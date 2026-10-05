'use client';

import React, { useEffect, useState } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  initialSeconds: number;
  isActive: boolean;
  onTimeUp?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  initialSeconds = 30,
  isActive = true,
  onTimeUp,
  className = '',
  size = 'md',
}) => {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval!);
            if (onTimeUp) onTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, seconds, onTimeUp]);

  const percentage = (seconds / initialSeconds) * 100;
  const isUrgent = seconds <= 5;
  const isWarning = seconds <= 10 && seconds > 5;

  const colorClass = isUrgent
    ? 'text-rose-500 border-rose-500 bg-rose-500/10 neon-glow-red animate-pulse'
    : isWarning
    ? 'text-amber-400 border-amber-500 bg-amber-500/10'
    : 'text-blue-400 border-blue-500/40 bg-blue-500/10';

  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-16 h-16 text-xl font-bold',
    lg: 'w-24 h-24 text-3xl font-extrabold',
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        className={`relative flex items-center justify-center rounded-full border-2 transition-all duration-300 ${colorClass} ${sizeClasses[size]}`}
      >
        <div className="flex items-center justify-center gap-1 font-mono">
          {seconds}s
        </div>
      </div>
      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ease-linear rounded-full ${
            isUrgent ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
