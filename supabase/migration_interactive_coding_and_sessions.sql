-- ==============================================================================
-- MIGRATION: INTERACTIVE CODING QUESTIONS, MULTI-SESSIONS & SECURE TEAM TURN ENGINE
-- ==============================================================================

-- 1. EXTEND QUESTIONS TABLE TO SUPPORT CODING QUESTIONS & VALIDATION MODES
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'coding')),
ADD COLUMN IF NOT EXISTS validation_type TEXT NOT NULL DEFAULT 'test_cases' CHECK (validation_type IN ('exact', 'test_cases')),
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'html_css_js',
ADD COLUMN IF NOT EXISTS starter_code TEXT,
ADD COLUMN IF NOT EXISTS expected_output TEXT,
ADD COLUMN IF NOT EXISTS test_cases JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS time_limit_seconds INT DEFAULT 0;

-- Make options and correct_answer nullable for coding questions
ALTER TABLE public.questions
ALTER COLUMN option_a DROP NOT NULL,
ALTER COLUMN option_b DROP NOT NULL,
ALTER COLUMN option_c DROP NOT NULL,
ALTER COLUMN option_d DROP NOT NULL,
ALTER COLUMN correct_answer DROP NOT NULL;

-- 2. EXTEND QUIZ SESSIONS TABLE FOR REUSABLE MASTER QUIZZES & TEAM TURN SYSTEM
ALTER TABLE public.quiz_sessions
ADD COLUMN IF NOT EXISTS session_name TEXT NOT NULL DEFAULT 'Sesi Utama',
ADD COLUMN IF NOT EXISTS code VARCHAR(12),
ADD COLUMN IF NOT EXISTS is_exam_mode BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS current_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS current_player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS turn_number INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS turn_status TEXT NOT NULL DEFAULT 'waiting_selection' CHECK (turn_status IN ('waiting_selection', 'answering', 'completed')),
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_code ON public.quiz_sessions(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_turn_team ON public.quiz_sessions(current_team_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_turn_player ON public.quiz_sessions(current_player_id);

-- 3. CREATE CODING SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.coding_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_session_id UUID NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code_answer TEXT NOT NULL,
    test_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    score INT NOT NULL DEFAULT 0,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    max_points INT NOT NULL DEFAULT 100,
    evaluation_status TEXT NOT NULL DEFAULT 'evaluated' CHECK (evaluation_status IN ('pending', 'evaluated', 'manual_review')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coding_submissions_session ON public.coding_submissions(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_coding_submissions_student ON public.coding_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_coding_submissions_question ON public.coding_submissions(question_id);

-- 4. CREATE EXAM EVENTS TABLE (Anti-Cheating & Focus Monitoring)
CREATE TABLE IF NOT EXISTS public.exam_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_session_id UUID NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('tab_hidden', 'window_blur', 'fullscreen_exit')),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_events_session ON public.exam_events(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_exam_events_student ON public.exam_events(student_id);

-- 5. HELPER FUNCTION: INITIALIZE SESSION TURN (Uses normalized JOIN on teams)
CREATE OR REPLACE FUNCTION public.initialize_session_turn(p_session_id UUID)
RETURNS JSON AS $$
DECLARE
    v_quiz_id UUID;
    v_first_team_id UUID;
    v_first_player_id UUID;
BEGIN
    SELECT quiz_id INTO v_quiz_id
    FROM public.quiz_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session tidak ditemukan.';
    END IF;

    -- Pick first team in quiz
    SELECT id INTO v_first_team_id
    FROM public.teams
    WHERE quiz_id = v_quiz_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Pick first student in that team using normalized join
    IF v_first_team_id IS NOT NULL THEN
        SELECT tm.student_id INTO v_first_player_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE tm.team_id = v_first_team_id AND t.quiz_id = v_quiz_id
        ORDER BY tm.joined_at ASC, tm.id ASC
        LIMIT 1;
    END IF;

    UPDATE public.quiz_sessions
    SET current_team_id = v_first_team_id,
        current_player_id = v_first_player_id,
        current_question_id = NULL,
        turn_status = 'waiting_selection',
        turn_number = 1,
        turn_started_at = NOW()
    WHERE id = p_session_id;

    RETURN json_build_object(
        'current_team_id', v_first_team_id,
        'current_player_id', v_first_player_id,
        'turn_number', 1,
        'turn_status', 'waiting_selection'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. HELPER FUNCTION: ROTATE SESSION TURN (ROUND ROBIN TEAMS & PLAYERS)
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
    v_player_ids UUID[];
    v_total_players INT;
    v_next_player_idx INT;
    v_next_player_id UUID;
    i INT;
BEGIN
    SELECT quiz_id, current_team_id, turn_number
    INTO v_quiz_id, v_curr_team_id, v_curr_turn_number
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session tidak ditemukan.';
    END IF;

    -- Fetch all teams for this quiz
    SELECT array_agg(id ORDER BY created_at ASC, id ASC)
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
            turn_started_at = NOW()
        WHERE id = p_session_id;

        RETURN json_build_object('success', true, 'message', 'Tidak ada tim.');
    END IF;

    -- Find index of current team in array
    IF v_curr_team_id IS NOT NULL THEN
        FOR i IN 1..v_total_teams LOOP
            IF v_team_ids[i] = v_curr_team_id THEN
                v_curr_team_idx := i;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Next team index (1-based round robin)
    IF v_curr_team_idx = 0 OR v_curr_team_idx >= v_total_teams THEN
        v_next_team_idx := 1;
    ELSE
        v_next_team_idx := v_curr_team_idx + 1;
    END IF;

    v_next_team_id := v_team_ids[v_next_team_idx];

    -- Fetch players in next team using normalized join
    SELECT array_agg(tm.student_id ORDER BY tm.joined_at ASC, tm.id ASC)
    INTO v_player_ids
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.team_id = v_next_team_id AND t.quiz_id = v_quiz_id;

    v_total_players := COALESCE(array_length(v_player_ids, 1), 0);

    IF v_total_players > 0 THEN
        -- Rotate player within team based on turn count
        v_next_player_idx := ((COALESCE(v_curr_turn_number, 0)) % v_total_players) + 1;
        v_next_player_id := v_player_ids[v_next_player_idx];
    ELSE
        v_next_player_id := NULL;
    END IF;

    -- Update session record
    UPDATE public.quiz_sessions
    SET current_team_id = v_next_team_id,
        current_player_id = v_next_player_id,
        current_question_id = NULL,
        turn_status = 'waiting_selection',
        turn_number = COALESCE(v_curr_turn_number, 0) + 1,
        turn_started_at = NOW()
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'current_team_id', v_next_team_id,
        'current_player_id', v_next_player_id,
        'turn_number', COALESCE(v_curr_turn_number, 0) + 1,
        'turn_status', 'waiting_selection'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ATOMIC RPC: SELECT QUESTION FOR TURN
-- Drop all existing overloads first
DROP FUNCTION IF EXISTS public.select_question_for_turn(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.select_question_for_turn(uuid, uuid, uuid);

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
    SELECT question, points INTO v_question_title, v_question_points
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak valid untuk quiz ini.';
    END IF;

    -- 8. Check question usage in this session
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RAISE EXCEPTION 'Soal ini sudah pernah dijawab pada sesi ini.';
    END IF;

    -- 9. Update session to lock question
    UPDATE public.quiz_sessions
    SET current_team_id = p_team_id,
        current_player_id = v_user_id,
        current_question_id = p_question_id,
        turn_status = 'answering'
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'session_id', p_session_id,
        'question_id', p_question_id,
        'question_title', v_question_title,
        'points', v_question_points,
        'turn_status', 'answering'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. ATOMIC RPC: SUBMIT CODING QUIZ ANSWER (CANONICAL SIGNATURE)
-- Explicitly drop all past overload variations to avoid conflict
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, text, jsonb, uuid, integer);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_coding_quiz_answer(uuid, uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.submit_coding_quiz_answer(
    p_session_id UUID,
    p_question_id UUID,
    p_team_id UUID,
    p_student_id UUID,
    p_code_answer TEXT,
    p_test_results JSONB,
    p_score INT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_student_id UUID := auth.uid();
    v_session_status TEXT;
    v_quiz_id UUID;
    v_quiz_status TEXT;
    v_curr_team_id UUID;
    v_curr_player_id UUID;
    v_curr_question_id UUID;
    v_question_points INT;
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
    v_clean_expected_code TEXT;
    v_client_total_tests INT := 0;
    v_all_client_tests_passed BOOLEAN := false;
BEGIN
    -- 1. Enforce authenticated student identity
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- 2. Check quiz session & lock
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
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
    WHERE tm.student_id = v_student_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siswa tidak terdaftar dalam tim manapun pada quiz ini.';
    END IF;

    IF v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    -- 4. VALIDASI TURN SYSTEM
    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RAISE EXCEPTION 'Belum giliran tim kamu.';
    END IF;

    IF v_curr_player_id IS NOT NULL AND v_curr_player_id != v_student_id THEN
        RAISE EXCEPTION 'Anda bukan pemain aktif pada giliran ini.';
    END IF;

    IF v_curr_question_id IS NOT NULL AND v_curr_question_id != p_question_id THEN
        RAISE EXCEPTION 'Soal yang dikerjakan bukan soal aktif pada giliran ini.';
    END IF;

    -- 5. Check if question was already used
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RAISE EXCEPTION 'Soal ini sudah pernah dijawab pada sesi ini.';
    END IF;

    -- 6. Fetch question points, validation mode, expected output & test cases
    SELECT points, COALESCE(validation_type, 'test_cases'), expected_output, test_cases
    INTO v_question_points, v_validation_type, v_expected_output, v_test_cases
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak ditemukan untuk quiz ini.';
    END IF;

    -- 7. EXTRACT & SANITIZE RAW CODE
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

    -- 8. UNIFIED EVALUATION & SCORING (NO NEGATIVE PENALTY FOR CODING)
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

    -- Check A: Empty code or whitespace only is 0 points
    IF LENGTH(TRIM(COALESCE(v_clean_student_code, ''))) = 0 THEN
        v_is_correct := false;
        v_points_change := 0;
        v_passed_count := 0;
        v_total_test_cases := GREATEST(1, v_client_total_tests, v_total_test_cases);

    -- Check B: Mode A — Exact Answer / Structural HTML Matching
    ELSIF (v_validation_type = 'exact' OR (v_expected_output IS NOT NULL AND TRIM(v_expected_output) != '' AND v_total_test_cases = 0)) THEN
        v_total_test_cases := 1;
        -- If client structural DOM validation evaluated and all passed
        IF v_all_client_tests_passed AND v_client_total_tests > 0 AND v_passed_count >= 1 THEN
            v_is_correct := true;
            v_points_change := v_question_points;
            v_passed_count := 1;
        ELSE
            v_is_correct := false;
            v_points_change := 0;
            v_passed_count := 0;
        END IF;

    -- Check C: Mode B — Test Cases / Behavior Validation
    ELSIF v_total_test_cases > 0 THEN
        IF v_all_client_tests_passed AND v_client_total_tests >= v_total_test_cases AND v_passed_count = v_total_test_cases THEN
            v_is_correct := true;
            v_points_change := v_question_points;
        ELSIF v_passed_count > 0 THEN
            v_is_correct := false;
            v_points_change := ROUND((v_passed_count::numeric / v_total_test_cases::numeric) * v_question_points);
        ELSE
            v_is_correct := false;
            v_points_change := 0;
        END IF;

    -- Check D: Fallback for client-evaluated tests
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
            v_points_change := 0;
        END IF;

    ELSE
        -- No test cases and no expected answer => 0 points
        v_is_correct := false;
        v_points_change := 0;
        v_passed_count := 0;
        v_total_test_cases := 1;
    END IF;

    -- 9. Lock and update team score (Score cannot drop below 0)
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

    -- 10. Mark question as used
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW());

    -- 11. Record coding submission
    INSERT INTO public.coding_submissions (
        quiz_session_id, question_id, team_id, student_id,
        code_answer, test_results, score, is_correct, max_points, evaluation_status, submitted_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_student_id,
        p_code_answer, p_test_results, v_points_change, v_is_correct, v_question_points, 'evaluated', NOW()
    );

    -- 12. Record attempt history log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_student_id,
        'CODING_SUBMISSION', v_is_correct, v_points_change, NOW()
    );

    -- 13. AUTOMATIC TURN ROTATION TO NEXT TEAM & PLAYER
    v_turn_result := public.rotate_session_turn(p_session_id);

    -- 14. Return response JSON
    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'score', v_points_change,
        'max_points', v_question_points,
        'passed_count', v_passed_count,
        'total_count', v_total_test_cases,
        'new_score', v_new_points,
        'points_change', v_points_change,
        'next_turn', v_turn_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. ATOMIC RPC: SUBMIT QUIZ ANSWER (MULTIPLE CHOICE WITH CANONICAL SIGNATURE)
-- Explicitly drop past overloads
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.submit_quiz_answer(
    p_session_id UUID,
    p_question_id UUID,
    p_team_id UUID,
    p_student_id UUID,
    p_answer TEXT
)
RETURNS JSON AS $$
DECLARE
    v_student_id UUID := auth.uid();
    v_session_status TEXT;
    v_quiz_id UUID;
    v_quiz_status TEXT;
    v_curr_team_id UUID;
    v_curr_player_id UUID;
    v_curr_question_id UUID;
    v_correct_answer TEXT;
    v_question_points INT;
    v_explanation TEXT;
    v_current_points INT;
    v_new_points INT;
    v_points_change INT;
    v_is_correct BOOLEAN;
    v_already_used BOOLEAN;
    v_member_team_id UUID;
    v_turn_result JSON;
BEGIN
    -- 1. Enforce authenticated caller identity
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- 2. Check quiz session and get quiz_id
    SELECT status, quiz_id, current_team_id, current_player_id, current_question_id
    INTO v_session_status, v_quiz_id, v_curr_team_id, v_curr_player_id, v_curr_question_id
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
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

    -- 3. VALIDASI KEANGGOTAAN TIM SISWA VIA NORMALIZED JOIN
    SELECT tm.team_id INTO v_member_team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_student_id AND t.quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siswa tidak terdaftar dalam tim manapun pada quiz ini.';
    END IF;

    IF v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    -- 4. VALIDASI TURN SYSTEM
    IF v_curr_team_id IS NOT NULL AND v_curr_team_id != p_team_id THEN
        RAISE EXCEPTION 'Belum giliran tim kamu.';
    END IF;

    IF v_curr_player_id IS NOT NULL AND v_curr_player_id != v_student_id THEN
        RAISE EXCEPTION 'Anda bukan pemain aktif pada giliran ini.';
    END IF;

    IF v_curr_question_id IS NOT NULL AND v_curr_question_id != p_question_id THEN
        RAISE EXCEPTION 'Soal ini bukan soal aktif pada giliran ini.';
    END IF;

    -- 5. Check if question is already used in this session
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RAISE EXCEPTION 'Soal ini sudah pernah dijawab pada sesi ini.';
    END IF;

    -- 6. Fetch question details
    SELECT correct_answer, points, explanation
    INTO v_correct_answer, v_question_points, v_explanation
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak ditemukan untuk quiz ini.';
    END IF;

    -- 7. Lock team record & get current points
    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tim tidak ditemukan untuk quiz ini.';
    END IF;

    -- 8. SCORING RULE: Correct => +points, Wrong => -points, Min score => 0
    v_is_correct := (UPPER(TRIM(p_answer)) = UPPER(TRIM(v_correct_answer)));

    IF v_is_correct THEN
        v_points_change := v_question_points;
    ELSE
        v_points_change := -v_question_points;
    END IF;

    v_new_points := GREATEST(0, v_current_points + v_points_change);

    -- 9. Update team points
    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    -- 10. Mark question as used for this session
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW());

    -- 11. Record attempt log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, v_student_id,
        p_answer, v_is_correct, v_points_change, NOW()
    );

    -- 12. AUTOMATIC TURN ROTATION TO NEXT TEAM & PLAYER
    v_turn_result := public.rotate_session_turn(p_session_id);

    -- 13. Return result
    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'correct_answer', v_correct_answer,
        'points_change', v_points_change,
        'new_score', v_new_points,
        'explanation', v_explanation,
        'next_turn', v_turn_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC: ADMIN ADVANCE TURN (SECURED: ONLY TEACHER OWNER CAN SKIP/ROTATE TURN)
DROP FUNCTION IF EXISTS public.admin_advance_turn(uuid);

CREATE OR REPLACE FUNCTION public.admin_advance_turn(p_session_id UUID)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_quiz_id UUID;
    v_quiz_owner UUID;
    v_session_owner UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna tidak terautentikasi.';
    END IF;

    -- Validate session exists and get owners
    SELECT qs.quiz_id, qs.created_by, q.created_by
    INTO v_quiz_id, v_session_owner, v_quiz_owner
    FROM public.quiz_sessions qs
    JOIN public.quizzes q ON q.id = qs.quiz_id
    WHERE qs.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session tidak ditemukan.';
    END IF;

    -- Validate role and ownership
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_role != 'teacher' OR (v_quiz_owner != v_user_id AND (v_session_owner IS NULL OR v_session_owner != v_user_id)) THEN
        RAISE EXCEPTION 'Hanya guru pemilik quiz yang berwenang mengganti giliran.';
    END IF;

    RETURN public.rotate_session_turn(p_session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. SECURE ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.coding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_events ENABLE ROW LEVEL SECURITY;

-- coding_submissions policies
DROP POLICY IF EXISTS "Students can view their own submissions" ON public.coding_submissions;
CREATE POLICY "Students can view their own submissions"
    ON public.coding_submissions FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can view submissions for their quizzes" ON public.coding_submissions;
CREATE POLICY "Teachers can view submissions for their quizzes"
    ON public.coding_submissions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_sessions qs
            JOIN public.quizzes q ON q.id = qs.quiz_id
            WHERE qs.id = coding_submissions.quiz_session_id
              AND (q.created_by = auth.uid() OR qs.created_by = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Students can insert their own submissions" ON public.coding_submissions;
CREATE POLICY "Students can insert their own submissions"
    ON public.coding_submissions FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());

-- exam_events policies
DROP POLICY IF EXISTS "Students can insert their own exam events" ON public.exam_events;
CREATE POLICY "Students can insert their own exam events"
    ON public.exam_events FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can view their own exam events" ON public.exam_events;
CREATE POLICY "Students can view their own exam events"
    ON public.exam_events FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can view exam events for their quizzes" ON public.exam_events;
CREATE POLICY "Teachers can view exam events for their quizzes"
    ON public.exam_events FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quiz_sessions qs
            JOIN public.quizzes q ON q.id = qs.quiz_id
            WHERE qs.id = exam_events.quiz_session_id
              AND (q.created_by = auth.uid() OR qs.created_by = auth.uid())
        )
    );

-- 12. ENABLE REALTIME FOR QUIZ SESSIONS & NEW TABLES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'quiz_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_sessions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'coding_submissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.coding_submissions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'exam_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_events;
    END IF;
END $$;
