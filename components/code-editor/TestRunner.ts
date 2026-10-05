import { TestCase, TestResultItem } from '@/types/database';
import { CodeBundle } from './CodeEditor';

export interface TestExecutionResult {
  passedCount: number;
  totalCount: number;
  scorePercentage: number;
  pointsAwarded: number;
  results: TestResultItem[];
  allPassed: boolean;
}

/**
 * Normalizes HTML/Code string for safe exact comparison:
 * - normalizes \r\n to \n
 * - collapses consecutive whitespace
 * - normalizes whitespace between tags (> <)
 * - trims outer whitespace
 */
export function normalizeCodeString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

/**
/**
 * Generic and robust HTML structural validator:
 * 1. Parses studentCode and expectedAnswer using DOMParser.
 * 2. Extracts required elements/structures from expectedAnswer (fragment or full document).
 * 3. Recursively checks that all required elements, tag names, text content, and key attributes
 *    exist in the student DOM, ignoring DOCTYPE, html wrappers, heads, comments, whitespace, and attribute order.
 * 4. Allows additional student elements around the required elements unless strictly conflicting.
 */
export function validateHtmlAnswer(
  studentHtml: string,
  expectedHtml: string
): { isMatch: boolean; reason?: string } {
  if (!studentHtml || !studentHtml.trim()) {
    return { isMatch: false, reason: 'Kode jawaban masih kosong.' };
  }
  if (!expectedHtml || !expectedHtml.trim()) {
    return { isMatch: false, reason: 'Kunci jawaban belum ditentukan.' };
  }

  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const studentDoc = parser.parseFromString(studentHtml, 'text/html');
      const expectedDoc = parser.parseFromString(expectedHtml, 'text/html');

      // Helper to extract non-empty, non-comment child elements
      const getMeaningfulChildElements = (el: Element): Element[] => {
        return Array.from(el.children).filter((child) => {
          const tag = child.tagName.toLowerCase();
          return tag !== 'script' && tag !== 'style';
        });
      };

      // Helper to normalize text: collapse whitespace and trim
      const normalizeText = (text: string | null | undefined): string => {
        return (text || '').trim().replace(/\s+/g, ' ');
      };

      // Check if expected output specifically includes <html> or <head>
      const expectedHasHtml = /<html[^>]*>/i.test(expectedHtml);
      const expectedHasHead = /<head[^>]*>/i.test(expectedHtml);

      // Determine required root elements from expectedDoc
      let requiredElements: Element[] = [];
      if (expectedHasHtml || expectedHasHead) {
        requiredElements = getMeaningfulChildElements(expectedDoc.documentElement);
      } else {
        requiredElements = getMeaningfulChildElements(expectedDoc.body);
      }

      // If expectedDoc.body has no element children (e.g. plain text or text-only)
      if (requiredElements.length === 0) {
        const expectedBodyText = normalizeText(expectedDoc.body.textContent);
        if (expectedBodyText) {
          const studentBodyText = normalizeText(studentDoc.body.textContent);
          if (studentBodyText.includes(expectedBodyText) || studentBodyText === expectedBodyText) {
            return { isMatch: true };
          }
          return {
            isMatch: false,
            reason: `Teks "${expectedBodyText}" tidak ditemukan di dalam dokumen HTML.`,
          };
        }
      }

      // Helper to verify if an actual DOM element satisfies a required expected DOM element
      const satisfiesRequirement = (
        actualEl: Element,
        reqEl: Element
      ): { ok: boolean; reason?: string } => {
        // 1. Tag name must match case-insensitively
        if (actualEl.tagName.toLowerCase() !== reqEl.tagName.toLowerCase()) {
          return {
            ok: false,
            reason: `Tag <${actualEl.tagName.toLowerCase()}> tidak sesuai dengan <${reqEl.tagName.toLowerCase()}>.`,
          };
        }

        // 2. All required attributes on reqEl must be present and match
        for (let i = 0; i < reqEl.attributes.length; i++) {
          const attr = reqEl.attributes[i];
          const attrName = attr.name.toLowerCase();
          const expVal = attr.value.trim();

          if (!actualEl.hasAttribute(attrName)) {
            return {
              ok: false,
              reason: `Elemen <${reqEl.tagName.toLowerCase()}> harus memiliki atribut "${attrName}".`,
            };
          }

          const actVal = (actualEl.getAttribute(attrName) || '').trim();

          if (attrName === 'class') {
            const expClasses = expVal.split(/\s+/).filter(Boolean);
            const actClasses = actVal.split(/\s+/).filter(Boolean);
            const missingClass = expClasses.find((cls) => !actClasses.includes(cls));
            if (missingClass) {
              return {
                ok: false,
                reason: `Elemen <${reqEl.tagName.toLowerCase()}> harus memiliki class "${missingClass}".`,
              };
            }
          } else if (attrName === 'style') {
            const normExp = expVal.replace(/\s+/g, '').toLowerCase();
            const normAct = actVal.replace(/\s+/g, '').toLowerCase();
            if (normAct !== normExp && !normAct.includes(normExp)) {
              return {
                ok: false,
                reason: `Atribut style pada <${reqEl.tagName.toLowerCase()}> belum sesuai.`,
              };
            }
          } else {
            // General attribute equality (case-insensitive for values/paths)
            if (actVal.toLowerCase() !== expVal.toLowerCase()) {
              return {
                ok: false,
                reason: `Atribut "${attrName}" pada <${reqEl.tagName.toLowerCase()}> bernilai "${actVal}", diharapkan "${expVal}".`,
              };
            }
          }
        }

        // 3. Child elements & Text content comparison
        const reqChildren = getMeaningfulChildElements(reqEl);

        // Leaf node: has no child elements (e.g. <h1>Hallo World</h1>, <p>Hello</p>, <button>Click</button>)
        if (reqChildren.length === 0) {
          const reqText = normalizeText(reqEl.textContent);
          if (reqText.length > 0) {
            const actText = normalizeText(actualEl.textContent);
            if (actText !== reqText) {
              return {
                ok: false,
                reason: `Isi teks elemen <${reqEl.tagName.toLowerCase()}> adalah "${actText}", diharapkan "${reqText}".`,
              };
            }
          }
          return { ok: true };
        }

        // Container node: has child elements (e.g. <div class="card"><h2>Product</h2><p>Description</p></div>)
        for (const reqChild of reqChildren) {
          const childTag = reqChild.tagName.toLowerCase();
          const candidateChildren = Array.from(actualEl.querySelectorAll(childTag)).filter((c) => {
            return actualEl.contains(c);
          });

          if (candidateChildren.length === 0) {
            return {
              ok: false,
              reason: `Elemen <${childTag}> tidak ditemukan di dalam <${reqEl.tagName.toLowerCase()}>.`,
            };
          }

          let childMatched = false;
          let lastChildReason = '';

          for (const cand of candidateChildren) {
            const matchRes = satisfiesRequirement(cand, reqChild);
            if (matchRes.ok) {
              childMatched = true;
              break;
            } else {
              lastChildReason = matchRes.reason || '';
            }
          }

          if (!childMatched) {
            return {
              ok: false,
              reason: lastChildReason || `Struktur elemen <${childTag}> di dalam <${reqEl.tagName.toLowerCase()}> belum sesuai.`,
            };
          }
        }

        return { ok: true };
      };

      // Match each top-level required element in the student document
      for (const reqEl of requiredElements) {
        const reqTag = reqEl.tagName.toLowerCase();
        const candidates = Array.from(studentDoc.querySelectorAll(reqTag));

        if (candidates.length === 0) {
          return {
            isMatch: false,
            reason: `Elemen <${reqTag}> tidak ditemukan pada dokumen HTML.`,
          };
        }

        let foundMatch = false;
        let lastFailureReason = '';

        for (const cand of candidates) {
          const res = satisfiesRequirement(cand, reqEl);
          if (res.ok) {
            foundMatch = true;
            break;
          } else {
            lastFailureReason = res.reason || '';
          }
        }

        if (!foundMatch) {
          return {
            isMatch: false,
            reason: lastFailureReason || `Elemen <${reqTag}> belum memenuhi format/isi yang diminta.`,
          };
        }
      }

      return { isMatch: true };
    }
  } catch (err: any) {
    console.error('[validateHtmlAnswer] DOMParser error:', err);
  }

  // Fallback string normalization if DOMParser is unavailable
  const normA = normalizeCodeString(studentHtml);
  const normB = normalizeCodeString(expectedHtml);
  return { isMatch: normA.includes(normB) || normA === normB };
}

