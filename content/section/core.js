(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  CXH.S = {
    restartFlag: false
  };

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

  // ★★★ 新增：清空指定节的进度记录
  function clearProgress(sectionId) {
    if (!sectionId) return;
    try {
      sessionStorage.removeItem(progressKey(sectionId));
    } catch (_) {}
  }

  function jobKey(job, cardIndex) {
    if (job.jobId) return job.jobId;
    if (job.objectId) return job.objectId;
    const ci = (cardIndex != null) ? cardIndex : (job.cardIndex || 0);
    return `c${ci}-i${job.index}-${job.type}`;
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

  CXH.sectionCore = {
    getProgress,
    markProgressDone,
    clearProgress,  // ★ 导出
    jobKey,
    isSectionFinished
  };
})();