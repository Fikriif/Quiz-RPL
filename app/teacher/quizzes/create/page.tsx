'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy, ArrowLeft, ArrowRight, Plus, Trash2, Sparkles, Layers, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';

export default function CreateQuizPage() {
  const router = useRouter();
  const supabase = createClient();

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState(generateRandomCode());
  const [startingPoints, setStartingPoints] = useState(1000);
  const [categories, setCategories] = useState<string[]>(['HTML', 'CSS', 'JavaScript', 'Database']);
  const [teams, setTeams] = useState<string[]>(['Team Alpha', 'Team Beta', 'Team Gamma', 'Team Delta']);
  const [newCatInput, setNewCatInput] = useState('');
  const [newTeamInput, setNewTeamInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddCategory = () => {
    if (!newCatInput.trim()) return;
    setCategories([...categories, newCatInput.trim()]);
    setNewCatInput('');
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const handleAddTeam = () => {
    if (!newTeamInput.trim()) return;
    setTeams([...teams, newTeamInput.trim()]);
    setNewTeamInput('');
  };

  const handleRemoveTeam = (index: number) => {
    setTeams(teams.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Judul Quiz harus diisi.');
      return;
    }
    if (categories.length === 0) {
      setErrorMsg('Minimal buat 1 kategori.');
      return;
    }
    if (teams.length === 0) {
      setErrorMsg('Minimal buat 1 tim.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Harap login terlebih dahulu.');

      // 1. Insert Quiz
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          code: code.trim().toUpperCase(),
          starting_points: startingPoints,
          status: 'draft',
          created_by: user.id,
        })
        .select()
        .single();

      if (quizError || !quiz) throw quizError;

      // 2. Insert Categories
      const catInserts = categories.map((cat, idx) => ({
        quiz_id: quiz.id,
        name: cat,
        order_number: idx + 1,
      }));
      await supabase.from('categories').insert(catInserts);

      // 3. Insert Teams
      const teamInserts = teams.map((teamName, idx) => ({
        quiz_id: quiz.id,
        name: teamName,
        starting_points: startingPoints,
        current_points: startingPoints,
        turn_order: idx + 1,
      }));
      await supabase.from('teams').insert(teamInserts);

      router.push(`/teacher/quizzes/${quiz.id}/edit`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat quiz.');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/teacher/quizzes"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Quiz</span>
        </Link>
      </div>

      <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl">
        <div className="flex items-center gap-3 pb-6 mb-6 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Buat Quiz Baru</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Siapkan detail kompetisi, kategori soal, dan tim peserta
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> 1. Informasi Utama
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Judul Quiz *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Web Development Champions Challenge"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Deskripsi
              </label>
              <textarea
                rows={2}
                placeholder="Deskripsi singkat mengenai aturan dan topik kompetisi..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Kode Akses Siswa (6 Karakter) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-amber-400 font-mono font-bold text-base focus:outline-none focus:border-amber-500 uppercase tracking-widest"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setCode(generateRandomCode())}
                  >
                    Acak
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Starting Points per Tim *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={100}
                  value={startingPoints}
                  onChange={(e) => setStartingPoints(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white font-mono font-bold text-base focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Initial Categories */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" /> 2. Kategori Soal
            </h3>
            <p className="text-xs text-slate-400">
              Kategori akan menjadi kolom pada Question Board. Anda dapat menambah atau mengedit soal nanti.
            </p>

            <div className="flex flex-wrap gap-2">
              {categories.map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-blue-300 text-xs font-bold"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(idx)}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="Nama kategori baru..."
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddCategory}>
                + Tambah
              </Button>
            </div>
          </div>

          {/* Section 3: Initial Teams */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4" /> 3. Tim Peserta Kompetisi
            </h3>
            <p className="text-xs text-slate-400">
              Setiap tim otomatis memiliki {startingPoints} starting points.
            </p>

            <div className="flex flex-wrap gap-2">
              {teams.map((team, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-bold"
                >
                  <span>{team}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTeam(idx)}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="Nama tim baru..."
                value={newTeamInput}
                onChange={(e) => setNewTeamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTeam();
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddTeam}>
                + Tambah
              </Button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-6 border-t border-slate-800 flex justify-end gap-3">
            <Link href="/teacher/quizzes">
              <Button variant="ghost" size="lg">
                Batal
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Simpan & Masuk ke Bank Soal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