// Backward compatibility alias
export const compareHtmlStructure = validateHtmlAnswer;

/**
 * Executes a list of generic & extensible test cases or exact answer matching
 * against a student's code bundle inside a secure sandboxed iframe.
 */
export async function runTestCases(
  code: CodeBundle,
  testCases: TestCase[],
  maxPoints: number = 100,
  validationType: 'exact' | 'test_cases' = 'test_cases',
  expectedOutput?: string | null
): Promise<TestExecutionResult> {
  const hasCode = Boolean(code.html.trim() || code.css.trim() || code.js.trim());

  // Check 1: Empty code is ALWAYS a failure
  if (!hasCode) {
    return {
      passedCount: 0,
      totalCount: Math.max(1, testCases?.length || 1),
      scorePercentage: 0,
      pointsAwarded: 0,
      results: [
        {
          id: 'empty_code_check',
          description: 'Pengecekan Kode Jawaban',
          passed: false,
          message: 'Kode jawaban masih kosong. Tuliskan kode solusi terlebih dahulu.',
        },
      ],
      allPassed: false,
    };
  }

  // Check 2: Mode A — Exact Answer Matching (Structural DOM / HTML Requirement Comparison)
  if (validationType === 'exact' || (expectedOutput && expectedOutput.trim() !== '' && (!testCases || testCases.length === 0))) {
    const rawStudentCode = code.html || (code.html + ' ' + code.css + ' ' + code.js).trim();
    const comparison = validateHtmlAnswer(rawStudentCode, expectedOutput || '');
    const isMatch = comparison.isMatch;

    return {
      passedCount: isMatch ? 1 : 0,
      totalCount: 1,
      scorePercentage: isMatch ? 100 : 0,
      pointsAwarded: isMatch ? maxPoints : 0,
      results: [
        {
          id: 'exact_match_check',
          description: 'Kesesuaian Struktur HTML (Exact Answer)',
          passed: isMatch,
          message: isMatch
            ? 'Struktur dan isi kode HTML kamu sesuai dengan yang diminta.'
            : comparison.reason || 'Kode solusi kamu belum sesuai dengan format/struktur yang diminta.',
          expected: expectedOutput || undefined,
          actual: isMatch ? 'Sesuai' : comparison.reason,
        },
      ],
      allPassed: isMatch,
    };
  }

  // Check 3: If no test cases and no exact output specified
  if (!testCases || testCases.length === 0) {
    return {
      passedCount: 0,
      totalCount: 1,
      scorePercentage: 0,
      pointsAwarded: 0,
      results: [
        {
          id: 'no_test_cases',
          description: 'Kriteria Pengujian',
          passed: false,
          message: 'Belum ada kriteria pengujian atau kunci jawaban yang ditentukan untuk soal ini.',
        },
      ],
      allPassed: false,
    };
  }

  return new Promise((resolve) => {
    // Create temporary hidden sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('sandbox', 'allow-scripts');

    const testId = `test_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build comprehensive in-iframe evaluator script
    const runnerScript = `
      <script>
        (function() {
          const testCases = ${JSON.stringify(testCases)};
          const results = [];

          // Helper: Deep equality comparison for primitives, objects, arrays
          function isDeepEqual(a, b) {
            if (a === b) return true;
            if (typeof a === 'number' && typeof b === 'number') {
              return Math.abs(a - b) < 1e-6;
            }
            if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
              return false;
            }
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            if (Array.isArray(a)) {
              if (a.length !== b.length) return false;
              for (let i = 0; i < a.length; i++) {
                if (!isDeepEqual(a[i], b[i])) return false;
              }
              return true;
            }
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;
            for (const key of keysA) {
              if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
              if (!isDeepEqual(a[key], b[key])) return false;
            }
            return true;
          }

          // Helper: Normalize colors (hex, rgb, names) to rgb(r, g, b)
          function normalizeColor(colorStr) {
            if (!colorStr) return '';
            const temp = document.createElement('div');
            temp.style.color = colorStr.trim();
            document.body.appendChild(temp);
            const computed = window.getComputedStyle(temp).color;
            document.body.removeChild(temp);
            return (computed || colorStr).toLowerCase().replace(/\\s+/g, '');
          }

          // Helper: Normalize CSS style values
          function normalizeStyle(prop, val) {
            if (val === undefined || val === null) return '';
            const str = String(val).trim().toLowerCase();
            if (prop.includes('color') || prop === 'background') {
              const normColor = normalizeColor(str);
              if (normColor) return normColor;
            }
            if (str === 'start' || str === 'flex-start') return 'flex-start';
            if (str === 'end' || str === 'flex-end') return 'flex-end';
            return str.replace(/['"]/g, '').replace(/\\s+/g, ' ');
          }

          // Evaluator 1: HTML & DOM Structure / Properties (type: 'dom', 'html', 'dom_element', 'dom_text', 'dom_attribute')
          function evaluateDom(tc) {
            const selector = tc.selector || 'body';
            const elements = document.querySelectorAll(selector);
            const count = elements.length;

            const assertion = (tc.assertion || '').toLowerCase();
            const prop = tc.property || (assertion === 'text' ? 'textContent' : (assertion === 'html' ? 'innerHTML' : (assertion === 'count' ? 'count' : (assertion === 'exists' ? 'exists' : 'textContent'))));

            if (tc.expected_count !== undefined || assertion === 'count' || prop === 'count') {
              const expCount = tc.expected_count !== undefined ? tc.expected_count : (typeof tc.expected === 'number' ? tc.expected : parseInt(tc.expected) || 1);
              if (count !== expCount) {
                return {
                  passed: false,
                  message: 'Elemen ' + selector + ' ditemukan ' + count + ', diharapkan ' + expCount + '.',
                  actual: String(count),
                  expected: String(expCount)
                };
              }
              return {
                passed: true,
                message: 'Elemen ' + selector + ' ditemukan sejumlah ' + count + ' (sesuai).',
                actual: String(count),
                expected: String(expCount)
              };
            } else if (count === 0) {
              return {
                passed: false,
                message: 'Elemen ' + selector + ' tidak ditemukan pada dokumen HTML.',
                actual: '0 elemen',
                expected: 'Minimal 1 elemen ' + selector
              };
            }

            if (assertion === 'exists' || prop === 'exists') {
              return {
                passed: true,
                message: 'Elemen ' + selector + ' ditemukan pada dokumen HTML.',
                actual: count + ' elemen',
                expected: 'Minimal 1 elemen'
              };
            }

            const targetEl = elements[0];
            const expectedVal = tc.expected !== undefined ? tc.expected : (tc.expected_value !== undefined ? tc.expected_value : tc.expected_text);

            if (expectedVal !== undefined && expectedVal !== null) {
              let actualVal = '';
              if (prop === 'textContent' || prop === 'innerText' || prop === 'text') {
                actualVal = (targetEl.textContent || targetEl.innerText || '').trim().replace(/\\s+/g, ' ');
              } else if (prop === 'innerHTML' || prop === 'html') {
                actualVal = (targetEl.innerHTML || '').trim();
              } else if (prop === 'tagName' || prop === 'tag') {
                actualVal = (targetEl.tagName || '').toLowerCase();
              } else if (prop === 'value') {
                actualVal = (targetEl.value !== undefined ? targetEl.value : targetEl.getAttribute('value') || '').trim();
              } else if (prop === 'className' || prop === 'class') {
                actualVal = (targetEl.className || targetEl.getAttribute('class') || '').trim();
              } else {
                actualVal = targetEl.getAttribute(prop) !== null ? targetEl.getAttribute(prop) : targetEl[prop];
                actualVal = String(actualVal !== undefined && actualVal !== null ? actualVal : '').trim();
              }

              const expNorm = String(expectedVal).trim().replace(/\\s+/g, ' ');
              const mode = tc.text_match_mode || tc.match_mode || 'exact';

              let isPassed = false;
              if (mode === 'exact') {
                isPassed = actualVal === expNorm;
              } else if (mode === 'trim_equals' || mode === 'case_insensitive') {
                isPassed = actualVal.toLowerCase() === expNorm.toLowerCase();
              } else {
                isPassed = actualVal.toLowerCase().includes(expNorm.toLowerCase());
              }

              if (!isPassed) {
                return {
                  passed: false,
                  message: 'Elemen ' + selector + ' properti ' + prop + ' bernilai "' + actualVal + '", diharapkan "' + expNorm + '".',
                  actual: actualVal,
                  expected: expNorm
                };
              }
            }

            if (tc.attribute) {
              const attrName = tc.attribute.name;
              const hasAttr = targetEl.hasAttribute(attrName);
              if (tc.attribute.exists === false) {
                if (hasAttr) return { passed: false, message: 'Elemen ' + selector + ' tidak boleh memiliki atribut ' + attrName };
              } else {
                if (!hasAttr) return { passed: false, message: 'Elemen ' + selector + ' tidak memiliki atribut ' + attrName };
                if (tc.attribute.value !== undefined) {
                  const actualAttr = (targetEl.getAttribute(attrName) || '').trim();
                  const expAttr = String(tc.attribute.value).trim();
                  if (actualAttr.toLowerCase() !== expAttr.toLowerCase()) {
                    return {
                      passed: false,
                      message: 'Atribut ' + attrName + ' bernilai "' + actualAttr + '", diharapkan "' + expAttr + '".',
                      actual: actualAttr,
                      expected: expAttr
                    };
                  }
                }
              }
            }

            if (tc.has_children && Array.isArray(tc.has_children)) {
              for (const childSel of tc.has_children) {
                if (!targetEl.querySelector(childSel)) {
                  return {
                    passed: false,
                    message: 'Elemen ' + selector + ' tidak memiliki child ' + childSel + '.'
                  };
                }
              }
            }

            return {
              passed: true,
              message: 'Elemen ' + selector + ' memenuhi kriteria DOM yang diminta.',
              actual: expectedVal !== undefined ? String(expectedVal) : undefined,
              expected: expectedVal !== undefined ? String(expectedVal) : undefined
            };
          }

          // Evaluator 2: CSS Computed Styles (type: 'css', 'css_style')
          function evaluateCss(tc) {
            const selector = tc.selector || 'body';
            const el = document.querySelector(selector);
            if (!el) {
              return {
                passed: false,
                message: 'Elemen ' + selector + ' tidak ditemukan untuk pengujian CSS.'
              };
            }

            const computed = window.getComputedStyle(el);
            const styleRules = {};

            if (tc.property) {
              const exp = tc.expected !== undefined ? tc.expected : tc.expected_value;
              if (exp !== undefined) {
                styleRules[tc.property] = exp;
              }
            }

            if (tc.styles) {
              Object.assign(styleRules, tc.styles);
            }
            if (tc.computed_styles) {
              Object.assign(styleRules, tc.computed_styles);
            }

            for (const [prop, expectedRaw] of Object.entries(styleRules)) {
              const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
              const actualRaw = computed.getPropertyValue(kebabProp) || computed[prop] || '';

              const expectedNorm = normalizeStyle(kebabProp, expectedRaw);
              const actualNorm = normalizeStyle(kebabProp, actualRaw);

              let stylePassed = false;
              if (actualNorm === expectedNorm || actualNorm.includes(expectedNorm)) {
                stylePassed = true;
              } else if (kebabProp === 'padding' || kebabProp === 'margin') {
                const top = normalizeStyle(kebabProp + '-top', computed.getPropertyValue(kebabProp + '-top'));
                const right = normalizeStyle(kebabProp + '-right', computed.getPropertyValue(kebabProp + '-right'));
                const bottom = normalizeStyle(kebabProp + '-bottom', computed.getPropertyValue(kebabProp + '-bottom'));
                const left = normalizeStyle(kebabProp + '-left', computed.getPropertyValue(kebabProp + '-left'));
                stylePassed = (top === expectedNorm || right === expectedNorm || bottom === expectedNorm || left === expectedNorm);
              }

              if (!stylePassed) {
                return {
                  passed: false,
                  message: 'CSS ' + kebabProp + ' bernilai "' + actualRaw + '", diharapkan "' + expectedRaw + '".',
                  actual: actualRaw,
                  expected: String(expectedRaw)
                };
              }
            }

            return {
              passed: true,
              message: 'CSS styles pada ' + selector + ' sesuai.'
            };
          }

          // Evaluator 3: JavaScript Function Return (type: 'function', 'js_function')
          function evaluateJsFunction(tc) {
            const funcName = tc.name || tc.function_name;
            if (!funcName) {
              return { passed: false, message: 'Nama fungsi belum ditentukan pada test case.' };
            }

            const fn = window[funcName];
            if (typeof fn !== 'function') {
              return {
                passed: false,
                message: 'Fungsi "' + funcName + '" tidak ditemukan atau bukan sebuah function di global scope.',
                actual: typeof fn,
                expected: 'function'
              };
            }

            const inputs = Array.isArray(tc.input) ? tc.input : (tc.input !== undefined ? [tc.input] : (Array.isArray(tc.args) ? tc.args : []));
            let actual;
            try {
              actual = fn.apply(window, inputs);
            } catch (err) {
              return {
                passed: false,
                message: 'Error saat menjalankan ' + funcName + '(' + inputs.map(JSON.stringify).join(', ') + '): ' + err.message,
                actual: 'Error: ' + err.message,
                expected: JSON.stringify(tc.expected)
              };
            }

            if (!isDeepEqual(actual, tc.expected)) {
              return {
                passed: false,
                message: funcName + '(' + inputs.map(JSON.stringify).join(', ') + ') menghasilkan ' + JSON.stringify(actual) + ', diharapkan ' + JSON.stringify(tc.expected) + '.',
                actual: JSON.stringify(actual),
                expected: JSON.stringify(tc.expected)
              };
            }

            return {
              passed: true,
              message: 'Fungsi ' + funcName + '(' + inputs.map(JSON.stringify).join(', ') + ') menghasilkan ' + JSON.stringify(tc.expected) + '.',
              actual: JSON.stringify(actual),
              expected: JSON.stringify(tc.expected)
            };
          }

          // Evaluator 4: JavaScript Expressions / Unit Tests (type: 'javascript', 'js_eval')
          function evaluateJs(tc) {
            if (tc.tests && Array.isArray(tc.tests)) {
              for (const test of tc.tests) {
                let actual;
                try {
                  actual = window.eval(test.expression);
                } catch (err) {
                  return {
                    passed: false,
                    message: 'Error menjalankan ' + test.expression + ': ' + err.message,
                    actual: 'Error: ' + err.message,
                    expected: JSON.stringify(test.expected)
                  };
                }

                if (!isDeepEqual(actual, test.expected)) {
                  return {
                    passed: false,
                    message: (test.description || test.expression) + ' menghasilkan ' + JSON.stringify(actual) + ', diharapkan ' + JSON.stringify(test.expected) + '.',
                    actual: JSON.stringify(actual),
                    expected: JSON.stringify(test.expected)
                  };
                }
              }
              return {
                passed: true,
                message: 'Semua unit test JavaScript (' + tc.tests.length + ' test) lolos.'
              };
            }

            if (tc.expression) {
              let actual;
              try {
                actual = window.eval(tc.expression);
              } catch (err) {
                return {
                  passed: false,
                  message: 'Error menjalankan ekspresi JS: ' + err.message,
                  actual: 'Error',
                  expected: JSON.stringify(tc.expected)
                };
              }

              if (!isDeepEqual(actual, tc.expected)) {
                return {
                  passed: false,
                  message: 'Ekspresi ' + tc.expression + ' menghasilkan ' + JSON.stringify(actual) + ', diharapkan ' + JSON.stringify(tc.expected) + '.',
                  actual: JSON.stringify(actual),
                  expected: JSON.stringify(tc.expected)
                };
              }
              return { passed: true, message: 'Ekspresi JavaScript menghasilkan nilai yang sesuai.' };
            }

            if (tc.custom_js) {
              const res = new Function(tc.custom_js).call(window);
              return {
                passed: Boolean(res),
                message: Boolean(res) ? 'Custom JS assertion lolos.' : 'Custom JS assertion menghasilkan false.'
              };
            }

            return { passed: true, message: 'Test JavaScript lolos.' };
          }

          // Evaluator 5: JavaScript DOM Interaction & Events (type: 'javascript_dom', 'js_dom', 'event')
          function evaluateJsDom(tc) {
            const actions = tc.actions || (tc.action ? [tc.action] : []);

            for (const act of actions) {
              const el = document.querySelector(act.selector);
              if (!el) {
                return {
                  passed: false,
                  message: 'Target aksi ' + act.selector + ' tidak ditemukan pada DOM.'
                };
              }

              if (act.type === 'click') {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                if (typeof el.click === 'function') el.click();
              } else if (act.type === 'input' || act.type === 'change') {
                if (act.value !== undefined) el.value = act.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } else if (act.type === 'submit') {
                el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
              } else if (act.type === 'keydown') {
                el.dispatchEvent(new KeyboardEvent('keydown', { key: act.key || 'Enter', bubbles: true }));
              }
            }

            const assertions = tc.assertions || (tc.assert ? [tc.assert] : []);
            for (const assert of assertions) {
              const targetSelector = assert.selector || 'body';
              const targetEl = document.querySelector(targetSelector);
              if (!targetEl) {
                return {
                  passed: false,
                  message: 'Elemen hasil ' + targetSelector + ' tidak ditemukan setelah interaksi.'
                };
              }

              if (assert.has_class) {
                const classes = Array.isArray(assert.has_class) ? assert.has_class : [assert.has_class];
                for (const cls of classes) {
                  if (!targetEl.classList.contains(cls)) {
                    return {
                      passed: false,
                      message: 'Elemen ' + targetSelector + ' tidak memiliki class "' + cls + '" setelah interaksi.',
                      actual: targetEl.className,
                      expected: 'Class memuat ' + cls
                    };
                  }
                }
              }

              if (assert.property) {
                const actualProp = targetEl[assert.property] !== undefined ? targetEl[assert.property] : targetEl.getAttribute(assert.property);
                const actualStr = String(actualProp || '').trim().replace(/\\s+/g, ' ');
                const expStr = String(assert.expected || '').trim().replace(/\\s+/g, ' ');
                if (!actualStr.toLowerCase().includes(expStr.toLowerCase())) {
                  return {
                    passed: false,
                    message: 'Properti ' + assert.property + ' bernilai "' + actualStr + '", diharapkan memuat "' + expStr + '".',
                    actual: actualStr,
                    expected: expStr
                  };
                }
              }

              if (assert.styles) {
                const comp = window.getComputedStyle(targetEl);
                for (const [prop, expStyle] of Object.entries(assert.styles)) {
                  const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                  const actStyle = comp.getPropertyValue(kebabProp) || comp[prop] || '';
                  const normAct = normalizeStyle(kebabProp, actStyle);
                  const normExp = normalizeStyle(kebabProp, expStyle);
                  if (normAct !== normExp && !normAct.includes(normExp)) {
                    return {
                      passed: false,
                      message: 'Style ' + kebabProp + ' bernilai "' + actStyle + '", diharapkan "' + expStyle + '".',
                      actual: actStyle,
                      expected: String(expStyle)
                    };
                  }
                }
              }
            }

            return {
              passed: true,
              message: 'Interaksi JavaScript DOM berhasil dan seluruh kondisi terpenuhi.'
            };
          }

          function runAllTests() {
            testCases.forEach((tc) => {
              try {
                let evalResult;
                const type = (tc.type || '').toLowerCase();

                if (type === 'dom' || type === 'html' || type === 'dom_element' || type === 'dom_text' || type === 'dom_attribute') {
                  evalResult = evaluateDom(tc);
                } else if (type === 'css' || type === 'css_style') {
                  evalResult = evaluateCss(tc);
                } else if (type === 'function' || type === 'js_function') {
                  evalResult = evaluateJsFunction(tc);
                } else if (type === 'javascript' || type === 'js_eval') {
                  evalResult = evaluateJs(tc);
                } else if (type === 'javascript_dom' || type === 'js_dom' || type === 'dom_interaction' || type === 'event') {
                  evalResult = evaluateJsDom(tc);
                } else {
                  if (tc.name) {
                    evalResult = evaluateJsFunction(tc);
                  } else if (tc.selector && tc.styles) {
                    evalResult = evaluateCss(tc);
                  } else if (tc.selector) {
                    evalResult = evaluateDom(tc);
                  } else {
                    evalResult = { passed: true, message: 'Test case dilewati.' };
                  }
                }

                results.push({
                  id: tc.id || 'tc_' + results.length,
                  description: tc.description || (tc.selector ? (tc.selector + ' ' + (tc.property || '')) : (tc.name ? (tc.name + '()') : ('Test ' + (results.length + 1)))),
                  passed: Boolean(evalResult.passed),
                  message: evalResult.message,
                  expected: evalResult.expected,
                  actual: evalResult.actual,
                  test: tc.description || tc.selector || tc.name || tc.type
                });
              } catch (err) {
                results.push({
                  id: tc.id || 'tc_' + results.length,
                  description: tc.description || ('Test ' + (results.length + 1)),
                  passed: false,
                  message: 'Error eksekusi: ' + (err.message || String(err)),
                  test: tc.description || tc.type
                });
              }
            });

            window.parent.postMessage({
              type: 'TEST_RUNNER_COMPLETE',
              testId: '${testId}',
              results: results
            }, '*');
          }

          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(runAllTests, 100);
          } else {
            window.addEventListener('DOMContentLoaded', () => setTimeout(runAllTests, 100));
          }
        })();
      </script>
    `;

    // Construct full HTML to load
    let fullHtml = code.html || '';
    const styleBlock = `<style>${code.css || ''}</style>`;
    const scriptBlock = `<script>${code.js || ''}</script>`;

    if (fullHtml.includes('</head>')) {
      fullHtml = fullHtml.replace('</head>', `${styleBlock}</head>`);
    } else {
      fullHtml = `${styleBlock}${fullHtml}`;
    }

    if (fullHtml.includes('</body>')) {
      fullHtml = fullHtml.replace('</body>', `${scriptBlock}${runnerScript}</body>`);
    } else {
      fullHtml = `${fullHtml}${scriptBlock}${runnerScript}`;
    }

    // Message handler
    const messageHandler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'TEST_RUNNER_COMPLETE' && e.data.testId === testId) {
        cleanup();
        const results: TestResultItem[] = e.data.results || [];
        const passedCount = results.filter((r) => r.passed).length;
        const totalCount = results.length;
        const scorePercentage = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
        const pointsAwarded = Math.round((scorePercentage / 100) * maxPoints);

        resolve({
          passedCount,
          totalCount,
          scorePercentage,
          pointsAwarded,
          results,
          allPassed: passedCount === totalCount && totalCount > 0,
        });
      }
    };

    // Timeout safety
    const timeoutTimer = setTimeout(() => {
      cleanup();
      const fallbackResults: TestResultItem[] = testCases.map((tc) => ({
        id: tc.id,
        description: tc.description || 'Test case',
        passed: false,
        message: 'Timeout: Eksekusi kode melebihi batas waktu maksimal (4 detik).',
      }));
      resolve({
        passedCount: 0,
        totalCount: testCases.length,
        scorePercentage: 0,
        pointsAwarded: 0,
        results: fallbackResults,
        allPassed: false,
      });
    }, 4000);

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      window.removeEventListener('message', messageHandler);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    window.addEventListener('message', messageHandler);
    document.body.appendChild(iframe);
    iframe.srcdoc = fullHtml;
  });
}
