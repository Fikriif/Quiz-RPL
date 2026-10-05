'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  History,
  PlusCircle,
  LogOut,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export const TeacherSidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const navItems = [
    { name: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
    { name: 'My Quizzes', href: '/teacher/quizzes', icon: Layers },
    { name: 'Quiz History', href: '/teacher/history', icon: History },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="w-64 shrink-0 hidden md:flex flex-col justify-between border-r border-slate-800 bg-slate-950/80 p-5 min-h-screen sticky top-0">
      <div className="space-y-6">
        {/* Brand Header */}
        <Link href="/teacher/dashboard" className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <span className="font-black text-lg tracking-wider text-white">QUIZ ARENA</span>
            <span className="block text-[10px] font-bold text-blue-400 tracking-widest uppercase">
              Teacher Portal
            </span>
          </div>
        </Link>

        {/* Quick Action Button */}
        <Link
          href="/teacher/quizzes/create"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ Create Quiz</span>
        </Link>

        {/* Navigation Items */}
        <nav className="space-y-1.5 pt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 neon-glow-blue'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Logout */}
      <div className="space-y-4 pt-4 border-t border-slate-800/80">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 font-semibold text-sm transition-colors cursor-pointer"
        >
          <LogOut className="w-5 h-5" />
          <span>Keluar (Logout)</span>
        </button>
      </div>
    </aside>
  );
};
