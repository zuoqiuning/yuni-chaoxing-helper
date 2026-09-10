(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  CXH.catalog = {
    scan() {
      const items = [];
      document.querySelectorAll('.posCatalog_select').forEach(node => {
        if (node.classList.contains('firstLayer')) return;
        const id = (node.id || '').replace(/^cur/, '');
        const label = node.querySelector('.posCatalog_sbar')?.textContent?.trim() || '';
        const nameEl = node.querySelector('.posCatalog_name') || node.querySelector('.posCatalog_title');
        const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || '';
        const finished = !!node.querySelector('.icon_Completed');
        if (id) items.push({ id, label, name, finished });
      });
      return items;
    }
  };
})();