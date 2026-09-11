(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const R = SP.render;

  let lastScanTime = 0;
  const SCAN_THROTTLE_MS = 2000;

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(type, payload = {}, timeoutMs = 10000, tabId = null) {
    let tid = tabId;
    if (!tid) {
      const tab = await getActiveTab();
      if (!tab || !tab.id) return { ok: false, error: 'no active tab' };
      tid = tab.id;
    }
    try {
      const res = await Promise.race([
        chrome.tabs.sendMessage(tid, { type, payload }, { frameId: 0 }),
        new Promise(r => setTimeout(() => r({ ok: false, error: 'timeout' }), timeoutMs))
      ]);
      return res || { ok: false, error: 'no response' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function waitContentScript(maxWaitMs = 20000, tabId = null) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await sendToTab('PING', {}, 1500, tabId);
      if (res.ok && res.role === 'top') return true;
      await U.sleep(500);
    }
    return false;
  }

  async function waitSectionChange(sectionId, maxMs = 25000, tabId = null) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const res = await sendToTab('GET_CURRENT_SECTION', {}, 1500, tabId);
      if (res.ok) {
        if (res.sectionId === sectionId) return true;
        if (res.iframeKnowledgeId === sectionId) return true;
      }
      await U.sleep(400);
    }
    return false;
  }

  async function getCurrentSectionId(tabId = null) {
    const res = await sendToTab('GET_CURRENT_SECTION', {}, 1500, tabId);
    return res.ok ? res.sectionId : null;
  }

  async function doScan(silent = false, quiet = true) {
    if (SP.state.scanning) return;

    const now = Date.now();
    if (now - lastScanTime < SCAN_THROTTLE_MS) {
      if (!silent) U.log('扫描节流中，稍后再试', '');
      return;
    }
    lastScanTime = now;

    SP.state.scanning = true;
    try {
      const tab = await getActiveTab();
      if (!tab || !tab.url || !tab.url.includes('chaoxing.com')) {
        U.$('catalog').innerHTML = '<div class="empty">请打开学习通课程页</div>';
        U.$('jobs').innerHTML = '<div class="empty">—</div>';
        if (!silent) U.log('当前标签页不是学习通页面', 'err');
        return;
      }

      const ready = await waitContentScript(15000, tab.id);
      if (!ready) {
        if (!silent) U.log('content script 未就绪，请刷新页面', 'err');
        return;
      }

      await U.sleep(1200);

      const sectionId = await getCurrentSectionId(tab.id);
      const catRes = await sendToTab('SCAN_CATALOG', {}, 10000, tab.id);
      if (!catRes.ok) { U.log('目录扫描失败: ' + catRes.error, 'err'); return; }
      R.renderCatalog(catRes.catalog || [], sectionId);

      const jobRes = await sendToTab(
        'SCAN_SECTION',
        { currentOnly: quiet === true },
        quiet ? 30000 : 180000,
        tab.id
      );
      if (!jobRes.ok) { U.log('任务点扫描失败: ' + jobRes.error, 'err'); return; }

      const jobList = jobRes.jobs || [];

      if (jobList.length === 0) {
        R.renderCardJobs([], sectionId);
      } else {
        const grouped = {};
        jobList.forEach(j => {
          const ci = j.cardIndex ?? 0;
          if (!grouped[ci]) {
            grouped[ci] = { cardIndex: ci, cardText: j.cardText || '', jobs: [] };
          }
          grouped[ci].jobs.push({
            index: j.index,
            jobId: j.jobId,
            objectId: j.objectId,
            type: j.type,
            done: j.done,
            playing: false
          });
        });
        R.renderCardJobs(Object.values(grouped), sectionId);

        SP.state.currentJobs = [];
        jobList.forEach(j => {
          SP.state.currentJobs.push({
            index: j.index,
            jobId: j.jobId,
            objectId: j.objectId,
            type: j.type,
            done: j.done,
            cardIndex: j.cardIndex ?? 0,
            cardText: j.cardText || ''
          });
        });
      }

      if (!silent) U.log(quiet ? '扫描完成（当前节）' : '扫描完成（全量）', 'ok');
    } finally {
      SP.state.scanning = false;
    }
  }

  async function restartCurrent(tid = null) {
    let tabId = tid;
    if (!tabId) {
      const tab = await getActiveTab();
      if (!tab || !tab.id) return { ok: false, error: 'no active tab' };
      tabId = tab.id;
    }
    const sectionId = await getCurrentSectionId(tabId);
    U.log(`重启本节 (${sectionId})`);

    const restartRes = await sendToTab('RESTART_SECTION', {}, 5000, tabId);
    if (restartRes.ok) U.log('  已发送重启信号', 'ok');
    else U.log('  重启信号发送失败: ' + restartRes.error, 'err');

    await U.sleep(2000);
    const catRes = await sendToTab('SCAN_CATALOG', {}, 10000, tabId);
    if (catRes.ok) R.renderCatalog(catRes.catalog || [], sectionId);
    const jobRes = await sendToTab('SCAN_SECTION', { currentOnly: true }, 60000, tabId);
    if (jobRes.ok) R.renderJobs(jobRes.jobs || [], sectionId);
    else return { ok: false, error: jobRes.error };
    return { ok: true, sectionId };
  }

  // ★ 超时从 5s → 10s（避免因 play() 慢而误报超时）
  async function pause(tid = null) {
    return await sendToTab('PAUSE', {}, 10000, tid);
  }
  async function resume(tid = null) {
    return await sendToTab('RESUME', {}, 10000, tid);
  }
  async function setLock(enabled, tid = null) {
    return await sendToTab('SET_LOCK', { enabled }, 3000, tid);
  }

  SP.scan = {
    getActiveTab, sendToTab,
    waitContentScript, waitSectionChange,
    getCurrentSectionId,
    doScan, restartCurrent,
    pause, resume, setLock
  };
})();