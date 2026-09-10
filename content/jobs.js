(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const dom = CXH.dom;
  const utils = CXH.utils;

  function judgeDone(attach, aria) {
    if (aria === '任务点已完成') return true;
    if (aria === '任务点未完成') return false;
    if (attach.classList.contains('ans-job-finished')) return true;
    if (attach.querySelector('.ans-job-finished')) return true;
    return false;
  }

  function classifyType(src) {
    if (!src) return 'unknown';
    if (/ananas\/modules\/video/.test(src)) return 'video';
    if (/downloadfile/.test(src)) return 'download';
    if (/ananas\/modules\/doc/.test(src)) return 'document';
    if (/ananas\/modules\/audio/.test(src)) return 'audio';
    return 'unknown';
  }

  CXH.jobs = {
    scanCurrentCard() {
      const attaches = dom.getAttachments();
      const list = [];
      attaches.forEach((c, i) => {
        const icon = c.querySelector('.ans-job-icon');
        const aria = icon?.getAttribute('aria-label') || '';
        const iframeEl = c.querySelector('iframe');
        const src = iframeEl?.src || '';
        list.push({
          index: i,
          done: judgeDone(c, aria),
          type: classifyType(src),
          aria, src,
          jobId: c.getAttribute('jobid') || c.querySelector('[jobid]')?.getAttribute('jobid') || '',
          objectId: c.getAttribute('objectid') || c.querySelector('[objectid]')?.getAttribute('objectid') || ''
        });
      });
      return list;
    },

    /**
     * 扫描全部卡片，支持多轮取并集
     * ★ 默认 rounds 从 2 降到 1，减少超星 iframe 反复懒加载
     * @param {Object} opts { rounds: 扫描轮数 }
     */
    async scanAllCards(opts = {}) {
      const rounds = opts.rounds || 1;
      const tabs = dom.getCardTabs();
      const originIdx = dom.getActiveCardIdx();
      const jobMap = new Map();

      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < tabs.length; i++) {
          const isActive = (i === originIdx);
          if (!isActive) {
            tabs[i].click();
            await utils.waitFor(() => dom.getAttachments().length > 0, { timeout: 5000 });
            await utils.sleep(round === 0 ? 900 : 500);
          } else {
            if (round === 0) await utils.sleep(500);
          }

          const list = this.scanCurrentCard();
          list.forEach(j => {
            const key = j.jobId || j.objectId || `card${i}-idx${j.index}`;
            const rec = {
              ...j,
              cardIndex: i,
              cardText: (tabs[i].querySelector('.spanText')?.textContent
                     || tabs[i].textContent || '').trim()
            };
            const prev = jobMap.get(key);
            if (!prev) {
              jobMap.set(key, rec);
            } else {
              if (prev.done && !rec.done) rec.done = true;
              jobMap.set(key, rec);
            }
          });
        }
      }

      if (originIdx >= 0 && tabs[originIdx]) {
        tabs[originIdx].click();
        await utils.sleep(800);
      }

      return Array.from(jobMap.values());
    }
  };
})();