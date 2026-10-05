'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Trophy, Calendar, Users, HelpCircle, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { Quiz } from '@/types/database';

export default function TeacherHistoryPage() {
  const [finishedQuizzes, setFinishedQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('quizzes')
          .select(`
            *,
            teams (*),
            questions (*)
          `)
          .eq('status', 'finished')
          .order('updated_at', { ascending: false });

        if (data) {
          setFinishedQuizzes(data as any[]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
          <History className="w-7 h-7 text-blue-400" />
          Riwayat Pertandingan Quiz
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Daftar seluruh kompetisi quiz yang telah selesai beserta pemenang dan skor akhir
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
          <p className="text-sm">Memuat riwayat pertandingan...</p>
        </div>
      ) : finishedQuizzes.length === 0 ? (
        <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-500 opacity-50" />
          <h4 className="font-bold text-white text-base">Belum Ada Pertandingan Selesai</h4>
          <p className="text-xs text-slate-400 mt-1">
            Pertandingan yang telah diselesaikan oleh Guru melalui Game Master akan tercatat di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {finishedQuizzes.map((quiz) => {
            const sortedTeams = [...(quiz.teams || [])].sort(
              (a, b) => b.current_points - a.current_points
            );
            const winner = sortedTeams[0];

            return (
              <Card key={quiz.id} hoverEffect className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="slate" size="sm">
                      FINISHED
                    </Badge>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(quiz.updated_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white text-lg">{quiz.title}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{quiz.description}</p>

                  {/* Winner Spotlight Box */}
                  {winner && (
                    <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-[10px] uppercase font-bold text-amber-300 block">
                            Juara 1 (Winner)
                          </span>
                          <span className="text-sm font-extrabold text-white">{winner.name}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-amber-400 text-lg">
                          {winner.current_points.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1 font-bold">PTS</span>
                      </div>
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-slate-400">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                      <Users className="w-4 h-4 text-blue-400" />
                      <span>{quiz.teams?.length || 0} Tim Bertanding</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                      <HelpCircle className="w-4 h-4 text-indigo-400" />
                      <span>{quiz.questions?.length || 0} Total Soal</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                  <Link href={`/teacher/quiz/${quiz.id}/game`}>
                    <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                      Lihat Hasil Akhir
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
