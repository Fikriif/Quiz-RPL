-- ==============================================================================
-- QUIZ ARENA - DATABASE SCHEMA & MIGRATION
-- Web Quiz Competition Platform (Next.js + Supabase + PostgreSQL)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & DOMAINS (OR CHECK CONSTRAINTS)

-- 3. PROFILES TABLE (Linked with Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. QUIZZES TABLE
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    code VARCHAR(10) UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'active', 'finished')),
    starting_points INT NOT NULL DEFAULT 1000 CHECK (starting_points >= 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_number INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    points INT NOT NULL DEFAULT 100 CHECK (points > 0),
    explanation TEXT,
    image_url TEXT,
    order_number INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TEAMS TABLE
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    starting_points INT NOT NULL DEFAULT 1000 CHECK (starting_points >= 0),
    current_points INT NOT NULL DEFAULT 1000 CHECK (current_points >= 0),
    turn_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- 8. TEAM MEMBERS TABLE (1 Student per Quiz constraint)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_student_quiz UNIQUE (student_id, quiz_id)
);

-- 9. QUIZ SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'paused', 'finished')),
    current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
    current_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. QUESTION ATTEMPTS TABLE (Log history)
CREATE TABLE IF NOT EXISTS public.question_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_session_id UUID NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    points_change INT NOT NULL,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. QUESTION USAGE TABLE (Ensure single-use per session)
CREATE TABLE IF NOT EXISTS public.question_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_session_id UUID NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(quiz_session_id, question_id)
);

