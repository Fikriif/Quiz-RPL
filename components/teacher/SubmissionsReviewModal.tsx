'use client';

import React, { useState, useEffect } from 'react';
import {
  Code2,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldAlert,
  Clock,
  User,
  Users,
  Copy,
  Check,
  FileCode,
  Trophy,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import { CodingSubmission, ExamEvent } from '@/types/database';

interface SubmissionsReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  quizTitle?: string;
}

export const SubmissionsReviewModal: React.FC<SubmissionsReviewModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  quizTitle,
}) => {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'submissions' | 'exam_logs'>('submissions');
  const [submissions, setSubmissions] = useState<CodingSubmission[]>([]);
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<CodingSubmission | null>(null);
  const [codeTab, setCodeTab] = useState<'html' | 'css' | 'js'>('html');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Coding Submissions
      const { data: subData } = await supabase
        .from('coding_submissions')
        .select(`
          *,
          student:profiles(*),
          team:teams(*),
          question:questions(*)
        `)
        .eq('quiz_session_id', sessionId)
        .order('submitted_at', { ascending: false });

      if (subData) {
        setSubmissions(subData as any[]);
        if (subData.length > 0 && !selectedSubmission) {
          setSelectedSubmission(subData[0] as any);
        }
      }

      // 2. Fetch Exam Events
      const { data: eventData } = await supabase
        .from('exam_events')
        .select(`
          *,
          student:profiles(*)
        `)
        .eq('quiz_session_id', sessionId)
        .order('created_at', { ascending: false });

      if (eventData) {
        setExamEvents(eventData as any[]);
      }
    } catch (err) {
      console.error('[SubmissionsReviewModal] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  // Parse code bundle
  const parsedCode = selectedSubmission
    ? (() => {
        try {
          return JSON.parse(selectedSubmission.code_answer);
        } catch (e) {
          return { html: selectedSubmission.code_answer, css: '', js: '' };
        }
      })()
    : { html: '', css: '', js: '' };

  const handleCopyCode = () => {
    const text = parsedCode[codeTab] || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="5xl" showCloseButton>
      <div className="space-y-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
          <div>
            <span className="text-[10px] font-black tracking-widest text-indigo-400 uppercase bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/30">
              TEACHER INSPECTOR
            </span>
            <h3 className="text-xl font-black text-white mt-1">
              Hasil Submission & Log Pengawas
            </h3>
            {quizTitle && <p className="text-xs text-slate-400">{quizTitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('submissions')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'submissions'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Coding Submissions ({submissions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('exam_logs')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'exam_logs'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Log Pelanggaran Fokus ({examEvents.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: CODING SUBMISSIONS */}
        {activeTab === 'submissions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-y-auto">
            {/* Left List (5 cols) */}
            <div className="lg:col-span-5 space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {submissions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 rounded-2xl bg-slate-950/60 border border-slate-800">
                  Belum ada siswa yang mengumpulkan jawaban coding pada sesi ini.
                </div>
              ) : (
                submissions.map((sub) => {
                  const isSelected = selectedSubmission?.id === sub.id;
                  const passedCount = (sub.test_results || []).filter((r) => r.passed).length;
                  const totalTests = (sub.test_results || []).length;

                  return (
                    <div
                      key={sub.id}
                      onClick={() => setSelectedSubmission(sub)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-600/15 border-blue-500 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-extrabold text-sm text-white flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-blue-400" />
                          {sub.student?.name || 'Siswa'}
                        </span>
                        <span className="font-mono text-xs font-black text-amber-400">
                          +{sub.score}/{sub.max_points} PTS
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-semibold line-clamp-1 mb-2">
                        {sub.question?.question || 'Soal Coding'}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 text-indigo-300">
                          <Users className="w-3 h-3" />
                          {sub.team?.name || 'Tim'}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          {passedCount}/{totalTests} Tests Passed
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right: Code & Test Details (7 cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-3">
              {selectedSubmission ? (
                <>
                  {/* Test Results Summary */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Hasil Pengujian Test Case
                    </span>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {(selectedSubmission.test_results || []).map((tr, idx) => (
                        <div
                          key={tr.id || idx}
                          className={`flex items-start gap-2 p-2 rounded-lg text-xs border ${
                            tr.passed
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                          }`}
                        >
                          {tr.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-bold">{tr.description}</span>
                            {tr.message && <p className="text-[10px] text-slate-400">{tr.message}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Code Viewer */}
                  <div className="flex-1 flex flex-col rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden font-mono text-xs">
                    {/* Code Tabs Bar */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
                      <div className="flex items-center gap-1">
                        {(['html', 'css', 'js'] as const).map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setCodeTab(tab)}
                            className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase transition-colors ${
                              codeTab === tab
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Tersalin' : 'Salin Kode'}</span>
                      </button>
                    </div>

                    <pre className="flex-1 p-3 text-slate-200 overflow-auto whitespace-pre max-h-56 leading-5 bg-slate-950">
                      {parsedCode[codeTab] || `/* Tidak ada kode ${codeTab.toUpperCase()} */`}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-xs text-slate-500 rounded-2xl bg-slate-950/60 border border-slate-800">
                  Pilih salah satu submission di sebelah kiri untuk melihat detail kode dan hasil test.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: EXAM FOCUS LOGS */}
        {activeTab === 'exam_logs' && (
          <div className="flex-1 overflow-y-auto space-y-2">
            {examEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-2xl bg-slate-950/60 border border-slate-800">
                Tidak ada catatan pelanggaran fokus / perpindahan tab selama sesi ujian ini.
              </div>
            ) : (
              examEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      <ShieldAlert className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="font-bold text-white">
                        {ev.student?.name || 'Siswa'}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {ev.event_type === 'tab_hidden'
                          ? 'Berpindah Tab / Meminimalkan Browser'
                          : ev.event_type === 'window_blur'
                          ? 'Fokus Layar Berpindah ke Aplikasi Lain'
                          : 'Keluar dari Mode Layar Penuh (Fullscreen)'}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
