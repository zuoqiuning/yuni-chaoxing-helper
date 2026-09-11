(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH || !CXH.P || !CXH.S) return;
  const P = CXH.P;
  const S = CXH.S;
  const dom = CXH.dom;
  const jobs = CXH.jobs;
  const utils = CXH.utils;
  const core = CXH.sectionCore;
  const runner = CXH.sectionRunner;
  const finder = CXH.sectionFinder;

  function requestRestart() {
    S.restartFlag = true;
    try { CXH.player.interruptWait(); } catch (_) {}
  }

  function isOnExpectedSection(expectedId) {
    if (!expectedId) return true;
    return dom.getCurrentSectionId() === expectedId;
  }

  function sendCardReset(sectionId) {
    utils.sendMsg({ type: 'CARD_JOBS_RESET', sectionId });
  }

  function sendCardJobs(cardResults, sectionId) {
    if (cardResults && cardResults.length > 0) {
      utils.sendMsg({ type: 'CARD_JOBS', sectionId, cards: cardResults });
    }
  }

  function sendCardActive(cardIndex, cardText) {
    utils.sendMsg({ type: 'CARD_ACTIVE', cardIndex, cardText });
  }

  function sendCardUpdate(card, sectionId) {
    utils.sendMsg({ type: 'CARD_JOBS_UPDATE', sectionId, card });
  }

  // ★ scanCardNow：加 localDone 字段（来自 sessionStorage）
  function scanCardNow(cardIdx, sectionId) {
    const iframeIdx = dom.getIframeCardIdx();
    if (iframeIdx !== -1 && iframeIdx !== cardIdx) {
      return { cardIndex: cardIdx, cardText: '', jobs: [], _skip: true };
    }

    const tabs = dom.getCardTabs();
    const progress = sectionId ? core.getProgress(sectionId) : {};

    const list = jobs.scanCurrentCard().map(j => ({
      ...j,
      cardIndex: cardIdx,
      cardText: jobs.getCardText(tabs[cardIdx])
    }));
    const targets = list.filter(j => j.type === 'video' || j.type === 'document');

    return {
      cardIndex: cardIdx,
      cardText: jobs.getCardText(tabs[cardIdx]),
      jobs: targets.map(j => {
        const key = core.jobKey(j, cardIdx);
        const localDone = !!progress[key];
        return {
          index: j.index,
          jobId: j.jobId,
          objectId: j.objectId,
          type: j.type,
          done: j.done,
          localDone  // ★ 传给 panel
        };
      })
    };
  }

  async function runPassAllTabs(rate, maxRetry, sectionId, autoMute, expectedSectionId, handledJobs, trustDone) {
    const tabs = dom.getCardTabs();
    const originIdx = dom.getActiveCardIdx();

    let totalCount = 0;
    let doneCount = 0;
    let unfinishedAfter = 0;
    const cardResults = [];
    const failedJobs = [];

    for (let i = 0; i < tabs.length; i++) {
      if (P.stopped) return { totalCount, doneCount, unfinishedAfter, sectionChanged: false, cardResults, sectionDone: false, failedJobs };
      if (S.restartFlag) return { totalCount, doneCount, unfinishedAfter, sectionChanged: false, cardResults, sectionDone: false, failedJobs };
      if (!isOnExpectedSection(expectedSectionId)) return { totalCount, doneCount, unfinishedAfter, sectionChanged: true, cardResults, sectionDone: false, failedJobs };

      const isActive = tabs[i].classList.contains('active');
      if (!isActive) {
        tabs[i].click();
      }

      const switched = await finder.waitForTabSwitch(i, 15000);
      if (!switched) {
        utils.log(`  ⚠ 切到卡${i + 1}失败（iframe 未就绪），跳过本卡片`, 'err');
        continue;
      }

      await utils.sleep(300);

      sendCardActive(i, jobs.getCardText(tabs[i]));

      const cardInfo = scanCardNow(i, sectionId);

      if (cardInfo._skip) {
        utils.log(`  ⚠ 卡${i + 1} 数据未就绪，跳过`, 'err');
        continue;
      }

      cardResults.push(cardInfo);
      sendCardUpdate(cardInfo, sectionId);

      const progress = core.getProgress(sectionId);
      const targets = cardInfo.jobs;
      const unfinished = targets.filter(j => {
        const key = core.jobKey(j, i);
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
        if (P.stopped) break;
        if (S.restartFlag) break;
        if (!isOnExpectedSection(expectedSectionId)) return { totalCount, doneCount, unfinishedAfter, sectionChanged: true, cardResults, sectionDone: false, failedJobs };

        const ok = await runner.processOneJob(job, i, rate, maxRetry, autoMute, sectionId, expectedSectionId);
        const key = core.jobKey(job, i);
        handledJobs.add(key);

        if (ok) {
          doneCount++;
          core.markProgressDone(sectionId, key);
        } else {
          failedJobs.push({ ...job, cardIndex: i });
        }

        const updatedCard = scanCardNow(i, sectionId);
        if (!updatedCard._skip) {
          const ri = cardResults.findIndex(c => c.cardIndex === i);
          if (ri >= 0) cardResults[ri] = updatedCard;
          sendCardUpdate(updatedCard, sectionId);
        }

        if (core.isSectionFinished(sectionId)) {
          utils.log(`  ✓ 服务端已标记本节完成`);
          return { totalCount, doneCount, unfinishedAfter: 0, sectionChanged: false, cardResults, sectionDone: true, failedJobs };
        }
      }

      if (core.isSectionFinished(sectionId)) {
        utils.log(`  ✓ 服务端已标记本节完成`);
        return { totalCount, doneCount, unfinishedAfter: 0, sectionChanged: false, cardResults, sectionDone: true, failedJobs };
      }

      const progress2 = core.getProgress(sectionId);
      const remaining = targets.filter(j => {
        const key = core.jobKey(j, i);
        if (progress2[key]) return false;
        return !handledJobs.has(key);
      });
      unfinishedAfter += remaining.length;
    }

    if (originIdx >= 0 && tabs[originIdx] && !tabs[originIdx].classList.contains('active')) {
      tabs[originIdx].click();
      await finder.waitForTabSwitch(originIdx, 10000);
      sendCardActive(originIdx, jobs.getCardText(tabs[originIdx]));
    }

    return { totalCount, doneCount, unfinishedAfter, sectionChanged: false, cardResults, sectionDone: false, failedJobs };
  }

  async function processAllCards(rate, options = {}) {
    const maxRetry = options.maxRetry || 3;
    const autoMute = options.autoMute === true;
    const trustDone = options.trustDone !== false;
    const expectedSectionId = options.expectedSectionId || dom.getCurrentSectionId();
    const sectionId = dom.getCurrentSectionId();
    const courseId = dom.getCurrentCourseId();

    S.restartFlag = false;
    P.stopped = false;
    P.paused = false;
    P.expectedSectionId = expectedSectionId;

    const handledJobs = new Set();

    sendCardReset(sectionId);

    utils.log(`开始处理当前节，倍速 ${rate}x${autoMute ? '（自动静音）' : ''}`);

    if (!isOnExpectedSection(expectedSectionId)) {
      utils.log(`  ⚠ 进入本节时已被切换`, 'err');
      P.expectedSectionId = null;
      return { ok: false, total: 0, done: 0, stopped: P.stopped, sectionChanged: true, sectionDone: false };
    }

    if (core.isSectionFinished(sectionId)) {
      utils.log(`✓ 本节已完成`);
      P.expectedSectionId = null;
      return { ok: true, total: 0, done: 0, stopped: false, sectionChanged: false, sectionDone: true };
    }

    let pass = 0;
    let restartCount = 0;
    const MAX_RESTART = 5;
    const MAX_PASS = 2;
    let lastResult = { total: 0, done: 0 };

    while (pass < MAX_PASS) {
      if (S.restartFlag) {
        S.restartFlag = false;
        restartCount++;
        if (restartCount > MAX_RESTART) {
          utils.log(`  ⚠ 重启次数超上限`, 'err');
        } else {
          utils.log(`  ↻ 收到重启信号（第 ${restartCount} 次）`, 'ok');
          pass = 0;
          handledJobs.clear();
          sendCardReset(sectionId);
          await utils.sleep(1000);
          continue;
        }
      }
      if (!isOnExpectedSection(expectedSectionId)) {
        P.expectedSectionId = null;
        return { ok: false, total: lastResult.total, done: lastResult.done, stopped: P.stopped, sectionChanged: true, sectionDone: false };
      }
      if (P.stopped) break;

      utils.log(`\n--- 第 ${pass + 1}/${MAX_PASS} 轮 ---`);

      const result = await runPassAllTabs(
        rate, maxRetry, sectionId, autoMute, expectedSectionId, handledJobs, trustDone
      );

      sendCardJobs(result.cardResults, sectionId);

      if (result.sectionChanged) {
        P.expectedSectionId = null;
        return { ok: false, total: lastResult.total, done: lastResult.done, stopped: P.stopped, sectionChanged: true, sectionDone: false };
      }
      if (result.sectionDone) {
        P.expectedSectionId = null;
        utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: result.totalCount, done: result.doneCount, stopped: false });
        return { ok: true, total: result.totalCount, done: result.doneCount, stopped: false, sectionChanged: false, sectionDone: true };
      }
      if (S.restartFlag) continue;
      if (P.stopped) break;

      lastResult.total = result.totalCount;
      lastResult.done = result.doneCount;

      utils.log(`--- 第 ${pass + 1}/${MAX_PASS} 轮：完成 ${result.doneCount}/${result.totalCount} ---`);

      if (result.unfinishedAfter === 0) {
        utils.log(`✓ 本轮无遗留，等待服务端标记…`);
        let finished = false;
        for (let k = 0; k < 3; k++) {
          await utils.sleep(3000);
          if (core.isSectionFinished(sectionId)) {
            finished = true;
            break;
          }
        }
        if (finished) {
          utils.log(`✓ 服务端已确认完成`);
          P.expectedSectionId = null;
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

    if (core.isSectionFinished(sectionId)) {
      utils.log(`✓ 服务端已确认本节完成`);
      P.expectedSectionId = null;
      utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: lastResult.total, done: lastResult.done, stopped: false });
      return { ok: true, total: lastResult.total, done: lastResult.done, stopped: false, sectionChanged: false, sectionDone: true };
    }

    P.expectedSectionId = null;
    utils.sendMsg({ type: 'SECTION_DONE', sectionId, courseId, total: lastResult.total, done: lastResult.done, stopped: P.stopped });
    return { ok: true, total: lastResult.total, done: lastResult.done, stopped: P.stopped, sectionChanged: false, sectionDone: false };
  }

  function isRunning() {
    return !P.stopped && !!P.expectedSectionId;
  }

  function clearState() {
    P.stopped = true;
    P.paused = false;
    P.interrupted = false;
    P.expectedSectionId = null;
    if (P.currentVideoEl && !P.currentVideoEl.paused) {
      try { P.currentVideoEl.pause(); } catch (_) {}
    }
  }

  CXH.section = {
    requestRestart,
    processAllCards,
    isRunning,
    clearState
  };
})();