-- ==============================================================================
-- INDEXES FOR FAST PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON public.quizzes(created_by);
CREATE INDEX IF NOT EXISTS idx_quizzes_code ON public.quizzes(code);
CREATE INDEX IF NOT EXISTS idx_categories_quiz_id ON public.categories(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON public.questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_category_id ON public.questions(category_id);
CREATE INDEX IF NOT EXISTS idx_teams_quiz_id ON public.teams(quiz_id);
CREATE INDEX IF NOT EXISTS idx_team_members_student_quiz ON public.team_members(student_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_id ON public.quiz_sessions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_session ON public.question_attempts(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_question_usage_session ON public.question_usage(quiz_session_id);

-- ==============================================================================
-- AUTH PROFILE SYNC TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));
    IF v_role NOT IN ('teacher', 'student') THEN
        v_role := 'student';
    END IF;

    INSERT INTO public.profiles (id, name, email, role, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        v_role,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- TRIGGER TO ENSURE quiz_id IS POPULATED ON team_members
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_team_member_quiz_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quiz_id IS NULL THEN
        SELECT quiz_id INTO NEW.quiz_id
        FROM public.teams
        WHERE id = NEW.team_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_team_member_quiz_id ON public.team_members;
CREATE TRIGGER trg_set_team_member_quiz_id
    BEFORE INSERT ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.set_team_member_quiz_id();

-- ==============================================================================
-- ATOMIC SCORE RPC: submit_quiz_answer
-- Ensures strict ACID transactions, anti-race condition, no client score manipulation
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(
    p_session_id UUID,
    p_question_id UUID,
    p_team_id UUID,
    p_student_id UUID,
    p_answer TEXT
)
RETURNS JSON AS $$
DECLARE
    v_session_status TEXT;
    v_quiz_id UUID;
    v_quiz_status TEXT;
    v_correct_answer TEXT;
    v_question_points INT;
    v_explanation TEXT;
    v_current_points INT;
    v_new_points INT;
    v_points_change INT;
    v_is_correct BOOLEAN;
    v_already_used BOOLEAN;
    v_member_team_id UUID;
BEGIN
    -- 1. Check quiz session and get quiz_id
    SELECT status, quiz_id INTO v_session_status, v_quiz_id
    FROM public.quiz_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz session tidak ditemukan.';
    END IF;

    -- 2. Verify quiz session status (auto-sync if quiz is active)
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

    -- 3. VALIDASI KEANGGOTAAN TIM SISWA:
    -- Jangan hanya mengandalkan frontend, validasi langsung dari database team_members
    SELECT team_id INTO v_member_team_id
    FROM public.team_members
    WHERE student_id = p_student_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siswa tidak terdaftar dalam tim manapun pada quiz ini.';
    END IF;

    IF v_member_team_id != p_team_id THEN
        RAISE EXCEPTION 'Tim yang dikirim tidak sesuai dengan keanggotaan siswa.';
    END IF;

    -- 4. Check if question is already used in this session
    SELECT EXISTS (
        SELECT 1 FROM public.question_usage
        WHERE quiz_session_id = p_session_id AND question_id = p_question_id
    ) INTO v_already_used;

    IF v_already_used THEN
        RAISE EXCEPTION 'Soal ini sudah pernah dijawab pada sesi ini.';
    END IF;

    -- 5. Fetch question details
    SELECT correct_answer, points, explanation
    INTO v_correct_answer, v_question_points, v_explanation
    FROM public.questions
    WHERE id = p_question_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Soal tidak ditemukan untuk quiz ini.';
    END IF;

    -- 6. Lock team record & get current points
    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tim tidak ditemukan untuk quiz ini.';
    END IF;

    -- 7. Determine correctness
    v_is_correct := (UPPER(TRIM(p_answer)) = UPPER(TRIM(v_correct_answer)));

    -- 8. Calculate new score (Score cannot drop below 0)
    IF v_is_correct THEN
        v_points_change := v_question_points;
        v_new_points := v_current_points + v_points_change;
    ELSE
        v_points_change := -v_question_points;
        v_new_points := GREATEST(v_current_points + v_points_change, 0);
        v_points_change := v_new_points - v_current_points; -- actual delta
    END IF;

    -- 9. Update team score
    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    -- 10. Mark question as used
    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW());

    -- 11. Insert into question attempt log
    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, p_student_id,
        p_answer, v_is_correct, v_points_change, NOW()
    );

    -- 12. Clear current_question_id in session
    UPDATE public.quiz_sessions
    SET current_question_id = NULL
    WHERE id = p_session_id;

    -- 13. Return response JSON
    RETURN json_build_object(
        'success', true,
        'is_correct', v_is_correct,
        'points_change', v_points_change,
        'new_score', v_new_points,
        'correct_answer', v_correct_answer,
        'explanation', v_explanation
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- TEACHER GAME MASTER OVERRIDE RPC: admin_award_points
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_award_points(
    p_session_id UUID,
    p_team_id UUID,
    p_question_id UUID,
    p_is_correct BOOLEAN
)
RETURNS JSON AS $$
DECLARE
    v_quiz_id UUID;
    v_correct_answer TEXT;
    v_question_points INT;
    v_explanation TEXT;
    v_current_points INT;
    v_new_points INT;
    v_points_change INT;
BEGIN
    SELECT quiz_id INTO v_quiz_id
    FROM public.quiz_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    SELECT correct_answer, points, explanation
    INTO v_correct_answer, v_question_points, v_explanation
    FROM public.questions
    WHERE id = p_question_id;

    SELECT current_points INTO v_current_points
    FROM public.teams
    WHERE id = p_team_id FOR UPDATE;

    IF p_is_correct THEN
        v_points_change := v_question_points;
        v_new_points := v_current_points + v_points_change;
    ELSE
        v_new_points := GREATEST(v_current_points - v_question_points, 0);
        v_points_change := v_new_points - v_current_points;
    END IF;

    UPDATE public.teams
    SET current_points = v_new_points,
        updated_at = NOW()
    WHERE id = p_team_id;

    INSERT INTO public.question_usage (quiz_session_id, question_id, team_id, used_at)
    VALUES (p_session_id, p_question_id, p_team_id, NOW())
    ON CONFLICT (quiz_session_id, question_id) DO NOTHING;

    INSERT INTO public.question_attempts (
        quiz_session_id, question_id, team_id, student_id,
        answer, is_correct, points_change, answered_at
    ) VALUES (
        p_session_id, p_question_id, p_team_id, auth.uid(),
        CASE WHEN p_is_correct THEN v_correct_answer ELSE 'WRONG' END,
        p_is_correct, v_points_change, NOW()
    );

    UPDATE public.quiz_sessions
    SET current_question_id = NULL
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'is_correct', p_is_correct,
        'points_change', v_points_change,
        'new_score', v_new_points,
        'correct_answer', v_correct_answer,
        'explanation', v_explanation
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- JOIN QUIZ BY CODE RPC (1 Student per Quiz validation)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.join_quiz_by_code(
    p_code TEXT,
    p_team_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_quiz_id UUID;
    v_quiz_title TEXT;
    v_quiz_status TEXT;
    v_target_team_name TEXT;
    v_existing_team_id UUID;
    v_existing_team_name TEXT;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join quiz';
    END IF;

    -- 1. Cari Quiz berdasarkan kode
    SELECT id, title, status INTO v_quiz_id, v_quiz_title, v_quiz_status
    FROM public.quizzes
    WHERE UPPER(code) = UPPER(TRIM(p_code));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz dengan kode % tidak ditemukan', p_code;
    END IF;

    -- 2. Pastikan team valid untuk quiz ini
    SELECT name INTO v_target_team_name
    FROM public.teams
    WHERE id = p_team_id AND quiz_id = v_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tim yang dipilih bukan bagian dari quiz ini';
    END IF;

    -- 3. Cek apakah siswa sudah memiliki team di quiz ini
    SELECT tm.team_id, t.name INTO v_existing_team_id, v_existing_team_name
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.student_id = v_user_id AND tm.quiz_id = v_quiz_id;

    IF FOUND THEN
        IF v_existing_team_id = p_team_id THEN
            -- Siswa sudah berada di tim ini
            RETURN json_build_object(
                'success', true,
                'already_joined', true,
                'quiz_id', v_quiz_id,
                'team_id', p_team_id,
                'team_name', v_target_team_name,
                'message', 'Kamu sudah bergabung dalam ' || v_target_team_name
            );
        ELSE
            -- Siswa sudah berada di tim lain dalam quiz yang sama
            RETURN json_build_object(
                'success', false,
                'already_in_other_team', true,
                'quiz_id', v_quiz_id,
                'existing_team_id', v_existing_team_id,
                'existing_team_name', v_existing_team_name,
                'message', 'Kamu sudah bergabung dengan ' || v_existing_team_name || ' untuk pertandingan ini.'
            );
        END IF;
    END IF;

    -- 4. Insert membership baru dengan quiz_id
    INSERT INTO public.team_members (team_id, student_id, quiz_id, joined_at)
    VALUES (p_team_id, v_user_id, v_quiz_id, NOW())
    ON CONFLICT (student_id, quiz_id) DO NOTHING;

    RETURN json_build_object(
        'success', true,
        'quiz_id', v_quiz_id,
        'team_id', p_team_id,
        'team_name', v_target_team_name,
        'message', 'Berhasil bergabung dengan ' || v_target_team_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- SWITCH STUDENT TEAM RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.switch_student_team(
    p_quiz_id UUID,
    p_new_team_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_new_team_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT name INTO v_new_team_name
    FROM public.teams
    WHERE id = p_new_team_id AND quiz_id = p_quiz_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tim tujuan tidak valid untuk quiz ini';
    END IF;

    INSERT INTO public.team_members (team_id, student_id, quiz_id, joined_at)
    VALUES (p_new_team_id, v_user_id, p_quiz_id, NOW())
    ON CONFLICT (student_id, quiz_id) DO UPDATE
    SET team_id = EXCLUDED.team_id,
        joined_at = NOW();

    RETURN json_build_object(
        'success', true,
        'team_id', p_new_team_id,
        'team_name', v_new_team_name,
        'message', 'Berhasil pindah ke ' || v_new_team_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_usage ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
DROP POLICY IF EXISTS "Public profiles are readable by all authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are readable by all authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 2. Quizzes Policies
DROP POLICY IF EXISTS "Anyone authenticated can view active or published quizzes" ON public.quizzes;
CREATE POLICY "Anyone authenticated can view active or published quizzes"
    ON public.quizzes FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Teachers can create quizzes" ON public.quizzes;
CREATE POLICY "Teachers can create quizzes"
    ON public.quizzes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Teachers can update their own quizzes" ON public.quizzes;
CREATE POLICY "Teachers can update their own quizzes"
    ON public.quizzes FOR UPDATE
    TO authenticated
    USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Teachers can delete their own quizzes" ON public.quizzes;
CREATE POLICY "Teachers can delete their own quizzes"
    ON public.quizzes FOR DELETE
    TO authenticated
    USING (auth.uid() = created_by);

-- 3. Categories Policies
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Anyone can view categories"
    ON public.categories FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Teachers can manage categories for their quizzes" ON public.categories;
CREATE POLICY "Teachers can manage categories for their quizzes"
    ON public.categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes
            WHERE quizzes.id = categories.quiz_id
            AND quizzes.created_by = auth.uid()
        )
    );

-- 4. Questions Policies
DROP POLICY IF EXISTS "Authenticated users can view questions" ON public.questions;
CREATE POLICY "Authenticated users can view questions"
    ON public.questions FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Teachers can manage questions for their quizzes" ON public.questions;
CREATE POLICY "Teachers can manage questions for their quizzes"
    ON public.questions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes
            WHERE quizzes.id = questions.quiz_id
            AND quizzes.created_by = auth.uid()
        )
    );

-- 5. Teams Policies
DROP POLICY IF EXISTS "Anyone can view teams" ON public.teams;
CREATE POLICY "Anyone can view teams"
    ON public.teams FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Teachers can manage teams for their quizzes" ON public.teams;
CREATE POLICY "Teachers can manage teams for their quizzes"
    ON public.teams FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes
            WHERE quizzes.id = teams.quiz_id
            AND quizzes.created_by = auth.uid()
        )
    );

