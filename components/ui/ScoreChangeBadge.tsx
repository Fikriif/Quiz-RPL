'use client';

import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface ScoreChangeBadgeProps {
  change: number;
  className?: string;
}

export const ScoreChangeBadge: React.FC<ScoreChangeBadgeProps> = ({ change, className = '' }) => {
  if (change === 0) return null;

  const isPositive = change > 0;
  const formattedChange = isPositive ? `+${change}` : `${change}`;

  return (
    <div
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-black text-sm animate-float-up pointer-events-none select-none z-20 ${
        isPositive
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 neon-glow-green'
          : 'bg-rose-500/20 text-rose-400 border border-rose-500/50 neon-glow-red'
      } ${className}`}
    >
      {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
      <span>{formattedChange}</span>
    </div>
  );
};
