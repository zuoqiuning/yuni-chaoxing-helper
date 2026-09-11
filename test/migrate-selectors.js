/**
 * 一次性迁移工具：把散落在各 content 模块里的平台选择器字面量替换为 CXH.SEL 引用。
 * 用法：node test/migrate-selectors.js [--dry]
 *
 * 设计要点：
 *   1. 逐条替换并统计命中次数 —— 命中 0 次不会报错，但会打印出来便于发现漏配。
 *   2. 数组类一律只替换「元素行」为 `...SEL.xxx`，不碰 `[` `]`，这样对缩进不敏感、更耐改。
 *   3. 组合选择器规则排在单条规则之前，避免 `.a, .b` 被 `.a` 先吃掉。
 *   4. 自动在每个模块顶部插入 `const SEL = CXH.SEL;`。
 *   5. selectors.js 自身跳过。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');

const FILES = [
  'content/dom.js',
  'content/catalog.js',
  'content/jobs.js',
  'content/doc.js',
  'content/quiz.js',
  'content/player/core.js',
  'content/section/finder.js',
  'content/section/index.js',
  'content/interceptor.js',
  'content/main.js',
];

const RULES = [
  // ===== A. 组合选择器 / 含字面量的整块（必须先于其组成部分）=====
  ["excludeIds: ['searchChapterListByName', 'searchChapter', 'chapterSearch']", 'excludeIds: SEL.captchaExcludeIds'],
  ["excludeIds: ['searchChapterListByName']", 'excludeIds: [SEL.searchInputId]'],
  ["'.singleQuesId, .stem_answer, .questionLi'", 'SEL.quizRootForCount'],
  ["'.singleQuesId, .questionLi, .TiMu'", 'SEL.quizRootAny'],
  ["'.edui-editor-iframeholder, .edui-editor, .edui-body-container'", 'SEL.quizEditor'],
  ["'.edui-editor-iframeholder, .edui-editor'", 'SEL.quizEditorHolder'],
  ["'.mark_name, .Zy_TItle, .newZy_TItle, .colorDeep.workTextWrap, .workTextWrap'", 'SEL.quizStem'],
  ["'.num_option_dx, .checkbox, input[type=\"checkbox\"]'", 'SEL.quizMultiHint'],
  ["'.num_option, span[data]'", 'SEL.quizOptionLetter'],
  ["'textarea, input[type=\"text\"]'", 'SEL.quizTextInput'],
  ["'[id^=\"question\"][class*=\"Ques\"]'", 'SEL.quizRootAltPattern'],
  ["'div, section, article, main, ul, ol'", 'SEL.scrollCandidates'],
  ["'button, .btn, a'", 'SEL.docDoneButtons'],
  ["['.tab-title', 'a', 'span']", 'SEL.cardTextFallbacks'],
  ["'#prev_tab .prev_ul > li'", 'SEL.cardTabs'],
  ["'.layui-layer-close, .layui-layer-close1, .layui-layer-btn-close'", 'SEL.zoomCloseButtons.join(\',\')'],
  ['`.posCatalog_select[id="cur${sectionId}"]`', 'SEL.catalogNodeById(sectionId)'],

  // ===== B. 数组元素行 -> 展开 =====
  [
    "        '#viewerContainer', '#viewer', '.pdfViewer', '.pdf-viewer',\n        '#pdfContainer', '.scroll-container', '.reader-container',\n        '.swiper-container', '.swiper-wrapper', '.swiper-slide'",
    '        ...SEL.readerContainers'
  ],
  [
    "    '#nextPage', '#next', '.nextPage', '.next-page', '.page-next',\n    '[class*=\"nextPage\"]', '[class*=\"next_page\"]', '[class*=\"next-page\"]',\n    '[aria-label=\"下一页\"]', '.toolbar .next', '.pdf-toolbar .next', '.turnpage .next'",
    '    ...SEL.nextPageButtons'
  ],
  [
    "    '.ans-job-limit-tip', '.mask-tip', '.popup-tip',\n    '.layui-layer:not(.layui-layer-hide)', '.ans-job-limit'",
    '    ...SEL.blockers'
  ],
  [
    "    '.layui-layer-btn a', '.layui-layer-btn0', '.layui-layer-btn1',\n    'button', 'a', 'input[type=\"button\"]', 'input[type=\"submit\"]',\n    'span[class*=\"btn\"]', 'div[class*=\"btn\"]'",
    '    ...SEL.blockerButtons'
  ],
  [
    "      '.ans-job-verify', '#verifyImg', '.face-verify',\n      '.verifyBox', '.check-code', '[class*=\"verify-box\"]',\n      '[class*=\"captcha-box\"]'",
    '      ...SEL.captchaContainer'
  ],
  [
    "      'input#ucode', 'input[name=\"ucode\"]', 'input[name=\"code\"]',\n      'input[name=\"verifyCode\"]', 'input[placeholder*=\"验证码\"]',\n      'input[placeholder*=\"字符\"]', 'input[placeholder*=\"请输\"]'",
    '      ...SEL.captchaInput'
  ],
  [
    "      'img#verifyImg', 'img#ucode_img', 'img#captchaImg',\n      'img[src*=\"verify\"]', 'img[src*=\"validate\"]',\n      'img[src*=\"captcha\"]', 'img[src*=\"antispider\"]',\n      'form img', '.verify img', '.captcha img'",
    '      ...SEL.captchaImage'
  ],
  [
    "      'input#ucode', 'input[name=\"ucode\"]', 'input[name=\"verifyCode\"]',\n      'input[name=\"code\"]', 'input[placeholder*=\"验证码\"]',\n      'input[placeholder*=\"字符\"]'",
    '      ...SEL.captchaInputStrict'
  ],
  [
    "      'input#ucode',\n      'input[name=\"ucode\"]',\n      'input[name=\"verifyCode\"]',\n      'input[name=\"code\"]',\n      'input[placeholder*=\"验证码\"]',\n      'input[placeholder*=\"字符\"]',\n      'input[placeholder*=\"请输\"]',\n      'input[type=\"text\"]'",
    '      ...SEL.captchaInputWide'
  ],

  // ===== C. 单条选择器 =====
  ["'.ans-job-finished'", 'SEL.jobFinished'],
  ["'ans-job-finished'", 'SEL.jobFinishedClass'],
  ["'.ans-job-icon'", 'SEL.jobIcon'],
  ["'.ans-attach-ct'", 'SEL.attach'],
  ["'jobid'", 'SEL.jobIdAttr'],
  ["'objectid'", 'SEL.objectIdAttr'],
  ["'.posCatalog_select'", 'SEL.catalogNode'],
  ["'.posCatalog_sbar'", 'SEL.catalogLabel'],
  ["'.posCatalog_name'", 'SEL.catalogName'],
  ["'.posCatalog_title'", 'SEL.catalogTitle'],
  ["'.icon_Completed'", 'SEL.catalogDone'],
  ["'firstLayer'", 'SEL.catalogChapterClass'],
  ["getElementById('iframe')", 'getElementById(SEL.cardsIframeId)'],
  ["'.spanText'", 'SEL.cardText'],
  ["'active'", 'SEL.cardActiveClass'],
  ["'source'", 'SEL.videoSource'],
  ["'video#video'", 'SEL.videoEl'],
  ["'.answerBg'", 'SEL.quizOption'],
  ["'.num_option'", 'SEL.quizOptionLetterOnly'],
  ["'.answer_p'", 'SEL.quizOptionText'],
  ["'check_answer'", 'SEL.quizSelectedClass'],
  ["'.singleQuesId'", 'SEL.quizRoot'],
  ["'.questionLi'", 'SEL.quizRootAlt'],
  ["'.completeBtn'", 'SEL.quizSubmit'],
  ["stemEl.querySelector('p')", 'stemEl.querySelector(SEL.quizParagraph)'],
  ["answerP.querySelectorAll('p')", 'answerP.querySelectorAll(SEL.quizParagraph)'],
  ["'searchChapterListByName'", 'SEL.searchInputId'],
  ["'curChapterId'", 'SEL.curChapterIdInput'],

  // ===== D. 正则 =====
  ['const CONFIRM_BTN_TEXT = /^(继续观看|继续学习|继续播放|继续|确定|确认|我知道了|知道了|好的)([\\s(（:：].*)?$/;',
   'const CONFIRM_BTN_TEXT = SEL.RE.confirmBtnText;'],
  ['const REJECT_BTN_TEXT = /取消|关闭|退出|返回|放弃|离开|不再|跳过/;',
   'const REJECT_BTN_TEXT = SEL.RE.rejectBtnText;'],
  ['/ananas\\/modules\\/video/', 'SEL.RE.videoIframe'],
  ['/ananas\\/modules\\/(pdf|doc)/', 'SEL.RE.docIframe'],
  ['/ananas\\/modules\\/pdf/', 'SEL.RE.docIframePdf'],
  ['/ananas\\/modules\\/doc/', 'SEL.RE.docIframeDoc'],
  ['/pan-yz\\.chaoxing\\.com/', 'SEL.RE.docHost'],
  ['/downloadfile/', 'SEL.RE.downloadFile'],
  ['/ananas\\/modules\\/audio/', 'SEL.RE.audioIframe'],
  ['/[?&]num=(\\d+)/', 'SEL.RE.cardNumParam'],
  ['/^cur/', 'SEL.RE.catalogIdPrefix'],
  ['/任务点已完成/', 'SEL.RE.jobDoneAria'],
  ['/disabled|disallow|forbid/i', 'SEL.RE.disabledClass'],
  ['/^(完成|已阅|确定|我已完成|阅读完成|已阅读)$/', 'SEL.RE.prevPageText'],
  ['/antispider|showverify|checkcode|vercode/i', 'SEL.RE.captchaIframeSrc'],
  ['/9010|操作异常|请输入图片中的验证码/', 'SEL.RE.captchaText'],
];

function main() {
  const report = [];
  let totalHits = 0;

  for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    let src = fs.readFileSync(abs, 'utf8');
    const fileHits = [];
    let fileTotal = 0;

    for (const [from, to] of RULES) {
      if (!src.includes(from)) continue;
      const n = src.split(from).length - 1;
      src = src.split(from).join(to);
      fileHits.push(`${n}× ${from.slice(0, 44).replace(/\n/g, '⏎')}${from.length > 44 ? '…' : ''}`);
      fileTotal += n;
    }

    // 通用 iframe 查询（放在最后，避免误伤 getElementById）
    const before = src;
    src = src.replace(/querySelectorAll\('iframe'\)/g, 'querySelectorAll(SEL.iframe)');
    src = src.replace(/querySelector\('iframe'\)/g, 'querySelector(SEL.iframe)');
    const nIframe = (before.match(/querySelector(All)?\('iframe'\)/g) || []).length;
    if (nIframe > 0) { fileHits.push(`${nIframe}× querySelector(All)('iframe')`); fileTotal += nIframe; }

    if (fileTotal > 0 && !/const SEL = CXH\.SEL;/.test(src)) {
      const m = src.match(/^\s*if \(!CXH[^\n]*\) return;\s*$/m);
      if (m) {
        const idx = src.indexOf(m[0]) + m[0].length;
        src = src.slice(0, idx) + '\n  const SEL = CXH.SEL;' + src.slice(idx);
      } else {
        src = src.replace(/(const CXH = window\.__CXH;)/, '$1\n  const SEL = CXH.SEL;');
      }
    }

    totalHits += fileTotal;
    report.push({ rel, fileTotal, fileHits });
    if (!DRY) fs.writeFileSync(abs, src.replace(/\n/g, '\r\n'), 'utf8');
  }

  console.log('');
  console.log('===== 选择器迁移报告' + (DRY ? '（dry-run，未写盘）' : '') + ' =====');
  for (const r of report) {
    console.log(`\n  ${r.rel}  共 ${r.fileTotal} 处`);
    for (const h of r.fileHits) console.log(`      ${h}`);
  }
  console.log(`\n----- 合计替换 ${totalHits} 处 -----`);

  const untouched = report.filter(r => r.fileTotal === 0).map(r => r.rel);
  if (untouched.length) {
    console.log('\n  未发生替换的文件：');
    for (const u of untouched) console.log('      ' + u);
  }
}

main();
