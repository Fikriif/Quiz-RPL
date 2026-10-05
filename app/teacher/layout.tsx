import React from 'react';
import { TeacherSidebar } from '@/components/teacher/TeacherSidebar';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row text-slate-100">
      <TeacherSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950 sticky top-0 z-30">
          <span className="font-black text-lg tracking-wider text-white">QUIZ ARENA</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/30">
            Teacher
          </span>
        </div>
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
