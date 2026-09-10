(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const dom = CXH.dom;
  const utils = CXH.utils;

  let stopped = false;
  let currentVideoEl = null;

  function applyRate(v, pl, rate) {
    try {
      if (pl && typeof pl.playbackRate === 'function' && pl.playbackRate() !== rate) pl.playbackRate(rate);
      if (v.playbackRate !== rate) v.playbackRate = rate;
    } catch (_) {}
  }

  function waitMetadata(v, timeoutMs) {
    return new Promise(resolve => {
      if (v.duration && !isNaN(v.duration) && v.duration > 0 && v.readyState >= 1) return resolve(true);
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
      const onMeta = () => { if (v.duration && !isNaN(v.duration) && v.duration > 0) finish(true); };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const poller = setInterval(() => {
        if (v.duration && !isNaN(v.duration) && v.duration > 0) finish(true);
        if (v.error) finish(false);
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

  async function smartPreload(v, pl) {
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
      utils.log('  [preload] NO_SOURCE，立即重置 src');
      await resetSrc(v, pl);
    } else if (ns === 0 || ns === 1) {
      try {
        if (pl && typeof pl.load === 'function') pl.load();
        else v.load();
      } catch (_) {}
    } else if (ns === 2) {
      utils.log('  [preload] 正在加载，等待');
    }

    const ok = await waitMetadata(v, 20000);
    if (ok) {
      utils.log(`  [preload] 成功，duration=${v.duration?.toFixed(1)}s`);
      return true;
    }

    utils.log('  [preload] 20s 未就绪，重置 src 兜底');
    await resetSrc(v, pl);
    const ok2 = await waitMetadata(v, 15000);
    if (ok2) {
      utils.log(`  [preload] 兜底成功，duration=${v.duration?.toFixed(1)}s`);
      return true;
    }

    utils.log('  [preload] 失败', 'err');
    return false;
  }

  function detectBlockers() {
    const doc = dom.getCardsDoc();
    if (!doc) return null;
    const patterns = [
      '.ans-job-limit-tip',
      '.mask-tip',
      '.popup-tip',
      '.layui-layer:not(.layui-layer-hide)',
      '.ans-job-limit'
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

  // ★ 带 autoMute 参数的播放
  async function safePlay(v, autoMute) {
    const originalMuted = v.muted;

    // 自动静音模式：直接静音播放，不走回退
    if (autoMute) {
      try {
        v.muted = true;
        await v.play();
        return { ok: true, muted: true };
      } catch (e) {
        return { ok: false, error: '静音播放失败: ' + (e.message || String(e)) };
      }
    }

    // 非静音模式：先有声，失败回退静音
    try {
      await v.play();
      if (!v.paused) {
        return { ok: true, muted: v.muted };
      }
    } catch (e) {
      const name = e && e.name;
      if (name !== 'NotAllowedError') {
        return { ok: false, error: e.message || String(e) };
      }
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
            if (v.paused) {
              v.muted = true;
              v.play().catch(() => {});
            }
          } catch (_) {
            v.muted = true;
            v.play().catch(() => {});
          }
        }, 500);
      }
      return { ok: true, muted: true };
    } catch (e2) {
      v.muted = originalMuted;
      return { ok: false, error: 'play 失败（含静音回退）: ' + (e2.message || String(e2)) };
    }
  }

  const player = {
    setStopped(v) { stopped = v; },
    isStopped() { return stopped; },
    getCurrentVideo() { return currentVideoEl; },

    async playJob(videoIframe, rate, autoMute) {
      const v = dom.getVideoEl(videoIframe);
      if (!v) return { ok: false, error: 'no video element' };
      const pl = dom.getVideoPlayer(videoIframe);

      if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
        return { ok: true, alreadyDone: true, duration: v.duration, currentTime: v.currentTime };
      }

      const loaded = await smartPreload(v, pl);

      const playRes = await safePlay(v, autoMute === true);
      if (!playRes.ok) {
        return { ok: false, error: playRes.error };
      }

      let ready = loaded && v.duration && !isNaN(v.duration) && v.duration > 0;
      if (!ready) {
        ready = await waitMetadata(v, 15000);
      }

      if (!ready || !v.duration || isNaN(v.duration) || v.duration === 0) {
        return {
          ok: false,
          error: `metadata timeout (readyState=${v.readyState}, networkState=${v.networkState}, src=${(v.currentSrc||v.src||'').slice(0,50)})`
        };
      }

      applyRate(v, pl, rate);
      if (!v.__cxhRateHooked) {
        v.__cxhRateHooked = true;
        v.addEventListener('ratechange', () => setTimeout(() => applyRate(v, pl, rate), 0));
        setInterval(() => { if (!v.paused && v.playbackRate !== rate) applyRate(v, pl, rate); }, 1000);
      }

      if (v.paused) {
        const resume = await safePlay(v, autoMute === true);
        if (!resume.ok) return { ok: false, error: 'resume play failed: ' + resume.error };
        applyRate(v, pl, rate);
      }

      currentVideoEl = v;
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

        const poller = setInterval(() => {
          if (stopped) {
            try { v.pause(); } catch (_) {}
            finish({ ok: false, error: 'stopped' });
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
            // 恢复播放时保持静音状态，不改变用户设置
            v.play().catch(() => {});
          }
        }, 5000);

        const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
      });
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || stopped) return;
    if (currentVideoEl && !currentVideoEl.ended && currentVideoEl.paused) {
      currentVideoEl.play().catch(() => {});
    }
  });

  CXH.player = player;
})();