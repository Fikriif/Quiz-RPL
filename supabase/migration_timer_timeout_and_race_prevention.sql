-- ==============================================================================
-- QUIZ ARENA: SERVER-VALIDATED TIMER, TIMEOUT ENGINE & RACE-CONDITION DEFENSE
-- ==============================================================================

-- 1. EXTEND QUESTION ATTEMPTS & CODING SUBMISSIONS FOR TIMEOUT STATUS & AUDIT
ALTER TABLE public.question_attempts
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'answered' CHECK (status IN ('answered', 'timeout', 'skipped')),
ADD COLUMN IF NOT EXISTS turn_number INT;

ALTER TABLE public.question_attempts
ALTER COLUMN answer DROP NOT NULL;

ALTER TABLE public.coding_submissions
ADD COLUMN IF NOT EXISTS is_timeout BOOLEAN NOT NULL DEFAULT false;

-- Ensure questions table has time_limit_seconds with default 30 if 0 or null
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS time_limit_seconds INT NOT NULL DEFAULT 30;

-- 2. DROP ALL EXISTING OVERLOADS OF RELEVANT RPCs TO PREVENT SUPABASE POSTGREST AMBIGUITY
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, text);

DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text, jsonb, integer, boolean);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, text, jsonb, uuid, integer);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text);

