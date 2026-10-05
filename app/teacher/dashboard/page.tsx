'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  HelpCircle,
  Users,
  PlayCircle,
  PlusCircle,
  Trophy,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import { Quiz } from '@/types/database';

export default function TeacherDashboard() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    totalQuestions: 0,
    totalTeams: 0,
    activeQuizzes: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setUserName(user.user_metadata?.name || 'Guru');

          // Fetch quizzes created by this teacher
          const { data: quizList } = await supabase
            .from('quizzes')
            .select(`
              *,
              questions (count),
              teams (count)
            `)
            .order('created_at', { ascending: false });

          if (quizList) {
            setQuizzes(quizList as any[]);

            // Fetch overall question & team count
            const { count: qCount } = await supabase
              .from('questions')
              .select('*', { count: 'exact', head: true });

            const { count: tCount } = await supabase
              .from('teams')
              .select('*', { count: 'exact', head: true });

            const activeCount = quizList.filter((q) => q.status === 'active').length;

            setStats({
              totalQuizzes: quizList.length,
              totalQuestions: qCount || 0,
              totalTeams: tCount || 0,
              activeQuizzes: activeCount,
            });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, [supabase]);

  const activeQuiz = quizzes.find((q) => q.status === 'active');

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900 border border-blue-500/20 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Control Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Selamat Datang, {userName} 👋
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Kelola kompetisi quiz, pantau skor tim, dan kendalikan Game Master untuk kelas Anda.
          </p>
        </div>

        <Link href="/teacher/quizzes/create">
          <Button
            variant="gold"
            size="lg"
            leftIcon={<PlusCircle className="w-5 h-5 text-slate-950" />}
          >
            Buat Quiz Baru
          </Button>
        </Link>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card hoverEffect className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Quiz
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3">{stats.totalQuizzes}</p>
        </Card>

        <Card hoverEffect className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Bank Soal
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3">{stats.totalQuestions}</p>
        </Card>

        <Card hoverEffect className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Tim
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3">{stats.totalTeams}</p>
        </Card>

        <Card hoverEffect glow="green" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Quiz Aktif
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <PlayCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-400 mt-3">{stats.activeQuizzes}</p>
        </Card>
      </div>

      {/* Active Game Master Spotlight */}
      {activeQuiz && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 neon-glow-green">
          <div>
            <Badge variant="emerald" size="sm" icon={<PlayCircle className="w-3.5 h-3.5" />}>
              GAME SEDANG BERJALAN
            </Badge>
            <h3 className="text-xl font-black text-white mt-2">{activeQuiz.title}</h3>
            <p className="text-xs text-slate-400 mt-1">
              Kode Akses Siswa:{' '}
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {activeQuiz.code}
              </span>
            </p>
          </div>
          <Link href={`/teacher/quiz/${activeQuiz.id}/game`}>
            <Button
              variant="success"
              size="lg"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Buka Game Master Control
            </Button>
          </Link>
        </div>
      )}

      {/* Recent Quizzes List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white uppercase tracking-wider">Daftar Quiz Anda</h3>
          <Link href="/teacher/quizzes" className="text-xs font-bold text-blue-400 hover:underline">
            Lihat Semua Quiz →
          </Link>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
            <p className="text-sm">Memuat data dashboard...</p>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
            <Layers className="w-10 h-10 mx-auto mb-3 text-slate-500 opacity-50" />
            <h4 className="font-bold text-white text-base">Belum Ada Quiz</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Buat quiz pertama Anda untuk memulai kompetisi seru antar tim siswa di kelas.
            </p>
            <Link href="/teacher/quizzes/create" className="inline-block mt-4">
              <Button variant="primary" size="md">
                + Buat Quiz Sekarang
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.slice(0, 6).map((quiz) => (
              <Card key={quiz.id} hoverEffect className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Badge
                      variant={
                        quiz.status === 'active'
                          ? 'emerald'
                          : quiz.status === 'waiting'
                          ? 'amber'
                          : quiz.status === 'finished'
                          ? 'slate'
                          : 'blue'
                      }
                      size="sm"
                    >
                      {quiz.status.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                      {quiz.code}
                    </span>
                  </div>

                  <h4 className="font-bold text-white text-base line-clamp-1">{quiz.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {quiz.description || 'Tidak ada deskripsi.'}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400">
                    {quiz.starting_points} Starting Pts
                  </span>
                  <div className="flex items-center gap-2">
                    <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/teacher/quiz/${quiz.id}/game`}>
                      <Button variant="primary" size="sm">
                        Game
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
