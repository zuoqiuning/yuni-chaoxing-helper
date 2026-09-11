(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const dom = CXH.dom;
  const utils = CXH.utils;

  let stopped = false;
  let paused = false;
  let interrupted = false;
  let currentVideoEl = null;
  let currentVideoIframe = null;
  let expectedSectionId = null;
  let lastThrottleLogState = null;

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
      if (!v.isConnected) {
        clearInterval(intervalId);
        return;
      }
      if (!v.paused && v.playbackRate !== rate) applyRate(v, pl, rate);
    }, 1000);

    v.__cxhRateInterval = intervalId;
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
      const sources = Array.from(v.querySelectorAll('source'));
      const srcBackup = sources.map(s => s.src);
      sources.forEach(s => s.remove());
      v.removeAttribute('src');
      try { v.load(); } catch (_) {}
      await utils.sleep(300);
      if (origSrc) v.src = origSrc;
      srcBackup.forEach(s => {
        const el = document.createElement('source');
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
      if (stopped) return { ok: false, error: 'stopped' };
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

  function detectBlockers() {
    const doc = dom.getCardsDoc();
    if (!doc) return null;
    const patterns = [
      '.ans-job-limit-tip', '.mask-tip', '.popup-tip',
      '.layui-layer:not(.layui-layer-hide)', '.ans-job-limit'
    ];
    for (const sel of patterns) {
      const el = doc.querySelector(sel);
      if (el) {
        const style = el.ownerDocument.defaultView.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return { selector: sel, text: (el.textContent || '').slice(0, 100) };
        }
      }
    }
    return null;
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

  function canSafelyRecover(v) {
    if (!v || !v.isConnected) return false;
    if (v.error) return false;
    if (v.ended) return false;
    if (!v.currentSrc && !v.src) return false;
    if (v.readyState < 2) return false;
    if (!v.duration || isNaN(v.duration) || v.duration <= 0) return false;
    return true;
  }

  function hookPauseGuard(v) {
    if (!v || v.__cxhPauseGuardHooked) return;
    v.__cxhPauseGuardHooked = true;

    let lastRecover = 0;

    v.addEventListener('pause', () => {
      if (stopped || paused || interrupted) return;
      if (v.ended) return;
      if (v.error) return;
      if (!v.duration || isNaN(v.duration) || v.duration <= 0) return;

      const now = Date.now();
      if (now - lastRecover < 1500) return;
      lastRecover = now;

      setTimeout(() => {
        if (!v.paused) return;
        if (stopped || paused || interrupted) return;
        if (v.ended || v.error) return;
        if (!v.isConnected) return;
        if (!canSafelyRecover(v)) return;
        try {
          v.muted = true;
          v.play().catch(() => {});
        } catch (_) {}
      }, 400);
    });

    v.addEventListener('play', () => {
      lastRecover = 0;
    });

    console.log('[CXH] pause guard hooked (fast)');
  }

  async function resumePlayback() {
    if (!currentVideoEl) return { ok: false, error: '没有正在播放的视频' };
    const v = currentVideoEl;
    if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
      return { ok: true, alreadyDone: true };
    }
    if (v.error) {
      if (!currentVideoIframe) return { ok: false, error: 'video error 且无 iframe' };
      const r = await forceReloadIframe(currentVideoIframe);
      if (!r.ok) return { ok: false, error: '重载 iframe 失败: ' + r.error };
      currentVideoEl = r.videoEl;
      hookPauseGuard(r.videoEl);
      const pl = dom.getVideoPlayer(currentVideoIframe);
      if (pl) applyRate(r.videoEl, pl, 2);
      try {
        r.videoEl.muted = true;
        await r.videoEl.play();
        return { ok: true, reloaded: true, playing: !r.videoEl.paused };
      } catch (e) {
        return { ok: false, error: '重载后播放失败: ' + e.message };
      }
    }
    if (v.paused) {
      if (!canSafelyRecover(v)) {
        return { ok: false, error: 'video 未就绪' };
      }
      const r = await safePlay(v, true);
      if (r.ok) return { ok: true, playing: !v.paused };
      return { ok: false, error: r.error };
    }
    return { ok: true, alreadyPlaying: true };
  }

  function interruptWait() {
    interrupted = true;
    if (currentVideoEl && !currentVideoEl.paused) {
      try { currentVideoEl.pause(); } catch (_) {}
    }
  }

  function clearInterrupted() { interrupted = false; }

  async function pausePlayback() {
    paused = true;
    if (currentVideoEl && !currentVideoEl.paused) {
      try { currentVideoEl.pause(); } catch (_) {}
    }
    return { ok: true };
  }

  // ★★★ 修复：不再等待 v.play() resolve，最多等 800ms
  async function resumeFromPause() {
    paused = false;
    if (!currentVideoEl) return { ok: false, error: '没有正在播放的视频' };
    const v = currentVideoEl;
    if (v.ended) return { ok: true, alreadyDone: true };
    if (!v.paused) return { ok: true, alreadyPlaying: true };
    if (v.error) {
      // 有错，走完整恢复流程
      return await resumePlayback();
    }

    // ★ 立即触发 play（不等待）
    try { v.muted = true; } catch (_) {}
    v.play().catch(() => {});

    // ★ 最多等 800ms 确认状态变化
    const start = Date.now();
    while (Date.now() - start < 800) {
      if (!v.paused) break;
      await utils.sleep(100);
    }

    return { ok: true, playing: !v.paused };
  }

  const player = {
    setStopped(v) { stopped = v; },
    isStopped() { return stopped; },
    isPaused() { return paused; },
    setPaused(v) { paused = v; },
    getCurrentVideo() { return currentVideoEl; },
    getCurrentVideoIframe() { return currentVideoIframe; },
    getExpectedSectionId() { return expectedSectionId; },
    setExpectedSectionId(id) { expectedSectionId = id; },
    forceReloadIframe,
    resumePlayback,
    pausePlayback,
    resumeFromPause,
    interruptWait,
    clearInterrupted,

    async playJob(videoIframe, rate, autoMute) {
      interrupted = false;

      if (currentVideoEl && currentVideoEl.__cxhRateInterval) {
        clearInterval(currentVideoEl.__cxhRateInterval);
        currentVideoEl.__cxhRateInterval = null;
      }

      const v = dom.getVideoEl(videoIframe);
      if (!v) return { ok: false, error: 'no video element' };
      if (v.error) return { ok: false, error: 'video error: ' + (v.error.message || v.error.code) };
      const pl = dom.getVideoPlayer(videoIframe);

      if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
        return { ok: true, alreadyDone: true, duration: v.duration, currentTime: v.currentTime };
      }

      hookPauseGuard(v);

      const loaded = await smartPreload(v, pl);
      if (v.error) return { ok: false, error: 'video error after preload: ' + (v.error.message || v.error.code) };

      const playRes = await safePlay(v, autoMute === true);
      if (!playRes.ok) return { ok: false, error: playRes.error };

      let ready = loaded && v.duration && !isNaN(v.duration) && v.duration > 0;
      if (!ready) ready = await waitMetadata(v, 15000);
      if (!ready || !v.duration || isNaN(v.duration) || v.duration === 0) {
        return { ok: false, error: `metadata timeout (rs=${v.readyState}, ns=${v.networkState})` };
      }

      applyRate(v, pl, rate);
      installRateHook(v, pl, rate);

      if (v.paused) {
        const resume = await safePlay(v, autoMute === true);
        if (!resume.ok) return { ok: false, error: 'resume play failed: ' + resume.error };
        applyRate(v, pl, rate);
      }
      currentVideoEl = v;
      currentVideoIframe = videoIframe;
      return { ok: true, duration: v.duration, currentTime: v.currentTime, muted: v.muted };
    },

    waitEnded(videoIframe, timeoutMs) {
      const v = dom.getVideoEl(videoIframe);
      if (!v) return Promise.resolve({ ok: false, error: 'no video' });
      if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
        return Promise.resolve({ ok: true, alreadyDone: true });
      }

      return new Promise(resolve => {
        let done = false;
        const finish = (result) => {
          if (done) return;
          done = true;
          v.removeEventListener('ended', onEnded);
          v.removeEventListener('error', onError);
          clearInterval(poller);
          clearTimeout(timer);
          resolve(result);
        };
        const onEnded = () => finish({ ok: true, duration: v.duration, currentTime: v.currentTime });
        const onError = () => finish({ ok: false, error: 'video error: ' + (v.error?.message || v.error?.code) });
        v.addEventListener('ended', onEnded);
        v.addEventListener('error', onError);

        let pausedCount = 0;
        const poller = setInterval(() => {
          if (interrupted) {
            interrupted = false;
            finish({ ok: false, error: 'interrupted' });
            return;
          }
          if (stopped) {
            try { v.pause(); } catch (_) {}
            finish({ ok: false, error: 'stopped' });
            return;
          }
          if (paused) { pausedCount = 0; return; }
          if (v.error) {
            finish({ ok: false, error: 'video error: ' + (v.error.message || v.error.code) });
            return;
          }
          if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
            finish({ ok: true, duration: v.duration, currentTime: v.currentTime });
            return;
          }
          const blocker = detectBlockers();
          if (blocker) {
            try { v.pause(); } catch (_) {}
            finish({ ok: false, error: 'blocked: ' + blocker.selector, blockerText: blocker.text });
            return;
          }
          if (v.paused && !v.ended && v.currentTime < v.duration - 1) {
            pausedCount++;
            if (pausedCount >= 3) {
              safePlay(v, true).catch(() => {});
              pausedCount = 0;
            }
          } else {
            pausedCount = 0;
          }
        }, 3000);
        const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
      });
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || stopped || paused) return;
    if (!currentVideoEl) return;
    if (!currentVideoEl.paused) return;
    resumePlayback().catch(() => {});
  });

  let lastHeartbeat = Date.now();
  setInterval(() => {
    const now = Date.now();
    const gap = now - lastHeartbeat;
    lastHeartbeat = now;

    if (stopped || paused) return;
    if (!currentVideoEl) return;

    const isThrottled = gap > 8000;
    if (!isThrottled) {
      lastThrottleLogState = null;
      return;
    }

    if (!canSafelyRecover(currentVideoEl)) return;

    if (!lastThrottleLogState) {
      utils.log(`  [heartbeat] 检测到节流 gap=${(gap/1000).toFixed(1)}s，恢复播放`);
      lastThrottleLogState = 'T';
    }
    resumePlayback().catch(() => {});
  }, 3000);

  let lastVideoTime = -1;
  let stuckTicks = 0;
  setInterval(() => {
    if (stopped || paused) { stuckTicks = 0; lastVideoTime = -1; return; }
    const v = currentVideoEl;
    if (!v) { stuckTicks = 0; lastVideoTime = -1; return; }
    if (v.ended || v.error) { stuckTicks = 0; lastVideoTime = -1; return; }
    if (!canSafelyRecover(v)) { stuckTicks = 0; lastVideoTime = v.currentTime; return; }

    if (lastVideoTime >= 0 && Math.abs(v.currentTime - lastVideoTime) < 0.3) {
      stuckTicks++;
      if (stuckTicks >= 3) {
        utils.log(`  [stuck] currentTime 停在 ${v.currentTime.toFixed(1)}s，强制恢复`);
        stuckTicks = 0;
        lastVideoTime = -1;
        try {
          v.muted = true;
          v.play().catch(() => {});
        } catch (_) {}
      }
    } else {
      stuckTicks = 0;
    }
    lastVideoTime = v.currentTime;
  }, 2000);

  CXH.player = player;
})();