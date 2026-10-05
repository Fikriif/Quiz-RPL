'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  PlusCircle,
  Play,
  Edit,
  Trash2,
  Copy,
  Users,
  HelpCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import { Quiz, QuizStatus } from '@/types/database';

export default function TeacherQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [filteredQuizzes, setFilteredQuizzes] = useState<Quiz[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | QuizStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const fetchQuizzes = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('quizzes')
        .select(`
          *,
          categories (*),
          questions (*),
          teams (*)
        `)
        .order('created_at', { ascending: false });

      if (data) {
        setQuizzes(data as any[]);
        setFilteredQuizzes(data as any[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  useEffect(() => {
    let result = quizzes;
    if (activeFilter !== 'all') {
      result = result.filter((q) => q.status === activeFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (q) =>
          q.title.toLowerCase().includes(query) ||
          q.code.toLowerCase().includes(query) ||
          (q.description && q.description.toLowerCase().includes(query))
      );
    }
    setFilteredQuizzes(result);
  }, [activeFilter, searchQuery, quizzes]);

  const handleDelete = async (quizId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus quiz ini? Seluruh kategori, soal, dan tim terkait akan terhapus.')) {
      return;
    }
    try {
      const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
      if (error) throw error;
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch (err: any) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  const handleDuplicate = async (quiz: Quiz) => {
    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const newCode = `QZ${randomSuffix}`;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // 1. Create duplicate quiz
      const { data: newQuiz, error } = await supabase
        .from('quizzes')
        .insert({
          title: `${quiz.title} (Salinan)`,
          description: quiz.description,
          code: newCode,
          status: 'draft',
          starting_points: quiz.starting_points,
          created_by: user.id,
        })
        .select()
        .single();

      if (error || !newQuiz) throw error;

      alert(`Quiz berhasil diduplikasi dengan kode baru: ${newCode}`);
      fetchQuizzes();
    } catch (err: any) {
      alert(`Gagal menduplikasi: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Kelola Quiz</h1>
          <p className="text-xs text-slate-400 mt-1">
            Daftar seluruh kompetisi quiz, kelola bank soal, dan jalankan pertandingan
          </p>
        </div>
        <Link href="/teacher/quizzes/create">
          <Button variant="gold" size="md" leftIcon={<PlusCircle className="w-4 h-4 text-slate-950" />}>
            Buat Quiz Baru
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {(['all', 'active', 'waiting', 'draft', 'finished'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all select-none ${
                activeFilter === filter
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari quiz atau kode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Quizzes List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
          <p className="text-sm">Memuat daftar quiz...</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
          <Layers className="w-10 h-10 mx-auto mb-3 text-slate-500 opacity-50" />
          <h4 className="font-bold text-white text-base">Tidak Ada Quiz</h4>
          <p className="text-xs text-slate-400 mt-1">
            {searchQuery
              ? 'Tidak ada quiz yang sesuai dengan pencarian Anda.'
              : 'Mulai buat quiz baru sekarang.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQuizzes.map((quiz) => (
            <Card key={quiz.id} hoverEffect className="flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Badge
                    variant={
                      quiz.status === 'active'
                        ? 'emerald'
                        : quiz.status === 'waiting'
                        ? 'amber'
                        : quiz.status === 'finished'
                        ? 'slate'
                        : 'blue'
                    }
                    size="sm"
                  >
                    {quiz.status.toUpperCase()}
                  </Badge>
                  <span className="font-mono text-xs font-black text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/30">
                    CODE: {quiz.code}
                  </span>
                </div>

                <h3 className="font-bold text-white text-lg line-clamp-1">{quiz.title}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {quiz.description || 'Tidak ada deskripsi.'}
                </p>

                {/* Sub Stats */}
                <div className="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">
                      Kategori
                    </span>
                    <span className="text-xs font-black text-blue-400">
                      {quiz.categories?.length || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">
                      Soal
                    </span>
                    <span className="text-xs font-black text-indigo-400">
                      {quiz.questions?.length || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">
                      Tim
                    </span>
                    <span className="text-xs font-black text-amber-400">
                      {quiz.teams?.length || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicate(quiz)}
                    title="Duplikasi Quiz"
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(quiz.id)}
                    title="Hapus Quiz"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                    <Button variant="outline" size="sm" leftIcon={<Edit className="w-3.5 h-3.5" />}>
                      Edit
                    </Button>
                  </Link>
                  <Link href={`/teacher/quiz/${quiz.id}/game`}>
                    <Button
                      variant={quiz.status === 'active' ? 'success' : 'primary'}
                      size="sm"
                      leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                    >
                      {quiz.status === 'active' ? 'Game Master' : 'Start'}
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
