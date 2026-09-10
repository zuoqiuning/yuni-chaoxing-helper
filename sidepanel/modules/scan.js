(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const R = SP.render;

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(type, payload = {}, timeoutMs = 10000) {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return { ok: false, error: 'no active tab' };
    try {
      const res = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type, payload }, { frameId: 0 }),
        new Promise(r => setTimeout(() => r({ ok: false, error: 'timeout' }), timeoutMs))
      ]);
      return res || { ok: false, error: 'no response' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function waitContentScript(maxWaitMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await sendToTab('PING', {}, 1500);
      if (res.ok && res.role === 'top') return true;
      await U.sleep(500);
    }
    return false;
  }

  async function waitTabUrlContains(substr, maxMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const tab = await getActiveTab();
      if (tab && tab.url && tab.url.includes(substr)) return true;
      await U.sleep(500);
    }
    return false;
  }

  // ★ 通过 content 内部状态判断节是否已切换（SPA 也能识别）
  async function waitSectionChange(sectionId, maxMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const res = await sendToTab('GET_CURRENT_SECTION', {}, 1500);
      if (res.ok) {
        if (res.sectionId === sectionId) return true;
        if (res.iframeKnowledgeId === sectionId) return true;
      }
      await U.sleep(400);
    }
    return false;
  }

  async function getCurrentSectionId() {
    const res = await sendToTab('GET_CURRENT_SECTION', {}, 1500);
    return res.ok ? res.sectionId : null;
  }

  async function doScan(silent = false) {
    if (SP.state.scanning) return;
    SP.state.scanning = true;
    try {
      const tab = await getActiveTab();
      if (!tab || !tab.url || !tab.url.includes('chaoxing.com')) {
        U.$('catalog').innerHTML = '<div class="empty">请打开学习通课程页</div>';
        U.$('jobs').innerHTML = '<div class="empty">—</div>';
        if (!silent) U.log('当前标签页不是学习通页面', 'err');
        return;
      }
      const ready = await waitContentScript(8000);
      if (!ready) {
        if (!silent) U.log('content script 未就绪，等待刷新', 'err');
        return;
      }

      const sectionId = await getCurrentSectionId();

      const catRes = await sendToTab('SCAN_CATALOG');
      if (!catRes.ok) { U.log('目录扫描失败: ' + catRes.error, 'err'); return; }
      R.renderCatalog(catRes.catalog || [], sectionId);

      const jobRes = await sendToTab('SCAN_SECTION', {}, 90000);
      if (!jobRes.ok) { U.log('任务点扫描失败: ' + jobRes.error, 'err'); return; }
      R.renderJobs(jobRes.jobs || []);

      if (!silent) U.log('扫描完成', 'ok');
    } finally {
      SP.state.scanning = false;
    }
  }

  SP.scan = {
    getActiveTab, sendToTab,
    waitContentScript,
    waitTabUrlContains,
    waitSectionChange,
    getCurrentSectionId,
    doScan
  };
})();