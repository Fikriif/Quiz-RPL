'use client';

import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle, Code, Layers, Sparkles, HelpCircle, FileJson, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TestCase, TestCaseType } from '@/types/database';

interface TestCaseBuilderProps {
  testCases: TestCase[];
  onChange: (testCases: TestCase[]) => void;
}

export const TestCaseBuilder: React.FC<TestCaseBuilderProps> = ({ testCases, onChange }) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual');
  const [jsonString, setJsonString] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Form states for Visual Builder
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TestCaseType>('html');
  const [selector, setSelector] = useState('h1');
  const [expectedText, setExpectedText] = useState('');
  const [expectedCount, setExpectedCount] = useState<string>('1');
  const [attrName, setAttrName] = useState('');
  const [attrValue, setAttrValue] = useState('');
  const [cssProp, setCssProp] = useState('background-color');
  const [cssVal, setCssVal] = useState('');
  const [jsExpr, setJsExpr] = useState('tambah(2, 3)');
  const [jsExpected, setJsExpected] = useState('5');
  const [domActionType, setDomActionType] = useState<'click' | 'input' | 'change' | 'submit'>('click');
  const [domActionSelector, setDomActionSelector] = useState('#btn');
  const [domInputValue, setDomInputValue] = useState('');
  const [domAssertSelector, setDomAssertSelector] = useState('#result');
  const [domAssertProp, setDomAssertProp] = useState('textContent');
  const [domAssertExpected, setDomAssertExpected] = useState('Berhasil');
  const [domAssertClass, setDomAssertClass] = useState('');

  // Switch to JSON tab
  const handleSwitchToJson = () => {
    setJsonString(JSON.stringify(testCases, null, 2));
    setJsonError(null);
    setActiveTab('json');
  };

  // Switch to Visual tab and save JSON
  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        throw new Error('Test cases harus berupa JSON Array ([ ... ]).');
      }
      onChange(parsed);
      setJsonError(null);
      setActiveTab('visual');
    } catch (err: any) {
      setJsonError(err.message || 'Format JSON tidak valid.');
    }
  };

  const handleAdd = () => {
    if (!description.trim()) return;

    const id = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    let newTestCase: TestCase = {
      id,
      description: description.trim(),
      type,
    };

    if (type === 'html' || type === 'dom' || type === 'dom_element' || type === 'dom_text' || type === 'dom_attribute') {
      newTestCase.selector = selector.trim() || undefined;
      newTestCase.property = 'textContent';
      if (expectedCount && !isNaN(parseInt(expectedCount))) {
        newTestCase.expected_count = parseInt(expectedCount);
      }
      if (expectedText.trim()) {
        newTestCase.expected = expectedText.trim();
        newTestCase.expected_text = expectedText.trim();
        newTestCase.expected_value = expectedText.trim();
      }
      if (attrName.trim()) {
        newTestCase.attribute = {
          name: attrName.trim(),
          value: attrValue.trim() || undefined,
        };
      }
    } else if (type === 'css' || type === 'css_style') {
      newTestCase.selector = selector.trim() || undefined;
      newTestCase.styles = {
        [cssProp.trim()]: cssVal.trim(),
      };
      newTestCase.property = cssProp.trim();
      newTestCase.expected = cssVal.trim();
      newTestCase.expected_value = cssVal.trim();
    } else if (type === 'javascript' || type === 'js_eval') {
      let parsedExpected: any = jsExpected.trim();
      try {
        parsedExpected = JSON.parse(jsExpected.trim());
      } catch {
        parsedExpected = jsExpected.trim();
      }
      newTestCase.tests = [
        {
          expression: jsExpr.trim(),
          expected: parsedExpected,
        },
      ];
      newTestCase.expression = jsExpr.trim();
      newTestCase.expected = parsedExpected;
    } else if (type === 'javascript_dom') {
      newTestCase.action = {
        type: domActionType,
        selector: domActionSelector.trim(),
        value: domInputValue.trim() || undefined,
      };
      newTestCase.assert = {
        selector: domAssertSelector.trim() || undefined,
        property: domAssertProp.trim() || undefined,
        expected: domAssertExpected.trim() || undefined,
        has_class: domAssertClass.trim() || undefined,
      };
    }

    onChange([...testCases, newTestCase]);

    // Reset fields with sensible defaults
    setDescription('');
    setExpectedText('');
    setAttrValue('');
    setCssVal('');
  };

  const handleRemove = (id: string) => {
    onChange(testCases.filter((tc) => tc.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Automated Test Cases ({testCases.length})
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Kriteria evaluasi otomatis (HTML, CSS, JavaScript, DOM Interaction)
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'visual'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Visual Builder
          </button>
          <button
            type="button"
            onClick={handleSwitchToJson}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'json'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileJson className="w-3.5 h-3.5 text-amber-400" /> Raw JSON
          </button>
        </div>
      </div>

      {activeTab === 'json' ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Edit atau paste array test cases langsung dalam format JSON:
          </p>
          <textarea
            rows={12}
            value={jsonString}
            onChange={(e) => setJsonString(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xs text-amber-300 focus:outline-none focus:border-blue-500"
          />
          {jsonError && (
            <p className="text-xs text-rose-400 font-semibold bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30">
              {jsonError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setActiveTab('visual')}>
              Batal
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleApplyJson}>
              Terapkan JSON
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Existing Test Cases List */}
          {testCases.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-500 italic">
              Belum ada test case. Tambahkan test case di bawah agar jawaban siswa dapat dinilai secara otomatis.
            </div>
          ) : (
            <div className="space-y-2">
              {testCases.map((tc, idx) => (
                <div
                  key={tc.id || idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 font-black flex items-center justify-center text-[10px] border border-emerald-500/30">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-white">{tc.description || `Test Case #${idx + 1}`}</span>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 font-mono">
                          Type: {tc.type}
                        </span>
                        {tc.selector && (
                          <span className="font-mono text-amber-300">
                            Selector: {tc.selector}
                          </span>
                        )}
                        {tc.expected_text && (
                          <span className="font-mono text-emerald-300">
                            Text: "{tc.expected_text}"
                          </span>
                        )}
                        {tc.styles && (
                          <span className="font-mono text-blue-300">
                            Styles: {JSON.stringify(tc.styles)}
                          </span>
                        )}
                        {tc.tests && (
                          <span className="font-mono text-purple-300">
                            JS: {tc.tests.map((t) => t.expression).join(', ')}
                          </span>
                        )}
                        {tc.action && (
                          <span className="font-mono text-pink-300">
                            Action: {tc.action.type} on {tc.action.selector}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(tc.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                    title="Hapus Test Case"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Test Case Box */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Tambah Kriteria Pengujian Baru
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Deskripsi Requirement (Tampil ke Siswa)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Ada element h1 dengan tulisan 'Welcome Page'"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Tipe Evaluasi
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TestCaseType)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500 font-bold text-blue-300"
                >
                  <option value="html">1. HTML (DOM Structure / Text / Attr)</option>
                  <option value="css">2. CSS (Styles / Flexbox / Grid)</option>
                  <option value="javascript">3. JavaScript (Pure Logic / Function)</option>
                  <option value="javascript_dom">4. JS DOM Interaction (Events & State)</option>
                </select>
              </div>
            </div>

            {/* Dynamic Fields for HTML */}
            {type === 'html' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    CSS Selector Target
                  </label>
                  <input
                    type="text"
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    placeholder="h1, .card, ul li, form"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-amber-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Expected Text (Opsional)
                  </label>
                  <input
                    type="text"
                    value={expectedText}
                    onChange={(e) => setExpectedText(e.target.value)}
                    placeholder="Welcome Page"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Expected Count (Opsional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={expectedCount}
                    onChange={(e) => setExpectedCount(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Dynamic Fields for CSS */}
            {type === 'css' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Selector Target
                  </label>
                  <input
                    type="text"
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    placeholder=".card, .container, #header"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-amber-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    CSS Property
                  </label>
                  <input
                    type="text"
                    value={cssProp}
                    onChange={(e) => setCssProp(e.target.value)}
                    placeholder="display, padding, background-color"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-blue-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Expected Style Value
                  </label>
                  <input
                    type="text"
                    value={cssVal}
                    onChange={(e) => setCssVal(e.target.value)}
                    placeholder="flex, 20px, white, #222"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Dynamic Fields for JavaScript Pure Logic */}
            {type === 'javascript' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Ekspresi Unit Test JS
                  </label>
                  <input
                    type="text"
                    value={jsExpr}
                    onChange={(e) => setJsExpr(e.target.value)}
                    placeholder="tambah(2, 3) atau cekNilai(80)"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-purple-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Expected Return Value (Primitive / JSON)
                  </label>
                  <input
                    type="text"
                    value={jsExpected}
                    onChange={(e) => setJsExpected(e.target.value)}
                    placeholder='5 atau "Lulus" atau true'
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Dynamic Fields for JS DOM Interaction */}
            {type === 'javascript_dom' && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Action Type
                    </label>
                    <select
                      value={domActionType}
                      onChange={(e) => setDomActionType(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-pink-300 font-bold focus:outline-none focus:border-blue-500"
                    >
                      <option value="click">click</option>
                      <option value="input">input</option>
                      <option value="change">change</option>
                      <option value="submit">submit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Action Selector Target
                    </label>
                    <input
                      type="text"
                      value={domActionSelector}
                      onChange={(e) => setDomActionSelector(e.target.value)}
                      placeholder="#btn, #darkMode, form"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-amber-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {domActionType === 'input' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">
                        Input Value
                      </label>
                      <input
                        type="text"
                        value={domInputValue}
                        onChange={(e) => setDomInputValue(e.target.value)}
                        placeholder="Teks yang diketik..."
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Assert Target Selector
                    </label>
                    <input
                      type="text"
                      value={domAssertSelector}
                      onChange={(e) => setDomAssertSelector(e.target.value)}
                      placeholder="#message, .container, body"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-amber-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Expected Text / Value
                    </label>
                    <input
                      type="text"
                      value={domAssertExpected}
                      onChange={(e) => setDomAssertExpected(e.target.value)}
                      placeholder="Berhasil"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Expected Class Name (Opsional)
                    </label>
                    <input
                      type="text"
                      value={domAssertClass}
                      onChange={(e) => setDomAssertClass(e.target.value)}
                      placeholder="dark, active, open"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-indigo-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAdd}
                disabled={!description.trim()}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Tambahkan Test Case
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
