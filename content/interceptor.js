(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  const SEL = CXH.SEL;
  let lockEnabled = true;
  let lastNotifyTime = 0;
  let lastNotifySignature = '';   // ★ 用签名去重
  let detectCount = 0;
  let captchaStableCount = 0;     // ★ 连续命中次数

  let toastEl = null;
  let toastTimer = null;

  function showToast(msg, type) {
    if (toastEl) { toastEl.remove(); toastEl = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

    const el = document.createElement('div');
    el.textContent = msg;
    const bg = type === 'error' ? 'rgba(211, 47, 47, 0.95)' : 'rgba(25, 118, 210, 0.95)';
    el.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: ${bg}; color: #fff;
      padding: 10px 20px; border-radius: 6px; font-size: 13px;
      z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      pointer-events: none; opacity: 0; transition: opacity 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 80%; text-align: center;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    toastEl = el;
    toastTimer = setTimeout(() => {
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }
      if (toastEl === el) toastEl = null;
    }, 2500);
  }

  document.addEventListener('click', (e) => {
    if (!lockEnabled) return;
    if (window.__cxhInternalClick) return;

    const player = CXH.player;
    if (!player || !player.getExpectedSectionId) return;
    const expected = player.getExpectedSectionId();
    if (!expected) return;

    const t = e.target;
    if (!t || !t.closest) return;
    const node = t.closest(SEL.catalogNode);
    if (!node) return;

    const clickedId = (node.id || '').replace(SEL.RE.catalogIdPrefix, '');
    if (!clickedId) return;
    if (clickedId === expected) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    showToast('任务运行中，已阻止切换章节。如需切换请先停止任务', 'error');
  }, true);

  // ============================================================
  // iframe 检测
  // ============================================================
  function checkIframeCaptcha() {
    const walk = (doc, depth) => {
      if (depth > 4) return null;
      let iframes = [];
      try { iframes = doc.querySelectorAll(SEL.iframe); } catch (_) { return null; }
      for (const ifr of iframes) {
        const src = ifr.src || '';
        if (SEL.RE.captchaIframeSrc.test(src)) {
          return { src, depth };
        }
        try {
          const d = ifr.contentDocument;
          if (d && d.body) {
            const r = walk(d, depth + 1);
            if (r) return r;
          }
        } catch (_) {}
      }
      return null;
    };
    return walk(document, 1);
  }

  function findInFrames(selectors) {
    const walk = (doc, depth) => {
      if (depth > 4) return null;
      for (const sel of selectors) {
        try {
          const el = doc.querySelector(sel);
          if (el && el.offsetParent !== null) return el;
        } catch (_) {}
      }
      let iframes = [];
      try { iframes = doc.querySelectorAll(SEL.iframe); } catch (_) { return null; }
      for (const ifr of iframes) {
        try {
          const d = ifr.contentDocument;
          if (d && d.body) {
            const r = walk(d, depth + 1);
            if (r) return r;
          }
        } catch (_) {}
      }
      return null;
    };
    return walk(document, 1);
  }

  function findCaptchaInput() {
    return findInFrames(SEL.captchaInput);
  }

  function findCaptchaImage() {
    return findInFrames(SEL.captchaImage);
  }

  function checkCaptcha() {
    detectCount++;
    const verbose = detectCount % 10 === 1;

    // 检测 0：iframe src
    const iframeHit = checkIframeCaptcha();
    if (iframeHit) {
      console.log(`[CXH] 验证码检测: iframe 命中 depth=${iframeHit.depth} src=${iframeHit.src.slice(0, 60)}`);
      return {
        selector: 'iframe-antispider',
        text: `iframe 验证码页: ${iframeHit.src.slice(0, 60)}`,
        hasImg: true,
        hasInput: true,
        iframeSrc: iframeHit.src
      };
    }

    // 检测 1：具体容器
    const specific = SEL.captchaContainer;
    for (const sel of specific) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const st = getComputedStyle(el);
          if (st.display !== 'none' && st.visibility !== 'hidden') {
            console.log(`[CXH] 验证码检测: 命中 "${sel}"`);
            return {
              selector: sel,
              text: (el.textContent || '').slice(0, 100),
              hasImg: !!findCaptchaImage(),
              hasInput: !!findCaptchaInput()
            };
          }
        }
      } catch (_) {}
    }

    // 检测 2：输入框 + 图片
    const input = findCaptchaInput();
    const img = findCaptchaImage();
    if (input && img) {
      console.log(`[CXH] 验证码检测: 输入框 + 图片组合`);
      return {
        selector: 'input+img',
        text: '输入框 + 图片',
        hasImg: true,
        hasInput: true
      };
    }

    // 检测 3：文本关键字
    try {
      const bodyText = (document.body && document.body.textContent || '').slice(0, 5000);
      if (SEL.RE.captchaText.test(bodyText)) {
        console.log(`[CXH] 验证码检测: 文本关键字命中`);
        return {
          selector: 'text-9010',
          text: '检测到 9010 提示文本',
          hasImg: !!img,
          hasInput: !!input
        };
      }
    } catch (_) {}

    if (verbose) {
      const inputFound = !!findCaptchaInput();
      const imgFound = !!findCaptchaImage();
      console.log(`[CXH] 验证码扫描 #${detectCount}: input=${inputFound}, img=${imgFound}, 无命中`);
    }

    return null;
  }

  // ★★★ 生成签名（用验证码图片的 src 片段 + input 是否在）
  function getSignature(info) {
    if (!info) return '';
    // 用 selector + hasInput + hasImg 组合
    return `${info.selector}|${info.hasImg ? 1 : 0}|${info.hasInput ? 1 : 0}`;
  }

  function notifyCaptcha(info) {
    const now = Date.now();
    const sig = getSignature(info);

    // ★★★ 签名相同 → 10 秒内不重复通知
    if (sig === lastNotifySignature && now - lastNotifyTime < 10000) {
      return;
    }

    // ★ 全局节流：距离上次通知 < 3 秒，跳过
    if (now - lastNotifyTime < 3000 && lastNotifyTime !== 0) {
      return;
    }

    lastNotifyTime = now;
    lastNotifySignature = sig;

    console.log(`[CXH] ⚠ 验证码已确认，通知 sidepanel:`, info);
    try {
      chrome.runtime.sendMessage({
        type: 'ALERT',
        alertType: 'CAPTCHA',
        detail: info.text || info.selector || '',
        selector: info.selector || '',
        hasImg: !!info.hasImg,
        hasInput: !!info.hasInput,
        url: location.href
      });
    } catch (e) {
      console.warn('[CXH] ALERT 发送失败:', e);
    }
  }

  function runCheck() {
    const captcha = checkCaptcha();
    if (captcha) {
      notifyCaptcha(captcha);
      captchaStableCount++;
    } else {
      // ★ 验证码消失 → 重置签名（下次出现时会重新通知）
      if (captchaStableCount > 0) {
        console.log(`[CXH] 验证码已消失，重置检测状态`);
      }
      captchaStableCount = 0;
      lastNotifySignature = '';
    }
  }

  setInterval(runCheck, 2000);
  setTimeout(runCheck, 1500);

  console.log('[CXH] 验证码检测器已启动（2 秒间隔，支持 iframe）');

  CXH.interceptor = {
    setLock(v) {
      lockEnabled = !!v;
      console.log('[CXH] 防打扰锁:', lockEnabled ? '开' : '关');
      return { ok: true, lockEnabled };
    },
    isLockOn() { return lockEnabled; },
    showToast,
    _checkCaptcha: checkCaptcha
  };
})();