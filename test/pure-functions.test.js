/**
 * 纯函数回归测试（零依赖）
 * 用法：node test/pure-functions.test.js
 *
 * 覆盖：
 *   - sidepanel/modules/ai.js : extractCaptchaCode（8 层提取策略）、parseAnswers（JSON / 逐行双通道）
 *   - content/section/core.js : jobKey（三级降级）
 *   - content/jobs.js 与 content/section/finder.js : classifyType / classifyTypeSimple 的分类分歧
 *
 * 这些都是纯函数，不需要真实 DOM 或网络，因此可以直接在 vm 沙箱里载入源文件调用。
 */

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 浏览器里 `window.SP = ...` 会同时创建一个全局变量 SP；vm 沙箱里不会。
// 因此这里让 sandbox.window 指向 sandbox 自身，并把预置变量直接挂在沙箱根上，
// 才能复现真实运行时的标识符解析行为。
function loadModule(relPath, globals, prelude) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    location: { href: 'https://mooc1.chaoxing.com/', pathname: '/' },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Event: class { constructor(t) { this.type = t; } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, JSON, String, Number, Array, Object, Math, RegExp, Set, Map, Date, isNaN, parseInt, parseFloat,
  };
  Object.assign(sandbox, globals || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // prelude：先于被测模块载入的依赖（如 content/selectors.js）
  for (const p of prelude || []) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, p), 'utf8'), sandbox);
  }
  vm.runInContext(code, sandbox);
  return sandbox;
}

// ---- 载入被测模块 ----
const aiSandbox = loadModule('sidepanel/modules/ai.js');
const AI = aiSandbox.SP && aiSandbox.SP.ai;

const sectionCoreSandbox = loadModule('content/section/core.js', { __CXH: {} });
const SECT = sectionCoreSandbox.__CXH.sectionCore;

const jobsSandbox = loadModule('content/jobs.js', { __CXH: {} }, ['content/selectors.js']);
const JOBS = jobsSandbox.__CXH.jobs;

const finderSandbox = loadModule('content/section/finder.js', {
  __CXH: { P: {}, S: {}, dom: {}, jobs: {}, utils: {} },
}, ['content/selectors.js']);
const FINDER = finderSandbox.__CXH.sectionFinder;

// ============================================================
const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, pass: true, detail: detail || '' });
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ''} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

// ============================================================
// 1. extractCaptchaCode —— 8 层提取策略
// ============================================================
if (!AI || typeof AI.extractCaptchaCode !== 'function') {
  console.error('✗ 无法取得 SP.ai.extractCaptchaCode（确认已导出）');
  process.exit(1);
}

const C = (input, expect, label) => check(`验证码提取: ${label}`, () => {
  const got = AI.extractCaptchaCode(input);
  eq(got, expect, '提取结果');
  return `输入 ${JSON.stringify(String(input).slice(0, 40))} → ${JSON.stringify(got)}`;
});

C('FEcF', 'FEcF', '策略2 纯 4 字母');
C('Ab3d', 'Ab3d', '策略3 4-6 位字母数字');
C('```\nFEcF\n```', 'FEcF', '策略1 清理 markdown 围栏');
C('"FEcF"', 'FEcF', '策略1 清理引号');
C('验证码是 AbCd', 'AbCd', '策略4 中文标记');
C('识别结果：EfGh', 'EfGh', '策略4 中文标记（冒号变体）');
C('{"code":"AbCd"}', 'AbCd', '策略5 JSON 字段');
C('The code is AbCd', 'AbCd', '策略6 边界匹配 + 噪声词过滤(code 在 NOISE 中)');
C('IMAGE PNG JPG', null, '策略6 全噪声词 → 无法提取');
C('UNKNOWN', null, '策略0 明确 UNKNOWN → null');
C('UNKNOWN.', null, '策略0 UNKNOWN 带标点 → null');
C('这不是验证码', null, '6 无 4 字母候选 → null');
C('', null, '空输入 → null');
C(null, null, 'null 输入 → null');

check('验证码提取: 多候选时按大小写混合度打分（确定性取 AbCd）', () => {
  const got = AI.extractCaptchaCode('可能为 AbCd 或 EfGh');
  assert(got === 'AbCd' || got === 'EfGh', `应返回混合大小写候选之一，实际 ${got}`);
  return `多候选 → ${got}（均为混合大小写，打分并列取首个）`;
});

// ============================================================
// 2. parseAnswers —— JSON 通道 + 逐行兜底
// ============================================================
check('答案解析: 标准 JSON 通道', () => {
  const r = AI.parseAnswers('{"answers":[{"index":0,"answer":"A","confidence":0.9},{"index":1,"answer":"ACD","confidence":0.8}]}', 2);
  assert(r.length === 2, `应有 2 条，实际 ${r.length}`);
  eq(r[0].answer, 'A', '第1题');
  eq(r[1].answer, 'ACD', '第2题');
  eq(r[0].confidence, 0.9, '第1题置信度');
  return `解析出 ${r.length} 条，置信度保留`;
});

