(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const dom = CXH.dom;
  const jobs = CXH.jobs;
  const player = CXH.player;
  const utils = CXH.utils;

  async function playJobWithRetry(videoIframe, rate, maxRetry, autoMute) {
    let lastErr = null;
    for (let i = 0; i <= maxRetry; i++) {
      if (player.isStopped()) return { ok: false, error: 'stopped' };
      const res = await player.playJob(videoIframe, rate, autoMute);
      if (res.ok) return res;
      lastErr = res.error;
      utils.log(`  ↻ 播放重试 ${i + 1}/${maxRetry}: ${lastErr}`, 'err');
      await utils.sleep(3000);
    }
    return { ok: false, error: lastErr };
  }

  function findAttachByJobId(jobId, objectId) {
    const attaches = dom.getAttachments();
    if (jobId) {
      for (const a of attaches) {
        const jid = a.getAttribute('jobid')
                 || a.querySelector('[jobid]')?.getAttribute('jobid') || '';
        if (jid === jobId) return a;
      }
    }
    if (objectId) {
      for (const a of attaches) {
        const oid = a.getAttribute('objectid')
                 || a.querySelector('[objectid]')?.getAttribute('objectid') || '';
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
    async processAllCards(rate, options = {}) {
      const maxRetry = options.maxRetry || 2;
      const maxPasses = options.maxPasses || 3;
      const autoMute = options.autoMute === true;
      const sectionId = dom.getCurrentSectionId();
      const courseId = dom.getCurrentCourseId();

      player.setStopped(false);
      utils.log(`开始处理当前节，倍速 ${rate}x，最多 ${maxPasses} 轮${autoMute ? '（自动静音）' : ''}`);

      for (let pass = 0; pass < maxPasses; pass++) {
        if (player.isStopped()) break;

        const allJobs = await jobs.scanAllCards({ rounds: pass === 0 ? 2 : 1 });
        const videoJobs = allJobs.filter(j => j.type === 'video');
        const unfinished = videoJobs.filter(j => !j.done);

        utils.log(`\n--- 第 ${pass + 1}/${maxPasses} 轮：视频任务点 ${videoJobs.length} 个，未完成 ${unfinished.length} 个 ---`);

        if (unfinished.length === 0) {
          utils.log(`✓ 无未完成任务点`);
          break;
        }

        if (pass > 0) {
          utils.log(`↻ 复查发现 ${unfinished.length} 个遗漏，继续处理`);
        }

        const doneThisPass = await this.runPass(unfinished, rate, maxRetry, sectionId, pass, autoMute);

        if (player.isStopped()) break;

        if (doneThisPass === 0 && pass < maxPasses - 1) {
          utils.log(`本轮无进展，等待 6s 后复查…`);
          await utils.sleep(6000);
        }
      }

      const finalList = await jobs.scanAllCards({ rounds: 1 });
      const finalVideos = finalList.filter(j => j.type === 'video');
      const finalUnfinished = finalVideos.filter(j => !j.done).length;
      const finalDone = finalVideos.length - finalUnfinished;

      utils.log(`\n本节结束: ${finalDone}/${finalVideos.length}${player.isStopped() ? ' (已停止)' : ''}`);

      utils.sendMsg({
        type: 'SECTION_DONE',
        sectionId, courseId,
        total: finalVideos.length,
        done: finalDone,
        stopped: player.isStopped()
      });

      return {
        ok: true,
        total: finalVideos.length,
        done: finalDone,
        stopped: player.isStopped()
      };
    },

    async runPass(unfinished, rate, maxRetry, sectionId, passIndex, autoMute) {
      const tabs = dom.getCardTabs();
      let doneCount = 0;

      const byCard = {};
      unfinished.forEach(j => {
        if (!byCard[j.cardIndex]) byCard[j.cardIndex] = [];
        byCard[j.cardIndex].push(j);
      });

      for (const cardIdxStr of Object.keys(byCard)) {
        if (player.isStopped()) break;
        const cardIdx = parseInt(cardIdxStr, 10);
        const jobsInCard = byCard[cardIdxStr];

        if (tabs[cardIdx] && !tabs[cardIdx].classList.contains('active')) {
          tabs[cardIdx].click();
          await utils.waitFor(() => dom.getAttachments().length > 0, { timeout: 5000 });
          await utils.sleep(1200);
        }

        for (const job of jobsInCard) {
          if (player.isStopped()) break;

          let attach = findAttachByJobId(job.jobId, job.objectId);
          if (!attach) {
            utils.log(`  jobId=${job.jobId} attach 丢失，重扫…`);
            await utils.sleep(1500);
            attach = findAttachByJobId(job.jobId, job.objectId);
          }
          if (!attach) {
            utils.log(`  ✗ jobId=${job.jobId} 找不到 attach`, 'err');
            continue;
          }

          if (recheckAttachDone(attach)) {
            utils.log(`  ✓ jobId=${job.jobId} 复查发现已完成`);
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

          const playRes = await playJobWithRetry(ready.videoIframe, rate, maxRetry, autoMute);
          if (!playRes.ok) {
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

          const endRes = await player.waitEnded(ready.videoIframe, 3600000);

          if (endRes.ok) {
            utils.log(`  ✓ jobId=${job.jobId} 完成`);
            doneCount++;
            utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
          } else if (endRes.error === 'stopped') {
            utils.log(`  ⏹ 已停止`, 'err');
          } else if (endRes.error?.startsWith('blocked')) {
            utils.log(`  ⚠ 弹窗阻挡: ${endRes.blockerText || endRes.error}`, 'err');
            utils.sendMsg({
              type: 'BLOCKED',
              jobId: job.jobId,
              text: endRes.blockerText || endRes.error
            });
          } else {
            utils.log(`  ✗ jobId=${job.jobId} 未完成: ${endRes.error}`, 'err');
          }

          await utils.sleep(1500);
        }
      }

      return doneCount;
    }
  };
})();