-- 6. Team Members Policies
DROP POLICY IF EXISTS "Anyone can view team members" ON public.team_members;
CREATE POLICY "Anyone can view team members"
    ON public.team_members FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Students can join teams" ON public.team_members;
CREATE POLICY "Students can join teams"
    ON public.team_members FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can update their team membership" ON public.team_members;
CREATE POLICY "Students can update their team membership"
    ON public.team_members FOR UPDATE
    TO authenticated
    USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can manage team members" ON public.team_members;
CREATE POLICY "Teachers can manage team members"
    ON public.team_members FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.teams
            JOIN public.quizzes ON quizzes.id = teams.quiz_id
            WHERE teams.id = team_members.team_id
            AND quizzes.created_by = auth.uid()
        )
    );

-- 7. Quiz Sessions Policies
DROP POLICY IF EXISTS "Anyone can view quiz sessions" ON public.quiz_sessions;
CREATE POLICY "Anyone can view quiz sessions"
    ON public.quiz_sessions FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Teachers can manage quiz sessions" ON public.quiz_sessions;
CREATE POLICY "Teachers can manage quiz sessions"
    ON public.quiz_sessions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes
            WHERE quizzes.id = quiz_sessions.quiz_id
            AND quizzes.created_by = auth.uid()
        )
    );

-- 8. Question Attempts Policies
DROP POLICY IF EXISTS "Anyone can view question attempts" ON public.question_attempts;
CREATE POLICY "Anyone can view question attempts"
    ON public.question_attempts FOR SELECT
    TO authenticated
    USING (true);

-- 9. Question Usage Policies
DROP POLICY IF EXISTS "Anyone can view question usage" ON public.question_usage;
CREATE POLICY "Anyone can view question usage"
    ON public.question_usage FOR SELECT
    TO authenticated
    USING (true);

-- ==============================================================================
-- REALTIME SUBSCRIPTIONS
-- Enable realtime for live leaderboard, question selection, and board updates
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'quizzes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'teams'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'team_members'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'quiz_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_sessions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'question_usage'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.question_usage;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'question_attempts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.question_attempts;
    END IF;
END $$;
