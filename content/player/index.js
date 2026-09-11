(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH || !CXH.P || !CXH.playerCore || !CXH.playerGuard) return;
  const P = CXH.P;
  const core = CXH.playerCore;
  const guard = CXH.playerGuard;
  const dom = CXH.dom;
  const utils = CXH.utils;

  async function resumePlayback() {
    if (!P.currentVideoEl) return { ok: false, error: '没有正在播放的视频' };
    const v = P.currentVideoEl;
    if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
      return { ok: true, alreadyDone: true };
    }
    if (v.error) {
      if (!P.currentVideoIframe) return { ok: false, error: 'video error 且无 iframe' };
      const r = await core.forceReloadIframe(P.currentVideoIframe);
      if (!r.ok) return { ok: false, error: '重载 iframe 失败: ' + r.error };
      P.currentVideoEl = r.videoEl;
      guard.hookPauseGuard(r.videoEl);
      const pl = dom.getVideoPlayer(P.currentVideoIframe);
      if (pl) core.applyRate(r.videoEl, pl, 2);
      try {
        r.videoEl.muted = true;
        await r.videoEl.play();
        return { ok: true, reloaded: true, playing: !r.videoEl.paused };
      } catch (e) {
        return { ok: false, error: '重载后播放失败: ' + e.message };
      }
    }
    if (v.paused) {
      if (!core.canSafelyRecover(v)) {
        return { ok: false, error: 'video 未就绪' };
      }
      const r = await core.safePlay(v, true);
      if (r.ok) return { ok: true, playing: !v.paused };
      return { ok: false, error: r.error };
    }
    return { ok: true, alreadyPlaying: true };
  }

  function interruptWait() {
    P.interrupted = true;
    if (P.currentVideoEl && !P.currentVideoEl.paused) {
      try { P.currentVideoEl.pause(); } catch (_) {}
    }
  }

  function clearInterrupted() { P.interrupted = false; }

  async function pausePlayback() {
    P.paused = true;
    if (P.currentVideoEl && !P.currentVideoEl.paused) {
      try { P.currentVideoEl.pause(); } catch (_) {}
    }
    return { ok: true };
  }

  async function resumeFromPause() {
    P.paused = false;
    if (!P.currentVideoEl) return { ok: false, error: '没有正在播放的视频' };
    const v = P.currentVideoEl;
    if (v.ended) return { ok: true, alreadyDone: true };
    if (!v.paused) return { ok: true, alreadyPlaying: true };
    if (v.error) return await resumePlayback();

    try { v.muted = true; } catch (_) {}
    v.play().catch(() => {});

    const start = Date.now();
    while (Date.now() - start < 800) {
      if (!v.paused) break;
      await utils.sleep(100);
    }
    return { ok: true, playing: !v.paused };
  }

  async function playJob(videoIframe, rate, autoMute) {
    P.interrupted = false;

    if (P.currentVideoEl && P.currentVideoEl.__cxhRateInterval) {
      clearInterval(P.currentVideoEl.__cxhRateInterval);
      P.currentVideoEl.__cxhRateInterval = null;
    }

    const v = dom.getVideoEl(videoIframe);
    if (!v) return { ok: false, error: 'no video element' };
    if (v.error) return { ok: false, error: 'video error: ' + (v.error.message || v.error.code) };
    const pl = dom.getVideoPlayer(videoIframe);

    if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
      return { ok: true, alreadyDone: true, duration: v.duration, currentTime: v.currentTime };
    }

    guard.hookPauseGuard(v);

    const loaded = await core.smartPreload(v, pl);
    if (v.error) return { ok: false, error: 'video error after preload: ' + (v.error.message || v.error.code) };

    const playRes = await core.safePlay(v, autoMute === true);
    if (!playRes.ok) return { ok: false, error: playRes.error };

    let ready = loaded && v.duration && !isNaN(v.duration) && v.duration > 0;
    if (!ready) ready = await core.waitMetadata(v, 15000);
    if (!ready || !v.duration || isNaN(v.duration) || v.duration === 0) {
      return { ok: false, error: `metadata timeout (rs=${v.readyState}, ns=${v.networkState})` };
    }

    core.applyRate(v, pl, rate);
    core.installRateHook(v, pl, rate);

    if (v.paused) {
      const resume = await core.safePlay(v, autoMute === true);
      if (!resume.ok) return { ok: false, error: 'resume play failed: ' + resume.error };
      core.applyRate(v, pl, rate);
    }
    P.currentVideoEl = v;
    P.currentVideoIframe = videoIframe;
    return { ok: true, duration: v.duration, currentTime: v.currentTime, muted: v.muted };
  }

  function waitEnded(videoIframe, timeoutMs) {
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
        if (P.interrupted) {
          P.interrupted = false;
          finish({ ok: false, error: 'interrupted' });
          return;
        }
        if (P.stopped) {
          try { v.pause(); } catch (_) {}
          finish({ ok: false, error: 'stopped' });
          return;
        }
        if (P.paused) { pausedCount = 0; return; }
        if (v.error) {
          finish({ ok: false, error: 'video error: ' + (v.error.message || v.error.code) });
          return;
        }
        if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
          finish({ ok: true, duration: v.duration, currentTime: v.currentTime });
          return;
        }
        const blocker = core.detectBlockers();
        if (blocker) {
          try { v.pause(); } catch (_) {}
          finish({ ok: false, error: 'blocked: ' + blocker.selector, blockerText: blocker.text });
          return;
        }
        if (v.paused && !v.ended && v.currentTime < v.duration - 1) {
          pausedCount++;
          if (pausedCount >= 3) {
            core.safePlay(v, true).catch(() => {});
            pausedCount = 0;
          }
        } else {
          pausedCount = 0;
        }
      }, 3000);
      const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
    });
  }

  CXH.player = {
    setStopped(v) { P.stopped = v; },
    isStopped() { return P.stopped; },
    isPaused() { return P.paused; },
    setPaused(v) { P.paused = v; },
    getCurrentVideo() { return P.currentVideoEl; },
    getCurrentVideoIframe() { return P.currentVideoIframe; },
    getExpectedSectionId() { return P.expectedSectionId; },
    setExpectedSectionId(id) { P.expectedSectionId = id; },
    forceReloadIframe: core.forceReloadIframe,
    resumePlayback,
    pausePlayback,
    resumeFromPause,
    interruptWait,
    clearInterrupted,
    playJob,
    waitEnded
  };

  console.log('[CXH] player module loaded');
})();