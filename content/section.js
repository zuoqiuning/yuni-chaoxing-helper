(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const dom = CXH.dom;
  const jobs = CXH.jobs;
  const player = CXH.player;
  const utils = CXH.utils;

  let restartFlag = false;

  function requestRestart() {
    restartFlag = true;
    try { player.interruptWait(); } catch (_) {}
  }

  function isOnExpectedSection(expectedId) {
    if (!expectedId) return true;
    return dom.getCurrentSectionId() === expectedId;
  }

  async function waitIfPaused() {
    while (player.isPaused() && !player.isStopped()) {
      await utils.sleep(1000);
    }
  }

  async function playJobWithRetry(videoIframe, rate, maxRetry, autoMute) {
    let lastErr = null;
    for (let i = 0; i <= maxRetry; i++) {
      if (player.isStopped()) return { ok: false, error: 'stopped' };
      if (restartFlag) return { ok: false, error: 'restart' };
      await waitIfPaused();

      const v = dom.getVideoEl(videoIframe);
      if (v && v.error) {
        utils.log(`  [retry] video.error: ${v.error.message || v.error.code}，重载 iframe`);
        const reload = await player.forceReloadIframe(videoIframe);
        if (reload.ok) utils.log('  [retry] iframe 重载成功');
        else utils.log(`  [retry] iframe 重载失败: ${reload.error}`, 'err');
      }
      const res = await player.playJob(videoIframe, rate, autoMute);
      if (res.ok) return res;
      lastErr = res.error;
      utils.log(`  ↻ 播放重试 ${i + 1}/${maxRetry}: ${lastErr}`, 'err');
      if (i < maxRetry) await utils.sleep(3000);
    }
    return { ok: false, error: lastErr };
  }

  function findAttachByJobId(jobId, objectId) {
    const attaches = dom.getAttachments();
    if (jobId) {
      for (const a of attaches) {
        const jid = a.getAttribute('jobid') || a.querySelector('[jobid]')?.getAttribute('jobid') || '';
        if (jid === jobId) return a;
      }
    }
    if (objectId) {
      for (const a of attaches) {
        const oid = a.getAttribute('objectid') || a.querySelector('[objectid]')?.getAttribute('objectid') || '';
        if (oid === objectId) return a;
      }
    }
    return null;
  }

  function recheckAttachDone(attach) {
    const icon = attach.querySelector('.ans-job-icon');
    const aria = icon?.getAttribute('aria-label') || '';
    if (aria === '任务点已完成') return true;
    if (aria === '任务点未完成') return false;
    if (attach.classList.contains('ans-job-finished')) return true;
    if (attach.querySelector('.ans-job-finished')) return true;
    return false;
  }

  CXH.section = {
    requestRestart,

    async processAllCards(rate, options = {}) {
      const maxRetry = options.maxRetry || 3;
      const maxPasses = options.maxPasses || 2;
      const autoMute = options.autoMute === true;
      const expectedSectionId = options.expectedSectionId || dom.getCurrentSectionId();
      const sectionId = dom.getCurrentSectionId();
      const courseId = dom.getCurrentCourseId();

      restartFlag = false;
      player.setStopped(false);
      player.setPaused(false);
      player.setExpectedSectionId(expectedSectionId);  // ★

      utils.log(`开始处理当前节，倍速 ${rate}x，最多 ${maxPasses} 轮${autoMute ? '（自动静音）' : ''}`);

      if (!isOnExpectedSection(expectedSectionId)) {
        utils.log(`  ⚠ 进入本节时已被切换`, 'err');
        player.setExpectedSectionId(null);
        return { ok: false, total: 0, done: 0, stopped: player.isStopped(), sectionChanged: true };
      }

      let pass = 0;
      let restartCount = 0;
      const MAX_RESTART = 5;
      let lastResult = { total: 0, done: 0 };

      while (pass < maxPasses) {
        if (restartFlag) {
          restartFlag = false;
          restartCount++;
          if (restartCount > MAX_RESTART) {
            utils.log(`  ⚠ 重启次数超上限，忽略`, 'err');
          } else {
            utils.log(`  ↻ 收到重启信号，重新开始本节（第 ${restartCount} 次）`, 'ok');
            pass = 0;
            await utils.sleep(1000);
            continue;
          }
        }
        if (!isOnExpectedSection(expectedSectionId)) {
          utils.log(`  ⚠ 第 ${pass + 1} 轮开始前节被切换`, 'err');
          player.setExpectedSectionId(null);
          return { ok: false, total: lastResult.total, done: lastResult.done, stopped: player.isStopped(), sectionChanged: true };
        }
        if (player.isStopped()) break;

        utils.log(`\n--- 第 ${pass + 1}/${maxPasses} 轮：开始扫描 ---`);
        const allJobs = await jobs.scanAllCards({ rounds: pass === 0 ? 2 : 1 });
        const videoJobs = allJobs.filter(j => j.type === 'video');
        const unfinished = videoJobs.filter(j => !j.done);

        utils.log(`--- 第 ${pass + 1}/${maxPasses} 轮：视频任务点 ${videoJobs.length} 个，未完成 ${unfinished.length} 个 ---`);
        lastResult.total = videoJobs.length;
        lastResult.done = videoJobs.length - unfinished.length;

        if (unfinished.length === 0) {
          utils.log(`✓ 无未完成任务点`);
          break;
        }
        if (pass > 0) utils.log(`↻ 复查发现 ${unfinished.length} 个遗漏，继续处理`);

        const passResult = await this.runPass(unfinished, rate, maxRetry, sectionId, pass, autoMute, expectedSectionId);

        if (passResult.sectionChanged) {
          utils.log(`  ⚠ runPass 检测到节被切换`, 'err');
          player.setExpectedSectionId(null);
          return { ok: false, total: lastResult.total, done: lastResult.done, stopped: player.isStopped(), sectionChanged: true };
        }
        if (restartFlag) continue;
        if (player.isStopped()) break;
        if (passResult.doneCount === 0 && pass < maxPasses - 1) {
          utils.log(`本轮无进展，等待 6s 后复查…`);
          await utils.sleep(6000);
        }
        pass++;
      }

      if (!isOnExpectedSection(expectedSectionId)) {
        player.setExpectedSectionId(null);
        return { ok: false, total: lastResult.total, done: lastResult.done, stopped: player.isStopped(), sectionChanged: true };
      }

      if (!player.isStopped()) {
        const finalList = await jobs.scanAllCards({ rounds: 1 });
        const finalVideos = finalList.filter(j => j.type === 'video');
        const finalUnfinished = finalVideos.filter(j => !j.done).length;
        const finalDone = finalVideos.length - finalUnfinished;

        utils.log(`\n本节结束: ${finalDone}/${finalVideos.length}${player.isStopped() ? ' (已停止)' : ''}`);
        utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: finalVideos.length, done: finalDone, stopped: player.isStopped() });

        player.setExpectedSectionId(null);
        return { ok: true, total: finalVideos.length, done: finalDone, stopped: player.isStopped(), sectionChanged: false };
      }

      player.setExpectedSectionId(null);
      return { ok: true, total: lastResult.total, done: lastResult.done, stopped: true, sectionChanged: false };
    },

    async runPass(unfinished, rate, maxRetry, sectionId, passIndex, autoMute, expectedSectionId) {
      const tabs = dom.getCardTabs();
      let doneCount = 0;
      const byCard = {};
      unfinished.forEach(j => {
        if (!byCard[j.cardIndex]) byCard[j.cardIndex] = [];
        byCard[j.cardIndex].push(j);
      });

      for (const cardIdxStr of Object.keys(byCard)) {
        if (player.isStopped()) break;
        if (restartFlag) return { doneCount, sectionChanged: false };
        if (!isOnExpectedSection(expectedSectionId)) {
          utils.log(`  ⚠ 处理中被切节，中断本轮`);
          return { doneCount, sectionChanged: true };
        }
        const cardIdx = parseInt(cardIdxStr, 10);
        const jobsInCard = byCard[cardIdxStr];

        if (tabs[cardIdx] && !tabs[cardIdx].classList.contains('active')) {
          tabs[cardIdx].click();
          await utils.waitFor(() => dom.getAttachments().length > 0, { timeout: 5000 });
          await utils.sleep(1200);
        }

        for (const job of jobsInCard) {
          if (player.isStopped()) break;
          if (restartFlag) return { doneCount, sectionChanged: false };
          if (!isOnExpectedSection(expectedSectionId)) {
            utils.log(`  ⚠ job 处理前节被切换，中断`);
            return { doneCount, sectionChanged: true };
          }

          await waitIfPaused();

          let attach = findAttachByJobId(job.jobId, job.objectId);
          if (!attach) {
            utils.log(`  jobId=${job.jobId} attach 丢失，重扫`);
            await utils.sleep(2000);
            if (restartFlag) return { doneCount, sectionChanged: false };
            if (!isOnExpectedSection(expectedSectionId)) return { doneCount, sectionChanged: true };
            attach = findAttachByJobId(job.jobId, job.objectId);
          }
          if (!attach) {
            utils.log(`  ✗ jobId=${job.jobId} 找不到 attach`, 'err');
            continue;
          }
          if (recheckAttachDone(attach)) {
            utils.log(`  ✓ jobId=${job.jobId} 复查已完成`);
            doneCount++;
            utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
            continue;
          }

          utils.sendMsg({ type: 'JOB_PLAYING', jobId: job.jobId, cardIndex: cardIdx, sectionId });
          utils.log(`  ▶ jobId=${job.jobId} (卡${cardIdx})`);

          const ready = await utils.waitFor(() => {
            const ifr = dom.getVideoIframe(attach);
            if (!ifr) return null;
            const v = dom.getVideoEl(ifr);
            if (!v) return null;
            return { videoIframe: ifr };
          }, { timeout: 25000, interval: 500 });

          if (!ready) {
            utils.log(`  ✗ jobId=${job.jobId} video 元素 25s 未就绪`, 'err');
            continue;
          }
          if (restartFlag) return { doneCount, sectionChanged: false };
          if (!isOnExpectedSection(expectedSectionId)) return { doneCount, sectionChanged: true };

          const playRes = await playJobWithRetry(ready.videoIframe, rate, maxRetry, autoMute);
          if (!playRes.ok) {
            if (playRes.error === 'restart') return { doneCount, sectionChanged: false };
            utils.log(`  ✗ 播放失败: ${playRes.error}`, 'err');
            continue;
          }
          if (playRes.alreadyDone) {
            utils.log(`  ✓ jobId=${job.jobId} 已播完`);
            doneCount++;
            utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
            continue;
          }

          utils.log(`  ✓ 开始播放，时长 ${playRes.duration?.toFixed(1)}s${playRes.muted ? ' (静音)' : ''}`);

          const endRes = await this.waitEndedWithSectionCheck(ready.videoIframe, 3600000, expectedSectionId);

          if (endRes.ok) {
            utils.log(`  ✓ jobId=${job.jobId} 完成`);
            doneCount++;
            utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
          } else if (endRes.error === 'interrupted') {
            utils.log(`  ⚠ 播放中被重启信号中断`);
            return { doneCount, sectionChanged: false };
          } else if (endRes.sectionChanged) {
            utils.log(`  ⚠ 播放中节被切换，中断`);
            return { doneCount, sectionChanged: true };
          } else if (endRes.error === 'stopped') {
            utils.log(`  ⏹ 已停止`, 'err');
          } else if (endRes.error?.startsWith('blocked')) {
            utils.log(`  ⚠ 弹窗阻挡: ${endRes.blockerText || endRes.error}`, 'err');
            utils.sendMsg({ type: 'BLOCKED', jobId: job.jobId, text: endRes.blockerText || endRes.error });
          } else {
            utils.log(`  ✗ jobId=${job.jobId} 未完成: ${endRes.error}`, 'err');
          }

          await utils.sleep(1500);
        }
      }
      return { doneCount, sectionChanged: false };
    },

    waitEndedWithSectionCheck(videoIframe, timeoutMs, expectedSectionId) {
      return new Promise(resolve => {
        const inner = player.waitEnded(videoIframe, timeoutMs);
        let done = false;
        const checker = setInterval(() => {
          if (done) return;
          if (restartFlag) {
            clearInterval(checker);
            done = true;
            resolve({ ok: false, error: 'interrupted' });
            return;
          }
          if (!isOnExpectedSection(expectedSectionId)) {
            clearInterval(checker);
            done = true;
            try { const v = dom.getVideoEl(videoIframe); if (v) v.pause(); } catch (_) {}
            resolve({ ok: false, sectionChanged: true });
          }
        }, 2000);
        inner.then(res => {
          if (done) return;
          done = true;
          clearInterval(checker);
          resolve(res);
        }).catch(e => {
          if (done) return;
          done = true;
          clearInterval(checker);
          resolve({ ok: false, error: String(e) });
        });
      });
    }
  };
})();