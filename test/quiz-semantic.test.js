/**
 * 答题填入逻辑的离线验证（零依赖，node test/quiz-semantic.test.js）
 *
 * 目的：在没有真实学习通页面的情况下，验证 content/quiz.js 的三处改动
 *   1) 判断题语义映射（正序 / 逆序 / 语义不可判定）
 *   2) 统一「先清理、再设置」的作用域（含跨题隔离）
 *   3) 回读校验（含 .check_answer 异步标记）
 *
 * 做法：用最小假 DOM 把 content/quiz.js 载入 vm 沙箱，直接调用其导出的
 *       fillAnswerAsync，然后断言【页面上真实选中了哪些选项】。
 */

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ============================================================
// 极简假 DOM
// ============================================================
function matches(el, sel) {
  if (!sel) return false;
  const m = sel.match(/^([a-zA-Z]*)\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (m) {
    const tag = m[1], attr = m[2], val = m[3];
    if (tag && el.tag !== tag.toLowerCase()) return false;
    if (el.attrs[attr] === undefined) return false;
    if (val !== undefined && String(el.attrs[attr]) !== val) return false;
    return true;
  }
  if (sel.startsWith('.')) return el.classes.has(sel.slice(1));
  return el.tag === sel.toLowerCase();
}

class El {
  constructor(tag, opts = {}) {
    this.tag = tag;
    this.attrs = Object.assign({}, opts.attrs || {});
    this.classes = new Set(opts.classes || []);
    this._text = opts.text || '';
    this.children = opts.children || [];
    this.onClick = opts.onClick || null;
    const self = this;
    this.classList = {
      contains: (c) => self.classes.has(c),
      add: (c) => { self.classes.add(c); },
      remove: (c) => { self.classes.delete(c); },
    };
  }
  get textContent() {
    return this._text || this.children.map((c) => c._text).join('');
  }
  set textContent(v) { this._text = v; }
  getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  click() { if (this.onClick) this.onClick(this); }
  dispatchEvent() {}
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const sels = sel.split(',').map((s) => s.trim());
    const out = [];
    const walk = (node) => {
      for (const ch of node.children) {
        for (const s of sels) {
          if (matches(ch, s)) { out.push(ch); break; }
        }
        walk(ch);
      }
    };
    walk(this);
    return out;
  }
}

// 造一个选项：.answerBg > (.num_option[data=X] , .answer_p > p)
function makeOption(letter, text) {
  const letterEl = new El('span', { classes: ['num_option'], attrs: { data: letter }, text: letter });
  const p = new El('p', { text });
  const answerP = new El('div', { classes: ['answer_p'], children: [p] });
  const ab = new El('div', { classes: ['answerBg'], children: [letterEl, answerP] });
  ab.letterEl = letterEl;
  return ab;
}

// 造一道题；clickMode: 'single' | 'multiple'；delayMs>0 用于模拟异步加标记
function makeQuestion(index, type, options, clickMode, delayMs = 0) {
  const qEl = new El('div', { classes: ['singleQuesId'], children: options });

  const apply = (o) => {
    if (clickMode === 'single') {
      options.forEach((x) => x.letterEl.classes.delete('check_answer'));
      o.letterEl.classes.add('check_answer');
    } else {
      if (o.letterEl.classes.has('check_answer')) o.letterEl.classes.delete('check_answer');
      else o.letterEl.classes.add('check_answer');
    }
  };

  for (const o of options) {
    o.onClick = () => {
      if (delayMs > 0) setTimeout(() => apply(o), delayMs);
      else apply(o);
    };
  }
  return { index, type, element: qEl, _options: options };
}

const selectedLetters = (q) =>
  q._options.filter((o) => o.letterEl.classes.has('check_answer')).map((o) => o.letterEl.attrs.data).sort();