check('答案解析: JSON 前后带解释性文字', () => {
  const r = AI.parseAnswers('好的，答案如下：\n{"answers":[{"index":0,"answer":"B","confidence":0.7}]}\n以上。', 1);
  assert(r.length === 1 && r[0].answer === 'B', `应提取出 B，实际 ${JSON.stringify(r)}`);
  return '括号平衡扫描成功提取内嵌 JSON';
});

check('答案解析: id 字段兼容（部分模型返回 id 而非 index）', () => {
  const r = AI.parseAnswers('{"answers":[{"id":1,"answer":"C"}]}', 2);
  eq(r[0].index, 1, 'index 应取自 id');
  return `index=${r[0].index} answer=${r[0].answer}`;
});

check('答案解析: 非法 JSON → 逐行兜底', () => {
  const r = AI.parseAnswers('A\nAC\nB', 3);
  assert(r.length === 3, `应有 3 条，实际 ${r.length}`);
  eq(r[1].answer, 'AC', '第2行');
  return `逐行提取 [${r.map(x => x.answer).join(',')}]`;
});

check('答案解析: 无字母内容 → 空数组', () => {
  const r = AI.parseAnswers('第一题 第二题', 2);
  assert(Array.isArray(r) && r.length === 0, `应为空数组，实际 ${JSON.stringify(r)}`);
  return '无候选时返回 []';
});

// ============================================================
// 3. jobKey —— 三级降级
// ============================================================
if (!SECT || typeof SECT.jobKey !== 'function') {
  console.error('✗ 无法取得 CXH.sectionCore.jobKey');
  process.exit(1);
}

check('jobKey: 优先 jobId', () => {
  eq(SECT.jobKey({ jobId: 'j1', objectId: 'o1', index: 2, type: 'video' }, 0), 'j1', 'jobId 优先');
  return 'jobId → j1';
});

check('jobKey: 无 jobId 时用 objectId', () => {
  eq(SECT.jobKey({ objectId: 'o1', index: 2, type: 'video' }, 0), 'o1', 'objectId 次之');
  return 'objectId → o1';
});

check('jobKey: 两者皆无 → c{card}-i{idx}-{type}', () => {
  eq(SECT.jobKey({ index: 2, type: 'video' }, 1), 'c1-i2-video', '兜底格式');
  return '兜底 → c1-i2-video';
});

check('jobKey: 未传 cardIndex 时回退 job.cardIndex', () => {
  eq(SECT.jobKey({ index: 0, type: 'document', cardIndex: 3 }, undefined), 'c3-i0-document', '回退 cardIndex');
  return '回退 → c3-i0-document';
});

// ============================================================
// 4. classifyType vs classifyTypeSimple —— 已知分歧
// ============================================================
if (!JOBS || typeof JOBS.classifyType !== 'function') {
  console.error('✗ 无法取得 CXH.jobs.classifyType（确认已导出）');
  process.exit(1);
}
if (!FINDER || typeof FINDER.classifyTypeSimple !== 'function') {
  console.error('✗ 无法取得 CXH.sectionFinder.classifyTypeSimple');
  process.exit(1);
}

const T = (src, expect, label) => check(`类型判定: ${label}`, () => {
  eq(JOBS.classifyType(src), expect, 'jobs.classifyType');
  return `${src} → ${expect}`;
});

T('https://x/ananas/modules/video/index.html', 'video', 'video');
T('https://x/ananas/modules/pdf/index.html', 'document', 'pdf');
T('https://x/ananas/modules/doc/index.html', 'document', 'doc');
T('https://pan-yz.chaoxing.com/x', 'document', 'pan-yz');
T('https://x/ananas/modules/audio/index.html', 'audio', 'audio');
T('https://x/downloadfile?id=1', 'attachment', 'downloadfile → attachment');
T('https://x/unknown/thing', 'unknown', '未识别');
T('', 'unknown', '空 src');

check('类型判定分歧: downloadfile 在两套实现里归类不同（已知不一致）', () => {
  const a = JOBS.classifyType('https://x/downloadfile?id=1');
  const b = FINDER.classifyTypeSimple('https://x/downloadfile?id=1');
  assert(a === 'attachment', `jobs.classifyType 应为 attachment，实际 ${a}`);
  assert(b === 'document', `finder.classifyTypeSimple 应为 document，实际 ${b}`);
  return `jobs=${a} / finder=${b} —— 这是路线图 §6.8 记录的待收敛项`;
});

check('类型判定分歧: video / document / audio 三者两套实现一致', () => {
  const cases = [
    ['https://x/ananas/modules/video/index.html', 'video'],
    ['https://x/ananas/modules/pdf/index.html', 'document'],
    ['https://x/ananas/modules/audio/index.html', 'audio'],
  ];
  for (const [src, want] of cases) {
    eq(JOBS.classifyType(src), want, `jobs ${src}`);
    eq(FINDER.classifyTypeSimple(src), want, `finder ${src}`);
  }
  return '三类资源归类一致';
});

// ============================================================
// 汇总
// ============================================================
const pass = results.filter(r => r.pass).length;
const fail = results.length - pass;
console.log('');
console.log('===== 纯函数回归测试 =====');
for (const r of results) {
  console.log(`${r.pass ? '  PASS' : '  FAIL'}  ${r.name}`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log(`-----  ${pass}/${results.length} 通过，${fail} 失败  -----`);
process.exit(fail === 0 ? 0 : 1);
