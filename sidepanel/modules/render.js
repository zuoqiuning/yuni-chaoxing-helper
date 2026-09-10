(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;

  function updateCatalogStat() {
    const todo = SP.state.catalogCache.filter(i => !i.finished);
    const el = U.$('catalog-stat');
    if (el) el.textContent = `${SP.state.catalogCache.length} 节 · 未完成 ${todo.length}`;
  }

  // ★ 自动滚动到当前节
  function scrollToCurrentSection(sectionId) {
    if (!sectionId) return;
    if (SP.state.lastScrolledSectionId === sectionId) return;
    SP.state.lastScrolledSectionId = sectionId;

    // 等 DOM 稳定再滚
    setTimeout(() => {
      const el = document.querySelector(`#catalog .item[data-section-id="${sectionId}"]`);
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {
        el.scrollIntoView();
      }
    }, 60);
  }

  function renderCatalog(items, currentSectionId) {
    SP.state.catalogCache = items;
    const el = U.$('catalog');
    const todo = items.filter(i => !i.finished);
    U.$('catalog-stat').textContent = `${items.length} 节 · 未完成 ${todo.length}`;
    if (!items.length) { el.innerHTML = '<div class="empty">无目录数据</div>'; return; }
    el.innerHTML = items.map(i => `
      <div class="item ${i.finished ? 'done' : ''} ${i.id === currentSectionId ? 'current' : ''}" data-section-id="${i.id}">
        <span class="item-label">${U.escapeHtml(i.label)}</span>
        <span class="item-name" title="${U.escapeHtml(i.name)}">${U.escapeHtml(i.name)}</span>
        <span class="item-flag">${i.finished ? '✓' : ''}</span>
      </div>
    `).join('');

    if (currentSectionId) scrollToCurrentSection(currentSectionId);
  }

  function renderJobs(jobs) {
    SP.state.currentJobs = jobs;
    const el = U.$('jobs');
    const unfinished = jobs.filter(j => !j.done);
    U.$('jobs-stat').textContent = `${jobs.length} 个 · 未完成 ${unfinished.length}`;
    if (!jobs.length) { el.innerHTML = '<div class="empty">当前节无任务点</div>'; return; }
    el.innerHTML = jobs.map(j => {
      const cls = j.done ? 'done' : (j.playing ? 'playing' : 'pending');
      return `
        <div class="item job-item ${cls}" data-job-id="${U.escapeHtml(j.jobId)}">
          <span class="item-label">[卡${j.cardIndex}]</span>
          <span class="item-name">${U.escapeHtml(j.type)} · ${U.escapeHtml(j.jobId || '(无id)')}</span>
          <span class="item-flag">${j.done ? '✓' : (j.playing ? '▶' : '✗')}</span>
        </div>
      `;
    }).join('');
  }

  function markJobDone(jobId) {
    const jobs = SP.state.currentJobs;
    const idx = jobs.findIndex(j => j.jobId === jobId);
    if (idx >= 0) { jobs[idx].done = true; jobs[idx].playing = false; }
    const el = document.querySelector(`#jobs .job-item[data-job-id="${jobId}"]`);
    if (el) {
      el.classList.remove('pending', 'playing');
      el.classList.add('done');
      const f = el.querySelector('.item-flag'); if (f) f.textContent = '✓';
    }
    const unfinished = jobs.filter(j => !j.done).length;
    U.$('jobs-stat').textContent = `${jobs.length} 个 · 未完成 ${unfinished}`;
  }

  function markJobPlaying(jobId) {
    const jobs = SP.state.currentJobs;
    const idx = jobs.findIndex(j => j.jobId === jobId);
    if (idx >= 0) jobs[idx].playing = true;
    const el = document.querySelector(`#jobs .job-item[data-job-id="${jobId}"]`);
    if (el) {
      el.classList.remove('pending');
      el.classList.add('playing');
      const f = el.querySelector('.item-flag'); if (f) f.textContent = '▶';
    }
  }

  function markSectionDone(sectionId) {
    if (!sectionId) return;
    const items = SP.state.catalogCache;
    const idx = items.findIndex(i => i.id === sectionId);
    if (idx < 0) return;
    if (items[idx].finished) return;
    items[idx].finished = true;
    const el = document.querySelector(`#catalog .item[data-section-id="${sectionId}"]`);
    if (el) {
      el.classList.remove('current');
      el.classList.add('done');
      const flag = el.querySelector('.item-flag');
      if (flag) flag.textContent = '✓';
    }
    updateCatalogStat();
  }

  // ★ 切换当前节 → 自动滚动
  function markSectionCurrent(sectionId) {
    U.qsa('#catalog .item.current').forEach(el => el.classList.remove('current'));
    if (!sectionId) return;
    const el = document.querySelector(`#catalog .item[data-section-id="${sectionId}"]`);
    if (el) {
      el.classList.add('current');
      scrollToCurrentSection(sectionId);
    }
  }

  SP.render = {
    renderCatalog, renderJobs,
    markJobDone, markJobPlaying,
    markSectionDone, markSectionCurrent,
    updateCatalogStat,
    scrollToCurrentSection
  };
})();