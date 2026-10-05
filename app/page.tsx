'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy,
  Users,
  Grid,
  Zap,
  ShieldCheck,
  PlayCircle,
  Sparkles,

} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';

export default function LandingPage() {
  const [quizCode, setQuizCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizCode.trim()) return;

    setIsSearching(true);
    setJoinError('');

    try {
      const code = quizCode.trim().toUpperCase();
      const { data: quiz, error } = await supabase
        .from('quizzes')
        .select('id, title, status')
        .ilike('code', code)
        .single();

      if (error || !quiz) {
        setJoinError('Quiz dengan kode tersebut tidak ditemukan. Periksa kembali kodenya.');
        setIsSearching(false);
        return;
      }

      // Check user session
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login with callback
        router.push(`/login?redirect=/student/quiz/${quiz.id}&code=${code}`);
      } else {
        router.push(`/student/quiz/${quiz.id}`);
      }
    } catch (err: any) {
      setJoinError('Terjadi kesalahan saat mencari quiz.');
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Background Neon Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-2/3 right-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation Header */}
      <header className="relative z-20 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <span className="font-black text-xl tracking-wider text-white">QUIZ ARENA</span>
            <span className="block text-[10px] font-extrabold text-blue-400 tracking-widest uppercase">
              Academic Competition
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="outline" size="sm">
              Masuk (Login)
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="primary" size="sm">
              Daftar Akun
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 animate-pulse-subtle">
          <Sparkles className="w-3.5 h-3.5" />
          Platform Kompetisi Quiz Antar Tim Sekolah
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[1.1] max-w-4xl mx-auto">
          Challenge Your Knowledge.{' '}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-amber-300 bg-clip-text text-transparent">
            Compete With Your Team.
          </span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Platform quiz interaktif dengan konsep Question Board & starting points untuk ruang kelas.
          Dirancang khusus untuk layar proyektor guru dan kenyamanan tablet/laptop siswa.
        </p>

        {/* Quick Join Bar & Primary CTAs */}
        <div className="mt-10 max-w-xl mx-auto flex flex-col sm:flex-row items-center gap-3 p-2 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl shadow-black/80">
          <input
            type="text"
            placeholder="Masukkan Kode Quiz (e.g. JS2026)"
            value={quizCode}
            onChange={(e) => setQuizCode(e.target.value)}
            className="w-full px-4 py-3 bg-transparent text-white font-mono text-base font-bold placeholder:text-slate-500 placeholder:font-sans focus:outline-none uppercase tracking-wider"
          />
          <Button
            variant="gold"
            size="lg"
            className="w-full sm:w-auto shrink-0"
            isLoading={isSearching}
            onClick={handleJoinByCode}
          >
            Join Quiz
          </Button>
        </div>

        {joinError && (
          <p className="mt-3 text-xs font-semibold text-rose-400 max-w-md mx-auto">{joinError}</p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/teacher/dashboard">
            <Button variant="accent" size="lg" leftIcon={<PlayCircle className="w-5 h-5" />}>
              Teacher Dashboard
            </Button>
          </Link>
          <Link href="/student/dashboard">
            <Button variant="secondary" size="lg" leftIcon={<Users className="w-5 h-5" />}>
              Student Arena
            </Button>
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {/* Card 1: Question Board */}
          <Card hoverEffect glow="blue" className="relative overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-5">
              <Grid className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Question Board Matrix</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Pilihan kategori dengan level poin berbeda (100 - 1000 pts). Soal yang sudah dijawab otomatis ditandai <strong>USED</strong> dan terkunci.
            </p>
          </Card>

          {/* Card 2: Atomic Score Engine */}
          <Card hoverEffect glow="gold" className="relative overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">1000 Starting Points</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Semua tim memulai dengan 1000 poin. Jawaban benar menambah poin (+pts), jawaban salah mengurangi poin (-pts) tanpa pernah jatuh di bawah 0.
            </p>
          </Card>

          {/* Card 3: Game Master & Realtime */}
          <Card hoverEffect glow="green" className="relative overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Realtime & Game Master</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Teacher Game Master control room, integrasi CSV import dengan live preview, serta leaderboard otomatis tersinkronisasi realtime.
            </p>
          </Card>
        </div>

        {/* Demonstration Board Preview Graphic */}
        <div className="mt-20 p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800 text-left">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                Preview Board Pertandingan
              </span>
              <h4 className="text-xl font-black text-white">Web Development Challenge</h4>
            </div>
            <Badge variant="emerald">ACTIVE GAME</Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {['HTML', 'CSS', 'JAVASCRIPT', 'DATABASE'].map((cat, i) => (
              <div key={cat} className="space-y-2">
                <div className="p-2.5 rounded-lg bg-blue-900/40 border border-blue-500/30 text-xs font-bold text-blue-300 uppercase">
                  {cat}
                </div>
                {[100, 200, 300, 500].map((pts, row) => (
                  <div
                    key={pts}
                    className={`p-3.5 rounded-xl font-mono font-bold text-lg border ${
                      i === 1 && row === 0
                        ? 'bg-slate-900/40 border-slate-800 text-slate-600 line-through'
                        : i === 2 && row === 1
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 neon-glow-gold'
                        : 'bg-slate-800/80 border-slate-700/80 text-blue-400'
                    }`}
                  >
                    {pts}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 py-8 text-center text-xs text-slate-500">
        <p>© 2026 QUIZ ARENA. Academic Quiz Competition Platform. Built for excellence.</p>
      </footer>
    </div>
  );
}
