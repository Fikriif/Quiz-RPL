'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy,
  Mail,
  Lock,
  User,
  GraduationCap,
  School,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UserRole } from '@/types/database';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [role, setRole] = useState<UserRole>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Validation
    if (!name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Email wajib diisi dengan format yang benar.');
      return;
    }

    if (!password) {
      setErrorMsg('Kata sandi wajib diisi.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (role !== 'student' && role !== 'teacher') {
      setErrorMsg('Role akun tidak valid. Pilih Student atau Teacher.');
      return;
    }

    setIsLoading(true);

    try {
      // 2. Supabase Auth signUp with metadata
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            role: role,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes('already registered')) {
          throw new Error('Email ini sudah terdaftar. Silakan gunakan email lain atau langsung masuk.');
        }
        throw signUpError;
      }

      if (data?.user) {
        // 3. Upsert into public.profiles with matching id = auth.users.id
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            name: name.trim(),
            email: email.trim(),
            role: role,
            updated_at: new Date().toISOString(),
          });
        } catch (profileErr) {
          console.warn('Profile sync fallback note:', profileErr);
        }

        // 4. Handle navigation or email confirmation requirement
        if (data.session) {
          // Session is immediately active
          if (role === 'teacher') {
            router.push('/teacher/dashboard');
          } else {
            router.push('/student/dashboard');
          }
          router.refresh();
        } else {
          // Email confirmation is required by Supabase Auth
          setSuccessMsg(
            'Pendaftaran berhasil! Akun Anda telah dibuat. Silakan periksa kotak masuk email untuk konfirmasi, lalu login ke akun Anda.'
          );
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mendaftar. Silakan coba kembali.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl shadow-black/80 backdrop-blur-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <Trophy className="w-5 h-5 text-amber-300" />
            </div>
            <span className="font-black text-xl tracking-wider text-white">QUIZ ARENA</span>
          </Link>
          <h1 className="text-2xl font-black text-white">Buat Akun Baru</h1>
          <p className="text-xs text-slate-400 mt-1">
            Pilih peran Anda dan bergabung ke platform kompetisi quiz
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-3 text-emerald-300 text-xs">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors self-start"
            >
              Menuju Halaman Login
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Role Selector: Two Interactive Cards */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
            Pilih Peran Akun (Role)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Pilih peran">
            {/* Student Card */}
            <button
              type="button"
              role="radio"
              aria-checked={role === 'student'}
              onClick={() => setRole('student')}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                role === 'student'
                  ? 'bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    role === 'student'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <GraduationCap className="w-5 h-5" />
                </div>
                {role === 'student' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    <CheckCircle2 className="w-3 h-3" />
                    Dipilih
                  </span>
                )}
              </div>
              <div>
                <h3 className={`font-bold text-sm ${role === 'student' ? 'text-white' : 'text-slate-300'}`}>
                  STUDENT
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Untuk mengikuti quiz dan bergabung dalam team.
                </p>
              </div>
            </button>

            {/* Teacher Card */}
            <button
              type="button"
              role="radio"
              aria-checked={role === 'teacher'}
              onClick={() => setRole('teacher')}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                role === 'teacher'
                  ? 'bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    role === 'teacher'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <School className="w-5 h-5" />
                </div>
                {role === 'teacher' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/40">
                    <CheckCircle2 className="w-3 h-3" />
                    Dipilih
                  </span>
                )}
              </div>
              <div>
                <h3 className={`font-bold text-sm ${role === 'teacher' ? 'text-white' : 'text-slate-300'}`}>
                  TEACHER
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Untuk membuat quiz, mengelola soal, team, dan sesi.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Register Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Nama Lengkap
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === 'teacher' ? 'Bpk/Ibu Guru (Nama Lengkap)' : 'Nama Lengkap Siswa'}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@sekolah.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Konfirmasi Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-3 font-bold"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Daftar Sebagai {role === 'teacher' ? 'Teacher' : 'Student'}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-400">
          Sudah memiliki akun?{' '}
          <Link href="/login" className="font-bold text-blue-400 hover:text-blue-300 transition-colors">
            Masuk Sekarang
          </Link>
        </div>
      </div>
    </div>
  );
}
