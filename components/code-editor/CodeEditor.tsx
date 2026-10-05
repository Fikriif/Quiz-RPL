'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Code2, Play, RotateCcw, Copy, Check, FileCode, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface CodeBundle {
  html: string;
  css: string;
  js: string;
}

interface CodeEditorProps {
  value?: CodeBundle;
  initialCode?: string | CodeBundle;
  language?: 'html_css_js' | 'javascript' | 'html' | 'css';
  onChange?: (code: CodeBundle) => void;
  onRun?: (code: CodeBundle) => void;
  onReset?: () => void;
  readOnly?: boolean;
  minHeight?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  initialCode,
  language = 'html_css_js',
  onChange,
  onRun,
  onReset,
  readOnly = false,
  minHeight = '360px',
}) => {
  // Parse fallback code bundle
  const parseDefault = (): CodeBundle => {
    if (typeof initialCode === 'object' && initialCode !== null) {
      return {
        html: initialCode.html || '',
        css: initialCode.css || '',
        js: initialCode.js || '',
      };
    }
    if (typeof initialCode === 'string') {
      return {
        html: initialCode || '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Code</title>\n</head>\n<body>\n  <!-- Tulis kode HTML kamu di sini -->\n</body>\n</html>',
        css: '/* Tulis styling CSS kamu di sini */\n',
        js: '// Tulis logic JavaScript kamu di sini\n',
      };
    }
    return {
      html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Code</title>\n</head>\n<body>\n  \n</body>\n</html>',
      css: '',
      js: '',
    };
  };

  const [activeTab, setActiveTab] = useState<'html' | 'css' | 'js'>('html');
  const [internalCode, setInternalCode] = useState<CodeBundle>(parseDefault);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Controlled vs uncontrolled code bundle
  const currentBundle: CodeBundle = value || internalCode;
  const activeContent: string = currentBundle[activeTab] || '';

  const handleTextChange = (val: string) => {
    if (readOnly) return;
    const updated: CodeBundle = {
      ...currentBundle,
      [activeTab]: val,
    };
    if (!value) {
      setInternalCode(updated);
    }
    if (onChange) {
      onChange(updated);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;

      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      handleTextChange(newVal);

      // Restore cursor position
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (readOnly) return;
    if (onReset) {
      onReset();
    } else {
      const def = parseDefault();
      setInternalCode(def);
      if (onChange) onChange(def);
    }
  };

  const handleRun = () => {
    if (onRun) {
      onRun(currentBundle);
    }
  };

  const lines = activeContent.split('\n');

  return (
    <div className="flex flex-col rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden font-mono text-sm">
      {/* Editor Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800 gap-2">
        {/* Language Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('html')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'html'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            HTML
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('css')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'css'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            CSS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('js')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'js'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            JavaScript
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            className="text-xs"
          >
            {copied ? 'Tersalin' : 'Salin'}
          </Button>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-slate-400" />}
              className="text-xs"
            >
              Reset
            </Button>
          )}
          {onRun && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleRun}
              leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
              className="text-xs font-bold shadow-lg shadow-blue-500/20"
            >
              Run Code
            </Button>
          )}
        </div>
      </div>

      {/* Editor Body with Line Numbers */}
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight }}>
        {/* Line Numbers Gutter */}
        <div className="w-12 py-3 bg-slate-900/50 text-slate-600 text-right pr-3 select-none text-xs leading-6 border-r border-slate-800/60 font-mono">
          {lines.map((_, i) => (
            <div key={i} className="hover:text-slate-400">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={activeContent}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          className="flex-1 w-full p-3 bg-transparent text-slate-200 placeholder-slate-600 font-mono text-xs sm:text-sm leading-6 resize-none focus:outline-none focus:ring-0 overflow-auto whitespace-pre"
          placeholder={`Tulis kode ${activeTab.toUpperCase()} di sini...`}
        />
      </div>

      {/* Editor Footer Status */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-t border-slate-800/60 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <FileCode className="w-3 h-3 text-blue-400" />
          <span>Editing {activeTab.toUpperCase()} ({lines.length} baris)</span>
        </span>
        <span className="text-slate-500">Tab untuk indentasi • Client-side Sandbox</span>
      </div>
    </div>
  );
};
