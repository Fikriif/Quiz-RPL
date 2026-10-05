'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Users,
  PlayCircle,
  KeyRound,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';

export default function StudentDashboard() {
  const [userName, setUserName] = useState('');
  const [enrolledTeams, setEnrolledTeams] = useState<any[]>([]);
  const [activeQuizzes, setActiveQuizzes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchStudentData = async () => {
      setIsLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setUserName(user.user_metadata?.name || 'Siswa');

          // Fetch teams student joined with quiz information
          const { data: memberData } = await supabase
            .from('team_members')
            .select(`
              team_id,
              team:teams (
                id,
                name,
                current_points,
                starting_points,
                quiz:quizzes (
                  id,
                  title,
                  description,
                  code,
                  status
                )
              )
            `)
            .eq('student_id', user.id);

          if (memberData) {
            const formatted = memberData.map((m: any) => m.team).filter(Boolean);
            setEnrolledTeams(formatted);
          }

          // Fetch all public active quizzes
          const { data: activeQ } = await supabase
            .from('quizzes')
            .select('*')
            .eq('status', 'active');

          if (activeQ) {
            setActiveQuizzes(activeQ);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentData();
  }, [supabase]);

  const primaryTeam = enrolledTeams[0];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-900/40 via-blue-900/30 to-slate-900 border border-indigo-500/20 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Arena Kompetisi Siswa
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Selamat Datang, {userName}! 🎯
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Pilih soal bersama timmu, raih skor tertinggi di leaderboard, dan jadilah juara kelas!
          </p>
        </div>
      </div>

      {/* Primary Team Spotlight Card */}
      {primaryTeam ? (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="blue" size="sm" icon={<Users className="w-3.5 h-3.5" />}>
                  TIM SAYA
                </Badge>
                {primaryTeam.quiz?.status === 'active' && (
                  <Badge variant="emerald" size="sm">
                    LIVE MATCH
                  </Badge>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
                {primaryTeam.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Kompetisi:{' '}
                <strong className="text-slate-200">{primaryTeam.quiz?.title}</strong>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Skor Tim Saat Ini
                </span>
                <span className="text-3xl sm:text-4xl font-black font-mono text-amber-400">
                  {primaryTeam.current_points.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-bold ml-1">PTS</span>
              </div>

              {primaryTeam.quiz?.id && (
                <Link href={`/student/quiz/${primaryTeam.quiz.id}`}>
                  <Button
                    variant="gold"
                    size="lg"
                    rightIcon={<ArrowRight className="w-5 h-5 text-slate-950" />}
                  >
                    Masuk ke Pertandingan
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Card className="text-center p-8">
          <Users className="w-12 h-12 mx-auto mb-3 text-indigo-400 opacity-70" />
          <h3 className="text-lg font-bold text-white">Belum Bergabung ke Tim Quiz</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Gunakan kode quiz dari guru Anda untuk bergabung ke dalam tim dan mulai bertanding.
          </p>
        </Card>
      )}

      {/* Enrolled Quizzes List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">
          Quiz yang Anda Ikuti ({enrolledTeams.length})
        </h3>

        {enrolledTeams.length === 0 ? (
          <div className="p-8 text-center text-slate-400 glass-panel rounded-2xl">
            <p className="text-xs">Belum ada quiz terdaftar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrolledTeams.map((team) => (
              <Card key={team.id} hoverEffect className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant={
                        team.quiz?.status === 'active'
                          ? 'emerald'
                          : team.quiz?.status === 'waiting'
                          ? 'amber'
                          : 'slate'
                      }
                      size="sm"
                    >
                      {team.quiz?.status?.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs font-bold text-slate-400">
                      Code: {team.quiz?.code}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-white text-base">{team.quiz?.title}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-blue-400 font-bold">Tim: {team.name}</span>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {team.current_points} PTS
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <Link href={`/student/quiz/${team.quiz?.id}`}>
                    <Button
                      variant={team.quiz?.status === 'active' ? 'primary' : 'outline'}
                      size="sm"
                      rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    >
                      Buka Arena
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
