-- ==============================================================================
-- QUIZ ARENA: FIXED TEAM TURN ORDER (STRICT ROUND-ROBIN BY TURN_ORDER)
-- ==============================================================================

-- 1. ADD turn_order COLUMN TO TEAMS
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS turn_order INTEGER;

-- 2. BACKFILL turn_order FOR EXISTING TEAMS (Deterministic based on created_at, id)
WITH numbered_teams AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY quiz_id ORDER BY created_at ASC, id ASC) as rn
    FROM public.teams
)
UPDATE public.teams t
SET turn_order = nt.rn
FROM numbered_teams nt
WHERE t.id = nt.id AND (t.turn_order IS NULL OR t.turn_order = 0);

-- 3. TRIGGER TO AUTO-ASSIGN turn_order ON NEW TEAMS
CREATE OR REPLACE FUNCTION public.set_team_turn_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.turn_order IS NULL OR NEW.turn_order <= 0 THEN
        SELECT COALESCE(MAX(turn_order), 0) + 1 INTO NEW.turn_order
        FROM public.teams
        WHERE quiz_id = NEW.quiz_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_team_turn_order ON public.teams;
CREATE TRIGGER trg_set_team_turn_order
    BEFORE INSERT ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.set_team_turn_order();


-- 4. ATOMIC RPC: INITIALIZE SESSION TURN (STARTS STRICTLY AT turn_order = 1)
CREATE OR REPLACE FUNCTION public.initialize_session_turn(p_session_id UUID)
RETURNS JSON AS $$
DECLARE
    v_quiz_id UUID;
    v_first_team_id UUID;
    v_first_team_name TEXT;
    v_first_player_id UUID;
BEGIN
    -- Fetch and validate quiz session
    SELECT quiz_id INTO v_quiz_id
    FROM public.quiz_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session quiz tidak ditemukan.';
    END IF;

    -- Pick the first team strictly based on turn_order (lowest turn_order = 1)
    -- NEVER based on score, points, or random
    SELECT id, name INTO v_first_team_id, v_first_team_name
    FROM public.teams
    WHERE quiz_id = v_quiz_id
    ORDER BY turn_order ASC, created_at ASC, id ASC
    LIMIT 1;

    IF v_first_team_id IS NOT NULL THEN
        -- Pick first player for this team
        SELECT tm.student_id INTO v_first_player_id
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE tm.team_id = v_first_team_id AND t.quiz_id = v_quiz_id
        ORDER BY tm.joined_at ASC, tm.id ASC
        LIMIT 1;
    END IF;

    -- Initialize session state
    UPDATE public.quiz_sessions
    SET current_team_id = v_first_team_id,
        current_player_id = v_first_player_id,
        current_question_id = NULL,
        turn_status = 'waiting_selection',
        turn_number = 1,
        turn_started_at = NOW()
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


-- 5. ATOMIC RPC: ROTATE SESSION TURN (STRICT FIXED ROUND-ROBIN BY turn_order)
-- Rule: Team 1 -> Team 2 -> Team 3 -> Team 4 -> Team 1 ...
-- Independent of team scores, rankings, points delta, or answer status.
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
    -- Fetch & lock session row
    SELECT quiz_id, current_team_id, turn_number
    INTO v_quiz_id, v_curr_team_id, v_curr_turn_number
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session quiz tidak ditemukan.';
    END IF;

    -- Fetch all teams strictly ordered by turn_order ASC, created_at ASC, id ASC
    -- Score is completely ignored here
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
            turn_started_at = NOW()
        WHERE id = p_session_id;

        RETURN json_build_object(
            'success', true,
            'message', 'Tidak ada tim terdaftar.',
            'turn_number', COALESCE(v_curr_turn_number, 0) + 1
        );
    END IF;

    -- Find index of the current active team
    IF v_curr_team_id IS NOT NULL THEN
        FOR i IN 1..v_total_teams LOOP
            IF v_team_ids[i] = v_curr_team_id THEN
                v_curr_team_idx := i;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Calculate next team in strict sequential cyclic order:
    -- If current is at the end or unknown, loop back to 1 (Team 1)
    -- Otherwise advance by exactly 1
    IF v_curr_team_idx = 0 OR v_curr_team_idx >= v_total_teams THEN
        v_next_team_idx := 1;
    ELSE
        v_next_team_idx := v_curr_team_idx + 1;
    END IF;

    v_next_team_id := v_team_ids[v_next_team_idx];

    -- Fetch team name
    SELECT name INTO v_next_team_name
    FROM public.teams
    WHERE id = v_next_team_id;

    -- Round-robin player rotation within the selected next team
    SELECT array_agg(tm.student_id ORDER BY tm.joined_at ASC, tm.id ASC)
    INTO v_player_ids
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.team_id = v_next_team_id AND t.quiz_id = v_quiz_id;

    v_total_players := COALESCE(array_length(v_player_ids, 1), 0);

    IF v_total_players > 0 THEN
        -- Count how many attempts this specific team has completed so far
        SELECT COUNT(*) INTO v_team_turn_count
        FROM public.question_attempts
        WHERE quiz_session_id = p_session_id AND team_id = v_next_team_id;

        v_next_player_idx := (v_team_turn_count % v_total_players) + 1;
        v_next_player_id := v_player_ids[v_next_player_idx];
    ELSE
        v_next_player_id := NULL;
    END IF;

    -- Advance session to next team
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
        'current_team_name', v_next_team_name,
        'current_player_id', v_next_player_id,
        'turn_number', COALESCE(v_curr_turn_number, 0) + 1,
        'turn_status', 'waiting_selection'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 6. RPC: ADMIN ADVANCE TURN (TEACHER MANUAL SKIP / NEXT TURN)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
