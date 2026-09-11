(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const utils = CXH.utils;

  // 收集所有嵌套 iframe
  function collectFrames(rootDoc, rootWin, depth = 0, maxDepth = 4) {
    const list = [];
    if (depth > maxDepth) return list;
    let iframes = [];
    try { iframes = rootDoc.querySelectorAll('iframe'); } catch (_) { return list; }
    for (const f of iframes) {
      try {
        const d = f.contentDocument;
        const w = f.contentWindow;
        if (!d || !w) continue;
        if (d.readyState !== 'complete') continue;
        list.push({ el: f, doc: d, win: w, depth });
        if (d.body) {
          list.push(...collectFrames(d, w, depth + 1, maxDepth));
        }
      } catch (_) {}
    }
    return list;
  }

  function scrollOnce(win, doc) {
    let rolled = 0;
    try {
      const all = doc.querySelectorAll('div, section, article, main, ul, ol');
      for (const el of all) {
        try {
          const st = win.getComputedStyle(el);
          const oy = st.overflowY;
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 5) {
            const target = el.scrollHeight;
            if (el.scrollTop < target - 5) {
              el.scrollTop = target;
              el.dispatchEvent(new Event('scroll', { bubbles: true }));
              el.dispatchEvent(new Event('scroll', { bubbles: false }));
              rolled++;
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const target = Math.max(
        doc.body ? doc.body.scrollHeight : 0,
        doc.documentElement ? doc.documentElement.scrollHeight : 0
      );
      if ((win.scrollY || 0) < target - 5) {
        win.scrollTo(0, target);
        win.dispatchEvent(new Event('scroll'));
        rolled++;
      }
    } catch (_) {}

    try {
      const sels = [
        '#viewerContainer', '#viewer', '.pdfViewer', '.pdf-viewer',
        '#pdfContainer', '.scroll-container', '.reader-container',
        '.swiper-container', '.swiper-wrapper', '.swiper-slide'
      ];
      for (const sel of sels) {
        const el = doc.querySelector(sel);
        if (el && el.scrollHeight > el.clientHeight + 5) {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
          rolled++;
        }
      }
    } catch (_) {}

    try { win.dispatchEvent(new Event('wheel')); } catch (_) {}

    return rolled;
  }

  function scrollAllFrames(outerIframe) {
    let rolled = 0;
    try {
      const outerDoc = outerIframe.contentDocument;
      const outerWin = outerIframe.contentWindow;
      if (!outerDoc || !outerWin) return 0;
      rolled += scrollOnce(outerWin, outerDoc);
      const frames = collectFrames(outerDoc, outerWin);
      for (const f of frames) {
        try { rolled += scrollOnce(f.win, f.doc); } catch (_) {}
      }
    } catch (_) {}
    return rolled;
  }

  function computeSig(outerIframe) {
    let h = 0;
    try {
      const outerDoc = outerIframe.contentDocument;
      const outerWin = outerIframe.contentWindow;
      if (!outerDoc) return 0;
      h += outerDoc.documentElement ? outerDoc.documentElement.scrollHeight : 0;
      if (outerDoc.body) h += outerDoc.body.scrollHeight || 0;
      const frames = collectFrames(outerDoc, outerWin);
      for (const f of frames) {
        try {
          h += f.doc.documentElement ? f.doc.documentElement.scrollHeight : 0;
          if (f.doc.body) h += f.doc.body.scrollHeight || 0;
        } catch (_) {}
      }
    } catch (_) {}
    return h;
  }

  function tryCompleteTriggers(outerIframe) {
    try {
      const doc = outerIframe.contentDocument;
      if (!doc) return;
      const btns = doc.querySelectorAll('button, .btn, a');
      for (const b of btns) {
        const txt = (b.textContent || '').trim();
        if (/^(完成|已阅|确定|我已完成|阅读完成|已阅读)$/.test(txt)) {
          try { b.click(); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // ★★★ 检测超星是否已标记完成
  function checkAttachDone(attach) {
    if (!attach) return false;
    const icon = attach.querySelector('.ans-job-icon');
    const aria = icon?.getAttribute('aria-label') || '';
    if (aria === '任务点已完成') return true;
    if (attach.classList.contains('ans-job-finished')) return true;
    if (attach.querySelector('.ans-job-finished')) return true;
    return false;
  }

  CXH.doc = {
    async processDocument(attach, opts = {}) {
      if (!attach) return { ok: false, error: 'no attach' };

      // 1. 找 doc iframe
      let ifr = null;
      for (const f of attach.querySelectorAll('iframe')) {
        const src = f.src || '';
        if (/ananas\/modules\/(pdf|doc)/.test(src) || /pan-yz\.chaoxing\.com/.test(src)) {
          ifr = f;
          break;
        }
      }
      if (!ifr) ifr = attach.querySelector('iframe');
      if (!ifr) return { ok: false, error: 'no iframe' };

      // 2. 等 iframe 就绪（最多 6s，间隔 200ms）
      const ready = await utils.waitFor(() => {
        try {
          const d = ifr.contentDocument;
          return d && d.readyState === 'complete' && d.body;
        } catch (_) { return false; }
      }, { timeout: 6000, interval: 200 });
      if (!ready) return { ok: false, error: 'iframe not ready (6s)' };

      // 3. 短等待渲染
      await utils.sleep(400);

      // ★★★ 4. 快速滚动 3 轮（150ms 间隔）触发懒加载 + 检查是否完成
      for (let i = 0; i < 3; i++) {
        scrollAllFrames(ifr);
        await utils.sleep(150);
        if (checkAttachDone(attach)) {
          return { ok: true, fast: true, rounds: i + 1 };
        }
      }

      // ★★★ 5. 稳定滚动：最多 5 轮 × 300ms，连续 2 次签名不变就退出
      let lastSig = -1;
      let stable = 0;
      for (let i = 0; i < 5; i++) {
        if (CXH.player && CXH.player.isStopped && CXH.player.isStopped()) {
          return { ok: false, error: 'stopped' };
        }
        scrollAllFrames(ifr);
        await utils.sleep(300);
        if (checkAttachDone(attach)) {
          return { ok: true, fast: true, rounds: i + 4 };
        }
        const sig = computeSig(ifr);
        if (sig === lastSig && sig > 0) {
          stable++;
          if (stable >= 2) break;
        } else {
          stable = 0;
        }
        lastSig = sig;
      }

      // 6. 尝试点击"完成"按钮
      tryCompleteTriggers(ifr);
      await utils.sleep(250);

      // 7. 兜底再滚一遍
      scrollAllFrames(ifr);
      await utils.sleep(150);

      return { ok: true };
    }
  };

  console.log('[CXH] doc module loaded (fast)');
})();