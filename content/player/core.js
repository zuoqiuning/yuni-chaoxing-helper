(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const SEL = CXH.SEL;
  const dom = CXH.dom;
  const utils = CXH.utils;

  // ★ 共享状态
  CXH.P = {
    stopped: false,
    paused: false,
    interrupted: false,
    currentVideoEl: null,
    currentVideoIframe: null,
    expectedSectionId: null,
    lastThrottleLogState: null,
    lastVideoTime: -1,
    stuckTicks: 0,
    // ★ 单个视频任务内自动处理弹窗的次数（防连续弹窗导致无限循环）
    blockerAutoClicks: 0
  };

  const P = CXH.P;

  function applyRate(v, pl, rate) {
    try {
      if (pl && typeof pl.playbackRate === 'function' && pl.playbackRate() !== rate) pl.playbackRate(rate);
      if (v.playbackRate !== rate) v.playbackRate = rate;
    } catch (_) {}
  }

  function installRateHook(v, pl, rate) {
    if (!v || v.__cxhRateHooked) return;
    v.__cxhRateHooked = true;
    v.addEventListener('ratechange', () => setTimeout(() => applyRate(v, pl, rate), 0));
    const intervalId = setInterval(() => {
      if (!v.isConnected) { clearInterval(intervalId); return; }
      if (!v.paused && v.playbackRate !== rate) applyRate(v, pl, rate);
    }, 1000);
    v.__cxhRateInterval = intervalId;
  }

  function canSafelyRecover(v) {
    if (!v || !v.isConnected) return false;
    if (v.error) return false;
    if (v.ended) return false;
    if (!v.currentSrc && !v.src) return false;
    if (v.readyState < 2) return false;
    if (!v.duration || isNaN(v.duration) || v.duration <= 0) return false;
    return true;
  }

  function waitMetadata(v, timeoutMs) {
    return new Promise(resolve => {
      if (v.duration && !isNaN(v.duration) && v.duration > 0 && v.readyState >= 1 && !v.error) return resolve(true);
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        v.removeEventListener('loadedmetadata', onMeta);
        v.removeEventListener('durationchange', onMeta);
        v.removeEventListener('canplay', onMeta);
        clearInterval(poller);
        clearTimeout(timer);
        resolve(ok);
      };
      const onMeta = () => { if (v.duration && !isNaN(v.duration) && v.duration > 0 && !v.error) finish(true); };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const poller = setInterval(() => {
        if (v.error) { finish(false); return; }
        if (v.duration && !isNaN(v.duration) && v.duration > 0) finish(true);
      }, 300);
      v.addEventListener('loadedmetadata', onMeta);
      v.addEventListener('durationchange', onMeta);
      v.addEventListener('canplay', onMeta);
    });
  }

  async function resetSrc(v, pl) {
    try {
      const origSrc = v.currentSrc || v.src || '';
      const sources = Array.from(v.querySelectorAll(SEL.videoSource));
      const srcBackup = sources.map(s => s.src);
      sources.forEach(s => s.remove());
      v.removeAttribute('src');
      try { v.load(); } catch (_) {}
      await utils.sleep(300);
      if (origSrc) v.src = origSrc;
      srcBackup.forEach(s => {
        const el = document.createElement(SEL.videoSource);
        el.src = s;
        v.appendChild(el);
      });
      try { v.load(); } catch (_) {}
      if (pl && typeof pl.load === 'function') { try { pl.load(); } catch (_) {} }
      await utils.sleep(200);
    } catch (e) {
      utils.log('  [resetSrc] 异常: ' + e.message, 'err');
    }
  }

  async function forceReloadIframe(videoIframe, timeoutMs = 25000) {
    if (!videoIframe) return { ok: false, error: 'no iframe' };
    try {
      const origSrc = videoIframe.src;
      utils.log('  [reload] 重载 video iframe…');
      videoIframe.src = 'about:blank';
      await utils.sleep(600);
      videoIframe.src = origSrc;
    } catch (e) {
      return { ok: false, error: 'reload failed: ' + e.message };
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (P.stopped) return { ok: false, error: 'stopped' };
      try {
        const v = dom.getVideoEl(videoIframe);
        if (v && !v.error && v.readyState >= 1 && v.duration > 0) {
          utils.log(`  [reload] 新 video 元素就绪，duration=${v.duration.toFixed(1)}s`);
          return { ok: true, videoEl: v };
        }
      } catch (_) {}
      await utils.sleep(500);
    }
    return { ok: false, error: 'iframe reload timeout' };
  }

  async function smartPreload(v, pl) {
    if (v.error) {
      utils.log(`  [preload] video.error: ${v.error.message || v.error.code}`, 'err');
      return false;
    }
    if (v.duration && !isNaN(v.duration) && v.duration > 0 && v.readyState >= 1) return true;

    const hasSrc = await utils.waitFor(() => (v.currentSrc || v.src || '') !== '', {
      timeout: 10000, interval: 200
    });
    if (!hasSrc) {
      utils.log('  [preload] 10s 内 src 未出现', 'err');
      return false;
    }
    if (pl) {
      await utils.waitFor(() => {
        try { return typeof pl.readyState === 'function'; } catch (_) { return false; }
      }, { timeout: 3000, interval: 200 });
    }
    const ns = v.networkState;
    utils.log(`  [preload] readyState=${v.readyState}, networkState=${ns}`);
    if (ns === 3) {
      utils.log('  [preload] NO_SOURCE，重置 src');
      await resetSrc(v, pl);
    } else if (ns === 0 || ns === 1) {
      try {
        if (pl && typeof pl.load === 'function') pl.load();
        else v.load();
      } catch (_) {}
    }
    const ok = await waitMetadata(v, 20000);
    if (ok) {
      utils.log(`  [preload] 成功，duration=${v.duration?.toFixed(1)}s`);
      return true;
    }
    if (v.error) return false;
    utils.log('  [preload] 20s 未就绪，重置 src 兜底');
    await resetSrc(v, pl);
    const ok2 = await waitMetadata(v, 15000);
    if (ok2) {
      utils.log(`  [preload] 兜底成功，duration=${v.duration?.toFixed(1)}s`);
      return true;
    }
    return false;
  }

  // ============================================================
  // 遮挡层检测与三分类
  // 「`.layui-layer` 是超星的通用弹窗类名，不能只按类名判类型」——
  // 类型判定以【弹窗内按钮文本】为准。
  // ============================================================
  const BLOCKER_SELECTORS = SEL.blockers;

  // 这些选择器语义明确，代表「需要用户决策」，绝不自动点击
  const NEED_USER_SELECTORS = new Set(SEL.blockerNeedUser);

  // 允许自动点击的按钮文本（可带尾随括号/冒号说明，如「继续观看(还剩30秒)」）
  const CONFIRM_BTN_TEXT = SEL.RE.confirmBtnText;
  // 危险词黑名单：命中即放弃自动点击（防止把「取消并继续」之类的按钮点掉）
  const REJECT_BTN_TEXT = SEL.RE.rejectBtnText;

  const BLOCKER_BTN_SELECTORS = SEL.blockerButtons;

  // 在弹窗内寻找可安全自动点击的「继续类」按钮
  function findConfirmButton(root) {
    if (!root) return null;
    let btns;
    try { btns = root.querySelectorAll(BLOCKER_BTN_SELECTORS.join(',')); } catch (_) { return null; }
    for (const b of btns) {
      let txt = '';
      try { txt = (b.textContent || b.value || '').trim(); } catch (_) {}
      if (!txt) continue;
      if (REJECT_BTN_TEXT.test(txt)) continue;
      if (!CONFIRM_BTN_TEXT.test(txt)) continue;
      try {
        const win = b.ownerDocument && b.ownerDocument.defaultView;
        if (win && win.getComputedStyle) {
          const st = win.getComputedStyle(b);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
        }
      } catch (_) {}
      return b;
    }
    return null;
  }

  // 返回 { selector, text, category, button }
  //   category: 'confirmable' 可自动点击继续
  //           | 'need-user'   必须人工决策（任务点上限等）
  //           | 'unknown'     有其他遮挡但不认识，交回人工
  function detectBlockers() {
    const doc = dom.getCardsDoc();
    if (!doc) return null;
    for (const sel of BLOCKER_SELECTORS) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      let style = null;
      try {
        const win = el.ownerDocument && el.ownerDocument.defaultView;
        if (win && win.getComputedStyle) style = win.getComputedStyle(el);
      } catch (_) {}
      if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;

      const text = (el.textContent || '').slice(0, 100);

      if (NEED_USER_SELECTORS.has(sel)) {
        return { selector: sel, text, category: 'need-user', button: null };
      }
      const button = findConfirmButton(el);
      if (button) {
        return { selector: sel, text, category: 'confirmable', button };
      }
      return { selector: sel, text, category: 'unknown', button: null };
    }
    return null;
  }

  function clickBlockerButton(blocker) {
    if (!blocker || !blocker.button) return false;
    try { blocker.button.click(); return true; } catch (_) { return false; }
  }

  function blockerButtonText(blocker) {
    if (!blocker || !blocker.button) return '';
    try { return String(blocker.button.textContent || blocker.button.value || '').trim().slice(0, 20); } catch (_) { return ''; }
  }

  async function safePlay(v, autoMute) {
    if (v.error) return { ok: false, error: 'video error: ' + (v.error.message || v.error.code) };
    const originalMuted = v.muted;

    if (autoMute) {
      try {
        v.muted = true;
        await v.play();
        return { ok: true, muted: true };
      } catch (e) {
        return { ok: false, error: '静音播放失败: ' + (e.message || String(e)) };
      }
    }
    try {
      await v.play();
      if (!v.paused) return { ok: true, muted: v.muted };
    } catch (e) {
      if (e && e.name !== 'NotAllowedError') return { ok: false, error: e.message || String(e) };
      utils.log('  [play] 被自动播放策略拦截，尝试静音播放…', 'err');
    }
    try {
      v.muted = true;
      await v.play();
      utils.log('  [play] 静音播放成功');
      if (!originalMuted) {
        setTimeout(() => {
          try {
            v.muted = false;
            if (v.paused) { v.muted = true; v.play().catch(() => {}); }
          } catch (_) {
            v.muted = true;
            v.play().catch(() => {});
          }
        }, 500);
      }
      return { ok: true, muted: true };
    } catch (e2) {
      v.muted = originalMuted;
      return { ok: false, error: 'play 失败: ' + (e2.message || String(e2)) };
    }
  }

  CXH.playerCore = {
    applyRate, installRateHook, canSafelyRecover, waitMetadata,
    resetSrc, forceReloadIframe, smartPreload, detectBlockers, safePlay,
    clickBlockerButton, blockerButtonText
  };
})();