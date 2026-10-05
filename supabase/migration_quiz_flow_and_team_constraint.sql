-- ==============================================================================
-- MIGRATION: QUIZ FLOW, REALTIME & TEAM MEMBERSHIP UNIQUE CONSTRAINT
-- ==============================================================================

-- 1. TAMBAHKAN COLUMN quiz_id PADA team_members JIKA BELUM ADA
ALTER TABLE public.team_members 
ADD COLUMN IF NOT EXISTS quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE;

-- 2. BACKFILL quiz_id DARI TABEL teams
UPDATE public.team_members tm
SET quiz_id = t.quiz_id
FROM public.teams t
WHERE tm.team_id = t.id AND tm.quiz_id IS NULL;

-- 3. QUERY UNTUK MENDETEKSI DUPLICATE MEMBERSHIP (STUDENT + QUIZ)
-- Query ini digunakan untuk memeriksa apakah ada akun siswa yang masuk ke lebih dari 1 team di quiz yang sama:
/*
SELECT 
    tm.student_id, 
    tm.quiz_id, 
    p.name AS student_name,
    q.title AS quiz_title,
    count(*) AS total_teams_joined,
    array_agg(t.name) AS team_names
FROM public.team_members tm
JOIN public.teams t ON t.id = tm.team_id
JOIN public.quizzes q ON q.id = tm.quiz_id
JOIN public.profiles p ON p.id = tm.student_id
GROUP BY tm.student_id, tm.quiz_id, p.name, q.title
HAVING count(*) > 1;
*/

-- 4. BERSIHKAN DUPLIKAT SECARA AMAN (MEMPERTAHANKAN MEMBERSHIP TERAKHIR)
DELETE FROM public.team_members
WHERE id NOT IN (
    SELECT DISTINCT ON (student_id, quiz_id) id
    FROM public.team_members
    WHERE quiz_id IS NOT NULL
    ORDER BY student_id, quiz_id, joined_at DESC
);

-- 5. SET NOT NULL PADA quiz_id
ALTER TABLE public.team_members 
ALTER COLUMN quiz_id SET NOT NULL;

-- 6. HAPUS CONSTRAINT LAMA (JIKA ADA) DAN PASANG UNIQUE (student_id, quiz_id)
ALTER TABLE public.team_members
DROP CONSTRAINT IF EXISTS unique_student_quiz,
DROP CONSTRAINT IF EXISTS team_members_team_id_student_id_key;

ALTER TABLE public.team_members
ADD CONSTRAINT unique_student_quiz UNIQUE (student_id, quiz_id);

CREATE INDEX IF NOT EXISTS idx_team_members_student_quiz ON public.team_members(student_id, quiz_id);

-- 7. TRIGGER OTOMATIS MENGISI quiz_id JIKA TIDAK DIKIRIM CLIENT
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

-- 8. UPDATE RPC join_quiz_by_code DENGAN PROTEKSI 1 TEAM PER QUIZ
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

-- 9. RPC KHUSUS UNTUK PINDAH TEAM (JIKA SISWA MEMILIH PINDAH)
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

    -- Update atau Insert atomic
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

-- 10. REALTIME PUBLICATION UNTUK TABEL QUIZZES
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
        WHERE pubname = 'supabase_realtime' AND tablename = 'team_members'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
    END IF;
END $$;

-- 11. ATOMIC SCORE RPC: submit_quiz_answer
-- Validasi keanggotaan siswa dalam tim dan auto-sync session status
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
