(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  const SEL = CXH.SEL;
  CXH.catalog = {
    scan() {
      const items = [];
      document.querySelectorAll(SEL.catalogNode).forEach(node => {
        if (node.classList.contains(SEL.catalogChapterClass)) return;
        const id = (node.id || '').replace(SEL.RE.catalogIdPrefix, '');
        const label = node.querySelector(SEL.catalogLabel)?.textContent?.trim() || '';
        const nameEl = node.querySelector(SEL.catalogName) || node.querySelector(SEL.catalogTitle);
        const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || '';
        const finished = !!node.querySelector(SEL.catalogDone);
        if (id) items.push({ id, label, name, finished });
      });
      return items;
    }
  };
})();