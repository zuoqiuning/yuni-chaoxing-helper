(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH || !CXH.P || !CXH.playerCore || !CXH.playerGuard) return;
  const P = CXH.P;
  const core = CXH.playerCore;
  const guard = CXH.playerGuard;
  const dom = CXH.dom;
  const utils = CXH.utils;

  // 单个视频任务内最多自动处理几次弹窗。
  // 超星有时会连续弹两次同类型弹窗，所以要允许 >1；但必须封顶，避免无限循环。
  const MAX_BLOCKER_AUTOCLICKS = 5;

  async function playWithTimeout(v, timeoutMs = 2000) {
    try {
      v.muted = true;
    } catch (_) {}
    try {
      const ok = await Promise.race([
        v.play().then(() => true).catch(() => false),
        utils.sleep(timeoutMs).then(() => false)
      ]);
      return ok && !v.paused;
    } catch (_) {
      return false;
    }
  }

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
      const ok = await playWithTimeout(r.videoEl, 3000);
      return ok ? { ok: true, reloaded: true, playing: true } : { ok: false, error: '重载后播放失败' };
    }
    if (v.paused) {
      if (!core.canSafelyRecover(v)) {
        return { ok: false, error: 'video 未就绪' };
      }
      const ok = await playWithTimeout(v, 2000);
      return ok ? { ok: true, playing: true } : { ok: false, error: 'play 失败' };
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

    if (!P.currentVideoEl) {
      console.log('[CXH] resumeFromPause: 无 video，转 forceResume');
      return await forceResume();
    }

    const v = P.currentVideoEl;

    if (!v.isConnected) {
      console.log('[CXH] resumeFromPause: video 已卸载，转 forceResume');
      return await forceResume();
    }

    if (v.ended) return { ok: true, alreadyDone: true };
    if (!v.paused) return { ok: true, alreadyPlaying: true };

    const ok = await playWithTimeout(v, 2000);
    if (ok) return { ok: true, playing: true };

    console.log('[CXH] resumeFromPause: play 超时/失败，转 forceResume');
    return await forceResume();
  }

  async function forceResume() {
    console.log('[CXH] forceResume 开始');
    P.paused = false;

    const oldV = P.currentVideoEl;
    if (oldV) {
      console.log(`[CXH] forceResume: 丢弃旧 video (isConnected=${oldV.isConnected}, currentTime=${oldV.currentTime})`);
      try {
        if (oldV.__cxhRateInterval) {
          clearInterval(oldV.__cxhRateInterval);
          oldV.__cxhRateInterval = null;
        }
      } catch (_) {}
    }
    P.currentVideoEl = null;
    P.currentVideoIframe = null;

    const MAX_WAIT = 15000;
    const start = Date.now();
    let scanCount = 0;

    while (Date.now() - start < MAX_WAIT) {
      scanCount++;

      if (P.stopped) {
        console.log('[CXH] forceResume: 已停止');
        return { ok: false, error: 'stopped' };
      }

      // ★★★ 改动 2：检测 restartFlag
      if (CXH.S && CXH.S.restartFlag) {
        console.log('[CXH] forceResume: 检测到 restartFlag，退出');
        return { ok: false, error: 'restart' };
      }

      let attaches = [];
      try { attaches = dom.getAttachments(); } catch (_) {}

      if (scanCount <= 3 || attaches.length > 0) {
        console.log(`[CXH] forceResume: 第 ${scanCount} 次扫描, attach=${attaches.length}`);
      }

      for (let i = 0; i < attaches.length; i++) {
        const attach = attaches[i];
        const ifr = dom.getVideoIframe(attach);
        if (!ifr) continue;
        const v = dom.getVideoEl(ifr);
        if (!v) continue;
        if (v.error) {
          console.log(`[CXH] forceResume attach[${i}]: video.error=${v.error.code}`);
          continue;
        }
        if (v.ended) continue;
        if (!v.duration || v.duration <= 0 || isNaN(v.duration)) {
          continue;
        }
        if (v.readyState < 2) {
          continue;
        }

        console.log(`[CXH] forceResume: ✓ 找到 video[${i}], currentTime=${v.currentTime.toFixed(1)}/${v.duration.toFixed(1)}, paused=${v.paused}, readyState=${v.readyState}`);

        P.currentVideoEl = v;
        P.currentVideoIframe = ifr;

        try { guard.hookPauseGuard(v); } catch (_) {}
        const pl = dom.getVideoPlayer(ifr);
        if (pl) core.applyRate(v, pl, 2);

        const ok = await playWithTimeout(v, 3000);
        if (ok) {
          console.log('[CXH] forceResume: play 成功');
          return { ok: true, via: 'rescan', attachIdx: i, currentTime: v.currentTime };
        } else {
          console.log(`[CXH] forceResume: video[${i}] play 未成功`);
        }
      }

      await utils.sleep(500);
    }

    console.log('[CXH] forceResume: 超时');
    return { ok: false, error: 'timeout' };
  }

  async function playJob(videoIframe, rate, autoMute) {
    P.interrupted = false;
    P.blockerAutoClicks = 0;   // 每个视频任务重置弹窗自动处理计数

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
          // ① 可自动处理：仅当弹窗内按钮文本命中「继续类」白名单
          if (blocker.category === 'confirmable' && P.blockerAutoClicks < MAX_BLOCKER_AUTOCLICKS) {
            P.blockerAutoClicks++;
            const btnText = core.blockerButtonText(blocker);
            const clicked = core.clickBlockerButton(blocker);
            if (clicked) {
              utils.log(`  [blocker] ✓ 已自动处理（${P.blockerAutoClicks}/${MAX_BLOCKER_AUTOCLICKS}）${blocker.selector} → 点击「${btnText}」`);
              // 给平台反应时间后续播；不 finish，下一轮继续观察（连续弹窗会被再次捕获）
              setTimeout(() => {
                try { v.muted = true; v.play().catch(() => {}); } catch (_) {}
              }, 600);
              return;
            }
            utils.log(`  [blocker] 自动点击失败（按钮已失效），转人工`, 'err');
          } else if (blocker.category === 'confirmable') {
            utils.log(`  [blocker] 自动点击已达上限 ${MAX_BLOCKER_AUTOCLICKS} 次，转人工（疑似连续弹窗）`, 'err');
          }

          // ② 需人工：任务点上限 / 未知遮挡 / 点击失败 / 超上限
          try { v.pause(); } catch (_) {}
          const reason = blocker.category === 'need-user' ? '需人工决策' : '自动处理未成功';
          utils.log(`  [blocker] ✗ 转人工处理（${reason}）: ${blocker.selector}`, 'err');
          finish({
            ok: false,
            error: 'blocked: ' + blocker.selector,
            blockerText: blocker.text,
            category: blocker.category
          });
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
    forceResume,
    playJob,
    waitEnded
  };

  console.log('[CXH] player module loaded (v2.1)');
})();