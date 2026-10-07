-- ==============================================================================
-- QUIZ ARENA: FIX PREMATURE QUESTION TIMEOUT & ZERO-TRUST SERVER TIME VALIDATION
-- ==============================================================================

-- 1. DROP OLD OVERLOADS TO PREVENT POSTGREST AMBIGUITY
DROP FUNCTION IF EXISTS public.select_question_for_turn(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.select_question_for_turn(uuid, uuid, uuid);

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


-- 2. ATOMIC RPC: INITIALIZE SESSION TURN (WAITING SELECTION: turn_started_at = NULL)
CREATE OR REPLACE FUNCTION public.initialize_session_turn(p_session_id UUID)
RETURNS JSON AS $$
DECLARE
    v_quiz_id UUID;
    v_first_team_id UUID;
    v_first_team_name TEXT;
    v_first_player_id UUID;
BEGIN
    SELECT quiz_id INTO v_quiz_id
    FROM public.quiz_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session quiz tidak ditemukan.';
    END IF;

    -- Pick the first team strictly based on turn_order (Fixed Team Order)
    SELECT id, name INTO v_first_team_id, v_first_team_name
    FROM public.teams
    WHERE quiz_id = v_quiz_id
    ORDER BY turn_order ASC, created_at ASC, id ASC
    LIMIT 1;

    IF v_first_team_id IS NOT NULL THEN
        SELECT tm.student_id INTO v_first_player_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE tm.team_id = v_first_team_id AND t.quiz_id = v_quiz_id
        ORDER BY tm.joined_at ASC, tm.id ASC
        LIMIT 1;
    END IF;

    -- Set turn_status to waiting_selection and turn_started_at to NULL (Timer not started yet)
    UPDATE public.quiz_sessions
    SET current_team_id = v_first_team_id,
        current_player_id = v_first_player_id,
        current_question_id = NULL,
        turn_status = 'waiting_selection',
        turn_number = 1,
        turn_started_at = NULL
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'current_team_id', v_first_team_id,
        'current_team_name', v_first_team_name,
        'current_player_id', v_first_player_id,
        'turn_number', 1,
        'turn_status', 'waiting_selection'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. ATOMIC RPC: ROTATE SESSION TURN (WAITING SELECTION: turn_started_at = NULL)
CREATE OR REPLACE FUNCTION public.rotate_session_turn(p_session_id UUID)
RETURNS JSON AS $$
DECLARE
    v_quiz_id UUID;
    v_curr_team_id UUID;
    v_curr_turn_number INT;
    v_team_ids UUID[];
    v_total_teams INT;
    v_curr_team_idx INT := 0;
    v_next_team_idx INT;
    v_next_team_id UUID;
    v_next_team_name TEXT;
    v_player_ids UUID[];
    v_total_players INT;
    v_next_player_idx INT;
    v_next_player_id UUID;
    v_team_turn_count INT := 0;
    i INT;
BEGIN
    SELECT quiz_id, current_team_id, turn_number
    INTO v_quiz_id, v_curr_team_id, v_curr_turn_number
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session quiz tidak ditemukan.';
    END IF;

    -- Fetch all teams in strict fixed turn_order
    SELECT array_agg(id ORDER BY turn_order ASC, created_at ASC, id ASC)
    INTO v_team_ids
    FROM public.teams
    WHERE quiz_id = v_quiz_id;

    v_total_teams := COALESCE(array_length(v_team_ids, 1), 0);

    IF v_total_teams = 0 THEN
        UPDATE public.quiz_sessions
        SET current_team_id = NULL,
            current_player_id = NULL,
            current_question_id = NULL,
            turn_status = 'waiting_selection',
            turn_number = COALESCE(v_curr_turn_number, 0) + 1,
            turn_started_at = NULL
        WHERE id = p_session_id;

        RETURN json_build_object(
            'success', true,
            'message', 'Tidak ada tim terdaftar.',
            'turn_number', COALESCE(v_curr_turn_number, 0) + 1
        );
    END IF;

    -- Find index of current team
    IF v_curr_team_id IS NOT NULL THEN
        FOR i IN 1..v_total_teams LOOP
            IF v_team_ids[i] = v_curr_team_id THEN
                v_curr_team_idx := i;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Strict round-robin index calculation
    IF v_curr_team_idx = 0 OR v_curr_team_idx >= v_total_teams THEN
        v_next_team_idx := 1;
    ELSE
        v_next_team_idx := v_curr_team_idx + 1;
    END IF;

    v_next_team_id := v_team_ids[v_next_team_idx];

    SELECT name INTO v_next_team_name
    FROM public.teams
    WHERE id = v_next_team_id;

    -- Player rotation for next team
    SELECT array_agg(tm.student_id ORDER BY tm.joined_at ASC, tm.id ASC)
    INTO v_player_ids
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.team_id = v_next_team_id AND t.quiz_id = v_quiz_id;

    v_total_players := COALESCE(array_length(v_player_ids, 1), 0);

    IF v_total_players > 0 THEN
        SELECT COUNT(*) INTO v_team_turn_count
        FROM public.question_attempts
        WHERE quiz_session_id = p_session_id AND team_id = v_next_team_id;

        v_next_player_idx := (v_team_turn_count % v_total_players) + 1;
        v_next_player_id := v_player_ids[v_next_player_idx];
    ELSE
        v_next_player_id := NULL;
    END IF;

    -- Reset to waiting_selection with NULL turn_started_at
    UPDATE public.quiz_sessions
    SET current_team_id = v_next_team_id,
        current_player_id = v_next_player_id,
        current_question_id = NULL,
        turn_status = 'waiting_selection',
        turn_number = COALESCE(v_curr_turn_number, 0) + 1,
        turn_started_at = NULL
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'current_team_id', v_next_team_id,
        'current_team_name', v_next_team_name,
        'current_player_id', v_next_player_id,
        'turn_number', COALESCE(v_curr_turn_number, 0) + 1,
        'turn_status', 'waiting_selection'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. ATOMIC RPC: SELECT QUESTION FOR TURN (STAMPS turn_started_at = clock_timestamp())
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
    v_started_timestamp TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- Fetch and lock session
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

    -- Validate team membership
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_user_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND OR v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Anda bukan anggota terdaftar dari tim ini.';
    END IF;

    -- Validate current turn team
    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RAISE EXCEPTION 'Belum giliran tim kamu.';
    END IF;

    -- Validate current turn player
    IF v_curr_player_id IS NOT NULL AND v_curr_player_id != v_user_id THEN
        RAISE EXCEPTION 'Anda bukan pemain aktif pada giliran ini.';
    END IF;

    -- If another question is already active in this turn
    IF v_curr_question_id IS NOT NULL AND v_curr_question_id != p_question_id THEN
        RAISE EXCEPTION 'Soal lain sedang aktif pada giliran ini.';
    END IF;

    -- Verify question
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

    -- Check if question was already used
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RAISE EXCEPTION 'Soal ini sudah pernah dijawab pada sesi ini.';
    END IF;

    v_started_timestamp := clock_timestamp();

    -- Set turn_status to answering and stamp turn_started_at to current timestamp
    UPDATE public.quiz_sessions
    SET current_team_id = p_team_id,
        current_player_id = v_user_id,
        current_question_id = p_question_id,
        turn_status = 'answering',
        turn_started_at = v_started_timestamp
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'session_id', p_session_id,
        'question_id', p_question_id,
        'question_title', v_question_title,
        'points', v_question_points,
        'time_limit_seconds', v_time_limit,
        'turn_status', 'answering',
        'turn_started_at', v_started_timestamp
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 5. ATOMIC RPC: SUBMIT QUIZ ANSWER (ZERO-TRUST SERVER TIMEOUT & PREMATURE REJECTION)
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
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- Fetch and lock session
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id, turn_number, turn_status, turn_started_at
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id, v_turn_number, v_turn_status, v_turn_started_at
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
    END IF;

    -- Reject if turn is already finished, waiting selection, or question mismatched
    IF v_turn_status != 'answering' OR v_curr_question_id IS NULL OR v_curr_question_id != p_question_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Giliran ini sudah selesai atau telah berpindah ke giliran lain.'
        );
    END IF;

    IF v_turn_started_at IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', false,
            'message', 'Soal belum dimulai secara resmi.'
        );
    END IF;

    -- Validate team membership
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_caller_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND OR v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Bukan giliran tim kamu.'
        );
    END IF;

    -- Check question usage
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

    -- Fetch question points & time limit
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

    -- SERVER DEADLINE CALCULATION (Zero Trust)
    v_deadline := v_turn_started_at + (v_time_limit || ' seconds')::interval;
    IF clock_timestamp() > (v_deadline + interval '1.5 seconds') THEN
        v_is_server_timeout := true;
    END IF;

    -- PREMATURE TIMEOUT REJECTION GUARD:
    -- If client sent p_is_timeout = true BUT server time has NOT reached deadline, REJECT it!
    IF p_is_timeout = true AND v_is_server_timeout = false THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', false,
            'message', 'Waktu menjawab belum habis di server. Permintaan timeout ditolak.'
        );
    END IF;

    -- Process Timeout or Answer
    IF v_is_server_timeout = true THEN
        v_status := 'timeout';
        v_is_correct := false;
        v_points_change := -v_question_points;
        v_final_answer := COALESCE(p_answer, 'TIMEOUT');
    ELSE
        v_status := 'answered';
        v_final_answer := p_answer;
        v_is_correct := (UPPER(TRIM(COALESCE(p_answer, ''))) = UPPER(TRIM(COALESCE(v_correct_answer, ''))));

        IF v_is_correct THEN
            v_points_change := v_question_points;
        ELSE
            v_points_change := -v_question_points;
        END IF;
    END IF;

    -- Lock team and update points (min score 0)
    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id
    FOR UPDATE;

    v_new_points := GREATEST(0, v_current_points + v_points_change);

    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    -- Mark question used
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW())
    ON CONFLICT (quiz_session_id, question_id) DO NOTHING;

    -- Record attempt log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, status, turn_number, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_caller_id,
        v_final_answer, v_is_correct, v_points_change, v_status, v_turn_number, NOW()
    );

    -- Rotate to next team in fixed order
    v_turn_result := public.rotate_session_turn(p_session_id);

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