DROP FUNCTION IF EXISTS public.handle_turn_timeout(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.select_question_for_turn(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.select_question_for_turn(uuid, uuid, uuid);

-- 3. ATOMIC RPC: SELECT QUESTION FOR TURN (STAMPS turn_started_at AT ANSWERING START)
CREATE OR REPLACE FUNCTION public.select_question_for_turn(
    p_session_id UUID,
    p_team_id UUID,
    p_player_id UUID,
    p_question_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_session_status TEXT;
    v_quiz_id UUID;
    v_curr_team_id UUID;
    v_curr_player_id UUID;
    v_curr_question_id UUID;
    v_member_team_id UUID;
    v_already_used BOOLEAN;
    v_question_title TEXT;
    v_question_points INT;
    v_time_limit INT;
BEGIN
    -- 1. Enforce authenticated caller identity
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- 2. Fetch and lock session
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session quiz tidak ditemukan.';
    END IF;

    IF v_session_status != 'active' THEN
        RAISE EXCEPTION 'Pertandingan belum aktif.';
    END IF;

    -- 3. Validate student membership via normalized join
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_user_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND OR v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Anda bukan anggota terdaftar dari tim ini.';
    END IF;

    -- 4. Validate current turn team
    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RAISE EXCEPTION 'Belum giliran tim kamu.';
    END IF;

    -- 5. Validate current turn player (must match auth.uid())
    IF v_curr_player_id IS NOT NULL AND v_curr_player_id != v_user_id THEN
        RAISE EXCEPTION 'Anda bukan pemain aktif pada giliran ini.';
    END IF;

    -- 6. Validate if another question is already active in this turn
    IF v_curr_question_id IS NOT NULL AND v_curr_question_id != p_question_id THEN
        RAISE EXCEPTION 'Soal lain sedang aktif pada giliran ini.';
    END IF;

    -- 7. Verify question belongs to quiz
    SELECT question, points, COALESCE(time_limit_seconds, 30)
    INTO v_question_title, v_question_points, v_time_limit
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak valid untuk quiz ini.';
    END IF;

    IF v_time_limit <= 0 THEN
        v_time_limit := 30;
    END IF;

    -- 8. Check question usage in this session
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RAISE EXCEPTION 'Soal ini sudah pernah dijawab pada sesi ini.';
    END IF;

    -- 9. Update session to lock question and stamp turn_started_at EXACTLY NOW
    UPDATE public.quiz_sessions
    SET current_team_id = p_team_id,
        current_player_id = v_user_id,
        current_question_id = p_question_id,
        turn_status = 'answering',
        turn_started_at = clock_timestamp()
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'session_id', p_session_id,
        'question_id', p_question_id,
        'question_title', v_question_title,
        'points', v_question_points,
        'time_limit_seconds', v_time_limit,
        'turn_status', 'answering',
        'turn_started_at', clock_timestamp()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. ATOMIC RPC: SUBMIT QUIZ ANSWER (WITH SERVER-VALIDATED TIMEOUT & RACE PROTECTION)
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(
    p_session_id UUID,
    p_question_id UUID,
    p_team_id UUID,
    p_student_id UUID,
    p_answer TEXT,
    p_is_timeout BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_session_status TEXT;
    v_quiz_id UUID;
    v_quiz_status TEXT;
    v_curr_team_id UUID;
    v_curr_player_id UUID;
    v_curr_question_id UUID;
    v_turn_number INT;
    v_turn_status TEXT;
    v_turn_started_at TIMESTAMPTZ;
    v_correct_answer TEXT;
    v_question_points INT;
    v_explanation TEXT;
    v_time_limit INT;
    v_deadline TIMESTAMPTZ;
    v_is_server_timeout BOOLEAN := false;
    v_current_points INT;
    v_new_points INT;
    v_points_change INT;
    v_is_correct BOOLEAN;
    v_already_used BOOLEAN;
    v_member_team_id UUID;
    v_turn_result JSON;
    v_final_answer TEXT;
    v_status TEXT := 'answered';
BEGIN
    -- 1. Enforce authenticated caller identity
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- 2. Fetch and lock session row atomically
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id, turn_number, turn_status, turn_started_at
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id, v_turn_number, v_turn_status, v_turn_started_at
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
    END IF;

    -- Prevent double submissions / duplicate resolves
    IF v_turn_status != 'answering' OR v_curr_question_id IS NULL OR v_curr_question_id != p_question_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Giliran ini sudah selesai atau telah berpindah ke giliran lain.'
        );
    END IF;

    -- Verify quiz session status (auto-sync if quiz is active)
    IF v_session_status != 'active' THEN
        SELECT status INTO v_quiz_status FROM public.quizzes WHERE id = v_quiz_id;
        IF v_quiz_status = 'active' THEN
            UPDATE public.quiz_sessions 
            SET status = 'active', started_at = COALESCE(started_at, NOW()) 
            WHERE id = p_session_id;
            v_session_status := 'active';
        ELSE
            RAISE EXCEPTION 'Sesi quiz belum aktif (status saat ini: %)', v_session_status;
        END IF;
    END IF;

    -- 3. Validate student membership via normalized join
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_caller_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siswa tidak terdaftar dalam tim manapun pada quiz ini.';
    END IF;

    IF v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    -- 4. Validate turn authorization
    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Bukan giliran tim kamu.'
        );
    END IF;

    IF v_curr_player_id IS NOT NULL AND v_curr_player_id != v_caller_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Anda bukan pemain aktif pada giliran ini.'
        );
    END IF;

    -- 5. Check if question is already used in this session
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Soal ini sudah pernah dijawab pada sesi ini.'
        );
    END IF;

    -- 6. Fetch question details & time limit
    SELECT correct_answer, points, explanation, COALESCE(time_limit_seconds, 30)
    INTO v_correct_answer, v_question_points, v_explanation, v_time_limit
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak ditemukan untuk quiz ini.';
    END IF;

    IF v_time_limit <= 0 THEN
        v_time_limit := 30;
    END IF;

    -- 7. SERVER-SIDE TIMEOUT VERIFICATION (Zero Trust in Frontend Clock)
    -- Calculate strict deadline based on server turn_started_at + question time limit
    IF v_turn_started_at IS NOT NULL THEN
        v_deadline := v_turn_started_at + (v_time_limit || ' seconds')::interval;
        -- Allow 1.5 seconds network latency grace period
        IF clock_timestamp() > (v_deadline + interval '1.5 seconds') THEN
            v_is_server_timeout := true;
        END IF;
    END IF;

    -- If explicit timeout trigger was sent by frontend or server computed timeout
    IF p_is_timeout = true OR v_is_server_timeout = true THEN
        v_is_server_timeout := true;
        v_status := 'timeout';
        v_is_correct := false;
        v_points_change := -v_question_points;
        v_final_answer := COALESCE(p_answer, 'TIMEOUT');
    ELSE
        -- Normal answer evaluation
        v_status := 'answered';
        v_final_answer := p_answer;
        v_is_correct := (UPPER(TRIM(COALESCE(p_answer, ''))) = UPPER(TRIM(COALESCE(v_correct_answer, ''))));

        IF v_is_correct THEN
            v_points_change := v_question_points;
        ELSE
            v_points_change := -v_question_points;
        END IF;
    END IF;

    -- 8. Lock team record & update score (Min score = 0)
    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tim tidak ditemukan untuk quiz ini.';
    END IF;

    v_new_points := GREATEST(0, v_current_points + v_points_change);

    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    -- 9. Mark question as used for this session
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW())
    ON CONFLICT (quiz_session_id, question_id) DO NOTHING;

    -- 10. Record attempt log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, status, turn_number, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_caller_id,
        v_final_answer, v_is_correct, v_points_change, v_status, v_turn_number, NOW()
    );

    -- 11. AUTOMATIC TURN ROTATION TO NEXT TEAM & PLAYER
    v_turn_result := public.rotate_session_turn(p_session_id);

    -- 12. Return structured result
    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'is_timeout', v_is_server_timeout,
        'status', v_status,
        'correct_answer', v_correct_answer,
        'points_change', v_points_change,
        'new_score', v_new_points,
        'explanation', v_explanation,
        'next_turn', v_turn_result,
        'message', CASE WHEN v_is_server_timeout THEN 'Waktu menjawab telah habis. Jawaban dianggap salah.' ELSE 'Jawaban berhasil diproses.' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 5. ATOMIC RPC: SUBMIT CODING QUIZ ANSWER (WITH SERVER-VALIDATED TIMEOUT & RACE PROTECTION)
