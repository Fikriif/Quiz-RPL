# 🏆 QUIZ ARENA - SETUP & RUN GUIDE

Platform kompetisi quiz antar tim modern berbasis **Next.js (App Router + TypeScript)**, **Supabase** (PostgreSQL Database, Auth, Realtime, RLS & Atomic RPC), dan **Tailwind CSS**.

---

## 1. Prerequisites & Dependencies

Aplikasi membutuhkan **Node.js 18+** dan akun **Supabase**.

Semua dependensi telah disiapkan dalam `package.json`:
- `@supabase/supabase-js` & `@supabase/ssr`
- `lucide-react`
- `canvas-confetti`
- `papaparse`
- `clsx` & `tailwind-merge`

Untuk menginstall kembali jika diperlukan:
```bash
npm install
```

---

## 2. Supabase Configuration (.env.local)

Pastikan file `.env.local` di root project memiliki konfigurasi berikut:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tryrsqhcjvyrbjtmscym.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_cCl9OtCMR9JMFmQvhtxO9Q_OlO8SV2Q
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_cCl9OtCMR9JMFmQvhtxO9Q_OlO8SV2Q
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 3. Menjalankan Database Migration di Supabase

1. Buka [Supabase Dashboard](https://app.supabase.com) proyek Anda.
2. Masuk ke menu **SQL Editor**.
3. Buat Query Baru dan salin seluruh isi file:
   - [`supabase/schema.sql`](supabase/schema.sql)
4. Klik **Run** (Ctrl + Enter) untuk membuat seluruh tabel, constraints, Row Level Security (RLS) policies, triggers, dan fungsi atomic score RPC `submit_quiz_answer()`.
5. *(Opsional)* Untuk mengisi data sampel (Quiz Web Development, 4 Kategori, 16 Soal, 4 Tim):
   - Salin isi [`supabase/seed.sql`](supabase/seed.sql) dan klik **Run**.

---

## 4. Menjalankan Development Server

Jalankan perintah berikut:

```bash
npm run dev
```

Buka browser di: [http://localhost:3000](http://localhost:3000)

---

## 5. Alur Penggunaan

### A. Sebagai Guru (Teacher)
1. Buka `/register` dan pilih role **Teacher**.
2. Masuk ke **Teacher Dashboard** (`/teacher/dashboard`).
3. Buat Quiz baru (+ Create Quiz) dengan Starting Points (misal 1000).
4. Tambahkan Kategori (HTML, CSS, JS, Database).
5. Tambahkan Soal secara manual atau upload melalui fitur **Import CSV** (tersedia template CSV).
6. Buat Tim (Team Alpha, Team Beta, dll) dan berikan **Quiz Code** (misal `JS2026`) kepada siswa.
7. Masuk ke **Game Master Mode** (`/teacher/quiz/[id]/game`) untuk mengontrol giliran tim, memilih soal di Question Board, timer 30 detik, tombol Reveal Answer, dan pemberian skor secara realtime.

### B. Sebagai Siswa (Student)
1. Buka `/register` dan pilih role **Student**.
2. Masuk ke halaman utama atau `/student/dashboard`.
3. Masukkan **Quiz Code** untuk bergabung ke dalam tim.
4. Buka halaman pertandingan (`/student/quiz/[id]`).
5. Lihat Question Board live, pilih soal yang tersedia, jawab di modal, dan saksikan update skor serta leaderboard secara realtime!

---

## 6. Fitur Keamanan & Atomic Scoring

- **Poin Atomic**: Skor tim diperbarui di server/database melalui fungsi PostgreSQL `submit_quiz_answer()` dengan transaction lock `FOR UPDATE` dan validasi status session.
- **Anti Double-Pick**: Question usage dilindungi oleh unique constraint `(quiz_session_id, question_id)`.
- **Anti Negative Score**: Poin tim dijamin tidak pernah bernilai di bawah 0 (`GREATEST(points - penalty, 0)`).
- **Correct Answer Protection**: Kunci jawaban tidak pernah dibocorkan ke client sebelum jawaban di-submit dan diproses.
