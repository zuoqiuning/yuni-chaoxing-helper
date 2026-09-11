(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const utils = CXH.utils;

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
        // ★ 跳过还没加载完的
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

  function heightSig(win, doc) {
    let h = 0;
    try {
      h += doc.documentElement ? doc.documentElement.scrollHeight : 0;
      if (doc.body) h += doc.body.scrollHeight || 0;
      const scrollers = doc.querySelectorAll('div[class*="scroll"], div[class*="viewer"], div[style*="overflow"]');
      for (const el of scrollers) {
        try { h += el.scrollHeight || 0; } catch (_) {}
      }
    } catch (_) {}
    return h;
  }

  async function scrollAllToBottom(outerIframe, maxRounds = 20) {
    // ★ 重试获取 outerDoc（最多 8 次）
    let outerDoc = null;
    let outerWin = null;
    for (let i = 0; i < 8; i++) {
      try {
        outerDoc = outerIframe.contentDocument;
        outerWin = outerIframe.contentWindow;
        if (outerDoc && outerWin && outerDoc.readyState === 'complete' && outerDoc.body) break;
      } catch (_) {}
      outerDoc = null;
      outerWin = null;
      await utils.sleep(600);
    }
    if (!outerDoc || !outerWin) {
      return { ok: false, error: 'no outer doc/win' };
    }

    let lastSig = -1;
    let stableCount = 0;
    let totalRolled = 0;

    for (let round = 0; round < maxRounds; round++) {
      if (CXH.player && CXH.player.isStopped && CXH.player.isStopped()) {
        return { ok: false, error: 'stopped' };
      }

      const frames = [{ doc: outerDoc, win: outerWin, depth: 0 }];
      frames.push(...collectFrames(outerDoc, outerWin));

      for (const f of frames) {
        try { totalRolled += scrollOnce(f.win, f.doc); } catch (_) {}
      }

      await utils.sleep(700);

      let sig = 0;
      for (const f of frames) {
        try { sig += heightSig(f.win, f.doc); } catch (_) {}
      }

      if (sig === lastSig) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
      }
      lastSig = sig;
    }

    return { ok: true, totalRolled, rounds: maxRounds };
  }

  async function tryCompleteTriggers(outerIframe) {
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

  CXH.doc = {
    async processDocument(attach, opts = {}) {
      if (!attach) return { ok: false, error: 'no attach' };

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

      // ★ 等 iframe 就绪（含 readyState 和 body）
      const ready = await utils.waitFor(() => {
        try {
          const d = ifr.contentDocument;
          return d && d.readyState === 'complete' && d.body;
        } catch (_) { return false; }
      }, { timeout: 15000 });

      if (!ready) {
        return { ok: false, error: 'iframe not ready (15s)' };
      }

      await utils.sleep(1500);

      const res = await scrollAllToBottom(ifr, 20);
      if (!res.ok) return res;

      await utils.sleep(800);

      await tryCompleteTriggers(ifr);
      await utils.sleep(500);

      await scrollAllToBottom(ifr, 6);

      return { ok: true };
    }
  };

  console.log('[CXH] doc module loaded');
})();