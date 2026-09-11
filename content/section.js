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

  function classifyTypeSimple(src) {
    if (!src) return 'unknown';
    if (/ananas\/modules\/video/.test(src)) return 'video';
    if (/downloadfile/.test(src)) return 'document';
    if (/ananas\/modules\/doc/.test(src)) return 'document';
    if (/ananas\/modules\/pdf/.test(src)) return 'document';
    if (/pan-yz\.chaoxing\.com/.test(src)) return 'document';
    if (/ananas\/modules\/audio/.test(src)) return 'audio';
    return 'unknown';
  }

  function extractAttr(el, name) {
    if (!el || !name) return '';
    const v1 = el.getAttribute(name);
    if (v1) return v1;
    const child = el.querySelector(`[${name}]`);
    return child?.getAttribute(name) || '';
  }

  function jobKey(job) {
    if (job.jobId) return job.jobId;
    if (job.objectId) return job.objectId;
    return `idx${job.index}-${job.type}`;
  }

  const PROGRESS_TTL = 30 * 60 * 1000;

  function progressKey(sectionId) {
    return `__cxh_progress_${sectionId}`;
  }

  function getProgress(sectionId) {
    try {
      const raw = JSON.parse(sessionStorage.getItem(progressKey(sectionId)) || '{}');
      const now = Date.now();
      const result = {};
      for (const k in raw) {
        if (now - raw[k] < PROGRESS_TTL) result[k] = raw[k];
      }
      return result;
    } catch (_) { return {}; }
  }

  function markProgressDone(sectionId, keyStr) {
    try {
      const data = getProgress(sectionId);
      data[keyStr] = Date.now();
      sessionStorage.setItem(progressKey(sectionId), JSON.stringify(data));
    } catch (_) {}
  }

  function isSectionFinished(sectionId) {
    if (!sectionId) return false;
    try {
      if (!CXH.catalog || !CXH.catalog.scan) return false;
      const items = CXH.catalog.scan();
      const cur = items.find(i => i.id === sectionId);
      return !!(cur && cur.finished);
    } catch (_) {
      return false;
    }
  }

  // ★ 清空面板卡片
  function sendCardReset(sectionId) {
    utils.sendMsg({
      type: 'CARD_JOBS_RESET',
      sectionId
    });
  }

  // 全量卡片列表
  function sendCardJobs(cardResults, sectionId) {
    if (cardResults && cardResults.length > 0) {
      utils.sendMsg({
        type: 'CARD_JOBS',
        sectionId,
        cards: cardResults
      });
    }
  }

  // 当前激活卡片（高亮）
  function sendCardActive(cardIndex, cardText) {
    utils.sendMsg({
      type: 'CARD_ACTIVE',
      cardIndex,
      cardText
    });
  }

  // ★ 单卡片增量更新（带完整数据）
  function sendCardUpdate(card, sectionId) {
    utils.sendMsg({
      type: 'CARD_JOBS_UPDATE',
      sectionId,
      card
    });
  }

  function findAttachInCurrentTab(job) {
    const attaches = dom.getAttachments();
    if (!attaches.length) return null;

    if (job.jobId) {
      for (const a of attaches) {
        if (extractAttr(a, 'jobid') === job.jobId) return a;
      }
    }
    if (job.objectId) {
      for (const a of attaches) {
        if (extractAttr(a, 'objectid') === job.objectId) return a;
      }
    }
    if (typeof job.index === 'number' && attaches[job.index]) {
      const a = attaches[job.index];
      const videoIfr = dom.getVideoIframe(a);
      const docIfr = dom.getDocIframe ? dom.getDocIframe(a) : null;
      const anyIfr = a.querySelector('iframe');
      const src = videoIfr?.src || docIfr?.src || anyIfr?.src || '';
      if (classifyTypeSimple(src) === job.type) return a;
    }
    const sameType = attaches.filter(a => {
      const videoIfr = dom.getVideoIframe(a);
      const docIfr = dom.getDocIframe ? dom.getDocIframe(a) : null;
      const anyIfr = a.querySelector('iframe');
      const src = videoIfr?.src || docIfr?.src || anyIfr?.src || '';
      return classifyTypeSimple(src) === job.type;
    });
    if (sameType.length === 1) return sameType[0];

    return null;
  }

  async function ensureJobReady(job, maxMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (player.isStopped()) return null;
      if (restartFlag) return null;

      const attach = findAttachInCurrentTab(job);
      if (attach) {
        if (job.type === 'video') {
          const ifr = dom.getVideoIframe(attach);
          if (ifr && ifr.src && ifr.src !== 'about:blank') return attach;
        } else if (job.type === 'document') {
          const ifr = dom.getDocIframe ? dom.getDocIframe(attach) : null;
          if (ifr && ifr.src && ifr.src !== 'about:blank') {
            try {
              const d = ifr.contentDocument;
              if (d && d.readyState === 'complete' && d.body) return attach;
            } catch (_) {}
          }
        } else {
          return attach;
        }
      }
      await utils.sleep(500);
    }
    return null;
  }

  async function playJobWithRetry(videoIframe, rate, maxRetry, autoMute) {
    let lastErr = null;
    for (let i = 0; i <= maxRetry; i++) {
      if (player.isStopped()) return { ok: false, error: 'stopped' };
      if (restartFlag) return { ok: false, error: 'restart' };
      await waitIfPaused();

      const v = dom.getVideoEl(videoIframe);
      if (v && v.error) {
        utils.log(`  [retry] video.error，重载 iframe`);
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

  async function processOneJob(job, cardIdx, rate, maxRetry, autoMute, sectionId, expectedSectionId) {
    const attach = await ensureJobReady(job, 15000);
    if (!attach) {
      utils.log(`  ✗ attach 未就绪 (15s)`, 'err');
      return false;
    }
    if (restartFlag) return false;
    if (!isOnExpectedSection(expectedSectionId)) return false;

    utils.sendMsg({ type: 'JOB_PLAYING', jobId: job.jobId, cardIndex: cardIdx, sectionId });

    if (job.type === 'document') {
      utils.log(`  📄 文档任务 (卡${cardIdx + 1})`);
      try {
        const docRes = await CXH.doc.processDocument(attach, { maxMs: 90000 });
        if (docRes.ok) {
          utils.log(`  ✓ 文档完成`);
          utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
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
      if (restartFlag) return false;
      if (!isOnExpectedSection(expectedSectionId)) return false;

      const playRes = await playJobWithRetry(ready.videoIframe, rate, maxRetry, autoMute);
      if (!playRes.ok) {
        if (playRes.error === 'restart') return false;
        utils.log(`  ✗ 播放失败: ${playRes.error}`, 'err');
        return false;
      }

      if (playRes.alreadyDone) {
        utils.log(`  ✓ 已播完`);
        utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
        return true;
      }

      utils.log(`  ✓ 播放中 ${playRes.duration?.toFixed(0)}s${playRes.muted ? ' (静音)' : ''}`);

      const endRes = await waitEndedWithSectionCheck(ready.videoIframe, 3600000, expectedSectionId);

      if (endRes.ok) {
        utils.log(`  ✓ 视频完成`);
        utils.sendMsg({ type: 'JOB_DONE', jobId: job.jobId, cardIndex: cardIdx, sectionId });
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

  function scanCardNow(cardIdx) {
    const tabs = dom.getCardTabs();
    const list = jobs.scanCurrentCard().map(j => ({
      ...j,
      cardIndex: cardIdx,
      cardText: jobs.getCardText(tabs[cardIdx])
    }));
    const targets = list.filter(j => j.type === 'video' || j.type === 'document');
    return {
      cardIndex: cardIdx,
      cardText: jobs.getCardText(tabs[cardIdx]),
      jobs: targets.map(j => ({
        index: j.index,
        jobId: j.jobId,
        objectId: j.objectId,
        type: j.type,
        done: j.done
      }))
    };
  }

  async function runPassAllTabs(rate, maxRetry, sectionId, autoMute, expectedSectionId, handledJobs, trustDone) {
    const tabs = dom.getCardTabs();
    const originIdx = dom.getActiveCardIdx();
    const progress = getProgress(sectionId);

    let totalCount = 0;
    let doneCount = 0;
    let unfinishedAfter = 0;
    const cardResults = [];
    const failedJobs = [];

    for (let i = 0; i < tabs.length; i++) {
      if (player.isStopped()) return { totalCount, doneCount, unfinishedAfter, sectionChanged: false, cardResults, sectionDone: false, failedJobs };
      if (restartFlag) return { totalCount, doneCount, unfinishedAfter, sectionChanged: false, cardResults, sectionDone: false, failedJobs };
      if (!isOnExpectedSection(expectedSectionId)) return { totalCount, doneCount, unfinishedAfter, sectionChanged: true, cardResults, sectionDone: false, failedJobs };

      const isActive = tabs[i].classList.contains('active');
      if (!isActive) {
        tabs[i].click();
        await jobs.waitForCardLoaded(10000);
        await utils.sleep(500);
      } else {
        await jobs.waitForCardLoaded(6000);
      }

      // ★ 立即发 ACTIVET + UPDATE
      sendCardActive(i, jobs.getCardText(tabs[i]));

      const cardInfo = scanCardNow(i);
      cardResults.push(cardInfo);
      // ★★★ 关键：切到本 tab 后立即发送卡片完整数据
      sendCardUpdate(cardInfo, sectionId);

      const targets = cardInfo.jobs;
      const unfinished = targets.filter(j => {
        const key = jobKey(j);
        if (progress[key]) return false;
        if (handledJobs.has(key)) return false;
        if (trustDone && j.done) return false;
        return true;
      });

      totalCount += targets.length;

      if (unfinished.length > 0) {
        utils.log(`  [卡${i + 1}] 待处理 ${unfinished.length} 个`);
      }

      for (const job of unfinished) {
        if (player.isStopped()) break;
        if (restartFlag) break;
        if (!isOnExpectedSection(expectedSectionId)) return { totalCount, doneCount, unfinishedAfter, sectionChanged: true, cardResults, sectionDone: false, failedJobs };

        await waitIfPaused();

        const ok = await processOneJob(job, i, rate, maxRetry, autoMute, sectionId, expectedSectionId);
        const key = jobKey(job);
        handledJobs.add(key);
        if (ok) {
          doneCount++;
          markProgressDone(sectionId, key);
        } else {
          failedJobs.push({ ...job, cardIndex: i });
        }

        // ★ 任务后立即更新
        const updatedCard = scanCardNow(i);
        const ri = cardResults.findIndex(c => c.cardIndex === i);
        if (ri >= 0) cardResults[ri] = updatedCard;
        sendCardUpdate(updatedCard, sectionId);

        if (isSectionFinished(sectionId)) {
          utils.log(`  ✓ 服务端已标记本节完成`);
          return { totalCount, doneCount, unfinishedAfter: 0, sectionChanged: false, cardResults, sectionDone: true, failedJobs };
        }
      }

      if (isSectionFinished(sectionId)) {
        utils.log(`  ✓ 服务端已标记本节完成`);
        return { totalCount, doneCount, unfinishedAfter: 0, sectionChanged: false, cardResults, sectionDone: true, failedJobs };
      }

      const remaining = targets.filter(j => {
        const key = jobKey(j);
        if (progress[key]) return false;
        return !handledJobs.has(key);
      });
      unfinishedAfter += remaining.length;
    }

    if (originIdx >= 0 && tabs[originIdx] && !tabs[originIdx].classList.contains('active')) {
      tabs[originIdx].click();
      await jobs.waitForCardLoaded(6000);
      sendCardActive(originIdx, jobs.getCardText(tabs[originIdx]));
    }

    return { totalCount, doneCount, unfinishedAfter, sectionChanged: false, cardResults, sectionDone: false, failedJobs };
  }

  function waitEndedWithSectionCheck(videoIframe, timeoutMs, expectedSectionId) {
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

  CXH.section = {
    requestRestart,

    async processAllCards(rate, options = {}) {
      const maxRetry = options.maxRetry || 3;
      const autoMute = options.autoMute === true;
      const trustDone = options.trustDone !== false;
      const expectedSectionId = options.expectedSectionId || dom.getCurrentSectionId();
      const sectionId = dom.getCurrentSectionId();
      const courseId = dom.getCurrentCourseId();

      restartFlag = false;
      player.setStopped(false);
      player.setPaused(false);
      player.setExpectedSectionId(expectedSectionId);

      const handledJobs = new Set();

      // ★★★ 开始处理：立即清空面板
      sendCardReset(sectionId);

      utils.log(`开始处理当前节，倍速 ${rate}x${autoMute ? '（自动静音）' : ''}`);

      if (!isOnExpectedSection(expectedSectionId)) {
        utils.log(`  ⚠ 进入本节时已被切换`, 'err');
        player.setExpectedSectionId(null);
        return { ok: false, total: 0, done: 0, stopped: player.isStopped(), sectionChanged: true, sectionDone: false };
      }

      if (isSectionFinished(sectionId)) {
        utils.log(`✓ 本节已完成`);
        player.setExpectedSectionId(null);
        return { ok: true, total: 0, done: 0, stopped: false, sectionChanged: false, sectionDone: true };
      }

      let pass = 0;
      let restartCount = 0;
      const MAX_RESTART = 5;
      const MAX_PASS = 2;
      let lastResult = { total: 0, done: 0 };

      while (pass < MAX_PASS) {
        if (restartFlag) {
          restartFlag = false;
          restartCount++;
          if (restartCount > MAX_RESTART) {
            utils.log(`  ⚠ 重启次数超上限`, 'err');
          } else {
            utils.log(`  ↻ 收到重启信号（第 ${restartCount} 次）`, 'ok');
            pass = 0;
            handledJobs.clear();
            // ★★★ 重启时也清空面板
            sendCardReset(sectionId);
            await utils.sleep(1000);
            continue;
          }
        }
        if (!isOnExpectedSection(expectedSectionId)) {
          player.setExpectedSectionId(null);
          return { ok: false, total: lastResult.total, done: lastResult.done, stopped: player.isStopped(), sectionChanged: true, sectionDone: false };
        }
        if (player.isStopped()) break;

        utils.log(`\n--- 第 ${pass + 1}/${MAX_PASS} 轮 ---`);

        const result = await runPassAllTabs(
          rate, maxRetry, sectionId, autoMute, expectedSectionId, handledJobs, trustDone
        );

        sendCardJobs(result.cardResults, sectionId);

        if (result.sectionChanged) {
          player.setExpectedSectionId(null);
          return { ok: false, total: lastResult.total, done: lastResult.done, stopped: player.isStopped(), sectionChanged: true, sectionDone: false };
        }
        if (result.sectionDone) {
          player.setExpectedSectionId(null);
          utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: result.totalCount, done: result.doneCount, stopped: false });
          return { ok: true, total: result.totalCount, done: result.doneCount, stopped: false, sectionChanged: false, sectionDone: true };
        }
        if (restartFlag) continue;
        if (player.isStopped()) break;

        lastResult.total = result.totalCount;
        lastResult.done = result.doneCount;

        utils.log(`--- 第 ${pass + 1}/${MAX_PASS} 轮：完成 ${result.doneCount}/${result.totalCount} ---`);

        if (result.unfinishedAfter === 0) {
          utils.log(`✓ 本轮无遗留，等待服务端标记…`);
          let finished = false;
          for (let k = 0; k < 3; k++) {
            await utils.sleep(3000);
            if (isSectionFinished(sectionId)) {
              finished = true;
              break;
            }
          }
          if (finished) {
            utils.log(`✓ 服务端已确认完成`);
            player.setExpectedSectionId(null);
            utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: result.totalCount, done: result.doneCount, stopped: false });
            return { ok: true, total: result.totalCount, done: result.doneCount, stopped: false, sectionChanged: false, sectionDone: true };
          }
          utils.log(`⚠ 全部处理完但服务端未标记完成`, 'err');
          break;
        }

        if (result.failedJobs && result.failedJobs.length > 0) {
          utils.log(`↻ 准备重试 ${result.failedJobs.length} 个失败任务…`);
        } else if (result.doneCount === 0) {
          utils.log(`本轮无进展，退出`);
          break;
        }

        if (pass < MAX_PASS - 1) {
          await utils.sleep(2000);
        }
        pass++;
      }

      if (isSectionFinished(sectionId)) {
        utils.log(`✓ 服务端已确认本节完成`);
        player.setExpectedSectionId(null);
        utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: lastResult.total, done: lastResult.done, stopped: false });
        return { ok: true, total: lastResult.total, done: lastResult.done, stopped: false, sectionChanged: false, sectionDone: true };
      }

      player.setExpectedSectionId(null);
      utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: lastResult.total, done: lastResult.done, stopped: player.isStopped() });
      return { ok: true, total: lastResult.total, done: lastResult.done, stopped: player.isStopped(), sectionChanged: false, sectionDone: false };
    }
  };
})();