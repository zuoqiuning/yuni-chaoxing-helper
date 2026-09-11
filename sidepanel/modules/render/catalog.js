(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;

  function updateCatalogStat() {
    const todo = SP.state.catalogCache.filter(i => !i.finished);
    const el = U.$('catalog-stat');
    if (el) el.textContent = `${SP.state.catalogCache.length} 节 · 未完成 ${todo.length}`;
  }

  function scrollToCurrentSection(sectionId) {
    if (!sectionId) return;
    if (SP.state.lastScrolledSectionId === sectionId) return;
    SP.state.lastScrolledSectionId = sectionId;

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

  function markSectionCurrent(sectionId) {
    U.qsa('#catalog .item.current').forEach(el => el.classList.remove('current'));
    if (!sectionId) return;
    const el = document.querySelector(`#catalog .item[data-section-id="${sectionId}"]`);
    if (el) {
      el.classList.add('current');
      scrollToCurrentSection(sectionId);
    }
  }

  SP.catalog = {
    renderCatalog, markSectionDone, markSectionCurrent,
    updateCatalogStat, scrollToCurrentSection
  };
})();