'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentNavbar } from '@/components/student/StudentNavbar';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { KeyRound, Users, AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { Team } from '@/types/database';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [quizCode, setQuizCode] = useState('');
  const [step, setStep] = useState<'code' | 'team'>('code');
  const [foundQuiz, setFoundQuiz] = useState<any>(null);
  const [foundSession, setFoundSession] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [existingMembership, setExistingMembership] = useState<{ teamId: string; teamName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleSearchCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizCode.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setExistingMembership(null);
    setFoundSession(null);

    try {
      const code = quizCode.trim().toUpperCase();
      let matchedQuiz: any = null;
      let matchedSession: any = null;

      // 1. Search in quizzes table
      const { data: qData } = await supabase
        .from('quizzes')
        .select('id, title, description, code, status')
        .ilike('code', code)
        .maybeSingle();

      if (qData) {
        matchedQuiz = qData;
      } else {
        // 2. Search in quiz_sessions table
        const { data: sData } = await supabase
          .from('quiz_sessions')
          .select('*, quiz:quizzes(id, title, description, code, status)')
          .ilike('code', code)
          .maybeSingle();

        if (sData && (sData as any).quiz) {
          matchedSession = sData;
          matchedQuiz = (sData as any).quiz;
        }
      }

      if (!matchedQuiz) {
        throw new Error('Quiz atau Sesi dengan kode tersebut tidak ditemukan.');
      }

      setFoundQuiz(matchedQuiz);
      setFoundSession(matchedSession);

      // Fetch teams for this quiz
      const { data: tData } = await supabase.from('teams').select('*').eq('quiz_id', matchedQuiz.id);
      if (tData && tData.length > 0) {
        setTeams(tData as Team[]);
        setSelectedTeamId(tData[0].id);

        // Check if student already has a team in this quiz
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: memberData } = await supabase
            .from('team_members')
            .select('team_id, team:teams(name)')
            .eq('student_id', user.id)
            .eq('quiz_id', matchedQuiz.id)
            .maybeSingle();

          if (memberData) {
            const teamName = (memberData as any).team?.name || 'Tim Sebelumnya';
            setExistingMembership({
              teamId: memberData.team_id,
              teamName,
            });
            setSelectedTeamId(memberData.team_id);
          }
        }

        setStep('team');
      } else {
        throw new Error('Belum ada tim yang dibuat pada quiz ini.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mencari quiz.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmJoin = async (forceSwitch: boolean = false) => {
    if (!foundQuiz || !selectedTeamId) return;

    setIsLoading(true);
    setErrorMsg(null);

    const destUrl = foundSession
      ? `/student/quiz/${foundQuiz.id}?session=${foundSession.id}`
      : `/student/quiz/${foundQuiz.id}`;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Harap login terlebih dahulu.');

      if (existingMembership && existingMembership.teamId !== selectedTeamId && !forceSwitch) {
        // Show warning that student is already in another team
        setErrorMsg(`Kamu sudah bergabung dengan ${existingMembership.teamName} untuk pertandingan ini.`);
        setIsLoading(false);
        return;
      }

      if (existingMembership && existingMembership.teamId === selectedTeamId) {
        // Already in this team -> proceed directly to quiz
        resetJoinModal();
        router.push(destUrl);
        router.refresh();
        return;
      }

      // Perform atomic join / switch via Supabase RPC or upsert with quiz_id
      const { data: rpcRes, error: rpcError } = await supabase.rpc('join_quiz_by_code', {
        p_code: foundQuiz.code,
        p_team_id: selectedTeamId,
      });

      if (rpcError) {
        // Fallback to direct upsert with quiz_id
        const { error: upsertErr } = await supabase.from('team_members').upsert({
          student_id: user.id,
          team_id: selectedTeamId,
          quiz_id: foundQuiz.id,
          joined_at: new Date().toISOString(),
        }, {
          onConflict: 'student_id, quiz_id',
        });

        if (upsertErr) throw upsertErr;
      } else if (rpcRes && !rpcRes.success && rpcRes.already_in_other_team) {
        if (!forceSwitch) {
          setErrorMsg(rpcRes.message);
          setIsLoading(false);
          return;
        } else {
          // Force switch team
          await supabase.rpc('switch_student_team', {
            p_quiz_id: foundQuiz.id,
            p_new_team_id: selectedTeamId,
          });
        }
      }

      resetJoinModal();
      router.push(destUrl);
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal bergabung ke tim.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetJoinModal = () => {
    setIsJoinModalOpen(false);
    setStep('code');
    setQuizCode('');
    setErrorMsg(null);
    setExistingMembership(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <StudentNavbar onOpenJoinModal={() => setIsJoinModalOpen(true)} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">{children}</main>

      {/* Join Quiz Modal */}
      <Modal
        isOpen={isJoinModalOpen}
        onClose={resetJoinModal}
        title="Gabung ke Pertandingan Quiz"
      >
        <div className="space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 'code' ? (
            <form onSubmit={handleSearchCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Kode Akses Quiz
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="Contoh: JS2026"
                    value={quizCode}
                    onChange={(e) => setQuizCode(e.target.value.toUpperCase())}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-amber-400 font-mono font-bold text-base focus:outline-none focus:border-amber-500 uppercase tracking-widest"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Minta 6 karakter kode quiz kepada guru Anda di kelas.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="md" onClick={resetJoinModal}>
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="md"
                  isLoading={isLoading}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Cari Quiz
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-blue-400 block">
                  Quiz Ditemukan
                </span>
                <h4 className="text-base font-extrabold text-white">{foundQuiz?.title}</h4>
              </div>

              {/* Notice if already joined a team */}
              {existingMembership && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs">
                  <p className="font-semibold">
                    Saat ini kamu terdaftar di: <strong>{existingMembership.teamName}</strong>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  Pilih Tim Anda
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto">
                  {teams.map((t) => {
                    const isSelected = selectedTeamId === t.id;
                    const isCurrent = existingMembership?.teamId === t.id;

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTeamId(t.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-400 text-white font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-blue-400 shrink-0" />
                            <span className="text-xs">{t.name}</span>
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                              Tim Kamu
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-amber-400 font-mono mt-1 block">
                          {t.current_points} PTS
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep('code')}>
                  ← Ganti Kode
                </Button>

                {existingMembership && existingMembership.teamId !== selectedTeamId ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTeamId(existingMembership.teamId);
                        handleConfirmJoin(false);
                      }}
                    >
                      Tetap di {existingMembership.teamName}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      isLoading={isLoading}
                      onClick={() => handleConfirmJoin(true)}
                    >
                      Pindah ke Tim Ini
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    isLoading={isLoading}
                    onClick={() => handleConfirmJoin(false)}
                  >
                    Masuk ke Arena Quiz
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
