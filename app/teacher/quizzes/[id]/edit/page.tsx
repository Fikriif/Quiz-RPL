'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Layers,
  HelpCircle,
  Users,
  Plus,
  Trash2,
  Edit,
  Play,
  FileSpreadsheet,
  Settings,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { CsvImporter } from '@/components/quiz/CsvImporter';
import { TestCaseBuilder } from '@/components/teacher/TestCaseBuilder';
import { createClient } from '@/lib/supabase/client';
import { Quiz, Category, Question, Team, QuizStatus, QuestionType, CodingLanguage, CodingValidationType, TestCase } from '@/types/database';

export default function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const quizId = resolvedParams.id;
  const router = useRouter();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'questions' | 'teams' | 'settings'>('questions');
  const [questionSubTab, setQuestionSubTab] = useState<'list' | 'manual' | 'csv'>('list');

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual Question Form State
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [questionText, setQuestionText] = useState('');

  // Multiple Choice fields
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');

  // Coding fields
  const [language, setLanguage] = useState<CodingLanguage>('html_css_js');
  const [validationType, setValidationType] = useState<CodingValidationType>('test_cases');
  const [starterCode, setStarterCode] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(0);

  const [points, setPoints] = useState(100);
  const [explanation, setExplanation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // New Category Form State
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // New Team Form State
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  const fetchQuizData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Quiz
      const { data: qData } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
      if (qData) setQuiz(qData as Quiz);

      // 2. Fetch Categories
      const { data: cData } = await supabase
        .from('categories')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_number', { ascending: true });
      if (cData) {
        setCategories(cData as Category[]);
        if (cData.length > 0 && !selectedCatId) {
          setSelectedCatId(cData[0].id);
        }
      }

      // 3. Fetch Questions
      const { data: qsData } = await supabase
        .from('questions')
        .select('*, category:categories(*)')
        .eq('quiz_id', quizId)
        .order('points', { ascending: true });
      if (qsData) setQuestions(qsData as any[]);

      // 4. Fetch Teams with member count
      const { data: tData } = await supabase
        .from('teams')
        .select('*, members:team_members(*)')
        .eq('quiz_id', quizId)
        .order('turn_order', { ascending: true });
      if (tData) setTeams(tData as any[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizData();
  }, [quizId]);

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId || !questionText.trim()) return;

    setIsSavingQuestion(true);
    try {
      const payload: any = {
        quiz_id: quizId,
        category_id: selectedCatId,
        question_type: questionType,
        question: questionText.trim(),
        points,
        explanation: explanation.trim() || null,
        image_url: imageUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (questionType === 'coding') {
        payload.validation_type = validationType;
        payload.language = language;
        payload.starter_code = starterCode.trim() || null;
        payload.expected_output = validationType === 'exact' ? (expectedOutput.trim() || null) : null;
        payload.test_cases = validationType === 'test_cases' ? testCases : [];
        payload.time_limit_seconds = timeLimitSeconds;
        payload.option_a = null;
        payload.option_b = null;
        payload.option_c = null;
        payload.option_d = null;
        payload.correct_answer = null;
      } else {
        payload.validation_type = 'test_cases';
        payload.language = 'html_css_js';
        payload.starter_code = null;
        payload.expected_output = null;
        payload.test_cases = [];
        payload.time_limit_seconds = 0;
        payload.option_a = optionA.trim();
        payload.option_b = optionB.trim();
        payload.option_c = optionC.trim();
        payload.option_d = optionD.trim();
        payload.correct_answer = correctAnswer;
      }

      if (editingQuestionId) {
        // Update
        const { error } = await supabase
          .from('questions')
          .update(payload)
          .eq('id', editingQuestionId);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('questions').insert(payload);
        if (error) throw error;
      }

      // Reset
      resetQuestionForm();
      setQuestionSubTab('list');
      fetchQuizData();
    } catch (err: any) {
      alert(`Gagal menyimpan soal: ${err.message}`);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleEditQuestionClick = (q: Question) => {
    setEditingQuestionId(q.id);
    setQuestionType(q.question_type || 'multiple_choice');
    setSelectedCatId(q.category_id);
    setQuestionText(q.question);
    setOptionA(q.option_a || '');
    setOptionB(q.option_b || '');
    setOptionC(q.option_c || '');
    setOptionD(q.option_d || '');
    setCorrectAnswer(q.correct_answer || 'A');
    setLanguage(q.language || 'html_css_js');
    setValidationType(q.validation_type || (q.expected_output && (!q.test_cases || q.test_cases.length === 0) ? 'exact' : 'test_cases'));
    setStarterCode(q.starter_code || '');
    setExpectedOutput(q.expected_output || '');
    setTestCases(q.test_cases || []);
    setTimeLimitSeconds(q.time_limit_seconds || 0);
    setPoints(q.points);
    setExplanation(q.explanation || '');
    setImageUrl(q.image_url || '');
    setQuestionSubTab('manual');
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Hapus soal ini?')) return;
    try {
      await supabase.from('questions').delete().eq('id', id);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    }
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQuestionType('multiple_choice');
    setQuestionText('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer('A');
    setLanguage('html_css_js');
    setValidationType('test_cases');
    setStarterCode('');
    setExpectedOutput('');
    setTestCases([]);
    setTimeLimitSeconds(0);
    setPoints(100);
    setExplanation('');
    setImageUrl('');
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          quiz_id: quizId,
          name: newCatName.trim(),
          order_number: categories.length + 1,
        })
        .select()
        .single();

      if (error) throw error;
      setCategories([...categories, data as Category]);
      setNewCatName('');
      setIsCatModalOpen(false);
    } catch (err: any) {
      alert(`Gagal menambahkan kategori: ${err.message}`);
    }
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim() || !quiz) return;
    try {
      const { data, error } = await supabase
        .from('teams')
        .insert({
          quiz_id: quizId,
          name: newTeamName.trim(),
          description: newTeamDesc.trim() || null,
          starting_points: quiz.starting_points,
          current_points: quiz.starting_points,
          turn_order: teams.length + 1,
        })
        .select()
        .single();

      if (error) throw error;
      setTeams([...teams, data as Team]);
      setNewTeamName('');
      setNewTeamDesc('');
      setIsTeamModalOpen(false);
    } catch (err: any) {
      alert(`Gagal menambahkan tim: ${err.message}`);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!confirm('Hapus tim ini?')) return;
    try {
      await supabase.from('teams').delete().eq('id', id);
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      alert(`Gagal menghapus tim: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (newStatus: QuizStatus) => {
    try {
      await supabase.from('quizzes').update({ status: newStatus }).eq('id', quizId);

      // If set to active, make sure a quiz_session exists
      if (newStatus === 'active') {
        const { data: existingSession } = await supabase
          .from('quiz_sessions')
          .select('id')
          .eq('quiz_id', quizId)
          .single();

        if (!existingSession) {
          await supabase.from('quiz_sessions').insert({
            quiz_id: quizId,
            status: 'active',
            started_at: new Date().toISOString(),
          });
        } else {
          await supabase
            .from('quiz_sessions')
            .update({ status: 'active', started_at: new Date().toISOString() })
            .eq('quiz_id', quizId);
        }
      }

      setQuiz((prev) => (prev ? { ...prev, status: newStatus } : null));
    } catch (err: any) {
      alert(`Gagal mengubah status: ${err.message}`);
    }
  };

  if (isLoading || !quiz) {
    return (
      <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
        <p className="text-sm">Memuat data quiz...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/teacher/quizzes"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Daftar Quiz</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white">{quiz.title}</h1>
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
            >
              {quiz.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kode Akses Siswa:{' '}
            <span className="font-mono font-bold text-amber-400 text-sm bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {quiz.code}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/teacher/quizzes/${quiz.id}/sessions`}>
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Layers className="w-4 h-4 text-amber-400" />}
            >
              Kelola Sesi Pertandingan
            </Button>
          </Link>

          <Link href={`/teacher/quiz/${quiz.id}/game`}>
            <Button
              variant="gold"
              size="md"
              leftIcon={<Play className="w-4 h-4 text-slate-950 fill-current" />}
            >
              Buka Game Master
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('questions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'questions'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Bank Soal ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('teams')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'teams'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Tim Peserta ({teams.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Pengaturan Status</span>
        </button>
      </div>

      {/* TAB 1: QUESTIONS & CATEGORIES */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          {/* Sub Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuestionSubTab('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  questionSubTab === 'list'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Daftar Soal
              </button>
              <button
                onClick={() => {
                  resetQuestionForm();
                  setQuestionSubTab('manual');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  questionSubTab === 'manual'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                + Tambah Manual
              </button>
              <button
                onClick={() => setQuestionSubTab('csv')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  questionSubTab === 'csv'
                    ? 'bg-slate-800 text-blue-400 border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Import CSV</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsCatModalOpen(true)}
            >
              + Kategori Baru
            </Button>
          </div>

          {/* Subtab: CSV Importer */}
          {questionSubTab === 'csv' && (
            <Card>
              <CsvImporter quizId={quizId} onImportSuccess={fetchQuizData} />
            </Card>
          )}

          {/* Subtab: Manual Form */}
          {questionSubTab === 'manual' && (
            <Card>
              <form onSubmit={handleSaveQuestion} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="font-bold text-white text-base">
                    {editingQuestionId ? 'Edit Soal' : 'Tambah Soal Baru'}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      resetQuestionForm();
                      setQuestionSubTab('list');
                    }}
                  >
                    Batal
                  </Button>
                </div>

                {/* Question Type Selector */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Tipe Soal *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setQuestionType('multiple_choice')}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        questionType === 'multiple_choice'
                          ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        questionType === 'multiple_choice' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        A/B
                      </div>
                      <div>
                        <span className="font-bold text-xs block">Pilihan Ganda (Multiple Choice)</span>
                        <span className="text-[11px] text-slate-400">4 pilihan jawaban (A, B, C, D)</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestionType('coding')}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        questionType === 'coding'
                          ? 'bg-amber-500/20 border-amber-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        questionType === 'coding' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}>
                        &lt;/&gt;
                      </div>
                      <div>
                        <span className="font-bold text-xs block text-amber-300">Soal Coding Interaktif</span>
                        <span className="text-[11px] text-slate-400">HTML/CSS/JS Code Editor + Auto Grading</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                      Kategori *
                    </label>
                    <select
                      value={selectedCatId}
                      onChange={(e) => setSelectedCatId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                      Nilai Poin *
                    </label>
                    <div className="flex items-center gap-2">
                      {[100, 200, 300, 500, 1000].map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() => setPoints(pts)}
                          className={`flex-1 py-1.5 rounded-lg font-mono font-bold text-xs border ${
                            points === pts
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          {pts}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                    {questionType === 'coding' ? 'Judul / Perintah Soal *' : 'Pertanyaan *'}
                  </label>
                  <textarea
                    rows={questionType === 'coding' ? 2 : 3}
                    required
                    placeholder={
                      questionType === 'coding'
                        ? "Contoh: Buat tulisan 'Hello world!' menggunakan tag h1 dan berikan garis bawah."
                        : "Tuliskan teks soal di sini..."
                    }
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Multiple Choice Section */}
                {questionType === 'multiple_choice' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                      const valueMap = {
                        A: optionA,
                        B: optionB,
                        C: optionC,
                        D: optionD,
                      };
                      const setterMap = {
                        A: setOptionA,
                        B: setOptionB,
                        C: setOptionC,
                        D: setOptionD,
                      };

                      return (
                        <div key={optKey} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-400">
                              Pilihan {optKey} *
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="radio"
                                name="correct_answer"
                                checked={correctAnswer === optKey}
                                onChange={() => setCorrectAnswer(optKey)}
                                className="text-emerald-500 focus:ring-emerald-500"
                              />
                              <span
                                className={
                                  correctAnswer === optKey ? 'text-emerald-400 font-bold' : ''
                                }
                              >
                                Kunci Jawaban
                              </span>
                            </label>
                          </div>
                          <input
                            type="text"
                            required
                            placeholder={`Teks pilihan ${optKey}...`}
                            value={valueMap[optKey]}
                            onChange={(e) => setterMap[optKey](e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Coding Question Section */}
                {questionType === 'coding' && (
                  <div className="space-y-4 pt-2 border-t border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                          Bahasa Pemrograman *
                        </label>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value as CodingLanguage)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500 font-bold text-amber-300"
                        >
                          <option value="html_css_js">HTML + CSS + JavaScript</option>
                          <option value="javascript">JavaScript (DOM & Logic)</option>
                          <option value="html">HTML Only</option>
                          <option value="css">CSS Only</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                          Batas Waktu Pengerjaan (Detik, 0 = Tanpa Batas)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={timeLimitSeconds}
                          onChange={(e) => setTimeLimitSeconds(parseInt(e.target.value) || 0)}
                          placeholder="Contoh: 120"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Validation Type Toggle */}
                    <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Tipe Validasi Soal *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setValidationType('exact')}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                            validationType === 'exact'
                              ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-md'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            validationType === 'exact' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            📝
                          </div>
                          <div>
                            <span className="font-bold text-xs block text-emerald-300">Mode A — Exact Answer</span>
                            <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                              Pencocokan kode presisi dengan normalisasi whitespace/tag yang aman (contoh: &lt;marquee&gt;Welcome&lt;/marquee&gt;).
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setValidationType('test_cases')}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                            validationType === 'test_cases'
                              ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            validationType === 'test_cases' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                          }`}>
                            ⚙️
                          </div>
                          <div>
                            <span className="font-bold text-xs block text-blue-300">Mode B — Test Cases / Behavior</span>
                            <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                              Pengujian dinamis DOM element, computed style CSS (warna/padding/layout), JS logic, dan interaksi event.
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                        Starter Code (Template awal yang diberikan ke siswa)
                      </label>
                      <textarea
                        rows={4}
                        value={starterCode}
                        onChange={(e) => setStarterCode(e.target.value)}
                        placeholder={`<!DOCTYPE html>\n<html>\n<head>\n  <title>My Solution</title>\n</head>\n<body>\n  <!-- Tulis kode kamu di sini -->\n</body>\n</html>`}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xs text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Mode A: Exact Answer Field */}
                    {validationType === 'exact' && (
                      <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-900/50 space-y-2">
                        <label className="block text-xs font-bold text-emerald-300 uppercase tracking-wider">
                          Expected Answer (Kunci Jawaban Kode Persis) *
                        </label>
                        <p className="text-[11px] text-slate-400">
                          Tuliskan kode yang diharapkan. Sistem otomatis menormalisasi whitespace dan line break secara aman tanpa merusak struktur tag.
                        </p>
                        <textarea
                          rows={4}
                          required={validationType === 'exact'}
                          value={expectedOutput}
                          onChange={(e) => setExpectedOutput(e.target.value)}
                          placeholder="<marquee>Welcome Page</marquee>"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-emerald-700/60 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    )}

                    {/* Mode B: Test Cases Builder */}
                    {validationType === 'test_cases' && (
                      <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                        <TestCaseBuilder
                          testCases={testCases}
                          onChange={setTestCases}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
                    Penjelasan / Petunjuk Pengerjaan (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Petunjuk tambahan untuk siswa..."
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      resetQuestionForm();
                      setQuestionSubTab('list');
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSavingQuestion}
                  >
                    Simpan Soal
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Subtab: Questions List */}
          {questionSubTab === 'list' && (
            <div className="space-y-4">
              {categories.map((cat) => {
                const catQuestions = questions.filter((q) => q.category_id === cat.id);
                return (
                  <div key={cat.id} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-extrabold text-blue-300 text-base flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        {cat.name}
                      </h4>
                      <Badge variant="blue" size="sm">
                        {catQuestions.length} Soal
                      </Badge>
                    </div>

                    {catQuestions.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">
                        Belum ada soal pada kategori ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {catQuestions.map((q) => (
                          <div
                            key={q.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/30">
                                {q.points} PTS
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  {q.question_type === 'coding' ? (
                                    <span className="text-[10px] font-black font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase">
                                      &lt;/&gt; CODING • {q.test_cases?.length || 0} TESTS
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase">
                                      PILIHAN GANDA
                                    </span>
                                  )}
                                  <p className="text-xs font-semibold text-white line-clamp-1">
                                    {q.question}
                                  </p>
                                </div>
                                {q.question_type !== 'coding' ? (
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Kunci: <strong className="text-emerald-400">{q.correct_answer}</strong>{' '}
                                    | A: {q.option_a} | B: {q.option_b}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Bahasa: <strong className="text-amber-300 uppercase">{q.language || 'HTML/CSS/JS'}</strong>
                                    {q.time_limit_seconds ? ` • Batas: ${q.time_limit_seconds}s` : ''}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditQuestionClick(q)}
                                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEAMS */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white">Daftar Tim Peserta</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Siswa dapat bergabung ke tim menggunakan kode quiz: <strong>{quiz.code}</strong>
              </p>
            </div>
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-4 h-4 text-slate-950" />}
              onClick={() => setIsTeamModalOpen(true)}
            >
              + Tambah Tim
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.map((team) => (
              <Card key={team.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-extrabold text-white text-lg">{team.name}</h4>
                    <span className="font-mono font-black text-amber-400 text-lg">
                      {team.current_points} PTS
                    </span>
                  </div>
                  {team.description && (
                    <p className="text-xs text-slate-400 mb-3">{team.description}</p>
                  )}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                    <span className="font-bold text-slate-300">Anggota Terdaftar: </span>
                    {team.members && team.members.length > 0 ? (
                      <span>{team.members.length} siswa</span>
                    ) : (
                      <span className="italic text-slate-500">Belum ada siswa bergabung</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleDeleteTeam(team.id)}
                    className="p-1.5 text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Tim</span>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SETTINGS & STATUS */}
      {activeTab === 'settings' && (
        <Card className="max-w-2xl">
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-white">Status Pertandingan</h3>
              <p className="text-xs text-slate-400 mt-1">
                Ubah status quiz untuk mengontrol apakah siswa dapat melihat atau menjawab soal.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {(['draft', 'waiting', 'active', 'finished'] as QuizStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(st)}
                    className={`p-3 rounded-xl border text-center font-bold text-xs uppercase transition-all ${
                      quiz.status === st
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Starting Points
              </h4>
              <p className="text-sm font-mono font-bold text-amber-400">
                {quiz.starting_points} Poin (Default semua tim)
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Modal: New Category */}
      <Modal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        title="Tambah Kategori Baru"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
              Nama Kategori
            </label>
            <input
              type="text"
              placeholder="Contoh: CSS Flexbox, SQL Queries..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsCatModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddCategory}>
              Simpan Kategori
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: New Team */}
      <Modal isOpen={isTeamModalOpen} onClose={() => setIsTeamModalOpen(false)} title="Tambah Tim Baru">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
              Nama Tim *
            </label>
            <input
              type="text"
              placeholder="Contoh: Team Epsilon"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">
              Deskripsi (Opsional)
            </label>
            <input
              type="text"
              placeholder="Keterangan divisi tim..."
              value={newTeamDesc}
              onChange={(e) => setNewTeamDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsTeamModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddTeam}>
              Simpan Tim
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
