'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import {
  Trophy,
  ArrowLeft,
  Users,
  Grid,
  TrendingUp,
  AlertCircle,
  Clock,
  Sparkles,
  Lock,
  Medal,
  Award,
  Radio,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { QuestionBoard } from '@/components/question-board/QuestionBoard';
import { Leaderboard } from '@/components/leaderboard/Leaderboard';
import { QuestionModal } from '@/components/quiz/QuestionModal';
import { ExamFocusMonitor } from '@/components/exam/ExamFocusMonitor';
import { createClient } from '@/lib/supabase/client';
import {
  Quiz,
  Category,
  Question,
  Team,
  QuizSession,
  QuestionUsage,
  SubmitAnswerResult,
  SubmitCodingResult,
  TestResultItem,
} from '@/types/database';
import { CodeBundle } from '@/components/code-editor/CodeEditor';

export interface StudentTeam extends Team {
  team_id: string;
  student_id: string;
}

export default function StudentQuizArenaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const quizId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitSessionId = searchParams.get('session');
  const supabase = createClient();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeam, setMyTeam] = useState<StudentTeam | null>(null);
  const [myTeamMembers, setMyTeamMembers] = useState<any[]>([]);
  const [usedQuestionIds, setUsedQuestionIds] = useState<Set<string>>(new Set());

  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchQuizData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch authenticated user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const authUserId = user?.id || null;
      if (authUserId) {
        setCurrentUserId(authUserId);
      }

      // 2. Fetch Quiz
      const { data: qData, error: qError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (qData) setQuiz(qData as Quiz);

      // 3. Fetch or ensure Quiz Session
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

      if (!sData && qData && (qData.status === 'active' || qData.status === 'waiting')) {
        const { data: newSession } = await supabase
          .from('quiz_sessions')
          .insert({
            quiz_id: quizId,
            status: qData.status,
            started_at: qData.status === 'active' ? new Date().toISOString() : null,
          })
          .select()
          .maybeSingle();
        sData = newSession;
      }
      if (sData) setSession(sData as QuizSession);

      // 4. Fetch Categories
      const { data: cData } = await supabase
        .from('categories')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_number', { ascending: true });
      if (cData) setCategories(cData as Category[]);

      // 5. Fetch Questions with Coding Fields (Security Note: Client does NOT receive correct_answer)
      const { data: qsData } = await supabase
        .from('questions')
        .select('id, quiz_id, category_id, question, option_a, option_b, option_c, option_d, points, explanation, image_url, order_number, question_type, language, starter_code, expected_output, test_cases, time_limit_seconds')
        .eq('quiz_id', quizId)
        .order('points', { ascending: true });
      if (qsData) setQuestions(qsData as Question[]);

      // 6. Fetch Teams with members strictly ordered by turn_order (Fixed Team Order)
      const { data: tData } = await supabase
        .from('teams')
        .select('*, members:team_members(*, student:profiles(*))')
        .eq('quiz_id', quizId)
        .order('turn_order', { ascending: true });
      if (tData) setTeams(tData as any[]);

      // 7. Find Student's Team strictly using student_id and quiz_id
      let studentTeam: StudentTeam | null = null;
      if (authUserId) {
        // Direct query on team_members with student_id and quiz_id
        const { data: memberEntry } = await supabase
          .from('team_members')
          .select(`
            *,
            teams:team_id (
              id,
              name,
              description,
              starting_points,
              current_points,
              quiz_id
            )
          `)
          .eq('student_id', authUserId)
          .eq('quiz_id', quizId)
          .maybeSingle();

        if (memberEntry) {
          const tInfo = (memberEntry as any).teams || (memberEntry as any).team;
          if (tInfo) {
            studentTeam = {
              ...tInfo,
              id: memberEntry.team_id,
              team_id: memberEntry.team_id,
              quiz_id: memberEntry.quiz_id || quizId,
              student_id: memberEntry.student_id,
            };
          } else {
            // Direct query fallback for team details
            const { data: tRow } = await supabase
              .from('teams')
              .select('*')
              .eq('id', memberEntry.team_id)
              .maybeSingle();

            if (tRow) {
              studentTeam = {
                ...tRow,
                id: memberEntry.team_id,
                team_id: memberEntry.team_id,
                quiz_id: memberEntry.quiz_id || quizId,
                student_id: memberEntry.student_id,
              };
            }
          }
        } else if (tData) {
          // Fallback: search in teams list
          for (const t of tData) {
            const isMember = (t.members || []).some((m: any) => m.student_id === authUserId);
            if (isMember) {
              studentTeam = {
                ...t,
                id: t.id,
                team_id: t.id,
                quiz_id: quizId,
                student_id: authUserId,
              };
              break;
            }
          }
        }

        if (studentTeam) {
          setMyTeam(studentTeam);
          // Find members for this team
          const matched = tData?.find((t: any) => t.id === studentTeam?.team_id || t.id === studentTeam?.id);
          setMyTeamMembers(matched?.members || []);
        }
      }

      console.log('[StudentQuiz] Initialized Data:', {
        quizId,
        currentUserId: authUserId,
        session: sData,
        myTeam: studentTeam,
      });

      // 8. Fetch Used Questions for this session
      if (sData) {
        const { data: uData } = await supabase
          .from('question_usage')
          .select('question_id')
          .eq('quiz_session_id', sData.id);
        if (uData) {
          setUsedQuestionIds(new Set(uData.map((u: any) => u.question_id)));
        }

        // Auto-reconnect: if turn is currently answering, restore active question modal
        if (sData.current_question_id && sData.turn_status === 'answering' && qsData) {
          const activeQ = (qsData as Question[]).find((q) => q.id === sData.current_question_id);
          if (activeQ) {
            setSelectedQuestion(activeQ);
            setIsQuestionModalOpen(true);
          }
        }
      }
    } catch (err) {
      console.error('[StudentQuiz] fetchQuizData error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizData();
  }, [quizId]);

  // Realtime subscription for quizzes (status updates), teams, and question usage
  useEffect(() => {
    if (!quizId) return;

    const channel = supabase
      .channel(`student-realtime-${quizId}`)
      // 1. Listen for QUIZ STATUS UPDATES (waiting -> active -> finished)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quizzes',
          filter: `id=eq.${quizId}`,
        },
        (payload: any) => {
          const updated = payload.new as Quiz;
          setQuiz((prev) => {
            const next = prev ? { ...prev, ...updated } : updated;
            if (next.status === 'active' && prev?.status !== 'active') {
              // Trigger mini confetti on game start
              confetti({
                particleCount: 70,
                spread: 60,
                origin: { y: 0.6 },
              });
            }
            return next;
          });
        }
      )
      // 2. Listen for QUIZ SESSIONS updates (turn rotation, question selection)
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
            const newSession = payload.new as QuizSession;
            setSession(newSession);

            // Sync active question modal across all teammates / players
            if (newSession.current_question_id && newSession.turn_status === 'answering') {
              // Find matching question from questions list or fetch it
              setQuestions((prevQs) => {
                const matched = prevQs.find((q) => q.id === newSession.current_question_id);
                if (matched) {
                  setSelectedQuestion(matched);
                  setIsQuestionModalOpen(true);
                }
                return prevQs;
              });
            }
            // Note: When turn rotates to waiting_selection, do NOT force-close the modal
            // so the submitting student can view the result banner.
            // The modal will close gracefully when the student clicks 'Tutup & Lanjut'
            // or when a new question starts.
          }
        }
      )
      // 3. Listen for QUESTION USAGE updates
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
      // 4. Listen for TEAMS score updates
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
          filter: `quiz_id=eq.${quizId}`,
        },
        (payload: any) => {
          const updatedTeam = payload.new as Team;
          setTeams((prev) => prev.map((t) => (t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t)));
          setMyTeam((prev) => (prev && (prev.team_id === updatedTeam.id || prev.id === updatedTeam.id) ? { ...prev, ...updatedTeam } : prev));
        }
      )
      // 5. Listen for TEAM MEMBERS updates (lobby sync)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
        },
        async () => {
          // Re-fetch student team with student_id and quiz_id
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const authId = user?.id || currentUserId;

          if (authId) {
            const { data: memberEntry } = await supabase
              .from('team_members')
              .select(`
                *,
                teams:team_id (
                  id,
                  name,
                  description,
                  starting_points,
                  current_points,
                  quiz_id
                )
              `)
              .eq('student_id', authId)
              .eq('quiz_id', quizId)
              .maybeSingle();

            if (memberEntry) {
              const tInfo = (memberEntry as any).teams || (memberEntry as any).team;
              if (tInfo) {
                setMyTeam({
                  ...tInfo,
                  id: memberEntry.team_id,
                  team_id: memberEntry.team_id,
                  quiz_id: memberEntry.quiz_id || quizId,
                  student_id: memberEntry.student_id,
                });
              }
            }
          }

          // Re-fetch all teams with members in fixed turn order
          const { data: tData } = await supabase
            .from('teams')
            .select('*, members:team_members(*, student:profiles(*))')
            .eq('quiz_id', quizId)
            .order('turn_order', { ascending: true });

          if (tData) {
            setTeams(tData as any[]);
            if (authId) {
              const matched = tData.find((t: any) =>
                (t.members || []).some((m: any) => m.student_id === authId)
              );
              if (matched) {
                setMyTeamMembers(matched.members || []);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, currentUserId, supabase]);

  // Turn calculations
  const myTeamId = myTeam?.team_id || myTeam?.id;
  const isMyTeamTurn = Boolean(myTeamId && session?.current_team_id && session.current_team_id === myTeamId);
  const isMyPlayerTurn = Boolean(isMyTeamTurn && session?.current_player_id && session.current_player_id === currentUserId);
  const isSpectator = Boolean(isMyTeamTurn && !isMyPlayerTurn);
  const isOtherTeamTurn = Boolean(session?.current_team_id && !isMyTeamTurn);

  const activeTeamObj = teams.find((t) => t.id === session?.current_team_id);
  const allMembers = teams.flatMap((t: any) => t.members || []);
  const activeMember = allMembers.find((m: any) => m.student_id === session?.current_player_id);
  const activePlayerName = activeMember?.student?.name || (isMyPlayerTurn ? 'Kamu' : 'Pemain');

  const handleSelectQuestion = async (q: Question) => {
    if (quiz?.status !== 'active') {
      alert('Pertandingan belum dimulai.');
      return;
    }
    if (!isMyTeamTurn) {
      alert('Belum giliran tim kamu untuk memilih soal.');
      return;
    }
    if (!isMyPlayerTurn) {
      alert('Hanya pemain aktif pada giliran ini yang dapat memilih soal.');
      return;
    }

    try {
      const activeTeamId = myTeam?.team_id || myTeam?.id;
      if (session && activeTeamId && currentUserId) {
        const { error } = await supabase.rpc('select_question_for_turn', {
          p_session_id: session.id,
          p_team_id: activeTeamId,
          p_player_id: currentUserId,
          p_question_id: q.id,
        });

        if (error) throw error;
      }

      setSelectedQuestion(q);
      setIsQuestionModalOpen(true);
    } catch (err: any) {
      alert(`Gagal memilih soal: ${err.message}`);
    }
  };

  const handleSubmitAnswer = async (
    selectedOption: 'A' | 'B' | 'C' | 'D'
  ): Promise<SubmitAnswerResult> => {
    // 1. Auto-recovery fallback if any variable was not yet set in state
    let activeSession = session;
    if (!activeSession) {
      const { data: sData } = await supabase
        .from('quiz_sessions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sData) {
        activeSession = sData as QuizSession;
        setSession(sData as QuizSession);
      }
    }

    let activeUser = currentUserId;
    if (!activeUser) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        activeUser = user.id;
        setCurrentUserId(user.id);
      }
    }

    let activeTeam = myTeam;
    if (!activeTeam && activeUser) {
      const { data: memberEntry } = await supabase
        .from('team_members')
        .select(`
          *,
          teams:team_id (
            id,
            name,
            description,
            starting_points,
            current_points,
            quiz_id
          )
        `)
        .eq('student_id', activeUser)
        .eq('quiz_id', quizId)
        .maybeSingle();

      if (memberEntry) {
        const tInfo = (memberEntry as any).teams || (memberEntry as any).team;
        if (tInfo) {
          activeTeam = {
            ...tInfo,
            id: memberEntry.team_id,
            team_id: memberEntry.team_id,
            quiz_id: memberEntry.quiz_id || quizId,
            student_id: memberEntry.student_id,
          };
          setMyTeam(activeTeam);
        } else {
          const { data: tRow } = await supabase
            .from('teams')
            .select('*')
            .eq('id', memberEntry.team_id)
            .maybeSingle();

          if (tRow) {
            activeTeam = {
              ...tRow,
              id: memberEntry.team_id,
              team_id: memberEntry.team_id,
              quiz_id: memberEntry.quiz_id || quizId,
              student_id: memberEntry.student_id,
            };
            setMyTeam(activeTeam);
          }
        }
      }
    }

    // 2. Debugging log before validation as requested
    console.log({
      session: activeSession,
      selectedQuestion,
      myTeam: activeTeam,
      currentUserId: activeUser,
      quizId,
    });

    // 3. Strict validation (MUST NOT be removed)
    if (!activeSession || !selectedQuestion || !activeTeam || !activeUser) {
      console.error('[StudentQuiz] Validation failed: missing required data:', {
        session: activeSession,
        selectedQuestion,
        myTeam: activeTeam,
        currentUserId: activeUser,
        quizId,
      });
      throw new Error('Data sesi atau tim tidak lengkap.');
    }

    // 4. Call atomic RPC with timeout flag
    const { data, error } = await supabase.rpc('submit_quiz_answer', {
      p_session_id: activeSession.id,
      p_question_id: selectedQuestion.id,
      p_team_id: activeTeam.team_id || activeTeam.id,
      p_student_id: activeUser,
      p_answer: selectedOption,
      p_is_timeout: false,
    });

    if (error) {
      console.error('[StudentQuiz] RPC submit_quiz_answer error:', error);
      throw error;
    }

    // 5. Update local state
    setUsedQuestionIds((prev) => new Set([...prev, selectedQuestion.id]));
    if (data && activeTeam) {
      setMyTeam((prev) => (prev ? { ...prev, current_points: data.new_score } : null));
    }

    return data as SubmitAnswerResult;
  };

  const handleTimeoutAnswer = async (): Promise<SubmitAnswerResult> => {
    let activeSession = session;
    let activeUser = currentUserId;
    let activeTeam = myTeam;

    if (!activeUser) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        activeUser = user.id;
        setCurrentUserId(user.id);
      }
    }

    if (!activeSession || !selectedQuestion || !activeTeam || !activeUser) {
      throw new Error('Data sesi atau tim tidak lengkap untuk proses timeout.');
    }

    const { data, error } = await supabase.rpc('submit_quiz_answer', {
      p_session_id: activeSession.id,
      p_question_id: selectedQuestion.id,
      p_team_id: activeTeam.team_id || activeTeam.id,
      p_student_id: activeUser,
      p_answer: 'TIMEOUT',
      p_is_timeout: true,
    });

    if (error) {
      console.error('[StudentQuiz] RPC timeout error:', error);
      throw error;
    }

    setUsedQuestionIds((prev) => new Set([...prev, selectedQuestion.id]));
    if (data && activeTeam) {
      setMyTeam((prev) => (prev ? { ...prev, current_points: data.new_score } : null));
    }

    return data as SubmitAnswerResult;
  };

  const handleSubmitCodingAnswer = async (data: {
    codeBundle: CodeBundle;
    testResults: TestResultItem[];
    scoreAwarded: number;
    allPassed: boolean;
  }): Promise<SubmitCodingResult> => {
    // 1. Auto-recovery fallback if any variable was not yet set in state
    let activeSession = session;
    if (!activeSession) {
      const { data: sData } = await supabase
        .from('quiz_sessions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sData) {
        activeSession = sData as QuizSession;
        setSession(sData as QuizSession);
      }
    }

    let activeUser = currentUserId;
    if (!activeUser) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        activeUser = user.id;
        setCurrentUserId(user.id);
      }
    }

    let activeTeam = myTeam;
    if (!activeTeam && activeUser) {
      const { data: memberEntry } = await supabase
        .from('team_members')
        .select(`
          *,
          teams:team_id (
            id,
            name,
            description,
            starting_points,
            current_points,
            quiz_id
          )
        `)
        .eq('student_id', activeUser)
        .eq('quiz_id', quizId)
        .maybeSingle();

      if (memberEntry) {
        const tInfo = (memberEntry as any).teams || (memberEntry as any).team;
        if (tInfo) {
          activeTeam = {
            ...tInfo,
            id: memberEntry.team_id,
            team_id: memberEntry.team_id,
            quiz_id: memberEntry.quiz_id || quizId,
            student_id: memberEntry.student_id,
          };
          setMyTeam(activeTeam);
        }
      }
    }

    if (!activeSession || !selectedQuestion || !activeTeam || !activeUser) {
      throw new Error('Data sesi atau tim tidak lengkap.');
    }

    const sessionId = activeSession.id;
    const questionId = selectedQuestion.id;
    const teamId = activeTeam.team_id || activeTeam.id;
    const studentId = activeUser;
    const testResults = data.testResults || [];

    // Extract code answer string: if only HTML is provided, use raw html; if multi-tab, use JSON bundle
    let codeAnswer = '';
    if (typeof data.codeBundle === 'string') {
      codeAnswer = data.codeBundle;
    } else if (data.codeBundle) {
      const hasHtml = Boolean(data.codeBundle.html?.trim());
      const hasCss = Boolean(data.codeBundle.css?.trim());
      const hasJs = Boolean(data.codeBundle.js?.trim());

      if (hasHtml && !hasCss && !hasJs) {
        codeAnswer = data.codeBundle.html;
      } else if (!hasHtml && hasCss && !hasJs) {
        codeAnswer = data.codeBundle.css;
      } else if (!hasHtml && !hasCss && hasJs) {
        codeAnswer = data.codeBundle.js;
      } else if (hasHtml || hasCss || hasJs) {
        codeAnswer = JSON.stringify(data.codeBundle);
      } else {
        codeAnswer = '';
      }
    }

    // Call atomic RPC with canonical parameters and timeout flag false
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_coding_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionId,
      p_team_id: teamId,
      p_student_id: studentId,
      p_code_answer: codeAnswer,
      p_test_results: testResults,
      p_score: null,
      p_is_timeout: false,
    });

    if (rpcErr) {
      console.error('[StudentQuiz] coding RPC error:', rpcErr);
      throw rpcErr;
    }

    // Update local state
    setUsedQuestionIds((prev) => new Set([...prev, selectedQuestion.id]));
    if (rpcRes && activeTeam) {
      setMyTeam((prev) => (prev ? { ...prev, current_points: rpcRes.new_score } : null));
    }

    return rpcRes as SubmitCodingResult;
  };

  const handleTimeoutCodingAnswer = async (): Promise<SubmitCodingResult> => {
    let activeSession = session;
    let activeUser = currentUserId;
    let activeTeam = myTeam;

    if (!activeUser) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        activeUser = user.id;
        setCurrentUserId(user.id);
      }
    }

    if (!activeSession || !selectedQuestion || !activeTeam || !activeUser) {
      throw new Error('Data sesi atau tim tidak lengkap.');
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_coding_quiz_answer', {
      p_session_id: activeSession.id,
      p_question_id: selectedQuestion.id,
      p_team_id: activeTeam.team_id || activeTeam.id,
      p_student_id: activeUser,
      p_code_answer: '[TIMEOUT - WAKTU HABIS]',
      p_test_results: [],
      p_score: null,
      p_is_timeout: true,
    });

    if (rpcErr) {
      console.error('[StudentQuiz] coding timeout RPC error:', rpcErr);
      throw rpcErr;
    }

    setUsedQuestionIds((prev) => new Set([...prev, selectedQuestion.id]));
    if (rpcRes && activeTeam) {
      setMyTeam((prev) => (prev ? { ...prev, current_points: rpcRes.new_score } : null));
    }

    return rpcRes as SubmitCodingResult;
  };

  if (isLoading || !quiz) {
    return (
      <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
        <p className="text-sm">Memasuki Arena Pertandingan...</p>
      </div>
    );
  }

  const sortedTeams = [...teams].sort((a, b) => b.current_points - a.current_points);
  const myRank = myTeam ? sortedTeams.findIndex((t) => t.id === myTeam.id) + 1 : 0;
  const winner = sortedTeams[0];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/student/dashboard"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black tracking-widest text-indigo-400 uppercase bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/30">
                STUDENT ARENA
              </span>
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
              <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                QUIZ: {quiz.code}
              </span>
              {session?.code && (
                <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                  SESI: {session.code}
                </span>
              )}
              {session?.is_exam_mode && (
                <Badge variant="rose" size="sm" className="animate-pulse">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  EXAM MODE
                </Badge>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1">{quiz.title}</h1>
          </div>
        </div>

        {/* My Team Score Pill */}
        {myTeam ? (
          <div className="flex items-center gap-4 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Tim Saya
              </span>
              <span className="text-sm font-extrabold text-blue-400">{myTeam.name}</span>
            </div>
            <div className="border-l border-slate-800 pl-4 text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Skor Tim
              </span>
              <span className="text-2xl font-black font-mono text-amber-400">
                {myTeam.current_points.toLocaleString()} PTS
              </span>
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Kamu belum terdaftar di tim untuk quiz ini.</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* EXPLICIT STATE 1: WAITING / DRAFT -> LOBBY WAITING SCREEN                 */}
      {/* ========================================================================= */}
      {(quiz.status === 'waiting' || quiz.status === 'draft') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <Card className="p-8 text-center space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center relative">
                <Clock className="w-10 h-10 animate-pulse" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full animate-ping" />
              </div>

              <div>
                <span className="text-xs font-black tracking-widest text-amber-400 uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                  LOBBY PERTANDINGAN DIBUKA
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mt-3">
                  Menunggu Guru Memulai Pertandingan...
                </h2>
                <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
                  Anda telah siap di dalam tim. Halaman ini akan <strong>otomatis berubah</strong> menjadi Question Board begitu guru menekan tombol <strong>Mulai Pertandingan</strong> di kelas.
                </p>
              </div>

              {/* Joined Team Roster Box */}
              {myTeam ? (
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 max-w-md mx-auto text-left">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-blue-400 uppercase">
                      Anggota {myTeam.name}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {myTeam.current_points} Starting PTS
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                    {myTeamMembers.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Kamu adalah anggota pertama yang bergabung.</p>
                    ) : (
                      myTeamMembers.map((m: any, idx: number) => (
                        <div key={m.id || idx} className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-semibold">{m.student?.name || 'Siswa'}</span>
                          {m.student_id === currentUserId && (
                            <span className="text-[10px] text-blue-400 font-bold">(Kamu)</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs max-w-md mx-auto">
                  Kamu belum memilih tim untuk quiz ini. Gunakan tombol Join Quiz untuk memilih tim.
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-4">
            <Card className="p-5">
              <Leaderboard quizId={quizId} initialTeams={teams} highlightTeamId={myTeam?.id} />
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXPLICIT STATE 2: ACTIVE -> LIVE QUIZ GAME SCREEN                          */}
      {/* ========================================================================= */}
      {quiz.status === 'active' && (
        <div className="space-y-6">
          {/* TURN STATUS HUD BANNER */}
          {session && (
            <div
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                isMyPlayerTurn
                  ? 'bg-emerald-500/15 border-emerald-500/50 shadow-xl shadow-emerald-500/10 neon-glow-green'
                  : isSpectator
                  ? 'bg-amber-500/15 border-amber-500/40 shadow-xl shadow-amber-500/10 neon-glow-gold'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-2xl shrink-0 ${
                      isMyPlayerTurn
                        ? 'bg-emerald-400 text-slate-950 animate-bounce'
                        : isSpectator
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isMyPlayerTurn ? '🎮' : isSpectator ? '👁️' : '🔒'}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                        TURN #{session.turn_number || 1}
                      </span>
                      {isMyPlayerTurn && (
                        <span className="text-xs font-black text-emerald-300 uppercase bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/40 animate-pulse">
                          🟢 GILIRAN KAMU BERMAIN!
                        </span>
                      )}
                      {isSpectator && (
                        <span className="text-xs font-black text-amber-300 uppercase bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                          🟡 GILIRAN TIM KAMU (MODE PENONTON)
                        </span>
                      )}
                      {isOtherTeamTurn && (
                        <span className="text-xs font-bold text-slate-400">
                          🔒 Giliran {activeTeamObj?.name || 'Tim Lawan'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base font-extrabold text-white mt-1">
                      {isMyPlayerTurn
                        ? 'Pilih salah satu soal di Question Board untuk mulai menjawab!'
                        : isSpectator
                        ? `${activePlayerName} sedang menjadi pemain aktif tim kamu. Perhatikan soal yang dipilih.`
                        : `Menunggu ${activeTeamObj?.name || 'Tim lain'} menyelesaikan gilirannya. Papan soal dikunci.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-950/80 p-2.5 px-4 rounded-xl border border-slate-800 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Pemain Aktif
                    </span>
                    <span className="text-xs font-black text-amber-400">
                      {activePlayerName}
                    </span>
                  </div>
                  <div className="border-l border-slate-800 pl-3 text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Tim Aktif
                    </span>
                    <span className="text-xs font-black text-blue-400">
                      {activeTeamObj?.name || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fixed Team Turn Order Sequence Strip */}
              {teams.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">
                    🔄 Urutan Giliran:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
                    {teams.map((t, idx) => {
                      const isCurrent = t.id === session.current_team_id;
                      const isMy = t.id === myTeamId;
                      return (
                        <React.Fragment key={t.id}>
                          <div
                            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all ${
                              isCurrent
                                ? 'bg-amber-500/25 text-amber-300 border border-amber-400/60 shadow-sm ring-1 ring-amber-400/40 font-bold'
                                : isMy
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : 'bg-slate-950 text-slate-400 border border-slate-800'
                            }`}
                          >
                            <span className="w-3.5 h-3.5 rounded-full bg-slate-800 flex items-center justify-center text-[9px] font-bold">
                              {t.turn_order || idx + 1}
                            </span>
                            <span>{t.name}</span>
                            {isCurrent && <span className="text-[9px] text-amber-400 font-bold">●</span>}
                            {isMy && !isCurrent && <span className="text-[9px] text-blue-400">(Tim Kamu)</span>}
                          </div>
                          {idx < teams.length - 1 && <span className="text-slate-600 font-bold">→</span>}
                        </React.Fragment>
                      );
                    })}
                    <span className="text-slate-600 font-bold">→ 🔄 (Loop)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Question Board Matrix */}
            <div className="lg:col-span-8 space-y-4">
              {!myTeam && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                  <span>Perhatian: Kamu belum terdaftar di salah satu tim quiz ini.</span>
                  <Link href="/student/dashboard">
                    <Button variant="outline" size="sm">
                      Pilih Tim
                    </Button>
                  </Link>
                </div>
              )}

              <Card className="p-4 sm:p-6">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <h3 className="font-bold text-white text-base uppercase tracking-wider flex items-center gap-2">
                    <Grid className="w-4 h-4 text-blue-400" /> QUESTION BOARD
                  </h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Tersedia
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Selesai
                    </span>
                  </div>
                </div>

                <QuestionBoard
                  categories={categories}
                  questions={questions}
                  usedQuestionIds={usedQuestionIds}
                  selectedQuestionId={session?.current_question_id || selectedQuestion?.id || null}
                  onSelectQuestion={handleSelectQuestion}
                  isInteractive={Boolean(myTeam && quiz.status === 'active' && isMyPlayerTurn)}
                />
              </Card>
            </div>

            {/* Right: Leaderboard */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="p-5">
                <Leaderboard
                  quizId={quizId}
                  initialTeams={teams}
                  highlightTeamId={myTeam?.id}
                />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXPLICIT STATE 3: FINISHED -> FINAL RESULTS SCREEN                        */}
      {/* ========================================================================= */}
      {quiz.status === 'finished' && (
        <div className="max-w-3xl mx-auto">
          <Card className="p-8 text-center space-y-6">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center shadow-2xl shadow-amber-500/50">
              <Trophy className="w-12 h-12" />
            </div>

            <div>
              <span className="text-xs font-black tracking-widest text-amber-400 uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                PERTANDINGAN SELESAI
              </span>
              <h2 className="text-3xl font-black text-white mt-3">Hasil Akhir Pertandingan</h2>
              {winner && (
                <p className="text-base text-slate-300 mt-1">
                  🏆 Juara 1: <strong className="text-amber-400">{winner.name}</strong> dengan{' '}
                  <strong className="text-white font-mono">{winner.current_points.toLocaleString()} PTS</strong>
                </p>
              )}
            </div>

            {/* My Team Result Highlight */}
            {myTeam && (
              <div
                className={`p-5 rounded-2xl border max-w-md mx-auto ${
                  myRank === 1
                    ? 'bg-amber-500/15 border-amber-400/50 neon-glow-gold'
                    : myRank === 2
                    ? 'bg-slate-300/10 border-slate-300/40'
                    : myRank === 3
                    ? 'bg-amber-800/15 border-amber-700/40'
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Pencapaian Tim Kamu
                </span>
                <h3 className="text-xl font-extrabold text-white mt-1">{myTeam.name}</h3>
                <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Peringkat</span>
                    <span className="text-xl font-black text-white">#{myRank}</span>
                  </div>
                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-[10px] text-slate-400 block uppercase">Total Poin</span>
                    <span className="text-xl font-black font-mono text-amber-400">
                      {myTeam.current_points.toLocaleString()} PTS
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Full Podium Ranking List */}
            <div className="space-y-2 text-left max-w-md mx-auto pt-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Klasemen Lengkap
              </h4>
              {sortedTeams.map((team, idx) => {
                const rank = idx + 1;
                return (
                  <div
                    key={team.id}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      rank === 1
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                        : rank === 2
                        ? 'bg-slate-400/10 border-slate-400/30 text-slate-200'
                        : rank === 3
                        ? 'bg-amber-800/10 border-amber-800/30 text-amber-400'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-sm">
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                      </span>
                      <span className="font-bold text-sm">{team.name}</span>
                    </div>
                    <span className="font-mono font-bold text-sm">
                      {team.current_points.toLocaleString()} PTS
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-800">
              <Link href="/student/dashboard">
                <Button variant="primary" size="lg">
                  Kembali ke Dashboard Siswa
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* Question Answer Modal (Multiple Choice & Coding) */}
      {selectedQuestion && (
        <QuestionModal
          isOpen={isQuestionModalOpen}
          onClose={() => setIsQuestionModalOpen(false)}
          question={selectedQuestion}
          categoryName={categories.find((c) => c.id === selectedQuestion.category_id)?.name}
          turnStartedAt={session?.turn_started_at}
          isTeacher={false}
          isReadOnly={!isMyPlayerTurn}
          onSubmitAnswer={handleSubmitAnswer}
          onTimeoutAnswer={handleTimeoutAnswer}
          onSubmitCodingAnswer={handleSubmitCodingAnswer}
          onTimeoutCodingAnswer={handleTimeoutCodingAnswer}
          isLoading={isLoading}
          isDataReady={Boolean(session && myTeam && currentUserId && selectedQuestion)}
        />
      )}

      {/* Exam Focus Monitor (Fullscreen & Tab Switching Detection) */}
      {session && currentUserId && (
        <ExamFocusMonitor
          sessionId={session.id}
          studentId={currentUserId}
          isExamMode={Boolean(session.is_exam_mode)}
        />
      )}
    </div>
  );
}