CREATE OR REPLACE FUNCTION public.submit_coding_quiz_answer(
    p_session_id UUID,
    p_question_id UUID,
    p_team_id UUID,
    p_student_id UUID,
    p_code_answer TEXT,
    p_test_results JSONB,
    p_score INT DEFAULT NULL,
    p_is_timeout BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_session_status TEXT;
    v_quiz_id UUID;
    v_quiz_status TEXT;
    v_curr_team_id UUID;
    v_curr_player_id UUID;
    v_curr_question_id UUID;
    v_turn_number INT;
    v_turn_status TEXT;
    v_turn_started_at TIMESTAMPTZ;
    v_question_points INT;
    v_time_limit INT;
    v_deadline TIMESTAMPTZ;
    v_is_server_timeout BOOLEAN := false;
    v_validation_type TEXT;
    v_expected_output TEXT;
    v_test_cases JSONB;
    v_total_test_cases INT;
    v_passed_count INT := 0;
    v_is_correct BOOLEAN := false;
    v_points_change INT := 0;
    v_current_points INT;
    v_new_points INT;
    v_already_used BOOLEAN;
    v_member_team_id UUID;
    v_turn_result JSON;
    v_clean_student_code TEXT;
    v_client_total_tests INT := 0;
    v_all_client_tests_passed BOOLEAN := false;
    v_status TEXT := 'answered';
BEGIN
    -- 1. Enforce authenticated student identity
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- 2. Check quiz session & lock
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id, turn_number, turn_status, turn_started_at
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id, v_turn_number, v_turn_status, v_turn_started_at
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
    END IF;

    -- Prevent double submit or submissions after turn has already completed
    IF v_turn_status != 'answering' OR v_curr_question_id IS NULL OR v_curr_question_id != p_question_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Giliran ini sudah selesai atau telah berpindah ke giliran lain.'
        );
    END IF;

    -- Auto sync session status if quiz is active
    IF v_session_status != 'active' THEN
        SELECT status INTO v_quiz_status FROM public.quizzes WHERE id = v_quiz_id;
        IF v_quiz_status = 'active' THEN
            UPDATE public.quiz_sessions 
            SET status = 'active', started_at = COALESCE(started_at, NOW()) 
            WHERE id = p_session_id;
            v_session_status := 'active';
        ELSE
            RAISE EXCEPTION 'Sesi quiz belum aktif (status saat ini: %)', v_session_status;
        END IF;
    END IF;

    -- 3. Validate student membership via normalized join
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_caller_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siswa tidak terdaftar dalam tim manapun pada quiz ini.';
    END IF;

    IF v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    -- 4. Turn authorization
    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Belum giliran tim kamu.'
        );
    END IF;

    IF v_curr_player_id IS NOT NULL AND v_curr_player_id != v_caller_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Anda bukan pemain aktif pada giliran ini.'
        );
    END IF;

    -- 5. Check if question was already used
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Soal ini sudah pernah dijawab pada sesi ini.'
        );
    END IF;

    -- 6. Fetch question details & time limit
    SELECT points, COALESCE(validation_type, 'test_cases'), expected_output, test_cases, COALESCE(time_limit_seconds, 30)
    INTO v_question_points, v_validation_type, v_expected_output, v_test_cases, v_time_limit
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak ditemukan untuk quiz ini.';
    END IF;

    IF v_time_limit <= 0 THEN
        v_time_limit := 30;
    END IF;

    -- 7. SERVER-SIDE TIMEOUT VALIDATION
    IF v_turn_started_at IS NOT NULL THEN
        v_deadline := v_turn_started_at + (v_time_limit || ' seconds')::interval;
        IF clock_timestamp() > (v_deadline + interval '1.5 seconds') THEN
            v_is_server_timeout := true;
        END IF;
    END IF;

    IF p_is_timeout = true OR v_is_server_timeout = true THEN
        -- TIMEOUT BRANCH: DO NOT RUN EVALUATION, SUBMIT AS TIMEOUT (-points)
        v_is_server_timeout := true;
        v_status := 'timeout';
        v_is_correct := false;
        v_passed_count := 0;
        v_total_test_cases := GREATEST(1, COALESCE(jsonb_array_length(v_test_cases), 0));
        v_points_change := -v_question_points;
        v_clean_student_code := COALESCE(p_code_answer, '[TIMEOUT]');
    ELSE
        -- NORMAL CODING EVALUATION BRANCH
        v_status := 'answered';

        -- Extract and sanitize student code
        IF p_code_answer ~ '^\s*\{.*"html"' THEN
            BEGIN
                v_clean_student_code := COALESCE((p_code_answer::jsonb)->>'html', '');
                IF TRIM(COALESCE((p_code_answer::jsonb)->>'css', '')) != '' THEN
                    IF TRIM(v_clean_student_code) != '' THEN
                        v_clean_student_code := v_clean_student_code || ' ' || ((p_code_answer::jsonb)->>'css');
                    ELSE
                        v_clean_student_code := ((p_code_answer::jsonb)->>'css');
                    END IF;
                END IF;
                IF TRIM(COALESCE((p_code_answer::jsonb)->>'js', '')) != '' THEN
                    IF TRIM(v_clean_student_code) != '' THEN
                        v_clean_student_code := v_clean_student_code || ' ' || ((p_code_answer::jsonb)->>'js');
                    ELSE
                        v_clean_student_code := ((p_code_answer::jsonb)->>'js');
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_clean_student_code := p_code_answer;
            END;
        ELSE
            v_clean_student_code := p_code_answer;
        END IF;

        -- Count client test results from telemetry
        v_client_total_tests := COALESCE(jsonb_array_length(p_test_results), 0);
        IF v_client_total_tests > 0 THEN
            SELECT count(*) INTO v_passed_count
            FROM jsonb_array_elements(p_test_results) elem
            WHERE (elem->>'passed')::boolean = true;

            v_all_client_tests_passed := (v_passed_count = v_client_total_tests);
        ELSE
            v_passed_count := 0;
            v_all_client_tests_passed := false;
        END IF;

        v_total_test_cases := COALESCE(jsonb_array_length(v_test_cases), 0);

        IF LENGTH(TRIM(COALESCE(v_clean_student_code, ''))) = 0 THEN
            v_is_correct := false;
            v_points_change := -v_question_points;
            v_passed_count := 0;
            v_total_test_cases := GREATEST(1, v_client_total_tests, v_total_test_cases);

        ELSIF (v_validation_type = 'exact' OR (v_expected_output IS NOT NULL AND TRIM(v_expected_output) != '' AND v_total_test_cases = 0)) THEN
            v_total_test_cases := 1;
            IF v_all_client_tests_passed AND v_client_total_tests > 0 AND v_passed_count >= 1 THEN
                v_is_correct := true;
                v_points_change := v_question_points;
                v_passed_count := 1;
            ELSE
                v_is_correct := false;
                v_points_change := -v_question_points;
                v_passed_count := 0;
            END IF;

        ELSIF v_total_test_cases > 0 THEN
            IF v_all_client_tests_passed AND v_client_total_tests >= v_total_test_cases AND v_passed_count = v_total_test_cases THEN
                v_is_correct := true;
                v_points_change := v_question_points;
            ELSIF v_passed_count > 0 THEN
                v_is_correct := false;
                v_points_change := ROUND((v_passed_count::numeric / v_total_test_cases::numeric) * v_question_points);
            ELSE
                v_is_correct := false;
                v_points_change := -v_question_points;
            END IF;

        ELSIF v_client_total_tests > 0 THEN
            v_total_test_cases := v_client_total_tests;
            IF v_all_client_tests_passed AND v_passed_count = v_client_total_tests THEN
                v_is_correct := true;
                v_points_change := v_question_points;
            ELSIF v_passed_count > 0 THEN
                v_is_correct := false;
                v_points_change := ROUND((v_passed_count::numeric / v_total_test_cases::numeric) * v_question_points);
            ELSE
                v_is_correct := false;
                v_points_change := -v_question_points;
            END IF;

        ELSE
            v_is_correct := false;
            v_points_change := -v_question_points;
            v_passed_count := 0;
            v_total_test_cases := 1;
        END IF;
    END IF;

    -- 8. Lock and update team score (Score cannot drop below 0)
    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tim tidak ditemukan untuk quiz ini.';
    END IF;

    v_new_points := GREATEST(0, v_current_points + v_points_change);

    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    -- 9. Mark question as used
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW())
    ON CONFLICT (quiz_session_id, question_id) DO NOTHING;

    -- 10. Record coding submission
    INSERT INTO public.coding_submissions (
        quiz_session_id, question_id, team_id, student_id,
        code_answer, test_results, score, is_correct, is_timeout, max_points, evaluation_status, submitted_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_caller_id,
        COALESCE(p_code_answer, '[TIMEOUT]'), COALESCE(p_test_results, '[]'::jsonb), v_points_change, v_is_correct, v_is_server_timeout, v_question_points, 'evaluated', NOW()
    );

    -- 11. Record attempt history log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, status, turn_number, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_caller_id,
        CASE WHEN v_is_server_timeout THEN 'TIMEOUT' ELSE 'CODING_SUBMISSION' END,
        v_is_correct, v_points_change, v_status, v_turn_number, NOW()
    );

    -- 12. AUTOMATIC TURN ROTATION TO NEXT TEAM & PLAYER
    v_turn_result := public.rotate_session_turn(p_session_id);

    -- 13. Return response JSON
    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'is_timeout', v_is_server_timeout,
        'status', v_status,
        'score', v_points_change,
        'max_points', v_question_points,
        'passed_count', v_passed_count,
        'total_count', v_total_test_cases,
        'new_score', v_new_points,
        'points_change', v_points_change,
        'next_turn', v_turn_result,
        'message', CASE WHEN v_is_server_timeout THEN 'Waktu coding telah habis. Jawaban dianggap salah.' ELSE 'Solusi coding berhasil dinilai.' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 6. DEDICATED ATOMIC TIMEOUT RPC: handle_turn_timeout
CREATE OR REPLACE FUNCTION public.handle_turn_timeout(
    p_session_id UUID,
    p_question_id UUID,
    p_team_id UUID,
    p_student_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_question_type TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- Determine question type
    SELECT question_type INTO v_question_type
    FROM public.questions
    WHERE id = p_question_id;

    IF v_question_type = 'coding' THEN
        RETURN public.submit_coding_quiz_answer(
            p_session_id => p_session_id,
            p_question_id => p_question_id,
            p_team_id => p_team_id,
            p_student_id => p_student_id,
            p_code_answer => '[TIMEOUT - WAKTU HABIS]',
            p_test_results => '[]'::jsonb,
            p_score => NULL,
            p_is_timeout => true
        );
    ELSE
        RETURN public.submit_quiz_answer(
            p_session_id => p_session_id,
            p_question_id => p_question_id,
            p_team_id => p_team_id,
            p_student_id => p_student_id,
            p_answer => 'TIMEOUT',
            p_is_timeout => true
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
