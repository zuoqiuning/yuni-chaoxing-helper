(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) { console.error('[CXH] modules not loaded'); return; }
  if (window.__CXH_MAIN_LOADED) return;
  window.__CXH_MAIN_LOADED = true;

  console.log('[CXH] main loaded at', location.href);

  function getCurrentSectionId() {
    const inp = document.getElementById('curChapterId');
    if (inp && inp.value) return inp.value;
    try { return new URL(location.href).searchParams.get('chapterId'); }
    catch (_) { return null; }
  }
  function getIframeKnowledgeId() {
    const ifr = document.getElementById('iframe');
    if (!ifr || !ifr.src) return null;
    try { const m = ifr.src.match(/knowledgeid=(\d+)/); return m ? m[1] : null; }
    catch (_) { return null; }
  }
  function findCatalogNode(sectionId) {
    return document.querySelector(`.posCatalog_select[id="cur${sectionId}"]`);
  }
  function waitFor(cond, timeoutMs) {
    return new Promise(resolve => {
      const start = Date.now();
      const t = setInterval(() => {
        if (cond()) { clearInterval(t); resolve(true); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); resolve(false); }
      }, 200);
    });
  }
  function isOnSection(sectionId) {
    if (getCurrentSectionId() === sectionId) return true;
    if (getIframeKnowledgeId() === sectionId) return true;
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('chapterId') === sectionId) return true;
    } catch (_) {}
    return false;
  }
  function doReload(sectionId) {
    setTimeout(() => {
      const url = new URL(location.href);
      url.searchParams.set('chapterId', sectionId);
      location.href = url.toString();
    }, 120);
  }
  async function smartJump(sectionId) {
    if (isOnSection(sectionId)) return { ok: true, method: 'already' };
    const node = findCatalogNode(sectionId);
    if (!node) {
      console.log('[CXH] jump: 找不到目录节点，reload');
      doReload(sectionId);
      return { ok: true, method: 'reload-no-node' };
    }
    const targets = [
      node, node.querySelector('.posCatalog_name'),
      node.querySelector('.posCatalog_title'), node.querySelector('.posCatalog_sbar')
    ].filter(Boolean);

    window.__cxhInternalClick = true;
    try {
      for (const t of targets) {
        try {
          t.click();
          await new Promise(r => setTimeout(r, 200));
          if (isOnSection(sectionId)) {
            console.log('[CXH] jump: SPA 成功');
            return { ok: true, method: 'spa' };
          }
        } catch (e) {}
      }
    } finally {
      window.__cxhInternalClick = false;
    }

    const ok = await waitFor(() => isOnSection(sectionId), 8000);
    if (ok) {
      console.log('[CXH] jump: SPA 成功（延迟）');
      return { ok: true, method: 'spa-late' };
    }
    console.log('[CXH] jump: SPA 未生效，reload');
    doReload(sectionId);
    return { ok: true, method: 'reload' };
  }

  function isQuizPage() {
    if (CXH.quiz && typeof CXH.quiz.isQuizPage === 'function') {
      return CXH.quiz.isQuizPage();
    }
    if (/\/work\/dowork/.test(location.href)) return true;
    if (document.querySelector('.singleQuesId, .stem_answer, .questionLi')) return true;
    return false;
  }

  function getAllFrames() {
    const frames = [{ doc: document, win: window, depth: 0 }];
    const walk = (rootDoc, rootWin, depth) => {
      if (depth > 4) return;
      let iframes = [];
      try { iframes = rootDoc.querySelectorAll('iframe'); } catch (_) { return; }
      for (const ifr of iframes) {
        try {
          const d = ifr.contentDocument;
          const w = ifr.contentWindow;
          if (d && w && d.body) {
            frames.push({ doc: d, win: w, depth: depth + 1 });
            walk(d, w, depth + 1);
          }
        } catch (_) {}
      }
    };
    walk(document, window, 1);
    return frames;
  }

  function queryInAllFrames(selectors, opts = {}) {
    const excludeIds = opts.excludeIds || [];
    const frames = getAllFrames();
    const sorted = frames.slice().sort((a, b) => b.depth - a.depth);

    for (const f of sorted) {
      for (const sel of selectors) {
        try {
          const list = f.doc.querySelectorAll(sel);
          for (const el of list) {
            if (el.offsetParent === null) continue;
            if (el.id && excludeIds.includes(el.id)) continue;
            const cls = el.className || '';
            if (typeof cls === 'string' && /search/i.test(cls)) continue;
            return { el, doc: f.doc, win: f.win, depth: f.depth };
          }
        } catch (_) {}
      }
    }
    return null;
  }

  function closeZoomLayer() {
    let closed = 0;
    const frames = getAllFrames();

    for (const f of frames) {
      const w = f.win;
      try {
        if (typeof w.closeChapterVerificationCode === 'function') {
          try {
            w.closeChapterVerificationCode();
            closed++;
            console.log('[CXH] 调用 closeChapterVerificationCode');
          } catch (_) {}
        }
      } catch (_) {}
    }

    for (const f of frames) {
      try {
        const layuiClose = f.doc.querySelectorAll('.layui-layer-close, .layui-layer-close1, .layui-layer-btn-close');
        for (const el of layuiClose) {
          if (el.offsetParent === null) continue;
          try { el.click(); closed++; } catch (_) {}
        }
      } catch (_) {}
    }

    console.log(`[CXH] 关闭放大层: closed=${closed}`);
    return { ok: true, closed };
  }

  function checkCaptchaExists() {
    const input = queryInAllFrames([
      'input#ucode', 'input[name="ucode"]', 'input[name="verifyCode"]',
      'input[name="code"]', 'input[placeholder*="验证码"]',
      'input[placeholder*="字符"]'
    ], { excludeIds: ['searchChapterListByName'] });
    if (input) return { exists: true, type: 'input' };

    const frames = getAllFrames();
    for (const f of frames) {
      try {
        const text = (f.doc.body && f.doc.body.textContent) || '';
        if (/9010|操作异常|请输入图片中的验证码/.test(text.slice(0, 3000))) {
          return { exists: true, type: 'text' };
        }
      } catch (_) {}
    }

    const submitBtn = queryInAllFrames(['input.submit', 'button.submit']);
    if (submitBtn) return { exists: true, type: 'submit-btn' };

    return { exists: false };
  }

  function getCaptchaInfo() {
    const imgSelectors = [
      'img#verifyImg', 'img#ucode_img', 'img#captchaImg',
      'img[src*="verify"]', 'img[src*="validate"]',
      'img[src*="captcha"]', 'img[src*="antispider"]',
      'form img', '.verify img', '.captcha img'
    ];
    const found = queryInAllFrames(imgSelectors);
    if (found) {
      const src = found.el.src || '';
      if (src.startsWith('data:image')) return { dataUrl: src, source: 'img-dataurl' };
      if (src) return { url: src, source: 'img-url' };
    }
    return null;
  }

  function fillCaptcha(code) {
    const inputSelectors = [
      'input#ucode',
      'input[name="ucode"]',
      'input[name="verifyCode"]',
      'input[name="code"]',
      'input[placeholder*="验证码"]',
      'input[placeholder*="字符"]',
      'input[placeholder*="请输"]',
      'input[type="text"]'
    ];
    const found = queryInAllFrames(inputSelectors, {
      excludeIds: ['searchChapterListByName', 'searchChapter', 'chapterSearch']
    });
    if (!found) return { ok: false, error: 'input not found (all frames)' };

    const input = found.el;
    const win = found.win;
    const doc = found.doc;

    console.log(`[CXH] 找到输入框: id="${input.id}", name="${input.name}", depth=${found.depth}`);

    try { input.focus(); } catch (_) {}

    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, code);
    } catch (e) {
      input.value = code;
    }

    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        input.dispatchEvent(new InputEvent('input', {
          data: code, inputType: 'insertText', bubbles: true, cancelable: true
        }));
      } catch (_) {}
      for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const codeNum = char.charCodeAt(0);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, keyCode: codeNum, which: codeNum, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { key: char, keyCode: codeNum, which: codeNum, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, keyCode: codeNum, which: codeNum, bubbles: true }));
      }
      try {
        if (typeof win.jQuery !== 'undefined') {
          win.jQuery(input).val(code).trigger('input').trigger('change').trigger('keyup');
        }
      } catch (_) {}
    } catch (_) {}

    console.log(`[CXH] 填入后 input.value = "${input.value}" (期望 "${code}")`);

    let submitted = false;
    let via = 'none';

    try {
      if (typeof win.chapterVerifyCode === 'function') {
        try {
          win.chapterVerifyCode();
          submitted = true;
          via = 'chapterVerifyCode';
        } catch (_) {}
      }
    } catch (_) {}

    if (!submitted) {
      const frames = getAllFrames();
      for (const f of frames) {
        try {
          if (typeof f.win.chapterVerifyCode === 'function') {
            try {
              f.win.chapterVerifyCode();
              submitted = true;
              via = 'chapterVerifyCode(depth=' + f.depth + ')';
              break;
            } catch (_) {}
          }
        } catch (_) {}
      }
    }

    if (!submitted) {
      const btnSelectors = [
        'input.submit', 'button.submit', '.submit',
        'button[type="submit"]', 'input[type="submit"]'
      ];
      for (const sel of btnSelectors) {
        try {
          const btns = doc.querySelectorAll(sel);
          for (const b of btns) {
            if (b.offsetParent === null) continue;
            const txt = (b.textContent || b.value || '').trim();
            if (/提交|确定|验证|submit/i.test(txt) || b.type === 'submit') {
              try { b.click(); } catch (_) {}
              submitted = true;
              via = 'btn:' + sel;
              break;
            }
          }
          if (submitted) break;
        } catch (_) {}
      }
    }

    if (!submitted) {
      try {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        submitted = true;
        via = 'enter';
      } catch (_) {}
    }

    return { ok: true, submitted, via, value: input.value, inputId: input.id || input.name || '?' };
  }

  async function checkAndNotifyQuiz() {
    if (!isQuizPage()) return;
    await new Promise(r => setTimeout(r, 2500));
    if (!isQuizPage()) return;
    const count = document.querySelectorAll('.singleQuesId, .stem_answer, .questionLi').length;
    try { chrome.runtime.sendMessage({ type: 'QUIZ_PAGE_DETECTED', count, url: location.href }); } catch (_) {}
  }
  setTimeout(checkAndNotifyQuiz, 500);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(checkAndNotifyQuiz, 500);
    }
  }, 1000);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handle(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  });

  async function handle(msg) {
    const { type, payload } = msg || {};
    switch (type) {
      case 'PING':
        return { ok: true, role: 'top', url: location.href };

      case 'IS_RUNNING':
        return {
          ok: true,
          running: (CXH.section && CXH.section.isRunning) ? CXH.section.isRunning() : false
        };

      case 'CLEAR_STATE':
        if (CXH.section && CXH.section.clearState) {
          CXH.section.clearState();
        }
        return { ok: true };

      // ★★★ 新增：刷新当前页面
      case 'RELOAD_PAGE':
        console.log('[CXH] 收到 RELOAD_PAGE 指令，1.5 秒后刷新');
        setTimeout(() => {
          try {
            location.reload();
          } catch (_) {}
        }, 1500);
        return { ok: true, willReload: true };

      case 'CLEAR_SECTION_PROGRESS': {
        const sid = payload?.sectionId;
        if (sid && CXH.sectionCore && CXH.sectionCore.clearProgress) {
          CXH.sectionCore.clearProgress(sid);
          console.log(`[CXH] 已清空节进度: ${sid}`);
          return { ok: true };
        }
        return { ok: false, error: 'invalid sectionId' };
      }

      case 'GET_CAPTCHA': {
        const info = getCaptchaInfo();
        if (!info) return { ok: false, error: 'no captcha found' };
        return { ok: true, ...info };
      }

      case 'CHECK_CAPTCHA_EXISTS':
        return { ok: true, ...checkCaptchaExists() };

      case 'CLOSE_ZOOM_LAYER':
        return closeZoomLayer();

      case 'FILL_CAPTCHA': {
        const code = payload?.code || '';
        if (!code) return { ok: false, error: 'empty code' };
        const res = fillCaptcha(code);
        console.log(`[CXH] FILL_CAPTCHA "${code}": ok=${res.ok}, submitted=${res.submitted}, via=${res.via}, value=${res.value}`);
        return res;
      }

      case 'SCAN_CATALOG':
        return { ok: true, catalog: CXH.catalog.scan() };

      case 'SCAN_SECTION': {
        const currentOnly = payload?.currentOnly === true;
        if (currentOnly && CXH.jobs.scanCurrent) {
          return { ok: true, jobs: await CXH.jobs.scanCurrent() };
        }
        return { ok: true, jobs: await CXH.jobs.scanAllCards() };
      }

      case 'PLAY_SECTION':
        return await CXH.section.processAllCards(payload?.rate || 2, payload || {});

      case 'RESUME_PLAYBACK':
        return await CXH.player.resumePlayback();

      case 'RESTART_SECTION':
        if (CXH.section.requestRestart) {
          CXH.section.requestRestart();
          return { ok: true, msg: 'restart signaled' };
        }
        return { ok: false, error: 'requestRestart not available' };

      case 'PAUSE':
        await CXH.player.pausePlayback();
        return { ok: true };

      case 'RESUME':
        return await CXH.player.resumeFromPause();

      case 'SET_LOCK':
        if (CXH.interceptor) {
          return CXH.interceptor.setLock(payload?.enabled === true);
        }
        return { ok: false, error: 'interceptor not loaded' };

      case 'STOP':
        CXH.player.setStopped(true);
        if (CXH.section && CXH.section.clearState) {
          try { CXH.section.clearState(); } catch (_) {}
        }
        return { ok: true };

      case 'GET_CURRENT_SECTION':
        return {
          ok: true,
          sectionId: getCurrentSectionId(),
          iframeKnowledgeId: getIframeKnowledgeId()
        };

      case 'JUMP_SECTION':
        return await smartJump(payload.sectionId);

      case 'IS_QUIZ_PAGE':
        return { ok: true, isQuiz: isQuizPage() };

      case 'SCAN_QUIZ': {
        if (!CXH.quiz) return { ok: false, error: 'quiz 模块未加载' };
        if (!CXH.quiz.isQuizPage()) return { ok: false, error: '当前页面不是答题页面' };
        const questions = CXH.quiz.extractQuestions();
        return { ok: true, questions };
      }

      case 'FILL_QUIZ': {
        if (!CXH.quiz) return { ok: false, error: 'quiz 模块未加载' };
        const questions = CXH.quiz.extractQuestions();
        const answers = payload?.answers || [];
        let filled = 0, failed = 0;
        console.log(`[CXH] FILL_QUIZ: 收到 ${answers.length} 个答案，页面 ${questions.length} 道题`);

        for (const ans of answers) {
          const idx = typeof ans.index === 'number' ? ans.index
          : (typeof ans.id === 'number' ? ans.id : parseInt(ans.id, 10));
          const q = questions.find(x => x.index === idx);

          if (!q) {
            console.warn(`[CXH] 找不到题目 index=${idx}`);
            failed++;
            continue;
          }
          try {
            const ok = await CXH.quiz.fillAnswerAsync(q, ans.answer);
            if (ok) filled++;
            else { console.warn(`[CXH] 填入失败: index=${idx}`); failed++; }
          } catch (e) {
            console.warn(`[CXH] 异常 index=${idx}:`, e);
            failed++;
          }
        }
        console.log(`[CXH] FILL_QUIZ 结束: filled=${filled} failed=${failed}`);
        return { ok: true, filled, failed, total: questions.length };
      }

      default:
        return { ok: false, error: 'unknown: ' + type };
    }
  }
})();