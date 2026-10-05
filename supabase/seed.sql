-- ==============================================================================
-- QUIZ ARENA - SEED DATA SCRIPT
-- Sample Quiz, Categories, Questions, and Teams
-- ==============================================================================

DO $$
DECLARE
    v_teacher_id UUID;
    v_quiz_id UUID := 'a1111111-1111-1111-1111-111111111111';
    v_cat_html UUID := 'b1111111-1111-1111-1111-111111111111';
    v_cat_css UUID := 'b2222222-2222-2222-2222-222222222222';
    v_cat_js UUID := 'b3333333-3333-3333-3333-333333333333';
    v_cat_db UUID := 'b4444444-4444-4444-4444-444444444444';
BEGIN
    -- Try to pick an existing teacher or user profile
    SELECT id INTO v_teacher_id FROM public.profiles WHERE role = 'teacher' LIMIT 1;
    
    IF v_teacher_id IS NULL THEN
        SELECT id INTO v_teacher_id FROM public.profiles LIMIT 1;
    END IF;

    -- If still null, create a placeholder teacher UUID if needed for local manual run
    IF v_teacher_id IS NULL THEN
        v_teacher_id := '00000000-0000-0000-0000-000000000001';
        INSERT INTO public.profiles (id, name, email, role)
        VALUES (v_teacher_id, 'Master Teacher', 'teacher@quizarena.com', 'teacher')
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 1. Create Sample Quiz
    INSERT INTO public.quizzes (id, title, description, code, status, starting_points, created_by)
    VALUES (
        v_quiz_id,
        'Web Development Champions Challenge',
        'Kompetisi Quiz Pemrograman Web: HTML, CSS, JavaScript, dan Database untuk Tim Terbaik!',
        'JS2026',
        'active',
        1000,
        v_teacher_id
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        code = EXCLUDED.code,
        status = EXCLUDED.status;

    -- 2. Categories
    INSERT INTO public.categories (id, quiz_id, name, order_number)
    VALUES 
        (v_cat_html, v_quiz_id, 'HTML', 1),
        (v_cat_css, v_quiz_id, 'CSS', 2),
        (v_cat_js, v_quiz_id, 'JavaScript', 3),
        (v_cat_db, v_quiz_id, 'Database', 4)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Questions (HTML)
    INSERT INTO public.questions (quiz_id, category_id, question, option_a, option_b, option_c, option_d, correct_answer, points, explanation, order_number)
    VALUES
        (v_quiz_id, v_cat_html, 'Apa kepanjangan dari HTML?', 'Hyper Text Markup Language', 'Hyperlinks and Text Markup Language', 'Home Tool Markup Language', 'Hyperlinking Text Management Language', 'A', 100, 'HTML adalah singkatan dari Hyper Text Markup Language.', 1),
        (v_quiz_id, v_cat_html, 'Tag HTML mana yang digunakan untuk mendefinisikan navigasi utama?', '<header>', '<nav>', '<section>', '<navigation>', 'B', 200, 'Tag <nav> merepresentasikan bagian halaman yang berisi tautan navigasi utama.', 2),
        (v_quiz_id, v_cat_html, 'Manakah atribut HTML5 yang membuat input field wajib diisi sebelum form disubmit?', 'validate', 'important', 'required', 'mandatory', 'C', 300, 'Atribut required adalah atribut boolean HTML5 yang mewajibkan input diisi.', 3),
        (v_quiz_id, v_cat_html, 'Elemen HTML5 apa yang digunakan khusus untuk menggambar grafik secara langsung menggunakan JavaScript?', '<canvas>', '<svg>', '<graphic>', '<paint>', 'A', 500, 'Elemen <canvas> digunakan untuk merender grafik bitmap dinamis melalui JavaScript.', 4)
    ON CONFLICT DO NOTHING;

    -- 4. Questions (CSS)
    INSERT INTO public.questions (quiz_id, category_id, question, option_a, option_b, option_c, option_d, correct_answer, points, explanation, order_number)
    VALUES
        (v_quiz_id, v_cat_css, 'Properti CSS apa yang digunakan untuk mengubah warna latar belakang sebuah elemen?', 'color', 'background-color', 'bgcolor', 'fill-color', 'B', 100, 'background-color menetapkan warna background elemen.', 1),
        (v_quiz_id, v_cat_css, 'Dalam Box Model CSS, komponen apa yang terletak di antara padding dan margin?', 'Content', 'Outline', 'Border', 'Gutter', 'C', 200, 'Urutan Box Model dari dalam ke luar: Content -> Padding -> Border -> Margin.', 2),
        (v_quiz_id, v_cat_css, 'Apa nilai default dari properti position pada CSS?', 'static', 'relative', 'absolute', 'fixed', 'A', 300, 'Nilai default untuk position adalah static.', 3),
        (v_quiz_id, v_cat_css, 'Manakah CSS selector dengan spesifisitas (specificity) tertinggi?', 'class (.btn)', 'id (#btn)', 'element (button)', 'pseudo-class (:hover)', 'B', 500, 'ID selector (#id) memiliki spesifisitas lebih tinggi dibandingkan class dan element selector.', 4)
    ON CONFLICT DO NOTHING;

    -- 5. Questions (JavaScript)
    INSERT INTO public.questions (quiz_id, category_id, question, option_a, option_b, option_c, option_d, correct_answer, points, explanation, order_number)
    VALUES
        (v_quiz_id, v_cat_js, 'Tipe data manakah di JavaScript yang merepresentasikan nilai ketiadaan objek secara sengaja?', 'undefined', 'null', 'NaN', 'boolean', 'B', 100, 'null adalah nilai representasi sengaja dari tidak adanya objek/nilai.', 1),
        (v_quiz_id, v_cat_js, 'Apa output dari: typeof NaN ?', 'number', 'NaN', 'undefined', 'object', 'A', 200, 'Secara spesifikasi ECMAScript, typeof NaN menghasilkan "number".', 2),
        (v_quiz_id, v_cat_js, 'Method array apa yang mengembalikan array baru yang telah dimodifikasi oleh fungsi callback?', 'forEach()', 'filter()', 'map()', 'reduce()', 'C', 300, 'Array.prototype.map() mengembalikan array baru dengan elemen yang telah diproses callback.', 3),
        (v_quiz_id, v_cat_js, 'Fitur JavaScript apa yang memungkinkan fungsi mengingat dan mengakses variabel dari outer scope bahkan setelah outer function selesai?', 'Hoisting', 'Closure', 'Currying', 'Prototype Chaining', 'B', 500, 'Closure adalah kombinasi fungsi yang dibundel bersama lexical environment-nya.', 4)
    ON CONFLICT DO NOTHING;

    -- 6. Questions (Database)
    INSERT INTO public.questions (quiz_id, category_id, question, option_a, option_b, option_c, option_d, correct_answer, points, explanation, order_number)
    VALUES
        (v_quiz_id, v_cat_db, 'Klausa SQL apa yang digunakan untuk menyaring baris hasil query?', 'SORT BY', 'WHERE', 'GROUP BY', 'FILTER', 'B', 100, 'WHERE digunakan untuk memfilter baris sebelum dikembalikan.', 1),
        (v_quiz_id, v_cat_db, 'Tipe JOIN apa yang mengembalikan semua record dari kedua tabel, mengisi NULL jika tidak ada pasangan yang cocok?', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN', 'D', 200, 'FULL OUTER JOIN menyatukan semua record dari kedua tabel.', 2),
        (v_quiz_id, v_cat_db, 'Prinsip ACID dalam transaksi database: apa yang dimaksud dengan huruf A?', 'Accuracy', 'Atomicity', 'Availability', 'Authentication', 'B', 300, 'A dalam ACID adalah Atomicity (seluruh operasi sukses atau semua dibatalkan).', 3),
        (v_quiz_id, v_cat_db, 'Klausul SQL apa yang digunakan untuk memfilter hasil agregasi (setelah GROUP BY)?', 'WHERE', 'HAVING', 'QUALIFY', 'LIMIT', 'B', 500, 'HAVING digunakan untuk memfilter data setelah dilakukan agregasi GROUP BY.', 4)
    ON CONFLICT DO NOTHING;

    -- 7. Teams (Alpha, Beta, Gamma, Delta)
    INSERT INTO public.teams (quiz_id, name, description, starting_points, current_points)
    VALUES
        (v_quiz_id, 'Team Alpha', 'Divisi Web Frontend & Design', 1000, 1300),
        (v_quiz_id, 'Team Beta', 'Divisi Backend & API Engineering', 1000, 1100),
        (v_quiz_id, 'Team Gamma', 'Divisi Database & Systems', 1000, 900),
        (v_quiz_id, 'Team Delta', 'Divisi Quality Assurance & Security', 1000, 1000)
    ON CONFLICT DO NOTHING;

    -- 8. Create Quiz Session
    INSERT INTO public.quiz_sessions (id, quiz_id, status, started_at)
    VALUES ('c1111111-1111-1111-1111-111111111111', v_quiz_id, 'active', NOW())
    ON CONFLICT (id) DO NOTHING;

END $$;
