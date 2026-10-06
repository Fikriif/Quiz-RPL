'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trophy, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types/database';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect');
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Validation
    if (!email.trim()) {
      setErrorMsg('Email wajib diisi.');
      return;
    }

    if (!password) {
      setErrorMsg('Kata sandi wajib diisi.');
      return;
    }

    setIsLoading(true);

    try {
      // 2. Authenticate via Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        // AUTH ERROR Handling
        const lowerMsg = authError.message.toLowerCase();
        if (lowerMsg.includes('invalid login credentials') || lowerMsg.includes('invalid credentials')) {
          setErrorMsg('Tidak dapat login. Email atau password salah.');
        } else if (lowerMsg.includes('email not confirmed')) {
          setErrorMsg('Email belum dikonfirmasi. Silakan periksa kotak masuk email Anda untuk verifikasi.');
        } else {
          setErrorMsg(`Tidak dapat login: ${authError.message}`);
        }
        setIsLoading(false);
        return;
      }

      if (!data?.user) {
        setErrorMsg('Tidak dapat login. Data pengguna tidak ditemukan.');
        setIsLoading(false);
        return;
      }

      const authUser = data.user;

      // 3. Fetch profile record from public.profiles table (profiles.id = user.id)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .eq('id', authUser.id)
        .maybeSingle();

      let currentRole: string | null = profile?.role || null;

      // Self-healing fallback: If profile record is missing from table, attempt creation from metadata
      if (!profile) {
        const metaRole = authUser.user_metadata?.role as UserRole | undefined;
        const metaName = authUser.user_metadata?.name || email.trim().split('@')[0];

        if (metaRole === 'teacher' || metaRole === 'student') {
          const { error: healError } = await supabase.from('profiles').upsert({
            id: authUser.id,
            name: metaName,
            email: authUser.email || email.trim(),
            role: metaRole,
            updated_at: new Date().toISOString(),
          });

          if (!healError) {
            currentRole = metaRole;
          } else {
            // PROFILE ERROR
            setErrorMsg('Akun berhasil login tetapi profile belum ditemukan.');
            setIsLoading(false);
            return;
          }
        } else {
          // PROFILE ERROR
          setErrorMsg('Akun berhasil login tetapi profile belum ditemukan.');
          setIsLoading(false);
          return;
        }
      }

      // 4. Validate Role (ROLE ERROR)
      if (!currentRole || (currentRole !== 'teacher' && currentRole !== 'student')) {
        setErrorMsg('Role akun tidak valid.');
        setIsLoading(false);
        return;
      }

      // 5. Redirect based on role (REDIRECT ERROR Handling)
      try {
        if (redirectPath) {
          // Prevent cross-role redirect mismatch
          if (currentRole === 'teacher' && redirectPath.startsWith('/student')) {
            router.push('/teacher/dashboard');
          } else if (currentRole === 'student' && redirectPath.startsWith('/teacher')) {
            router.push('/student/dashboard');
          } else {
            router.push(redirectPath);
          }
        } else if (currentRole === 'teacher') {
          router.push('/teacher/dashboard');
        } else {
          router.push('/student/dashboard');
        }
        router.refresh();
      } catch (redirErr) {
        setErrorMsg('Tidak dapat membuka dashboard.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan pada proses autentikasi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl shadow-black/80 backdrop-blur-md z-10">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <span className="font-black text-xl tracking-wider text-white">QUIZ ARENA</span>
        </Link>
        <h1 className="text-2xl font-black text-white">Selamat Datang Kembali</h1>
        <p className="text-xs text-slate-400 mt-1">Masuk untuk mengakses dashboard kompetisi quiz</p>
      </div>

      {/* Categorized Error Alert */}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span className="leading-relaxed">{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
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
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2 font-bold"
          isLoading={isLoading}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Masuk ke Akun
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-400">
        Belum memiliki akun?{' '}
        <Link href="/register" className="font-bold text-blue-400 hover:text-blue-300 transition-colors">
          Daftar Sekarang
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense fallback={<div className="text-white text-sm">Memuat...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
