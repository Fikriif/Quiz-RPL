'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Trophy, LayoutDashboard, History, KeyRound, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

interface StudentNavbarProps {
  onOpenJoinModal?: () => void;
}

export const StudentNavbar: React.FC<StudentNavbarProps> = ({ onOpenJoinModal }) => {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <Link href="/student/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <span className="font-black text-lg tracking-wider text-white">QUIZ ARENA</span>
            <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-bold text-indigo-400 bg-indigo-500/10 rounded-full border border-indigo-500/30 uppercase">
              Student Arena
            </span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
          <Link
            href="/student/dashboard"
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              pathname === '/student/dashboard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/student/history"
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              pathname === '/student/history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            History & Badges
          </Link>
        </nav>

        {/* Right Action buttons */}
        <div className="flex items-center gap-3">
          {onOpenJoinModal && (
            <Button
              variant="gold"
              size="sm"
              leftIcon={<KeyRound className="w-3.5 h-3.5" />}
              onClick={onOpenJoinModal}
            >
              Join Quiz
            </Button>
          )}

          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
