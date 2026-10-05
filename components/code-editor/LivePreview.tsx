'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Monitor, RefreshCw, AlertTriangle, Terminal, Maximize2 } from 'lucide-react';
import { CodeBundle } from './CodeEditor';

interface LivePreviewProps {
  code: CodeBundle;
  minHeight?: string;
  onConsoleLog?: (log: { type: 'log' | 'error' | 'warn' | 'info'; message: string }) => void;
}

export const LivePreview: React.FC<LivePreviewProps> = ({
  code,
  minHeight = '360px',
  onConsoleLog,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateSrcDoc = () => {
    // Bundle HTML + CSS + JS with console interception script
    const consoleInterceptor = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;
          const originalInfo = console.info;

          function sendLog(type, args) {
            try {
              const message = Array.from(args).map(a => {
                if (typeof a === 'object') {
                  try { return JSON.stringify(a); } catch(e) { return String(a); }
                }
                return String(a);
              }).join(' ');

              window.parent.postMessage({
                type: 'SANDBOX_CONSOLE',
                payload: { type, message }
              }, '*');
            } catch(e) {}
          }

          console.log = function(...args) { sendLog('log', args); originalLog.apply(console, args); };
          console.error = function(...args) { sendLog('error', args); originalError.apply(console, args); };
          console.warn = function(...args) { sendLog('warn', args); originalWarn.apply(console, args); };
          console.info = function(...args) { sendLog('info', args); originalInfo.apply(console, args); };

          window.onerror = function(msg, url, lineNo, columnNo, error) {
            sendLog('error', [msg + ' (Line: ' + lineNo + ')']);
            return false;
          };
        })();
      </script>
    `;

    // Check if HTML already contains <html> and <body>
    let combinedHtml = code.html || '';
    const cssTag = `<style>${code.css || ''}</style>`;
    const jsTag = `<script>${code.js || ''}</script>`;

    if (combinedHtml.includes('</head>')) {
      combinedHtml = combinedHtml.replace('</head>', `${cssTag}${consoleInterceptor}</head>`);
    } else {
      combinedHtml = `${cssTag}${consoleInterceptor}${combinedHtml}`;
    }

    if (combinedHtml.includes('</body>')) {
      combinedHtml = combinedHtml.replace('</body>', `${jsTag}</body>`);
    } else {
      combinedHtml = `${combinedHtml}${jsTag}`;
    }

    return combinedHtml;
  };

  useEffect(() => {
    setHasError(false);
    setErrorMsg(null);
    const doc = generateSrcDoc();
    setSrcDoc(doc);
  }, [code.html, code.css, code.js]);

  // Listen for console messages from sandboxed iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SANDBOX_CONSOLE' && onConsoleLog) {
        onConsoleLog(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConsoleLog]);

  const handleReload = () => {
    setSrcDoc(generateSrcDoc());
  };

  return (
    <div className="flex flex-col rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 ml-2">
            <Monitor className="w-3.5 h-3.5 text-blue-400" />
            Live Browser Preview
          </span>
        </div>

        <button
          type="button"
          onClick={handleReload}
          title="Reload Preview"
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sandboxed Iframe Container */}
      <div className="relative flex-1 bg-white overflow-hidden" style={{ minHeight }}>
        {hasError && errorMsg && (
          <div className="absolute top-2 left-2 right-2 p-3 rounded-lg bg-rose-500/90 text-white text-xs z-10 flex items-center gap-2 shadow-lg">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          title="Student Live Sandbox"
          sandbox="allow-scripts"
          className="w-full h-full border-0 bg-white"
          style={{ minHeight }}
        />
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-t border-slate-800/60 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Sandbox Active
        </span>
        <span className="text-slate-500">Isolasi Iframe Aman</span>
      </div>
    </div>
  );
};
