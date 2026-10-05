'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Play,
  Layers,
  Calendar,
  ShieldAlert,
  Users,
  CheckCircle2,
  Clock,
  ExternalLink,
  Code2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SubmissionsReviewModal } from '@/components/teacher/SubmissionsReviewModal';
import { createClient } from '@/lib/supabase/client';
import { Quiz, QuizSession } from '@/types/database';

export default function QuizSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const quizId = resolvedParams.id;
  const router = useRouter();
  const supabase = createClient();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Session Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [isExamMode, setIsExamMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Review Modal State
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const generateRandomSessionCode = (quizCode?: string) => {
    const prefix = quizCode ? quizCode.substring(0, 3).toUpperCase() : 'SES';
    const num = Math.floor(10 + Math.random() * 90);
    return `${prefix}${num}`;
  };

  const fetchSessionsData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Quiz Master
      const { data: qData } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
      if (qData) {
        setQuiz(qData as Quiz);
        if (!sessionCode) {
          setSessionCode(generateRandomSessionCode(qData.code));
        }
      }

      // 2. Fetch Sessions
      const { data: sData } = await supabase
        .from('quiz_sessions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('created_at', { ascending: false });

      if (sData) {
        setSessions(sData as QuizSession[]);
      }
    } catch (err) {
      console.error('[QuizSessionsPage] Error fetching:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionsData();
  }, [quizId]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) {
      setErrorMsg('Nama sesi harus diisi.');
      return;
    }

    setIsCreating(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: newSession, error: sErr } = await supabase
        .from('quiz_sessions')
        .insert({
          quiz_id: quizId,
          session_name: sessionName.trim(),
          code: sessionCode.trim().toUpperCase() || generateRandomSessionCode(quiz?.code),
          is_exam_mode: isExamMode,
          status: 'waiting',
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (sErr || !newSession) throw sErr;

      setIsCreateModalOpen(false);
      setSessionName('');
      setSessionCode('');
      setIsExamMode(false);
      fetchSessionsData();

      // Navigate to Game Master Control Room for this session
      router.push(`/teacher/quiz/${quizId}/game?session=${newSession.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat sesi pertandingan.');
    } finally {
      setIsCreating(false);
    }
  };

  const openReview = (sessionId: string) => {
    setReviewSessionId(sessionId);
    setIsReviewOpen(true);
  };

  if (isLoading || !quiz) {
    return (
      <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
        <p className="text-sm">Memuat daftar sesi pertandingan...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl">
        <div>
          <Link
            href={`/teacher/quizzes/${quizId}/edit`}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Edit Master Quiz</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white">{quiz.title}</h1>
            <span className="text-xs font-black tracking-widest text-indigo-400 uppercase bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/30">
              MASTER TEMPLATE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quiz master ini dapat dimainkan berulang kali untuk berbagai kelas, sesi remedial, atau kompetisi.
          </p>
        </div>

        <Button
          variant="gold"
          size="lg"
          leftIcon={<Plus className="w-4 h-4 text-slate-950" />}
          onClick={() => {
            setSessionCode(generateRandomSessionCode(quiz.code));
            setIsCreateModalOpen(true);
          }}
          className="shadow-xl shadow-amber-500/20 font-black"
        >
          🚀 Mulai Sesi Baru
        </Button>
      </div>

      {/* Sessions Grid / List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            Riwayat Sesi Pertandingan ({sessions.length})
          </h3>
        </div>

        {sessions.length === 0 ? (
          <Card className="p-12 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
              <Layers className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">Belum Ada Sesi yang Dibuat</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Klik tombol <strong>Mulai Sesi Baru</strong> di atas untuk menjalankan pertandingan pertama untuk kelas atau kelompok siswa.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map((s, idx) => (
              <Card key={s.id} className="p-5 space-y-4 flex flex-col justify-between hover:border-slate-700 transition-all">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Sesi #{sessions.length - idx}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.is_exam_mode && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                          <ShieldAlert className="w-3 h-3" /> EXAM MODE
                        </span>
                      )}
                      <Badge
                        variant={
                          s.status === 'active'
                            ? 'emerald'
                            : s.status === 'waiting'
                            ? 'amber'
                            : s.status === 'finished'
                            ? 'slate'
                            : 'blue'
                        }
                        size="sm"
                      >
                        {s.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <h4 className="text-lg font-extrabold text-white">{s.session_name || 'Sesi Tanpa Nama'}</h4>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Kode Akses:</span>
                    <span className="font-mono font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {s.code || quiz.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
                    <Clock className="w-3 h-3" />
                    <span>Dibuat: {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                  <Link href={`/teacher/quiz/${quizId}/game?session=${s.id}`} className="flex-1">
                    <Button
                      variant={s.status === 'active' ? 'success' : s.status === 'waiting' ? 'gold' : 'secondary'}
                      size="sm"
                      leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                      className="w-full text-xs font-bold"
                    >
                      {s.status === 'finished' ? 'Buka Game Master (Selesai)' : 'Masuk Game Master'}
                    </Button>
                  </Link>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openReview(s.id)}
                    leftIcon={<Code2 className="w-3.5 h-3.5 text-blue-400" />}
                    className="text-xs"
                  >
                    Review Hasil
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create New Session Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} maxWidth="md">
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-lg">Mulai Sesi Baru</h3>
              <p className="text-xs text-slate-400">Jalankan quiz ini untuk kelompok / kelas tertentu</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
              Nama Sesi Pertandingan *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Kelas 10 RPL A atau Remedial Bab 1"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
              Kode Sesi Akses Siswa
            </label>
            <input
              type="text"
              required
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="Contoh: HTMLA01"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xs text-amber-400 font-bold focus:outline-none focus:border-blue-500 uppercase"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Siswa dapat bergabung langsung menggunakan kode sesi ini.
            </span>
          </div>

          {/* Exam Mode Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs font-bold text-white block">Aktifkan Exam Mode</span>
                <span className="text-[11px] text-slate-400">Kunci fullscreen & catat perpindahan tab</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isExamMode}
              onChange={(e) => setIsExamMode(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <Button type="button" variant="ghost" size="md" onClick={() => setIsCreateModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isCreating}>
              Buat & Masuk Sesi
            </Button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      {reviewSessionId && (
        <SubmissionsReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          sessionId={reviewSessionId}
          quizTitle={quiz.title}
        />
      )}
    </div>
  );
}
