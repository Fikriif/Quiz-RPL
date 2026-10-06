'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, Download, FileText, CheckCircle2, AlertCircle, AlertTriangle, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';

interface CsvRow {
  category?: string;
  question?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer?: string;
  points?: string | number;
  explanation?: string;
}

interface ParsedQuestionRow {
  rowIndex: number;
  category: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  points: number;
  explanation: string;
  isValid: boolean;
  errors: string[];
}

interface CsvImporterProps {
  quizId: string;
  onImportSuccess: () => void;
}

export const CsvImporter: React.FC<CsvImporterProps> = ({ quizId, onImportSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedQuestionRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const downloadTemplate = () => {
    const csvContent =
      'category,question,option_a,option_b,option_c,option_d,correct_answer,points,explanation\n' +
      'HTML,Apa fungsi tag img?,Menampilkan gambar,Membuat tabel,Membuat link,Membuat form,A,100,Tag img digunakan untuk menampilkan gambar\n' +
      'CSS,Apa fungsi margin?,Jarak luar elemen,Jarak dalam elemen,Warna teks,Warna background,A,200,Margin memberikan jarak di luar border\n' +
      'JavaScript,Apa fungsi map?,Menghasilkan array baru,Menghapus array,Mengurutkan array,Menggabungkan object,A,300,map menghasilkan array baru\n' +
      'Database,Klausa SQL apa untuk filter baris?,WHERE,GROUP BY,ORDER BY,HAVING,A,100,WHERE digunakan untuk menyaring data sebelum agregasi\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'quiz_questions_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setHeaderError(null);
    setIsProcessing(true);

    Papa.parse<CsvRow>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        const requiredHeaders = [
          'category',
          'question',
          'option_a',
          'option_b',
          'option_c',
          'option_d',
          'correct_answer',
          'points',
        ];

        const headers = results.meta.fields || [];
        const missingHeaders = requiredHeaders.filter((req) => !headers.includes(req));

        if (missingHeaders.length > 0) {
          setHeaderError(`Header CSV tidak lengkap. Hilang: ${missingHeaders.join(', ')}`);
          setRows([]);
          setIsProcessing(false);
          return;
        }

        // Validate each row
        const parsed: ParsedQuestionRow[] = results.data.map((row, index) => {
          const rowErrors: string[] = [];
          const category = (row.category || '').trim();
          const question = (row.question || '').trim();
          const option_a = (row.option_a || '').trim();
          const option_b = (row.option_b || '').trim();
          const option_c = (row.option_c || '').trim();
          const option_d = (row.option_d || '').trim();
          const correct_answer = (row.correct_answer || '').trim().toUpperCase();
          const points = parseInt(String(row.points || '0'), 10);
          const explanation = (row.explanation || '').trim();

          if (!category) rowErrors.push('Kategori kosong');
          if (!question) rowErrors.push('Pertanyaan kosong');
          if (!option_a || !option_b || !option_c || !option_d) {
            rowErrors.push('Semua opsi A, B, C, D harus diisi');
          }
          if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
            rowErrors.push('Kunci jawaban harus A, B, C, atau D');
          }
          if (isNaN(points) || points <= 0) {
            rowErrors.push('Points harus berupa angka positif');
          }

          return {
            rowIndex: index + 1,
            category,
            question,
            option_a,
            option_b,
            option_c,
            option_d,
            correct_answer: (['A', 'B', 'C', 'D'].includes(correct_answer)
              ? correct_answer
              : 'A') as 'A' | 'B' | 'C' | 'D',
            points: isNaN(points) || points <= 0 ? 100 : points,
            explanation,
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          };
        });

        setRows(parsed);
        setIsProcessing(false);
      },
      error: (err) => {
        setHeaderError(`Gagal membaca file CSV: ${err.message}`);
        setIsProcessing(false);
      },
    });
  };

  const handleConfirmImport = async () => {
    const validRows = rows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsUploading(true);

    try {
      // 1. Get or create categories
      const uniqueCategoryNames = Array.from(new Set(validRows.map((r) => r.category)));

      // Fetch existing categories for this quiz
      const { data: existingCats } = await supabase
        .from('categories')
        .select('*')
        .eq('quiz_id', quizId);

      const categoryMap = new Map<string, string>();
      (existingCats || []).forEach((c: any) => categoryMap.set(c.name.toLowerCase(), c.id));

      // Insert new categories if they don't exist
      for (let i = 0; i < uniqueCategoryNames.length; i++) {
        const catName = uniqueCategoryNames[i];
        if (!categoryMap.has(catName.toLowerCase())) {
          const { data: newCat, error } = await supabase
            .from('categories')
            .insert({
              quiz_id: quizId,
              name: catName,
              order_number: (existingCats?.length || 0) + i + 1,
            })
            .select()
            .single();

          if (!error && newCat) {
            categoryMap.set(catName.toLowerCase(), newCat.id);
          }
        }
      }

      // 2. Insert questions
      const questionsToInsert = validRows.map((r, idx) => ({
        quiz_id: quizId,
        category_id: categoryMap.get(r.category.toLowerCase())!,
        question: r.question,
        option_a: r.option_a,
        option_b: r.option_b,
        option_c: r.option_c,
        option_d: r.option_d,
        correct_answer: r.correct_answer,
        points: r.points,
        explanation: r.explanation || null,
        order_number: idx + 1,
      }));

      const { error: insertError } = await supabase.from('questions').insert(questionsToInsert);

      if (insertError) {
        throw insertError;
      }

      // Reset state
      setFile(null);
      setRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImportSuccess();
    } catch (err: any) {
      alert(`Gagal menyimpan soal: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const validCount = rows.filter((r) => r.isValid).length;
  const errorCount = rows.filter((r) => !r.isValid).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Template Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div>
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Import Soal dari File CSV
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Unggah banyak soal sekaligus dengan format standar CSV. Kategori baru akan otomatis dibuat.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Download className="w-4 h-4 text-slate-300" />}
          onClick={downloadTemplate}
        >
          Download Template CSV
        </Button>
      </div>

      {/* Upload Drag/Select Area */}
      {!file && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-900/40 hover:bg-slate-900/70"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Upload className="w-12 h-12 mx-auto mb-3 text-blue-400 opacity-80" />
          <h5 className="font-bold text-slate-200 text-base">
            Klik untuk memilih file CSV atau drag & drop ke sini
          </h5>
          <p className="text-xs text-slate-400 mt-1">Format yang didukung: .csv UTF-8</p>
        </div>
      )}

      {/* Header Error Warning */}
      {headerError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{headerError}</span>
        </div>
      )}

      {/* CSV Preview Section */}
      {rows.length > 0 && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 font-semibold block uppercase">
                Total Soal
              </span>
              <span className="text-2xl font-black text-white">{rows.length}</span>
            </div>
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-center">
              <span className="text-xs text-emerald-400 font-semibold block uppercase">
                Valid & Siap
              </span>
              <span className="text-2xl font-black text-emerald-400">{validCount}</span>
            </div>
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 text-center">
              <span className="text-xs text-rose-400 font-semibold block uppercase">
                Error / Ditolak
              </span>
              <span className="text-2xl font-black text-rose-400">{errorCount}</span>
            </div>
          </div>

          {/* Preview Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase sticky top-0">
                <tr>
                  <th className="p-3">Baris</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Pertanyaan</th>
                  <th className="p-3">Pilihan (A/B/C/D)</th>
                  <th className="p-3">Kunci</th>
                  <th className="p-3">Poin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {rows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={`hover:bg-slate-900/60 transition-colors ${
                      !row.isValid ? 'bg-rose-500/5' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold text-slate-500">{row.rowIndex}</td>
                    <td className="p-3">
                      {row.isValid ? (
                        <Badge variant="emerald" size="sm" icon={<CheckCircle2 className="w-3 h-3" />}>
                          Valid
                        </Badge>
                      ) : (
                        <div>
                          <Badge variant="rose" size="sm" icon={<AlertTriangle className="w-3 h-3" />}>
                            Error
                          </Badge>
                          <p className="text-[10px] text-rose-400 mt-1 font-mono">
                            {row.errors.join(', ')}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-blue-300">{row.category}</td>
                    <td className="p-3 max-w-xs truncate font-medium text-slate-200">
                      {row.question}
                    </td>
                    <td className="p-3 max-w-xs text-slate-400">
                      A: {row.option_a} | B: {row.option_b}
                    </td>
                    <td className="p-3 font-bold text-amber-400">{row.correct_answer}</td>
                    <td className="p-3 font-mono font-bold text-white">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4 text-rose-400" />}
              onClick={() => {
                setFile(null);
                setRows([]);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              Batalkan & Pilih File Lain
            </Button>
            <Button
              variant="primary"
              size="lg"
              disabled={validCount === 0 || isUploading}
              isLoading={isUploading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              onClick={handleConfirmImport}
            >
              Simpan {validCount} Soal ke Supabase
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
