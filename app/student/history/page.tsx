'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Trophy, Award, Calendar, Users, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

export default function StudentHistoryPage() {
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchStudentHistory = async () => {
      setIsLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from('team_members')
            .select(`
              team:teams (
                id,
                name,
                current_points,
                starting_points,
                quiz:quizzes (
                  id,
                  title,
                  description,
                  status,
                  updated_at,
                  teams (*)
                )
              )
            `)
            .eq('student_id', user.id);

          if (data) {
            const formatted = data.map((d: any) => d.team).filter(Boolean);
            setHistoryList(formatted);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentHistory();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
          <History className="w-7 h-7 text-indigo-400" />
          Riwayat Kompetisi & Prestasi
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Daftar seluruh pertandingan quiz yang pernah Anda ikuti bersama tim
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
          <p className="text-sm">Memuat riwayat quiz...</p>
        </div>
      ) : historyList.length === 0 ? (
        <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-500 opacity-50" />
          <h4 className="font-bold text-white text-base">Belum Ada Riwayat</h4>
          <p className="text-xs text-slate-400 mt-1">
            Bergabunglah ke pertandingan quiz untuk mencatatkan riwayat skor dan prestasi tim Anda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {historyList.map((item, idx) => {
            const allTeams = [...(item.quiz?.teams || [])].sort(
              (a: any, b: any) => b.current_points - a.current_points
            );
            const myRank = allTeams.findIndex((t: any) => t.id === item.id) + 1;
            const isWinner = myRank === 1 && item.quiz?.status === 'finished';

            return (
              <Card
                key={idx}
                hoverEffect
                glow={isWinner ? 'gold' : 'none'}
                className="flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Badge
                      variant={
                        item.quiz?.status === 'finished'
                          ? 'slate'
                          : item.quiz?.status === 'active'
                          ? 'emerald'
                          : 'amber'
                      }
                      size="sm"
                    >
                      {item.quiz?.status?.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(item.quiz?.updated_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-white text-lg">{item.quiz?.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{item.quiz?.description}</p>

                  {/* Team Performance Pill */}
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-400 block">
                        Tim: {item.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs font-bold text-slate-300">
                          Peringkat #{myRank > 0 ? myRank : '-'}
                        </span>
                        {isWinner && (
                          <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1">
                            🏆 Juara 1
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-amber-400 text-xl">
                        {item.current_points.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold ml-1">PTS</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                  <Link href={`/student/quiz/${item.quiz?.id}`}>
                    <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                      Buka Arena
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
