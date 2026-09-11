(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  // ============================================================
  // 平台选择器唯一真值源
  //
  // 为什么集中：超星改版是这类项目最主要的死因。原先这些字符串散落在
  // 12 个文件里，一次改版要翻遍全库找，极易漏改。
  //
  // 约定（由 check.ps1 强制检查）：
  //   平台相关的选择器/正则【只允许出现在本文件】。
  //   其他模块一律通过 CXH.SEL / CXH.SEL.RE 引用。
  // ============================================================

  // 正则（预编译，避免高频调用时重复构造）
  const RE = {
    videoIframe: /ananas\/modules\/video/,
    docIframe: /ananas\/modules\/(pdf|doc)/,
    docIframePdf: /ananas\/modules\/pdf/,
    docIframeDoc: /ananas\/modules\/doc/,
    docHost: /pan-yz\.chaoxing\.com/,
    audioIframe: /ananas\/modules\/audio/,
    downloadFile: /downloadfile/,
    cardNumParam: /[?&]num=(\d+)/,
    catalogIdPrefix: /^cur/,
    captchaUrl: /antispider|showverify|checkcode|vercode|verify\.ac/i,
    captchaIframeSrc: /antispider|showverify|checkcode|vercode/i,
    captchaText: /9010|操作异常|请输入图片中的验证码/,
    jobDoneAria: /任务点已完成/,
    quizTypeText: /[（(]([^）)]*?题)[）)]/,
    quizStemNumber: /^\s*\d+[\.\、\s]+/,
    quizStemTypeTag: /[（(]([^）)]*?题)[）)]/g,
    confirmBtnText: /^(继续观看|继续学习|继续播放|继续|确定|确认|我知道了|知道了|好的)([\s(（:：].*)?$/,
    rejectBtnText: /取消|关闭|退出|返回|放弃|离开|不再|跳过/,
    disabledClass: /disabled|disallow|forbid/i,
    prevPageText: /^(完成|已阅|确定|我已完成|阅读完成|已阅读)$/
  };

  const SEL = {
    // ---------- 课程目录 ----------
    catalogNode: '.posCatalog_select',
    catalogChapterClass: 'firstLayer',
    catalogLabel: '.posCatalog_sbar',
    catalogName: '.posCatalog_name',
    catalogTitle: '.posCatalog_title',
    catalogDone: '.icon_Completed',
    catalogNodeById: (sectionId) => `.posCatalog_select[id="cur${sectionId}"]`,
    catalogIdPrefix: 'cur',

    // ---------- 卡片（tab）/ 顶层 iframe ----------
    cardsIframeId: 'iframe',
    cardTabs: '#prev_tab .prev_ul > li',
    cardActiveClass: 'active',
    cardText: '.spanText',
    cardTextFallbacks: ['.tab-title', 'a', 'span'],

    // ---------- 任务点 ----------
    attach: '.ans-attach-ct',
    jobIcon: '.ans-job-icon',
    jobFinished: '.ans-job-finished',
    jobFinishedClass: 'ans-job-finished',
    jobIdAttr: 'jobid',
    objectIdAttr: 'objectid',
    iframe: 'iframe',
    anyIframeNotBlank: 'iframe',

    // ---------- 视频 ----------
    videoEl: 'video#video',
    videoElFallback: 'video',
    videoPlayerGlobal: 'videojs',
    videoPlayerId: 'video',
    videoSource: 'source',

    // ---------- 文档 ----------
    scrollCandidates: 'div, section, article, main, ul, ol',
    readerContainers: [
      '#viewerContainer', '#viewer', '.pdfViewer', '.pdf-viewer',
      '#pdfContainer', '.scroll-container', '.reader-container',
      '.swiper-container', '.swiper-wrapper', '.swiper-slide'
    ],
    nextPageButtons: [
      '#nextPage', '#next', '.nextPage', '.next-page', '.page-next',
      '[class*="nextPage"]', '[class*="next_page"]', '[class*="next-page"]',
      '[aria-label="下一页"]', '.toolbar .next', '.pdf-toolbar .next', '.turnpage .next'
    ],
    docDoneButtons: 'button, .btn, a',

    // ---------- 遮挡弹窗 ----------
    // 「.layui-layer 是超星通用弹窗类名」—— 类型判定只靠按钮文本，见 RE.confirmBtnText
    blockers: [
      '.ans-job-limit-tip', '.mask-tip', '.popup-tip',
      '.layui-layer:not(.layui-layer-hide)', '.ans-job-limit'
    ],
    blockerNeedUser: ['.ans-job-limit-tip', '.ans-job-limit'],
    blockerButtons: [
      '.layui-layer-btn a', '.layui-layer-btn0', '.layui-layer-btn1',
      'button', 'a', 'input[type="button"]', 'input[type="submit"]',
      'span[class*="btn"]', 'div[class*="btn"]'
    ],

    // ---------- 答题 ----------
    quizRoot: '.singleQuesId',
    quizRootAlt: '.questionLi',
    quizRootAltPattern: '[id^="question"][class*="Ques"]',
    quizRootAny: '.singleQuesId, .questionLi, .TiMu',
    quizRootForCount: '.singleQuesId, .stem_answer, .questionLi',
    quizStem: '.mark_name, .Zy_TItle, .newZy_TItle, .colorDeep.workTextWrap, .workTextWrap',
    quizParagraph: 'p',
    quizOption: '.answerBg',
    quizOptionLetter: '.num_option, span[data]',
    quizOptionLetterOnly: '.num_option',
    quizOptionText: '.answer_p',
    quizSelectedClass: 'check_answer',
    quizSelected: '.check_answer',
    quizMultiHint: '.num_option_dx, .checkbox, input[type="checkbox"]',
    quizEditor: '.edui-editor-iframeholder, .edui-editor, .edui-body-container',
    quizEditorHolder: '.edui-editor-iframeholder, .edui-editor',
    quizTextInput: 'textarea, input[type="text"]',
    quizSubmit: '.completeBtn',

    // ---------- 验证码（content 侧探测 / 填写） ----------
    captchaInput: [
      'input#ucode', 'input[name="ucode"]', 'input[name="code"]',
      'input[name="verifyCode"]', 'input[placeholder*="验证码"]',
      'input[placeholder*="字符"]', 'input[placeholder*="请输"]'
    ],
    captchaInputStrict: [
      'input#ucode', 'input[name="ucode"]', 'input[name="verifyCode"]',
      'input[name="code"]', 'input[placeholder*="验证码"]',
      'input[placeholder*="字符"]'
    ],
    captchaImage: [
      'img#verifyImg', 'img#ucode_img', 'img#captchaImg',
      'img[src*="verify"]', 'img[src*="validate"]',
      'img[src*="captcha"]', 'img[src*="antispider"]',
      'form img', '.verify img', '.captcha img'
    ],
    captchaContainer: [
      '.ans-job-verify', '#verifyImg', '.face-verify',
      '.verifyBox', '.check-code', '[class*="verify-box"]',
      '[class*="captcha-box"]'
    ],
    captchaSubmitBtn: ['input.submit', 'button.submit'],
    captchaSubmitBtnWide: ['input.submit', 'button.submit', '.submit', 'button[type="submit"]'],
    captchaInputWide: [
      'input#ucode', 'input[name="ucode"]', 'input[name="verifyCode"]',
      'input[name="code"]', 'input[placeholder*="验证码"]',
      'input[placeholder*="字符"]', 'input[placeholder*="请输"]',
      'input[type="text"]'
    ],
    captchaExcludeIds: ['searchChapterListByName', 'searchChapter', 'chapterSearch'],
    zoomCloseButtons: [
      '.layui-layer-close', '.layui-layer-close1', '.layui-layer-btn-close'
    ],

    // ---------- 隐藏域 / 其它 ----------
    curChapterIdInput: 'curChapterId',
    searchInputId: 'searchChapterListByName',
    fontSizeTempKey: 'fontSizeTemp',
  };

  // ============================================================
  // 选择器健康检查
  // 超星改版后，与其让用户看到「没反应」，不如明确告知「页面结构可能已更新」。
  // ============================================================
  const CRITICAL = [
    ['catalogNode', SEL.catalogNode],
    ['catalogDone', SEL.catalogDone],
    ['cardTabs', SEL.cardTabs],
    ['attach', SEL.attach],
    ['jobIcon', SEL.jobIcon],
    ['jobFinished', SEL.jobFinished],
  ];

  function healthCheck() {
    const missing = [];
    for (const [key, sel] of CRITICAL) {
      try {
        if (!document.querySelector(sel)) missing.push(key);
      } catch (_) { missing.push(key); }
    }
    return { ok: missing.length === 0, missing, checked: CRITICAL.length };
  }

  CXH.SEL = SEL;
  CXH.SEL.RE = RE;
  CXH.SEL.healthCheck = healthCheck;
  CXH.SEL.CRITICAL = CRITICAL;

  console.log('[CXH] selectors module loaded');
})();
