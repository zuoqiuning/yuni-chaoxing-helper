(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const SEL = CXH.SEL;
  const utils = CXH.utils;

  // 收集所有嵌套 iframe
  function collectFrames(rootDoc, rootWin, depth = 0, maxDepth = 4) {
    const list = [];
    if (depth > maxDepth) return list;
    let iframes = [];
    try { iframes = rootDoc.querySelectorAll(SEL.iframe); } catch (_) { return list; }
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

  // ============================================================
  // 可滚动容器缓存
  // 原先每轮都对全部 div/section/article/main/ul/ol 调 getComputedStyle，
  // 在复杂 PDF 页面上是重活。改为：每个文档首次全量扫描，之后复用。
  // ============================================================
  // 用普通 Map 而非 WeakMap：需要能「清空」以便每个文档任务重新扫描候选容器
  let containerCache = new Map();   // doc -> [Element]

  function collectScrollContainers(win, doc) {
    const els = [];
    try {
      const all = doc.querySelectorAll(SEL.scrollCandidates);
      for (const el of all) {
        try {
          const st = win.getComputedStyle(el);
          const oy = st.overflowY;
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 5) {
            els.push(el);
          }
        } catch (_) {}
      }
    } catch (_) {}
    return els;
  }

  function getScrollContainers(win, doc) {
    let els = containerCache.get(doc);
    if (!els) {
      els = collectScrollContainers(win, doc);
      containerCache.set(doc, els);
    }
    return els;
  }

  // 每个文档任务开始时调用，避免沿用上一次的结构（页面可能在任务之间被重新加载）
  function resetScrollCache() {
    containerCache = new Map();
  }

  // ============================================================
  // 阅读器翻页控件
  // 直接设 scrollTop 属于「假滚动」；分页型阅读器真正监听的是翻页控件。
  // ============================================================
  const NEXT_PAGE_SELECTORS = SEL.nextPageButtons;
  const MAX_PAGE_TURNS = 40;

  function advanceReader(outerIframe) {
    let clicked = 0;
    const docs = [];
    try {
      const outerDoc = outerIframe.contentDocument;
      const outerWin = outerIframe.contentWindow;
      if (outerDoc) docs.push(outerDoc);
      if (outerDoc && outerWin) {
        for (const f of collectFrames(outerDoc, outerWin)) docs.push(f.doc);
      }
    } catch (_) {}

    for (const d of docs) {
      if (!d) continue;
      for (const sel of NEXT_PAGE_SELECTORS) {
        let el = null;
        try { el = d.querySelector(sel); } catch (_) { continue; }
        if (!el) continue;

        // 禁用态不点（否则会白发一次日志，也会反复空点）
        const cls = String(el.className || '');
        if (SEL.RE.disabledClass.test(cls)) continue;
        if (el.getAttribute && el.getAttribute('disabled') !== null) continue;
        if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') continue;

        try { el.click(); clicked++; } catch (_) {}
        break;
      }
    }
    return clicked;
  }

  function scrollOnce(win, doc) {
    let rolled = 0;
    try {
      const candidates = getScrollContainers(win, doc);
      for (const el of candidates) {
        try {
          const target = el.scrollHeight;
          if (el.scrollTop < target - 5) {
            el.scrollTop = target;
            el.dispatchEvent(new Event('scroll', { bubbles: true }));
            el.dispatchEvent(new Event('scroll', { bubbles: false }));
            rolled++;
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
      const sels = SEL.readerContainers;
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
      const btns = doc.querySelectorAll(SEL.docDoneButtons);
      for (const b of btns) {
        const txt = (b.textContent || '').trim();
        if (SEL.RE.prevPageText.test(txt)) {
          try { b.click(); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // ★★★ 检测超星是否已标记完成
  function checkAttachDone(attach) {
    if (!attach) return false;
    const icon = attach.querySelector(SEL.jobIcon);
    const aria = icon?.getAttribute('aria-label') || '';
    if (aria === '任务点已完成') return true;
    if (attach.classList.contains(SEL.jobFinishedClass)) return true;
    if (attach.querySelector(SEL.jobFinished)) return true;
    return false;
  }

  CXH.doc = {
    async processDocument(attach, opts = {}) {
      if (!attach) return { ok: false, error: 'no attach' };

      // 1. 找 doc iframe
      let ifr = null;
      for (const f of attach.querySelectorAll(SEL.iframe)) {
        const src = f.src || '';
        if (SEL.RE.docIframe.test(src) || SEL.RE.docHost.test(src)) {
          ifr = f;
          break;
        }
      }
      if (!ifr) ifr = attach.querySelector(SEL.iframe);
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
      resetScrollCache();
      await utils.sleep(400);

      let pageTurns = 0;

      // 4. 先驱动阅读器自身的翻页控件（分页型 PDF 的唯一有效手段）
      for (let i = 0; i < 3; i++) {
        const turned = advanceReader(ifr);
        pageTurns += turned;
        scrollAllFrames(ifr);
        await utils.sleep(200);
        if (checkAttachDone(attach)) {
          return { ok: true, fast: true, rounds: i + 1, pageTurns };
        }
        if (!turned && i >= 1) break;   // 无翻页控件，不必在此空转
      }

      // 5. 稳定推进：最多 6 轮 × 350ms
      //    退出条件收紧为：签名连续 2 次不变「且」本轮既没翻页也没滚动（页面确实推不动了）
      let lastSig = -1;
      let stable = 0;
      for (let i = 0; i < 6; i++) {
        if (CXH.player && CXH.player.isStopped && CXH.player.isStopped()) {
          return { ok: false, error: 'stopped' };
        }
        let turned = 0;
        if (pageTurns < MAX_PAGE_TURNS) {
          turned = advanceReader(ifr);
          pageTurns += turned;
        }
        const rolled = scrollAllFrames(ifr);
        await utils.sleep(350);

        if (checkAttachDone(attach)) {
          return { ok: true, fast: true, rounds: i + 4, pageTurns };
        }

        const sig = computeSig(ifr);
        if (sig === lastSig && sig > 0 && !turned && !rolled) {
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

      if (pageTurns > 0) {
        console.log(`[CXH] 文档任务：共驱动翻页 ${pageTurns} 次`);
      }

      // ★ 返回前复核：滚动做完不等于平台已记账
      // 未检测到完成标记时如实返回失败，交由上层重试，避免"乐观成功"
      await utils.sleep(300);
      if (checkAttachDone(attach)) return { ok: true, confirmed: true, pageTurns };
      return { ok: false, error: 'not confirmed（滚动完成但未检测到完成标记）', pageTurns };
    }
  };

  console.log('[CXH] doc module loaded (fast)');
})();