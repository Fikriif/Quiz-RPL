'use client';

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Code2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Sparkles,
  Trophy,
  ArrowRight,
  RotateCcw,
  Check,
  Send,
  HelpCircle,
  Maximize2,
  X,
  Clock,
} from 'lucide-react';
import { Question, TestCase, TestResultItem, SubmitCodingResult } from '@/types/database';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CountdownTimer } from '@/components/ui/CountdownTimer';
import { CodeEditor, CodeBundle } from '@/components/code-editor/CodeEditor';
import { LivePreview } from '@/components/code-editor/LivePreview';
import { runTestCases, TestExecutionResult } from '@/components/code-editor/TestRunner';

interface CodingModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: Question | null;
  categoryName?: string;
  turnStartedAt?: string | null;
  isTeacher?: boolean;
  isReadOnly?: boolean;
  onSubmitCodingAnswer?: (data: {
    codeBundle: CodeBundle;
    testResults: TestResultItem[];
    scoreAwarded: number;
    allPassed: boolean;
  }) => Promise<SubmitCodingResult>;
  onTimeoutCodingAnswer?: () => Promise<SubmitCodingResult>;
  onNextQuestion?: () => void;
  isLoading?: boolean;
  isDataReady?: boolean;
}

export const CodingModal: React.FC<CodingModalProps> = ({
  isOpen,
  onClose,
  question,
  categoryName,
  turnStartedAt,
  isTeacher = false,
  isReadOnly = false,
  onSubmitCodingAnswer,
  onTimeoutCodingAnswer,
  onNextQuestion,
  isLoading = false,
  isDataReady = true,
}) => {
  if (!question) return null;

  // Initialize starter code
  const getInitialCodeBundle = (): CodeBundle => {
    if (question.starter_code) {
      return {
        html: question.starter_code,
        css: '',
        js: '',
      };
    }
    return {
      html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Solution</title>\n</head>\n<body>\n  <!-- Tulis kode HTML kamu di sini -->\n</body>\n</html>',
      css: '/* Tulis styling CSS kamu di sini */\n',
      js: '// Tulis logic JavaScript kamu di sini\n',
    };
  };

  const [currentCode, setCurrentCode] = useState<CodeBundle>(getInitialCodeBundle);
  const [testResults, setTestResults] = useState<TestResultItem[] | null>(null);
  const [executionSummary, setExecutionSummary] = useState<TestExecutionResult | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<{ type: string; message: string }[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmitCodingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'tests' | 'console'>('tests');
  const timeoutTriggeredRef = useRef(false);

  // Reset editor state whenever a new question is loaded
  useEffect(() => {
    if (question && isOpen) {
      setCurrentCode(getInitialCodeBundle());
      setTestResults(null);
      setExecutionSummary(null);
      setConsoleLogs([]);
      setSubmissionResult(null);
      setErrorMessage(null);
      setIsSubmitting(false);
      setIsTimedOut(false);
      timeoutTriggeredRef.current = false;
    }
  }, [question?.id, isOpen]);

  const testCases: TestCase[] = question.test_cases || [];

  const handleClose = () => {
    setTestResults(null);
    setExecutionSummary(null);
    setConsoleLogs([]);
    setSubmissionResult(null);
    setErrorMessage(null);
    setIsTimedOut(false);
    timeoutTriggeredRef.current = false;
    onClose();
  };

  const handleConsoleLog = (log: { type: string; message: string }) => {
    setConsoleLogs((prev) => [...prev.slice(-49), log]);
  };

  // Run Test Cases without submitting
  const handleRunTests = async () => {
    if (isTimedOut || Boolean(submissionResult)) return;
    setIsTesting(true);
    setErrorMessage(null);
    try {
      const exec = await runTestCases(
        currentCode,
        testCases,
        question.points,
        question.validation_type,
        question.expected_output
      );
      setExecutionSummary(exec);
      setTestResults(exec.results);
      setActiveBottomTab('tests');

      if (exec.allPassed) {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menjalankan test case.');
    } finally {
      setIsTesting(false);
    }
  };

  // Submit Coding Answer
  const handleSubmit = async () => {
    if (isReadOnly || !onSubmitCodingAnswer || !isDataReady || isTimedOut || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let resultsToSend = testResults;
      let summaryToSend = executionSummary;

      if (!resultsToSend || resultsToSend.length === 0 || !summaryToSend) {
        summaryToSend = await runTestCases(
          currentCode,
          testCases,
          question.points,
          question.validation_type,
          question.expected_output
        );
        resultsToSend = summaryToSend.results;
        setExecutionSummary(summaryToSend);
        setTestResults(resultsToSend);
      }

      console.log('CODING VALIDATION', {
        questionId: question.id,
        questionType: question.question_type,
        validationMode: question.validation_type,
        expectedAnswer: question.expected_output,
        studentCode: currentCode,
        testResults: resultsToSend,
        correct: summaryToSend.allPassed,
        score: summaryToSend.pointsAwarded,
        passedCount: summaryToSend.passedCount,
        totalCount: summaryToSend.totalCount,
      });

      // Submit to server / RPC (server strictly validates time & evaluates testResults)
      const result = await onSubmitCodingAnswer({
        codeBundle: currentCode,
        testResults: resultsToSend,
        scoreAwarded: summaryToSend.pointsAwarded,
        allPassed: summaryToSend.allPassed,
      });

      console.log('[CodingModal] Final Submission Result from Server:', result);
      setSubmissionResult(result);

      if (result?.is_timeout) {
        setIsTimedOut(true);
      } else if (result?.is_correct === true) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.5 },
        });
      }
    } catch (err: any) {
      console.error('[CodingModal] Submit error:', err);
      setErrorMessage(err.message || 'Gagal mengirim jawaban coding.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto Timeout Triggered by Countdown Timer hitting 0
  const handleTimeUp = async () => {
    if (isTeacher || isReadOnly || submissionResult || isTimedOut || timeoutTriggeredRef.current) {
      return;
    }

    timeoutTriggeredRef.current = true;
    setIsTimedOut(true);
    setErrorMessage(null);

    if (onTimeoutCodingAnswer) {
      setIsSubmitting(true);
      try {
        const result = await onTimeoutCodingAnswer();
        if (result) {
          setSubmissionResult(result);
        }
      } catch (err: any) {
        console.error('[CodingModal] Timeout error:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const timeLimitSeconds = question.time_limit_seconds && question.time_limit_seconds > 0 ? question.time_limit_seconds : 30;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="6xl" showCloseButton={!isSubmitting}>
      <div className="space-y-4 max-h-[85vh] flex flex-col">
        {/* Header Badges & Timer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-widest text-indigo-400 uppercase bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/30">
              CODING ARENA
            </span>
            <Badge variant="blue" size="md">
              {categoryName || 'HTML/CSS/JS'}
            </Badge>
            <Badge variant="gold" size="md">
              {question.points} Points
            </Badge>
            {!submissionResult && (
              <CountdownTimer
                initialSeconds={timeLimitSeconds}
                turnStartedAt={turnStartedAt}
                isActive={isOpen && !submissionResult && !isTimedOut}
                onTimeUp={handleTimeUp}
                size="sm"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">
              Bahasa: <strong className="text-white">HTML / CSS / JavaScript</strong>
            </span>
          </div>
        </div>

        {/* Timeout Alert Banner */}
        {isTimedOut && !submissionResult && (
          <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center gap-3 text-rose-300 animate-pulse shrink-0">
            <Clock className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <h4 className="font-bold text-sm text-white">WAKTU HABIS!</h4>
              <p className="text-xs text-rose-300">
                Waktu pengerjaan coding telah habis. Jawaban otomatis dikirim dan dianggap salah.
              </p>
            </div>
          </div>
        )}

        {/* Question Prompt / Instructions */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shrink-0">
          <h2 className="text-lg sm:text-xl font-extrabold text-white leading-relaxed">
            {question.question}
          </h2>
          {question.explanation && (
            <div className="mt-2 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              💡 <strong>Instruksi & Petunjuk:</strong> {question.explanation}
            </div>
          )}
        </div>

        {/* Spectator Alert if Not Active Player */}
        {isReadOnly && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2.5 shrink-0">
            <span className="text-base">👁️</span>
            <span>
              <strong>Mode Penonton:</strong> Hanya pemain aktif pada giliran ini yang dapat mengedit kode dan mengirim jawaban. Anda dapat menyaksikan jalannya pengerjaan secara langsung.
            </span>
          </div>
        )}

        {/* Split Grid: Left = Code Editor, Right = Live Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-y-auto">
          {/* Left: Code Editor (7 cols) */}
          <div className="lg:col-span-7 flex flex-col min-h-[380px]">
            <CodeEditor
              value={currentCode}
              language="html_css_js"
              onChange={(updated) => {
                if (!isTimedOut && !submissionResult) {
                  setCurrentCode(updated);
                  setTestResults(null);
                  setExecutionSummary(null);
                }
              }}
              onRun={(updated) => setCurrentCode(updated)}
              onReset={() => {
                if (!isTimedOut && !submissionResult) {
                  setCurrentCode(getInitialCodeBundle());
                  setTestResults(null);
                  setExecutionSummary(null);
                }
              }}
              readOnly={isReadOnly || Boolean(submissionResult) || isSubmitting || isTimedOut}
              minHeight="320px"
            />
          </div>

          {/* Right: Live Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col min-h-[380px]">
            <LivePreview
              code={currentCode}
              minHeight="320px"
              onConsoleLog={handleConsoleLog}
            />
          </div>
        </div>

        {/* Bottom Panel: Test Cases & Console */}
        <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0">
          {/* Tabs */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveBottomTab('tests')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeBottomTab === 'tests'
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Test Cases ({testCases.length})
                {executionSummary && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                    {executionSummary.passedCount}/{executionSummary.totalCount} Passed
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveBottomTab('console')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeBottomTab === 'console'
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                Console Output ({consoleLogs.length})
              </button>
            </div>

            {!submissionResult && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isTesting}
                disabled={isTimedOut || isSubmitting}
                onClick={handleRunTests}
                leftIcon={<Play className="w-3 h-3 fill-current text-blue-400" />}
                className="text-xs"
              >
                Uji Solusi (Run Tests)
              </Button>
            )}
          </div>

          {/* Tab Content */}
          <div className="p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1.5">
            {activeBottomTab === 'tests' ? (
              testCases.length === 0 ? (
                <p className="text-slate-500 italic">Tidak ada test case spesifik. Klik 'Kirim Jawaban' setelah selesai.</p>
              ) : testResults ? (
                testResults.map((r, i) => (
                  <div
                    key={r.id || i}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${
                      r.passed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {r.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold">{r.description}</span>
                      {r.message && <p className="text-[11px] text-slate-300 mt-0.5">{r.message}</p>}
                    </div>
                  </div>
                ))
              ) : (
                testCases.map((tc, idx) => (
                  <div key={tc.id || idx} className="flex items-center gap-2 text-slate-400 p-1">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span>{tc.description}</span>
                  </div>
                ))
              )
            ) : consoleLogs.length === 0 ? (
              <p className="text-slate-500 italic">Console output kosong. Jalankan kode untuk melihat log.</p>
            ) : (
              consoleLogs.map((log, i) => (
                <div
                  key={i}
                  className={`p-1.5 rounded text-[11px] ${
                    log.type === 'error'
                      ? 'text-rose-400 bg-rose-950/40'
                      : log.type === 'warn'
                      ? 'text-amber-400 bg-amber-950/40'
                      : 'text-slate-300 bg-slate-900/60'
                  }`}
                >
                  <span className="text-slate-500 mr-2">[{log.type.toUpperCase()}]</span>
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Submission Result Banner */}
        {submissionResult && (
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              submissionResult.is_correct === true
                ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300 shadow-lg shadow-emerald-950/50'
                : 'bg-rose-950/50 border-rose-500/60 text-rose-300 shadow-lg shadow-rose-950/50'
            }`}
          >
            <div className="flex items-center gap-3">
              {submissionResult.is_correct === true ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6 text-rose-400" />
                </div>
              )}
              <div>
                <h4 className="font-extrabold text-white text-base">
                  {submissionResult.is_timeout
                    ? '⏳ WAKTU HABIS! (TIMEOUT)'
                    : submissionResult.is_correct === true
                    ? '✓ Jawaban Coding Benar'
                    : '✗ Jawaban Coding Salah'}
                </h4>
                <p className="text-xs font-semibold mt-0.5">
                  <span className="font-mono font-bold">
                    {submissionResult.points_change > 0
                      ? `+${submissionResult.points_change}`
                      : submissionResult.points_change}{' '}
                    poin
                  </span>{' '}
                  • Skor tim:{' '}
                  <span className="font-mono font-bold text-white">{submissionResult.new_score}</span>
                  {typeof submissionResult.passed_count === 'number' &&
                    typeof submissionResult.total_count === 'number' &&
                    submissionResult.total_count > 0 && (
                      <span className="text-slate-400 ml-1.5">
                        ({submissionResult.passed_count}/{submissionResult.total_count} test case lolos)
                      </span>
                    )}
                </p>
              </div>
            </div>
            <Button
              variant={submissionResult.is_correct === true ? 'primary' : 'secondary'}
              size="md"
              onClick={handleClose}
              className="shrink-0 font-bold"
            >
              Tutup & Lanjut ke Giliran Berikutnya
            </Button>
          </div>
        )}

        {/* Footer Action Controls */}
        {!submissionResult && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 shrink-0">
            {!isDataReady && (
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Menyiapkan data sesi pertandingan & tim...</span>
              </div>
            )}

            <div className="flex items-center gap-3 ml-auto">
              <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
                Tutup
              </Button>
              {!isReadOnly ? (
                <Button
                  variant="primary"
                  size="lg"
                  disabled={isSubmitting || isLoading || !isDataReady || isTimedOut}
                  isLoading={isSubmitting}
                  onClick={handleSubmit}
                  leftIcon={<Send className="w-4 h-4" />}
                  className="font-bold shadow-xl shadow-blue-500/20"
                >
                  {isTimedOut ? 'Waktu Habis' : 'Kirim Jawaban Coding'}
                </Button>
              ) : (
                <Button variant="secondary" size="lg" disabled className="text-xs font-semibold">
                  🔒 Menunggu Pemain Aktif Mengirim
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
