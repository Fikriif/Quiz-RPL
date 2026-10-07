'use client';

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle, XCircle, HelpCircle, ArrowRight, ShieldAlert, Sparkles, AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import { Question, SubmitAnswerResult, SubmitCodingResult, TestResultItem } from '@/types/database';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CountdownTimer } from '@/components/ui/CountdownTimer';
import { CodingModal } from './CodingModal';
import { CodeBundle } from '@/components/code-editor/CodeEditor';

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: Question | null;
  categoryName?: string;
  turnStartedAt?: string | null;
  isTeacher?: boolean;
  isReadOnly?: boolean;
  onSubmitAnswer?: (selectedOption: 'A' | 'B' | 'C' | 'D') => Promise<SubmitAnswerResult>;
  onTimeoutAnswer?: () => Promise<SubmitAnswerResult>;
  onSubmitCodingAnswer?: (data: {
    codeBundle: CodeBundle;
    testResults: TestResultItem[];
    scoreAwarded: number;
    allPassed: boolean;
  }) => Promise<SubmitCodingResult>;
  onTimeoutCodingAnswer?: () => Promise<SubmitCodingResult>;
  onTeacherAwardPoints?: (isCorrect: boolean) => Promise<void>;
  onNextQuestion?: () => void;
  isLoading?: boolean;
  isDataReady?: boolean;
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  isOpen,
  onClose,
  question,
  categoryName,
  turnStartedAt,
  isTeacher = false,
  isReadOnly = false,
  onSubmitAnswer,
  onTimeoutAnswer,
  onSubmitCodingAnswer,
  onTimeoutCodingAnswer,
  onTeacherAwardPoints,
  onNextQuestion,
  isLoading = false,
  isDataReady = true,
}) => {
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmitAnswerResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timeoutTriggeredRef = useRef(false);

  // Reset local state when modal opens with a new question
  useEffect(() => {
    if (isOpen && question) {
      setSelectedOption(null);
      setSubmissionResult(null);
      setErrorMessage(null);
      setIsRevealed(false);
      setIsSubmitting(false);
      setIsTimedOut(false);
      timeoutTriggeredRef.current = false;
    }
  }, [isOpen, question?.id]);

  if (!question) return null;

  // ROUTE TO CODING MODAL IF QUESTION TYPE IS CODING
  if (question.question_type === 'coding') {
    return (
      <CodingModal
        isOpen={isOpen}
        onClose={onClose}
        question={question}
        categoryName={categoryName}
        turnStartedAt={turnStartedAt}
        isTeacher={isTeacher}
        isReadOnly={isReadOnly}
        onSubmitCodingAnswer={onSubmitCodingAnswer}
        onTimeoutCodingAnswer={onTimeoutCodingAnswer}
        onNextQuestion={onNextQuestion}
        isLoading={isLoading}
        isDataReady={isDataReady}
      />
    );
  }

  const handleClose = () => {
    setSelectedOption(null);
    setSubmissionResult(null);
    setErrorMessage(null);
    setIsRevealed(false);
    setIsTimedOut(false);
    timeoutTriggeredRef.current = false;
    onClose();
  };

  const handleSelectOption = (opt: 'A' | 'B' | 'C' | 'D') => {
    if (submissionResult || isRevealed || isTimedOut || isSubmitting) return;
    setErrorMessage(null);
    setSelectedOption(opt);
  };

  // Submit Answer Triggered by Student
  const handleSubmit = async () => {
    if (!selectedOption || !onSubmitAnswer || !isDataReady || isTimedOut || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await onSubmitAnswer(selectedOption);
      setSubmissionResult(result);
      if (result.is_timeout) {
        setIsTimedOut(true);
      } else if (result.is_correct) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (err: any) {
      console.error('[QuestionModal] Submit answer error:', err);
      setErrorMessage(err.message || 'Gagal mengirim jawaban.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto Timeout Triggered by Countdown Timer hitting 0
  const handleTimeUp = async () => {
    if (isTeacher || isReadOnly || submissionResult || isTimedOut || timeoutTriggeredRef.current || !turnStartedAt || !question) {
      return;
    }

    timeoutTriggeredRef.current = true;
    setErrorMessage(null);

    // Call server timeout RPC
    if (onTimeoutAnswer) {
      setIsSubmitting(true);
      try {
        const result = await onTimeoutAnswer();
        if (result && result.success && result.is_timeout) {
          setIsTimedOut(true);
          setSubmissionResult(result);
        } else if (result && result.already_resolved) {
          console.warn('[QuestionModal] Turn already resolved, ignoring timeout trigger.');
        }
      } catch (err: any) {
        console.error('[QuestionModal] Timeout error:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleTeacherScore = async (isCorrect: boolean) => {
    if (!onTeacherAwardPoints) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onTeacherAwardPoints(isCorrect);
      setIsRevealed(true);
      if (isCorrect) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (err: any) {
      console.error('[QuestionModal] Teacher award points error:', err);
      setErrorMessage(err.message || 'Gagal memberikan skor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[] = [
    { key: 'A', text: question.option_a || '' },
    { key: 'B', text: question.option_b || '' },
    { key: 'C', text: question.option_c || '' },
    { key: 'D', text: question.option_d || '' },
  ];

  const timeLimitSeconds = question.time_limit_seconds && question.time_limit_seconds > 0 ? question.time_limit_seconds : 30;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="2xl" showCloseButton={!isSubmitting}>
      <div className="space-y-6">
        {/* Header Badges & Timer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="blue" size="lg">
              {categoryName || 'General'}
            </Badge>
            <Badge variant="gold" size="lg">
              {question.points} Points
            </Badge>
          </div>
          {!submissionResult && !isRevealed && (
            <CountdownTimer
              initialSeconds={timeLimitSeconds}
              turnStartedAt={turnStartedAt}
              isActive={isOpen && !submissionResult && !isRevealed && !isTimedOut}
              onTimeUp={handleTimeUp}
              size="sm"
            />
          )}
        </div>

        {/* Timeout Alert Banner */}
        {isTimedOut && !submissionResult && (
          <div className="p-4 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center gap-3 text-rose-300 animate-pulse">
            <Clock className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <h4 className="font-bold text-sm text-white">WAKTU HABIS!</h4>
              <p className="text-xs text-rose-300">
                Waktu menjawab telah habis. Jawaban otomatis dikirim dan dianggap salah.
              </p>
            </div>
          </div>
        )}

        {/* Question Text */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
          <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-relaxed">
            {question.question}
          </h2>
          {question.image_url && (
            <div className="mt-4 rounded-lg overflow-hidden max-h-64 flex justify-center bg-black/40">
              <img
                src={question.image_url}
                alt="Question illustration"
                className="object-contain max-h-64"
              />
            </div>
          )}
        </div>

        {/* Spectator Alert if Not Active Player */}
        {isReadOnly && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2.5">
            <span className="text-base">👁️</span>
            <span>
              <strong>Mode Penonton:</strong> Hanya pemain aktif pada giliran ini yang dapat memilih dan mengirim jawaban.
            </span>
          </div>
        )}

        {/* Options List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {options.map((opt) => {
            const isSelected = selectedOption === opt.key;
            const isCorrectOption =
              (isRevealed && question.correct_answer === opt.key) ||
              (submissionResult && submissionResult.correct_answer === opt.key);
            const isWrongSelection =
              submissionResult && !submissionResult.is_correct && isSelected;

            let optionStyle =
              'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-750 hover:border-blue-500/50';

            if (isCorrectOption) {
              optionStyle =
                'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold neon-glow-green';
            } else if (isWrongSelection) {
              optionStyle =
                'bg-rose-500/20 border-rose-500 text-rose-300 font-bold neon-glow-red';
            } else if (isSelected) {
              optionStyle =
                'bg-blue-600/30 border-blue-500 text-white font-bold neon-glow-blue';
            }

            const isDisabled = isReadOnly || Boolean(submissionResult) || isRevealed || isSubmitting || isTimedOut;

            return (
              <button
                key={opt.key}
                disabled={isDisabled}
                onClick={() => !isDisabled && handleSelectOption(opt.key)}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 select-none ${
                  !isDisabled ? 'cursor-pointer' : 'cursor-default opacity-90'
                } ${optionStyle}`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${
                    isCorrectOption
                      ? 'bg-emerald-500 text-slate-950'
                      : isWrongSelection
                      ? 'bg-rose-500 text-white'
                      : isSelected
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {opt.key}
                </div>
                <span className="text-sm sm:text-base font-medium leading-snug">{opt.text}</span>
              </button>
            );
          })}
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Result & Feedback State */}
        {submissionResult && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-4 ${
              submissionResult.is_correct
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
            }`}
          >
            {submissionResult.is_correct ? (
              <CheckCircle className="w-8 h-8 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-8 h-8 text-rose-400 shrink-0" />
            )}
            <div>
              <h4 className="font-extrabold text-lg">
                {submissionResult.is_timeout
                  ? '⏳ WAKTU HABIS! (TIMEOUT)'
                  : submissionResult.is_correct
                  ? '✓ JAWABAN BENAR!'
                  : '✗ JAWABAN SALAH!'}
              </h4>
              <p className="text-sm font-semibold">
                {submissionResult.is_correct
                  ? `+${submissionResult.points_change} Points ditambahkan ke skor tim!`
                  : `${submissionResult.points_change} Points dikurangi dari skor tim.`}
              </p>
              {submissionResult.explanation && (
                <p className="text-xs mt-2 text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
                  💡 <strong>Penjelasan:</strong> {submissionResult.explanation}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Teacher Feedback / Revealed State */}
        {isTeacher && isRevealed && question.explanation && (
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-300 text-sm">
            💡 <strong>Penjelasan:</strong> {question.explanation}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {/* Student Actions */}
          {!isTeacher && !submissionResult && (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3">
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
                    disabled={!selectedOption || isSubmitting || isLoading || !isDataReady || isTimedOut}
                    isLoading={isSubmitting}
                    onClick={handleSubmit}
                  >
                    {isTimedOut ? 'Waktu Habis' : 'Kirim Jawaban'}
                  </Button>
                ) : (
                  <Button variant="secondary" size="lg" disabled className="text-xs font-semibold">
                    🔒 Menunggu Pemain Aktif Menjawab
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isTeacher && submissionResult && (
            <div className="w-full flex justify-end">
              <Button variant="accent" size="lg" onClick={handleClose} className="font-bold">
                Tutup & Lanjut ke Giliran Berikutnya
              </Button>
            </div>
          )}

          {/* Teacher Game Master Controls */}
          {isTeacher && (
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {!isRevealed && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setIsRevealed(true)}
                  >
                    Buka Kunci Jawaban ({question.correct_answer})
                  </Button>
                )}
                {isRevealed && (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                    Kunci: Option {question.correct_answer}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isRevealed ? (
                  <>
                    <Button
                      variant="danger"
                      size="md"
                      isLoading={isSubmitting}
                      onClick={() => handleTeacherScore(false)}
                    >
                      Salah (-{question.points})
                    </Button>
                    <Button
                      variant="success"
                      size="md"
                      isLoading={isSubmitting}
                      onClick={() => handleTeacherScore(true)}
                    >
                      Benar (+{question.points})
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="accent"
                    size="md"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                    onClick={() => {
                      handleClose();
                      if (onNextQuestion) onNextQuestion();
                    }}
                  >
                    Lanjut ke Giliran Berikutnya
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