-- 6. ATOMIC RPC: SUBMIT CODING QUIZ ANSWER (ZERO-TRUST SERVER TIMEOUT & PREMATURE REJECTION)
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
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- Fetch and lock session
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id, turn_number, turn_status, turn_started_at
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id, v_turn_number, v_turn_status, v_turn_started_at
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
    END IF;

    -- Reject if turn is already finished, waiting selection, or question mismatched
    IF v_turn_status != 'answering' OR v_curr_question_id IS NULL OR v_curr_question_id != p_question_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Giliran ini sudah selesai atau telah berpindah ke giliran lain.'
        );
    END IF;

    IF v_turn_started_at IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', false,
            'message', 'Soal belum dimulai secara resmi.'
        );
    END IF;

    -- Validate team membership
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_caller_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND OR v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', true,
            'message', 'Bukan giliran tim kamu.'
        );
    END IF;

    -- Check question usage
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

    -- Fetch question details
    SELECT points, validation_type, expected_output, test_cases, COALESCE(time_limit_seconds, 30)
    INTO v_question_points, v_validation_type, v_expected_output, v_test_cases, v_time_limit
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal coding tidak ditemukan untuk quiz ini.';
    END IF;

    IF v_time_limit <= 0 THEN
        v_time_limit := 30;
    END IF;

    -- SERVER DEADLINE CALCULATION (Zero Trust)
    v_deadline := v_turn_started_at + (v_time_limit || ' seconds')::interval;
    IF clock_timestamp() > (v_deadline + interval '1.5 seconds') THEN
        v_is_server_timeout := true;
    END IF;

    -- PREMATURE TIMEOUT REJECTION GUARD:
    -- If client sent p_is_timeout = true BUT server time has NOT reached deadline, REJECT it!
    IF p_is_timeout = true AND v_is_server_timeout = false THEN
        RETURN json_build_object(
            'success', false,
            'already_resolved', false,
            'message', 'Waktu menjawab belum habis di server. Permintaan timeout ditolak.'
        );
    END IF;

    -- Evaluate Timeout or Code
    IF v_is_server_timeout = true THEN
        v_status := 'timeout';
        v_is_correct := false;
        v_points_change := -v_question_points;
    ELSE
        v_status := 'answered';
        -- Evaluate test results
        IF p_test_results IS NOT NULL AND jsonb_typeof(p_test_results) = 'array' THEN
            v_client_total_tests := jsonb_array_length(p_test_results);
            IF v_client_total_tests > 0 THEN
                SELECT bool_and((elem->>'passed')::boolean)
                INTO v_all_client_tests_passed
                FROM jsonb_array_elements(p_test_results) elem;
            END IF;
        END IF;

        IF v_all_client_tests_passed = true THEN
            v_is_correct := true;
            v_points_change := v_question_points;
        ELSE
            v_is_correct := false;
            v_points_change := -v_question_points;
        END IF;
    END IF;

    -- Lock team and update points (min score 0)
    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id
    FOR UPDATE;

    v_new_points := GREATEST(0, v_current_points + v_points_change);

    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    -- Mark question used
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW())
    ON CONFLICT (quiz_session_id, question_id) DO NOTHING;

    -- Record attempt log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, status, turn_number, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_caller_id,
        p_code_answer, v_is_correct, v_points_change, v_status, v_turn_number, NOW()
    );

    -- Record coding submission log
    INSERT INTO public.coding_submissions (
        quiz_session_id, question_id, student_id, team_id,
        code_answer, test_results, score_awarded, all_passed, is_timeout, submitted_at
    ) VALUES (
        p_session_id, p_question_id, v_caller_id, p_team_id,
        p_code_answer, COALESCE(p_test_results, '[]'::jsonb),
        CASE WHEN v_is_correct THEN v_question_points ELSE 0 END,
        v_is_correct, v_is_server_timeout, NOW()
    );

    -- Rotate to next team in fixed order
    v_turn_result := public.rotate_session_turn(p_session_id);

    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'is_timeout', v_is_server_timeout,
        'status', v_status,
        'points_change', v_points_change,
        'new_score', v_new_points,
        'next_turn', v_turn_result,
        'message', CASE WHEN v_is_server_timeout THEN 'Waktu pengerjaan coding telah habis. Jawaban dianggap salah.' ELSE 'Jawaban coding berhasil diproses.' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 7. ATOMIC RPC: DEDICATED TIMEOUT RPC (STRICTLY VALIDATED AGAINST SERVER DEADLINE)
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
