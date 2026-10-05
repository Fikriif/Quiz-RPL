'use client';

import React from 'react';
import { Lock, Sparkles, CheckCircle2, Play } from 'lucide-react';
import { Category, Question, QuestionUsage, CellState } from '@/types/database';

interface QuestionBoardProps {
  categories: Category[];
  questions: Question[];
  usedQuestionIds: Set<string>;
  selectedQuestionId: string | null;
  onSelectQuestion?: (question: Question) => void;
  isInteractive?: boolean; // True for teacher or student whose turn it is
  className?: string;
}

export const QuestionBoard: React.FC<QuestionBoardProps> = ({
  categories,
  questions,
  usedQuestionIds,
  selectedQuestionId,
  onSelectQuestion,
  isInteractive = true,
  className = '',
}) => {
  // Sort categories by order_number
  const sortedCategories = [...categories].sort((a, b) => a.order_number - b.order_number);

  // Group questions by category_id and sort by points ascending
  const questionsByCategory: { [catId: string]: Question[] } = {};
  sortedCategories.forEach((cat) => {
    questionsByCategory[cat.id] = questions
      .filter((q) => q.category_id === cat.id)
      .sort((a, b) => a.points - b.points);
  });

  // Find max questions in any category to format row height
  const maxRows = Math.max(
    ...sortedCategories.map((cat) => questionsByCategory[cat.id]?.length || 0),
    0
  );

  const getCellState = (question: Question): CellState => {
    if (usedQuestionIds.has(question.id)) return 'USED';
    if (selectedQuestionId === question.id) return 'SELECTED';
    return 'AVAILABLE';
  };

  if (categories.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
        <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-500 opacity-50" />
        <p className="text-base font-semibold">Belum ada kategori dan soal pada quiz ini.</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto pb-4 ${className}`}>
      <div
        className="grid gap-3 min-w-[640px]"
        style={{
          gridTemplateColumns: `repeat(${sortedCategories.length}, minmax(140px, 1fr))`,
        }}
      >
        {/* Category Header Columns */}
        {sortedCategories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-center p-4 rounded-xl bg-gradient-to-b from-blue-900/60 to-slate-900 border border-blue-500/30 text-center shadow-lg shadow-blue-950/50"
          >
            <h3 className="font-extrabold text-sm sm:text-base text-blue-200 tracking-wider uppercase line-clamp-1">
              {category.name}
            </h3>
          </div>
        ))}

        {/* Matrix Question Cells */}
        {Array.from({ length: maxRows }).map((_, rowIndex) => (
          <React.Fragment key={`row-${rowIndex}`}>
            {sortedCategories.map((category) => {
              const categoryQuestions = questionsByCategory[category.id] || [];
              const question = categoryQuestions[rowIndex];

              if (!question) {
                // Empty placeholder cell
                return (
                  <div
                    key={`empty-${category.id}-${rowIndex}`}
                    className="h-20 sm:h-24 rounded-xl border border-slate-800/40 bg-slate-950/20"
                  />
                );
              }

              const state = getCellState(question);
              const isUsed = state === 'USED';
              const isSelected = state === 'SELECTED';
              const isAvailable = state === 'AVAILABLE';

              return (
                <button
                  key={question.id}
                  disabled={!isInteractive || isUsed}
                  onClick={() => isInteractive && !isUsed && onSelectQuestion && onSelectQuestion(question)}
                  className={`relative flex flex-col items-center justify-center h-20 sm:h-24 rounded-xl font-mono font-black text-xl sm:text-2xl transition-all duration-200 select-none ${
                    isUsed
                      ? 'bg-slate-900/40 border border-slate-800/60 text-slate-600 cursor-not-allowed opacity-60'
                      : isSelected
                      ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-300 neon-glow-gold animate-pulse scale-[1.03] z-10'
                      : isInteractive
                      ? 'bg-gradient-to-b from-slate-800/90 to-slate-900 border border-blue-500/40 text-blue-400 hover:border-blue-400 hover:text-white hover:bg-blue-600/30 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
                      : 'bg-slate-900 border border-slate-800 text-blue-400/80 cursor-default'
                  }`}
                >
                  {/* Point Value */}
                  <span>{question.points}</span>

                  {/* Status Indicator */}
                  {isUsed && (
                    <span className="absolute bottom-1.5 flex items-center gap-1 text-[10px] font-sans font-bold text-slate-500 uppercase tracking-widest">
                      <Lock className="w-2.5 h-2.5" /> USED
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute bottom-1.5 flex items-center gap-1 text-[10px] font-sans font-bold text-amber-300 uppercase tracking-widest">
                      <Play className="w-2.5 h-2.5 fill-current" /> PLAYING
                    </span>
                  )}
                  {isAvailable && (
                    <span className="absolute bottom-1.5 text-[9px] font-sans font-bold text-slate-400 uppercase tracking-widest opacity-0 hover:opacity-100 transition-opacity">
                      SELECT
                    </span>
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
