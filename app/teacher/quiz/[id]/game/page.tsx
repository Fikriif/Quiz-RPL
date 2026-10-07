'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import {
  Trophy,
  ArrowLeft,
  Users,
  Play,
  CheckCircle2,
  XCircle,
  Flag,
  Sparkles,
  HelpCircle,
  RotateCcw,
  Award,
  Medal,
  ChevronRight,
  Radio,
  Clock,
  Rocket,
  DoorOpen,
  ShieldAlert,
  Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { QuestionBoard } from '@/components/question-board/QuestionBoard';
import { Leaderboard } from '@/components/leaderboard/Leaderboard';
import { QuestionModal } from '@/components/quiz/QuestionModal';
import { SubmissionsReviewModal } from '@/components/teacher/SubmissionsReviewModal';
import { CountdownTimer } from '@/components/ui/CountdownTimer';
import { createClient } from '@/lib/supabase/client';
import { Quiz, Category, Question, Team, QuizSession, QuestionUsage, QuizStatus } from '@/types/database';

export default function GameMasterPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const quizId = resolvedParams.id;
  const searchParams = useSearchParams();
  const explicitSessionId = searchParams.get('session');
  const supabase = createClient();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [usedQuestionIds, setUsedQuestionIds] = useState<Set<string>>(new Set());

  // Game Master State
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [isFinalResultOpen, setIsFinalResultOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchGameData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Quiz
      const { data: qData } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
      if (qData) setQuiz(qData as Quiz);

      // 2. Fetch or create Quiz Session
      let sData: any = null;
      if (explicitSessionId) {
        const { data } = await supabase
          .from('quiz_sessions')
          .select('*')
          .eq('id', explicitSessionId)
          .maybeSingle();
        sData = data;
      }

      if (!sData) {
        const { data } = await supabase
          .from('quiz_sessions')
          .select('*')
          .eq('quiz_id', quizId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        sData = data;
      }

      if (!sData && qData) {
        const { data: newSession } = await supabase
          .from('quiz_sessions')
          .insert({
            quiz_id: quizId,
            session_name: `Main Match - ${new Date().toLocaleDateString('id-ID')}`,
            status: qData.status === 'active' ? 'active' : 'waiting',
            started_at: qData.status === 'active' ? new Date().toISOString() : null,
          })
          .select()
          .single();
        sData = newSession;
      }
      if (sData) setSession(sData as QuizSession);

      // 3. Fetch Categories
      const { data: cData } = await supabase
        .from('categories')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_number', { ascending: true });
      if (cData) setCategories(cData as Category[]);

      // 4. Fetch Questions
      const { data: qsData } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('points', { ascending: true });
      if (qsData) setQuestions(qsData as Question[]);

      // 5. Fetch Teams strictly ordered by turn_order (Fixed Team Order)
      const { data: tData } = await supabase
        .from('teams')
        .select('*, members:team_members(*)')
        .eq('quiz_id', quizId)
        .order('turn_order', { ascending: true });
      if (tData) setTeams(tData as Team[]);

      // 6. Fetch Used Questions for this session
      if (sData) {
        const { data: uData } = await supabase
          .from('question_usage')
          .select('question_id')
          .eq('quiz_session_id', sData.id);
        if (uData) {
          setUsedQuestionIds(new Set(uData.map((u: any) => u.question_id)));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGameData();
  }, [quizId, explicitSessionId]);

  // Realtime subscription for quizzes table, question usage & session status
  useEffect(() => {
    if (!quizId) return;

    const channel = supabase
      .channel(`gm-realtime-${quizId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quizzes',
          filter: `id=eq.${quizId}`,
        },
        (payload: any) => {
          const updatedQuiz = payload.new as Quiz;
          setQuiz((prev) => (prev ? { ...prev, ...updatedQuiz } : updatedQuiz));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'question_usage',
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const usage = payload.new as QuestionUsage;
            setUsedQuestionIds((prev) => new Set([...prev, usage.question_id]));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
        },
        () => {
          // Re-fetch teams in fixed turn order
          supabase
            .from('teams')
            .select('*, members:team_members(*)')
            .eq('quiz_id', quizId)
            .order('turn_order', { ascending: true })
            .then(({ data }: any) => {
              if (data) setTeams(data as Team[]);
            });
        }
      )
      // Listen for QUIZ SESSIONS updates (turn rotation, question selection)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quiz_sessions',
          filter: `quiz_id=eq.${quizId}`,
        },
        (payload: any) => {
          if (payload.new) {
            setSession(payload.new as QuizSession);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, supabase]);

  const activeTurnTeam = teams.find((t) => t.id === session?.current_team_id) || teams[0];
  const allGameMembers = teams.flatMap((t: any) => t.members || []);
  const activeTurnPlayer = allGameMembers.find((m: any) => m.student_id === session?.current_player_id)?.student?.name || 'Pemain';
  const activeTurnQuestion = questions.find((q) => q.id === session?.current_question_id);

  const currentTeam = activeTurnTeam;

  const handleSelectQuestion = (q: Question) => {
    if (quiz?.status !== 'active') {
      alert('Pertandingan belum dimulai. Klik tombol "Mulai Pertandingan" terlebih dahulu.');
      return;
    }
    setSelectedQuestion(q);
    setIsQuestionModalOpen(true);
  };

  const handleAdminAdvanceTurn = async () => {
    if (!session) return;
    try {
      const { error } = await supabase.rpc('admin_advance_turn', {
        p_session_id: session.id,
      });
      if (error) throw error;
    } catch (err: any) {
      alert(`Gagal memindahkan giliran: ${err.message}`);
    }
  };

  const handleTeacherAwardPoints = async (isCorrect: boolean) => {
    if (!session || !selectedQuestion || !currentTeam) return;

    try {
      const { data, error } = await supabase.rpc('admin_award_points', {
        p_session_id: session.id,
        p_team_id: currentTeam.id,
        p_question_id: selectedQuestion.id,
        p_is_correct: isCorrect,
      });

      if (error) throw error;

      // Update local used list
      setUsedQuestionIds((prev) => new Set([...prev, selectedQuestion.id]));

      // Update local team points
      setTeams((prev) =>
        prev.map((t) => (t.id === currentTeam.id ? { ...t, current_points: data.new_score } : t))
      );
    } catch (err: any) {
      alert(`Gagal memberikan skor: ${err.message}`);
    }
  };

  const handleNextTurn = () => {
    handleAdminAdvanceTurn();
    setSelectedQuestion(null);
    setIsQuestionModalOpen(false);
  };

  const handleOpenLobby = async () => {
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('quizzes')
        .update({ status: 'waiting', updated_at: new Date().toISOString() })
        .eq('id', quizId);

      if (error) throw error;

      setQuiz((prev) => (prev ? { ...prev, status: 'waiting' } : null));
    } catch (err: any) {
      alert(`Gagal membuka lobby: ${err.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStartMatch = async () => {
    setIsUpdatingStatus(true);
    try {
      // 1. Update quiz status to active
      const { error: qError } = await supabase
        .from('quizzes')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', quizId);

      if (qError) throw qError;

      // 2. Ensure quiz_session is active & initialize turn
      let activeSId = session?.id;
      if (!activeSId) {
        const { data: newSession } = await supabase
          .from('quiz_sessions')
          .insert({
            quiz_id: quizId,
            session_name: `Sesi Utama - ${new Date().toLocaleDateString('id-ID')}`,
            status: 'active',
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (newSession) {
          setSession(newSession as QuizSession);
          activeSId = newSession.id;
        }
      } else {
        await supabase
          .from('quiz_sessions')
          .update({ status: 'active', started_at: new Date().toISOString() })
          .eq('id', activeSId);
      }

      if (activeSId) {
        await supabase.rpc('initialize_session_turn', { p_session_id: activeSId });
      }

      setQuiz((prev) => (prev ? { ...prev, status: 'active' } : null));

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      alert(`Gagal memulai pertandingan: ${err.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleFinishQuiz = async () => {
    if (!confirm('Akhiri pertandingan dan umumkan pemenang?')) return;

    try {
      if (session) {
        await supabase
          .from('quiz_sessions')
          .update({ status: 'finished', ended_at: new Date().toISOString() })
          .eq('id', session.id);
      }
      await supabase.from('quizzes').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', quizId);

      setQuiz((prev) => (prev ? { ...prev, status: 'finished' } : null));
      setIsFinalResultOpen(true);

      // Grand celebration confetti
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.5 },
      });
    } catch (err: any) {
      alert(`Gagal menyelesaikan quiz: ${err.message}`);
    }
  };

  const sortedTeams = [...teams].sort((a, b) => b.current_points - a.current_points);
  const winner = sortedTeams[0];
  const totalStudentsJoined = teams.reduce((acc, t: any) => acc + (t.members?.length || 0), 0);

  if (isLoading || !quiz) {
    return (
      <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
        <p className="text-sm">Memuat Control Room Game Master...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar / Control Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <Link
            href={`/teacher/quizzes/${quiz.id}/edit`}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
            <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black tracking-widest text-blue-400 uppercase bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                GAME MASTER CONTROL ROOM
              </span>
              <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                QUIZ: {quiz.code}
              </span>
              {session?.code && (
                <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                  SESI: {session.code}
                </span>
              )}
              {session?.session_name && (
                <span className="text-xs font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  {session.session_name}
                </span>
              )}
              {session?.is_exam_mode && (
                <Badge variant="rose" size="sm" className="animate-pulse">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  EXAM MODE
                </Badge>
              )}
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
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1">{quiz.title}</h1>
          </div>
        </div>

        {/* Action Controls based on Status Flow */}
        <div className="flex flex-wrap items-center gap-3">
          {session && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Code2 className="w-4 h-4 text-emerald-400" />}
              onClick={() => setIsReviewModalOpen(true)}
            >
              Review Jawaban Siswa
            </Button>
          )}

          {/* Status: DRAFT -> Show Buka Lobby Button */}
          {quiz.status === 'draft' && (
            <Button
              variant="accent"
              size="md"
              leftIcon={<DoorOpen className="w-4 h-4" />}
              isLoading={isUpdatingStatus}
              onClick={handleOpenLobby}
            >
              Buka Lobby (Set ke Waiting)
            </Button>
          )}

          {/* Status: WAITING -> Show MULAI PERTANDINGAN Button */}
          {quiz.status === 'waiting' && (
            <Button
              variant="gold"
              size="lg"
              leftIcon={<Rocket className="w-5 h-5 text-slate-950 fill-current" />}
              isLoading={isUpdatingStatus}
              onClick={handleStartMatch}
              className="animate-pulse shadow-xl shadow-amber-500/30 font-black"
            >
              🚀 Mulai Pertandingan
            </Button>
          )}

          {/* Status: ACTIVE -> Show Turn Indicator & Advance Turn Button */}
          {quiz.status === 'active' && (
            <>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-bold text-slate-400 pl-2">Giliran Aktif:</span>
                <span className="text-xs font-bold text-amber-300 px-2.5 py-1 bg-amber-500/10 rounded-lg border border-amber-500/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Turn #{session?.turn_number || 1}: {currentTeam?.name || 'Loading...'}
                </span>
                <Button
                  onClick={handleNextTurn}
                  variant="outline"
                  size="sm"
                  title="Pindah ke Tim Berikutnya (Sesuai Urutan Giliran Tetap)"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs font-semibold shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <Button
                variant="danger"
                size="sm"
                leftIcon={<Flag className="w-3.5 h-3.5" />}
                onClick={handleFinishQuiz}
              >
                Finish Quiz
              </Button>
            </>
          )}

          {/* Status: FINISHED -> Show Lihat Hasil Akhir Button */}
          {quiz.status === 'finished' && (
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Trophy className="w-4 h-4 text-slate-950" />}
              onClick={() => setIsFinalResultOpen(true)}
            >
              Lihat Hasil Akhir
            </Button>
          )}
        </div>
      </div>

      {/* STATE BANNERS */}
      {quiz.status === 'waiting' && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">
                Lobby Pertandingan Terbuka (Status: WAITING)
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Siswa dapat memasukkan kode <strong className="text-amber-400 font-mono text-sm">{quiz.code}</strong> dan memilih tim.
                Saat ini terdapat <strong>{totalStudentsJoined} siswa</strong> yang telah bergabung.
              </p>
            </div>
          </div>
          <Button
            variant="gold"
            size="md"
            leftIcon={<Play className="w-4 h-4 text-slate-950 fill-current" />}
            isLoading={isUpdatingStatus}
            onClick={handleStartMatch}
          >
            Mulai Sekarang
          </Button>
        </div>
      )}

      {quiz.status === 'active' && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span>PERTANDINGAN SEDANG BERLANGSUNG (LIVE MATCH)</span>
          </div>
          <span className="text-slate-400">
            Giliran berpindah secara otomatis dan tetap (Round-Robin) setiap kali soal selesai.
          </span>
        </div>
      )}

      {/* Fixed Team Turn Order Sequence Strip */}
      {quiz.status === 'active' && teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[10px] flex items-center gap-1 shrink-0">
            🔄 Urutan Giliran Tetap:
          </span>
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            {teams.map((t, idx) => {
              const isCurrent = t.id === session?.current_team_id;
              return (
                <React.Fragment key={t.id}>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-400/60 shadow-md shadow-amber-500/20 ring-1 ring-amber-400/50'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-slate-900/80 flex items-center justify-center text-[10px] font-black text-slate-300">
                      {t.turn_order || idx + 1}
                    </span>
                    <span>{t.name}</span>
                    {isCurrent && <span className="text-[10px] text-amber-400 animate-pulse font-black">● (Aktif)</span>}
                  </div>
                  {idx < teams.length - 1 && <span className="text-slate-600 font-bold">→</span>}
                </React.Fragment>
              );
            })}
            <span className="text-slate-600 font-bold">→ 🔄 (Loop)</span>
          </div>
        </div>
      )}

      {/* Main Arena Layout: Board on Left (70%), Leaderboard on Right (30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Question Board Matrix */}
        <div className="lg:col-span-8 space-y-4">
          {/* Active Turn Indicator Banner */}
          {currentTeam && quiz.status === 'active' && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-slate-900 border border-blue-500/40 shadow-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/50 flex flex-col items-center justify-center text-blue-300 font-black">
                    <span className="text-[9px] uppercase tracking-wider text-blue-400 font-semibold leading-none">Turn</span>
                    <span className="text-lg leading-tight">{session?.turn_number || 1}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                        Giliran Aktif
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                        session?.turn_status === 'answering'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}>
                        {session?.turn_status === 'answering' ? '⏳ Sedang Menjawab' : '🎯 Memilih Soal'}
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      {currentTeam.name}
                      {activeTurnPlayer && activeTurnPlayer !== 'Pemain' && (
                        <span className="text-xs font-normal text-slate-300 bg-slate-800/80 px-2.5 py-0.5 rounded-md border border-slate-700">
                          👤 {activeTurnPlayer}
                        </span>
                      )}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4 justify-between sm:justify-end">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Poin Tim
                    </span>
                    <span className="text-xl font-black font-mono text-amber-400">
                      {currentTeam.current_points.toLocaleString()} PTS
                    </span>
                  </div>

                  <Button
                    onClick={handleAdminAdvanceTurn}
                    variant="outline"
                    size="sm"
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs font-semibold shrink-0"
                    title="Lewati atau ganti giliran ke tim & pemain berikutnya (Urutan Tetap)"
                  >
                    ⏭️ Ganti Giliran
                  </Button>
                </div>
              </div>

              {/* Active Answering Question Info & Live Countdown */}
              {session?.turn_status === 'answering' && activeTurnQuestion && (
                <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      <Clock className="w-5 h-5 animate-spin" style={{ animationDuration: '4s' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                          Soal Aktif ({activeTurnQuestion.question_type === 'coding' ? 'Interactive Coding' : 'Multiple Choice'})
                        </span>
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          +{activeTurnQuestion.points} PTS
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-200 line-clamp-1">
                        {activeTurnQuestion.question}
                      </p>
                      {session.turn_started_at && (
                        <span className="text-[10px] text-slate-400">
                          Mulai: {new Date(session.turn_started_at).toLocaleTimeString('id-ID')} | Limit: {activeTurnQuestion.time_limit_seconds || 30}s
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <CountdownTimer
                      initialSeconds={activeTurnQuestion.time_limit_seconds || 30}
                      turnStartedAt={session?.turn_started_at}
                      isActive={true}
                      size="sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedQuestion(activeTurnQuestion);
                        setIsQuestionModalOpen(true);
                      }}
                      className="text-xs"
                    >
                      Buka Soal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Question Board */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="font-bold text-white text-base uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> QUESTION BOARD
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Tersedia
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Digunakan
                </span>
              </div>
            </div>

            <QuestionBoard
              categories={categories}
              questions={questions}
              usedQuestionIds={usedQuestionIds}
              selectedQuestionId={selectedQuestion?.id || null}
              onSelectQuestion={handleSelectQuestion}
              isInteractive={quiz.status === 'active'}
            />
          </Card>
        </div>

        {/* Right: Realtime Leaderboard & Controls */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="p-5">
            <Leaderboard
              quizId={quizId}
              initialTeams={teams}
              highlightTeamId={quiz.status === 'active' ? currentTeam?.id : undefined}
            />
          </Card>

          {/* Game Information Box */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs text-slate-400">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-400" /> Alur Pertandingan
            </h4>
            <ol className="space-y-1.5 list-decimal list-inside">
              <li><strong>Draft</strong>: Siapkan soal dan tim.</li>
              <li><strong>Waiting</strong>: Siswa join tim via kode quiz.</li>
              <li><strong>Active</strong>: Guru klik "Mulai Pertandingan" untuk membuka board.</li>
              <li><strong>Finished</strong>: Guru klik "Finish Quiz" untuk mengumumkan pemenang.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Active Question Modal */}
      {selectedQuestion && (
        <QuestionModal
          isOpen={isQuestionModalOpen}
          onClose={() => setIsQuestionModalOpen(false)}
          question={selectedQuestion}
          categoryName={categories.find((c) => c.id === selectedQuestion.category_id)?.name}
          turnStartedAt={
            session?.turn_status === 'answering' && session?.current_question_id === selectedQuestion.id
              ? session?.turn_started_at
              : null
          }
          isTeacher={true}
          onTeacherAwardPoints={handleTeacherAwardPoints}
          onNextQuestion={handleNextTurn}
        />
      )}

      {/* FINAL RESULT MODAL */}
      <Modal
        isOpen={isFinalResultOpen}
        onClose={() => setIsFinalResultOpen(false)}
        maxWidth="2xl"
        showCloseButton={true}
      >
        <div className="text-center space-y-6">
          {/* Trophy Header */}
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center shadow-2xl shadow-amber-500/50">
            <Trophy className="w-10 h-10 animate-bounce" />
          </div>

          <div>
            <span className="text-xs font-black tracking-widest text-amber-400 uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
              HASIL AKHIR PERTANDINGAN
            </span>
            <h2 className="text-3xl font-black text-white mt-3">{quiz.title}</h2>
            {winner && (
              <p className="text-lg font-bold text-slate-300 mt-1">
                🏆 Selamat kepada <span className="text-amber-400">{winner.name}</span> sebagai Juara!
              </p>
            )}
          </div>

          {/* Podium Table */}
          <div className="space-y-2.5 text-left">
            {sortedTeams.map((team, idx) => {
              const rank = idx + 1;
              return (
                <div
                  key={team.id}
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    rank === 1
                      ? 'bg-amber-500/15 border-amber-400/50 neon-glow-gold'
                      : rank === 2
                      ? 'bg-slate-300/10 border-slate-300/30'
                      : rank === 3
                      ? 'bg-amber-800/15 border-amber-700/30'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm ${
                        rank === 1
                          ? 'bg-amber-400 text-slate-950'
                          : rank === 2
                          ? 'bg-slate-300 text-slate-950'
                          : rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-white text-base">{team.name}</h4>
                      <span className="text-xs text-slate-400">
                        Starting: {team.starting_points} pts
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-black text-2xl text-amber-400">
                      {team.current_points.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-slate-400 ml-1">PTS</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-center gap-3">
            <Link href="/teacher/dashboard">
              <Button variant="primary" size="lg">
                Kembali ke Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </Modal>

      {/* Submissions & Exam Logs Modal */}
      {session && (
        <SubmissionsReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          sessionId={session.id}
          quizTitle={quiz.title}
        />
      )}
    </div>
  );
}
