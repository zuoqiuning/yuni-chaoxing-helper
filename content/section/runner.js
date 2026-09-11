(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH || !CXH.P || !CXH.S) return;
  const P = CXH.P;
  const S = CXH.S;
  const dom = CXH.dom;
  const utils = CXH.utils;
  const finder = CXH.sectionFinder;

  async function waitIfPaused() {
    while (P.paused && !P.stopped) {
      await utils.sleep(1000);
    }
  }

  async function playJobWithRetry(videoIframe, rate, maxRetry, autoMute) {
    let lastErr = null;
    for (let i = 0; i <= maxRetry; i++) {
      if (P.stopped) return { ok: false, error: 'stopped' };
      if (S.restartFlag) return { ok: false, error: 'restart' };
      await waitIfPaused();

      const v = dom.getVideoEl(videoIframe);
      if (v && v.error) {
        utils.log(`  [retry] video.error，重载 iframe`);
        const reload = await CXH.player.forceReloadIframe(videoIframe);
        if (reload.ok) utils.log('  [retry] iframe 重载成功');
        else utils.log(`  [retry] iframe 重载失败: ${reload.error}`, 'err');
      }
      const res = await CXH.player.playJob(videoIframe, rate, autoMute);
      if (res.ok) return res;
      lastErr = res.error;
      utils.log(`  ↻ 播放重试 ${i + 1}/${maxRetry}: ${lastErr}`, 'err');
      if (i < maxRetry) await utils.sleep(3000);
    }
    return { ok: false, error: lastErr };
  }

  async function processOneJob(job, cardIdx, rate, maxRetry, autoMute, sectionId, expectedSectionId) {
    const attach = await finder.ensureJobReady(job, 15000);
    if (!attach) {
      utils.log(`  ✗ attach 未就绪 (15s)`, 'err');
      return false;
    }
    if (S.restartFlag) return false;

    const isOnExpected = (id) => {
      if (!id) return true;
      return dom.getCurrentSectionId() === id;
    };
    if (!isOnExpected(expectedSectionId)) return false;

    // ★★★ 加 jobIndex，panel 用 cardIndex + jobIndex 精确匹配
    utils.sendMsg({
      type: 'JOB_PLAYING',
      jobId: job.jobId,
      cardIndex: cardIdx,
      jobIndex: job.index,
      sectionId
    });

    if (job.type === 'document') {
      utils.log(`  📄 文档任务 (卡${cardIdx + 1})`);
      try {
        const docRes = await CXH.doc.processDocument(attach, { maxMs: 90000 });
        if (docRes.ok) {
          utils.log(`  ✓ 文档完成`);
          utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, jobIndex: job.index, sectionId });
          return true;
        } else {
          utils.log(`  ✗ 文档失败: ${docRes.error || 'unknown'}`, 'err');
          return false;
        }
      } catch (e) {
        utils.log(`  ✗ 文档异常: ${e.message}`, 'err');
        return false;
      }
    }

    if (job.type === 'video') {
      utils.log(`  ▶ 视频 (卡${cardIdx + 1})`);

      const ready = await utils.waitFor(() => {
        const ifr = dom.getVideoIframe(attach);
        if (!ifr) return null;
        const v = dom.getVideoEl(ifr);
        if (!v) return null;
        return { videoIframe: ifr };
      }, { timeout: 25000, interval: 500 });

      if (!ready) {
        utils.log(`  ✗ video 元素 25s 未就绪`, 'err');
        return false;
      }
      if (S.restartFlag) return false;
      if (!isOnExpected(expectedSectionId)) return false;

      const playRes = await playJobWithRetry(ready.videoIframe, rate, maxRetry, autoMute);
      if (!playRes.ok) {
        if (playRes.error === 'restart') return false;
        utils.log(`  ✗ 播放失败: ${playRes.error}`, 'err');
        return false;
      }

      if (playRes.alreadyDone) {
        utils.log(`  ✓ 已播完`);
        utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, jobIndex: job.index, sectionId });
        return true;
      }

      utils.log(`  ✓ 播放中 ${playRes.duration?.toFixed(0)}s${playRes.muted ? ' (静音)' : ''}`);

      const endRes = await finder.waitEndedWithSectionCheck(ready.videoIframe, 3600000, expectedSectionId);

      if (endRes.ok) {
        utils.log(`  ✓ 视频完成`);
        utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, jobIndex: job.index, sectionId });
        return true;
      } else if (endRes.error === 'interrupted') {
        utils.log(`  ⚠ 播放中被中断`);
      } else if (endRes.sectionChanged) {
        utils.log(`  ⚠ 节被切换`);
      } else if (endRes.error === 'stopped') {
        utils.log(`  ⏹ 已停止`, 'err');
      } else if (endRes.error?.startsWith('blocked')) {
        utils.log(`  ⚠ 弹窗阻挡`, 'err');
        utils.sendMsg({ type: 'BLOCKED', jobId: job.jobId, text: endRes.blockerText || endRes.error });
      } else {
        utils.log(`  ✗ 未完成: ${endRes.error}`, 'err');
      }
      return false;
    }

    return false;
  }

  CXH.sectionRunner = { processOneJob };
})();