import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'none' | 'blue' | 'gold' | 'green' | 'red';
  hoverEffect?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glow = 'none',
  hoverEffect = false,
  onClick,
}) => {
  const glowStyles = {
    none: '',
    blue: 'neon-glow-blue border-blue-500/30',
    gold: 'neon-glow-gold border-amber-500/40',
    green: 'neon-glow-green border-emerald-500/30',
    red: 'neon-glow-red border-rose-500/30',
  };

  return (
    <div
      onClick={onClick}
      className={`glass-panel rounded-2xl p-6 ${hoverEffect ? 'glass-panel-hover cursor-pointer' : ''} ${glowStyles[glow]} ${className}`}
    >
      {children}
    </div>
  );
};
