(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH || !CXH.P || !CXH.playerCore) return;
  const P = CXH.P;
  const core = CXH.playerCore;
  const utils = CXH.utils;

  function hookPauseGuard(v) {
    if (!v || v.__cxhPauseGuardHooked) return;
    v.__cxhPauseGuardHooked = true;

    let lastRecover = 0;

    v.addEventListener('pause', () => {
      if (P.stopped || P.paused || P.interrupted) return;
      if (v.ended) return;
      if (v.error) return;
      if (!v.duration || isNaN(v.duration) || v.duration <= 0) return;

      const now = Date.now();
      if (now - lastRecover < 1500) return;
      lastRecover = now;

      setTimeout(() => {
        if (!v.paused) return;
        if (P.stopped || P.paused || P.interrupted) return;
        if (v.ended || v.error) return;
        if (!v.isConnected) return;
        if (!core.canSafelyRecover(v)) return;
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

  // ★ 修复隐患 3：简化 visibilitychange，直接 safePlay 不走完整恢复
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || P.stopped || P.paused) return;
    const v = P.currentVideoEl;
    if (!v || !v.paused) return;
    if (!core.canSafelyRecover(v)) return;
    try { v.muted = true; } catch (_) {}
    v.play().catch(() => {});
  });

  let lastHeartbeat = Date.now();
  setInterval(() => {
    const now = Date.now();
    const gap = now - lastHeartbeat;
    lastHeartbeat = now;

    if (P.stopped || P.paused) return;
    if (!P.currentVideoEl) return;

    const isThrottled = gap > 8000;
    if (!isThrottled) {
      P.lastThrottleLogState = null;
      return;
    }

    if (!core.canSafelyRecover(P.currentVideoEl)) return;

    if (!P.lastThrottleLogState) {
      utils.log(`  [heartbeat] 检测到节流 gap=${(gap/1000).toFixed(1)}s，恢复播放`);
      P.lastThrottleLogState = 'T';
    }
    try { P.currentVideoEl.muted = true; } catch (_) {}
    P.currentVideoEl.play().catch(() => {});
  }, 3000);

  setInterval(() => {
    if (P.stopped || P.paused) { P.stuckTicks = 0; P.lastVideoTime = -1; return; }
    const v = P.currentVideoEl;
    if (!v) { P.stuckTicks = 0; P.lastVideoTime = -1; return; }
    if (v.ended || v.error) { P.stuckTicks = 0; P.lastVideoTime = -1; return; }
    if (!core.canSafelyRecover(v)) { P.stuckTicks = 0; P.lastVideoTime = v.currentTime; return; }

    if (P.lastVideoTime >= 0 && Math.abs(v.currentTime - P.lastVideoTime) < 0.3) {
      P.stuckTicks++;
      if (P.stuckTicks >= 3) {
        utils.log(`  [stuck] currentTime 停在 ${v.currentTime.toFixed(1)}s，强制恢复`);
        P.stuckTicks = 0;
        P.lastVideoTime = -1;
        try {
          v.muted = true;
          v.play().catch(() => {});
        } catch (_) {}
      }
    } else {
      P.stuckTicks = 0;
    }
    P.lastVideoTime = v.currentTime;
  }, 2000);

  CXH.playerGuard = { hookPauseGuard };
})();