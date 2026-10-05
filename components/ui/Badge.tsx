import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate' | 'gold' | 'silver' | 'bronze';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'blue',
  size = 'md',
  className = '',
  icon,
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-semibold',
    lg: 'px-3 py-1.5 text-sm font-bold',
  };

  const variantStyles = {
    blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    indigo: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    slate: 'bg-slate-700/40 text-slate-300 border border-slate-600/40',
    gold: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-400/50 shadow-sm shadow-amber-500/20',
    silver: 'bg-slate-300/15 text-slate-200 border border-slate-300/40',
    bronze: 'bg-amber-800/25 text-amber-400 border border-amber-700/50',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
