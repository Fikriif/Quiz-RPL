'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  initialSeconds: number;
  turnStartedAt?: string | null;
  isActive: boolean;
  onTimeUp?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  initialSeconds = 30,
  turnStartedAt,
  isActive = true,
  onTimeUp,
  className = '',
  size = 'md',
}) => {
  const totalDuration = Math.max(1, initialSeconds);
  const hasFiredTimeUp = useRef(false);

  // Calculate remaining seconds based on server turn_started_at timestamp
  const calculateRemaining = useCallback((): number => {
    if (!turnStartedAt) {
      return totalDuration;
    }

    const startTime = new Date(turnStartedAt).getTime();
    if (isNaN(startTime)) {
      return totalDuration;
    }

    const deadline = startTime + totalDuration * 1000;
    const now = Date.now();
    const remainingMs = deadline - now;

    return Math.max(0, Math.ceil(remainingMs / 1000));
  }, [turnStartedAt, totalDuration]);

  const [seconds, setSeconds] = useState<number>(() => calculateRemaining());

  // Reset trigger flag when turnStartedAt or initialSeconds changes
  useEffect(() => {
    hasFiredTimeUp.current = false;
    const initialRemaining = calculateRemaining();
    setSeconds(initialRemaining);

    if (isActive && initialRemaining <= 0 && !hasFiredTimeUp.current) {
      hasFiredTimeUp.current = true;
      if (onTimeUp) {
        onTimeUp();
      }
    }
  }, [turnStartedAt, initialSeconds, calculateRemaining, isActive, onTimeUp]);

  // High-frequency interval (200ms) to ensure smooth accuracy and instant reconnect calculation
  useEffect(() => {
    if (!isActive) return;

    const tick = () => {
      const remaining = calculateRemaining();
      setSeconds(remaining);

      if (remaining <= 0 && !hasFiredTimeUp.current) {
        hasFiredTimeUp.current = true;
        if (onTimeUp) {
          onTimeUp();
        }
      }
    };

    tick();
    const interval = setInterval(tick, 200);

    return () => clearInterval(interval);
  }, [isActive, calculateRemaining, onTimeUp]);

  const percentage = Math.min(100, Math.max(0, (seconds / totalDuration) * 100));
  const isUrgent = seconds <= 5;
  const isWarning = seconds <= 10 && seconds > 5;

  const colorClass = isUrgent
    ? 'text-rose-500 border-rose-500 bg-rose-500/10 neon-glow-red animate-pulse shadow-lg shadow-rose-500/20'
    : isWarning
    ? 'text-amber-400 border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20'
    : 'text-blue-400 border-blue-500/40 bg-blue-500/10 shadow-md shadow-blue-500/10';

  const sizeClasses = {
    sm: 'w-14 h-12 text-sm',
    md: 'w-16 h-16 text-xl font-bold',
    lg: 'w-24 h-24 text-3xl font-extrabold',
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div
        className={`relative flex items-center justify-center rounded-2xl border-2 transition-all duration-200 ${colorClass} ${sizeClasses[size]}`}
      >
        <div className="flex items-center justify-center gap-0.5 font-mono font-black">
          <Timer className="w-3.5 h-3.5 mr-0.5 opacity-80" />
          <span>{seconds}s</span>
        </div>
      </div>
      {/* Progress Bar */}
      <div className="w-full min-w-[56px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ease-linear rounded-full ${
            isUrgent ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