// ============================================================
// 载入 content/quiz.js
// ============================================================
const code = fs.readFileSync(path.join(__dirname, '..', 'content', 'quiz.js'), 'utf8');
const sandbox = {
  window: {},
  console: { log() {}, warn() {}, error() {} },
  document: { querySelectorAll: () => [], querySelector: () => null },
  location: { href: 'https://mooc1.chaoxing.com/work/dowork', pathname: '/work/dowork' },
  Event: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
  setTimeout, clearTimeout, Promise, JSON, String, Number, Array, Object, Math, RegExp, Set, Map, Date,
};
sandbox.window.__CXH = { utils: { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) } };
vm.createContext(sandbox);
// quiz.js 引用 SEL（选择器集中化），必须先载入 selectors.js
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'content', 'selectors.js'), 'utf8'), sandbox);
vm.runInContext(code, sandbox);

const quiz = sandbox.window.__CXH.quiz;
if (!quiz || typeof quiz.fillAnswerAsync !== 'function') {
  console.error('✗ 无法从 quiz.js 取得 fillAnswerAsync');
  process.exit(1);
}

// ============================================================
// 测试
// ============================================================
const results = [];
async function check(name, fn) {
  try {
    const r = await fn();
    results.push({ name, pass: true, detail: r || '' });
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async function run() {
  // ---- 检查 4：判断题正序（页面 A=对, B=错），AI 答 A ----
  await check('判断题·正序 A=对 → AI"A" 应选中「对」（即 A）', async () => {
    const q = makeQuestion(0, 'judge', [
      makeOption('A', '对'),
      makeOption('B', '错'),
    ], 'single');
    const r = await quiz.fillAnswerAsync(q, 'A');
    const got = selectedLetters(q);
    assert(got.length === 1 && got[0] === 'A', `期望选中 [A]，实际 [${got}]`);
    assert(r.ok === true, `回读应 ok=true，实际 ${JSON.stringify(r)}`);
    return `选中=[${got}] via=${r.via}`;
  });

  // ---- 检查 4（关键）：判断题逆序（页面 A=错, B=对），AI 答 A（语义=对）----
  await check('判断题·逆序 A=错 → AI"A" 应选中「对」（即 B，不是 A）', async () => {
    const q = makeQuestion(0, 'judge', [
      makeOption('A', '错'),
      makeOption('B', '对'),
    ], 'single');
    const r = await quiz.fillAnswerAsync(q, 'A');
    const got = selectedLetters(q);
    assert(got.length === 1 && got[0] === 'B', `期望选中 [B]（对），实际 [${got}] —— 说明仍按字母硬映射`);
    assert(r.via === 'judge-semantic(TRUE)', `期望走语义通道，实际 via=${r.via}`);
    return `选中=[${got}] via=${r.via}`;
  });

  // ---- AI 答 B（语义=错）在正序页面上应选中 B ----
  await check('判断题·正序 AI"B" 应选中「错」（即 B）', async () => {
    const q = makeQuestion(0, 'judge', [
      makeOption('A', '正确'),
      makeOption('B', '错误'),
    ], 'single');
    const r = await quiz.fillAnswerAsync(q, 'B');
    const got = selectedLetters(q);
    assert(got.length === 1 && got[0] === 'B', `期望选中 [B]，实际 [${got}]`);
    return `选中=[${got}] via=${r.via}`;
  });

  // ---- 语义不可判定 → 兜底回退字母通道，且必须仍然填上 ----
  await check('判断题·语义不可判定（甲/乙）→ 回退字母通道且填上 A', async () => {
    const q = makeQuestion(0, 'judge', [
      makeOption('A', '甲'),
      makeOption('B', '乙'),
    ], 'single');
    const r = await quiz.fillAnswerAsync(q, 'A');
    const got = selectedLetters(q);
    assert(got.length === 1 && got[0] === 'A', `期望兜底选中 [A]，实际 [${got}]`);
    assert(r.via === 'judge-fallback-letter', `期望 via=judge-fallback-letter，实际 ${r.via}`);
    return `选中=[${got}] via=${r.via}`;
  });

  // ---- 检查 5（关键）：多选题「已有 1 个错选项 + 需选 2 个正确项」 ----
  await check('多选·预选错误项 C + 答案"AB" → 结果应恰为 [A,B] 且 C 被清除', async () => {
    const q = makeQuestion(0, 'multiple', [
      makeOption('A', '选项甲'),
      makeOption('B', '选项乙'),
      makeOption('C', '选项丙'),
      makeOption('D', '选项丁'),
    ], 'multiple');
    // 模拟用户先前的手动误选
    q._options[2].letterEl.classes.add('check_answer');

    const r = await quiz.fillAnswerAsync(q, 'AB');
    const got = selectedLetters(q);
    assert(got.join('') === 'AB', `期望恰为 [A,B]，实际 [${got}]`);
    assert(r.ok === true, `回读应 ok=true，实际 ${JSON.stringify(r)}`);
    assert(r.cleaned === 1, `期望清理 1 个残留项，实际 cleaned=${r.cleaned}`);
    return `选中=[${got}] cleaned=${r.cleaned} set=${r.set}`;
  });

  // ---- 检查 5（作用域）：清理不得跨题 ----
  await check('多选·作用域隔离：填第 1 题不得动到第 2 题的已有选择', async () => {
    const q1 = makeQuestion(0, 'multiple', [
      makeOption('A', '甲1'),
      makeOption('B', '乙1'),
    ], 'multiple');
    const q2 = makeQuestion(1, 'multiple', [
      makeOption('A', '甲2'),
      makeOption('B', '乙2'),
      makeOption('C', '丙2'),
    ], 'multiple');
    // 第 2 题上已有用户的手动选择（B、C）
    q2._options[1].letterEl.classes.add('check_answer');
    q2._options[2].letterEl.classes.add('check_answer');

    await quiz.fillAnswerAsync(q1, 'A');

    const got1 = selectedLetters(q1);
    const got2 = selectedLetters(q2);
    assert(got1.join('') === 'A', `第1题期望 [A]，实际 [${got1}]`);
    assert(got2.join('') === 'BC', `第2题应保持 [B,C] 不变，实际 [${got2}] —— 清理范围越界了`);
    return `Q1=[${got1}] Q2=[${got2}]`;
  });

  // ---- 单选：预选了错误项 B，答案 A ----
  await check('单选·预选错误项 B + 答案"A" → 结果应恰为 [A]', async () => {
    const q = makeQuestion(0, 'single', [
      makeOption('A', '甲'),
      makeOption('B', '乙'),
      makeOption('C', '丙'),
    ], 'single');
    q._options[1].letterEl.classes.add('check_answer');

    const r = await quiz.fillAnswerAsync(q, 'A');
    const got = selectedLetters(q);
    assert(got.length === 1 && got[0] === 'A', `期望恰为 [A]，实际 [${got}]`);
    return `选中=[${got}] via=${r.via}`;
  });

  // ---- 检查 3：.check_answer 异步加标记（150ms）不应被误判为「没填上」 ----
  await check('回读校验·标记延迟 150ms 仍应判定 ok=true', async () => {
    const q = makeQuestion(0, 'single', [
      makeOption('A', '甲'),
      makeOption('B', '乙'),
    ], 'single', 150);
    const r = await quiz.fillAnswerAsync(q, 'A');
    assert(r.ok === true, `期望 ok=true（已等 200ms 再回读），实际 ${JSON.stringify(r)}`);
    return `ok=${r.ok} actual=[${r.actual}]`;
  });

  // ---- 文本答案（非字母）仍应可用 ----
  await check('单选·文本答案模糊匹配仍可用', async () => {
    const q = makeQuestion(0, 'single', [
      makeOption('A', '中国的首都是北京'),
      makeOption('B', '中国的首都是上海'),
    ], 'single');
    const r = await quiz.fillAnswerAsync(q, '北京');
    const got = selectedLetters(q);
    assert(got.join('') === 'A', `期望选中 [A]，实际 [${got}]`);
    return `选中=[${got}] via=${r.via}`;
  });

  // ============================================================
  // 汇总
  // ============================================================
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log('');
  console.log('===== 答题填入逻辑验证 =====');
  for (const r of results) {
    console.log(`${r.pass ? '  PASS' : '  FAIL'}  ${r.name}`);
    if (r.detail) console.log(`        ${r.detail}`);
  }
  console.log(`-----  ${pass}/${results.length} 通过，${fail} 失败  -----`);
  process.exit(fail === 0 ? 0 : 1);
})();
