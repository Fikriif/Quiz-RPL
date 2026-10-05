'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Maximize2, AlertTriangle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

interface ExamFocusMonitorProps {
  sessionId: string;
  studentId: string;
  isExamMode?: boolean;
}

export const ExamFocusMonitor: React.FC<ExamFocusMonitorProps> = ({
  sessionId,
  studentId,
  isExamMode = false,
}) => {
  const supabase = createClient();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [showWarningToast, setShowWarningToast] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  const logExamEvent = async (eventType: 'tab_hidden' | 'window_blur' | 'fullscreen_exit', details: any = {}) => {
    try {
      await supabase.from('exam_events').insert({
        quiz_session_id: sessionId,
        student_id: studentId,
        event_type: eventType,
        details,
      });
    } catch (err) {
      console.warn('[ExamFocusMonitor] Failed to log event:', err);
    }
  };

  const triggerWarning = (msg: string, eventType: 'tab_hidden' | 'window_blur' | 'fullscreen_exit') => {
    setWarningCount((prev) => prev + 1);
    setWarningMessage(msg);
    setShowWarningToast(true);
    logExamEvent(eventType, { timestamp: new Date().toISOString() });

    setTimeout(() => {
      setShowWarningToast(false);
    }, 5000);
  };

  const handleRequestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('[ExamFocusMonitor] Fullscreen request error:', err);
    }
  };

  useEffect(() => {
    if (!isExamMode || !sessionId || !studentId) return;

    // 1. Fullscreen change listener
    const onFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull) {
        triggerWarning('Perhatian! Anda keluar dari mode layar penuh (Fullscreen). Aktivitas ini tercatat.', 'fullscreen_exit');
      }
    };

    // 2. Visibility change listener (tab switch)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerWarning('Perhatian! Anda berpindah tab atau meminimalkan browser. Aktivitas ini tercatat oleh pengawas.', 'tab_hidden');
      }
    };

    // 3. Window blur listener
    const onWindowBlur = () => {
      triggerWarning('Perhatian! Fokus layar berpindah ke aplikasi lain. Aktivitas ini tercatat.', 'window_blur');
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [isExamMode, sessionId, studentId]);

  if (!isExamMode) return null;

  return (
    <>
      {/* Exam Mode Sticky Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
          <div>
            <span className="font-extrabold text-amber-300 block">
              EXAM MODE AKTIF (FOCUS MONITORING)
            </span>
            <span className="text-slate-400 text-[11px]">
              Dilarang berpindah tab atau keluar fullscreen selama pertandingan berlangsung.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {warningCount > 0 && (
            <span className="font-mono text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/30">
              Pelanggaran Fokus: {warningCount}x
            </span>
          )}

          {!isFullscreen ? (
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={handleRequestFullscreen}
              leftIcon={<Maximize2 className="w-3.5 h-3.5" />}
              className="text-xs font-bold shadow-md shadow-amber-500/20"
            >
              Masuk Fullscreen
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Fullscreen Terkunci
            </span>
          )}
        </div>
      </div>

      {/* Floating Warning Toast */}
      {showWarningToast && (
        <div className="fixed top-6 right-6 z-50 max-w-md p-4 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-white shadow-2xl animate-bounce">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-black text-sm text-rose-300">PERINGATAN PENGAWAS UJIAN</h5>
              <p className="text-xs text-slate-200 mt-1">{warningMessage}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
