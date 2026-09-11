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
    // ★ downloadfile = 附件（rar/zip），不是文档任务
    if (/downloadfile/.test(src)) return 'attachment';
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

  function getCardText(tab) {
    if (!tab) return '';
    const spanText = tab.querySelector('.spanText');
    if (spanText && spanText.textContent.trim()) {
      return spanText.textContent.trim();
    }
    for (const sel of ['.tab-title', 'a', 'span']) {
      const el = tab.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return (tab.textContent || '').trim();
  }

  function computeCardSignature() {
    const doc = dom.getCardsDoc();
    if (!doc) return '';
    const attaches = Array.from(doc.querySelectorAll('.ans-attach-ct'));
    if (!attaches.length) return '';
    return attaches.map(a => {
      const jid = extractAttr(a, 'jobid');
      const oid = extractAttr(a, 'objectid');
      const hasIcon = a.querySelector('.ans-job-icon') ? '1' : '0';
      const iframes = Array.from(a.querySelectorAll('iframe'));
      const srcs = iframes.map(f => (f.src || '').slice(-40)).join(',');
      return `${jid}|${oid}|${hasIcon}|${srcs}`;
    }).join(';;');
  }

  async function waitForCardLoaded(maxMs = 10000) {
    const start = Date.now();
    let lastSig = '';
    let stableTimes = 0;
    while (Date.now() - start < maxMs) {
      const sig = computeCardSignature();
      if (sig && sig === lastSig) {
        stableTimes++;
        if (stableTimes >= 2) return true;
      } else {
        stableTimes = 0;
      }
      lastSig = sig;
      await utils.sleep(400);
    }
    return false;
  }

  CXH.jobs = {
    waitForCardLoaded,
    computeCardSignature,
    getCardText,

    scanCurrentCard() {
      const tabs = dom.getCardTabs();
      const originIdx = dom.getActiveCardIdx();
      const cardText = getCardText(tabs[originIdx]);

      const attaches = dom.getAttachments();
      const list = [];
      attaches.forEach((c, i) => {
        // ★★★ 关键：无 .ans-job-icon → 不是任务点，跳过
        const icon = c.querySelector('.ans-job-icon');
        if (!icon) {
          // 可选：调试日志
          // console.log(`[CXH] attach[${i}] 无任务点图标，跳过`);
          return;
        }

        const aria = icon.getAttribute('aria-label') || '';

        const allIframes = Array.from(c.querySelectorAll('iframe'));
        const srcs = allIframes.map(f => f.src || '').filter(s => s && s !== 'about:blank');

        const videoIfr = dom.getVideoIframe(c);
        const docIfr = dom.getDocIframe ? dom.getDocIframe(c) : null;

        let type = 'unknown';
        let pickedSrc = '';
        if (videoIfr) {
          pickedSrc = videoIfr.src;
          type = 'video';
        } else if (docIfr) {
          pickedSrc = docIfr.src;
          type = classifyType(pickedSrc);
        } else if (srcs.length > 0) {
          for (const s of srcs) {
            const t = classifyType(s);
            if (t !== 'unknown' && t !== 'attachment') {
              pickedSrc = s;
              type = t;
              break;
            }
          }
          if (!pickedSrc) pickedSrc = srcs[0];
        }

        // ★ 二次过滤：attachment 不进任务列表
        if (type === 'attachment') return;

        list.push({
          index: i,
          done: judgeDone(c, aria),
          type,
          aria,
          src: pickedSrc,
          jobId: extractAttr(c, 'jobid'),
          objectId: extractAttr(c, 'objectid'),
          cardIndex: originIdx >= 0 ? originIdx : 0,
          cardText
        });
      });
      return list;
    },

    async scanCurrent() {
      const tabs = dom.getCardTabs();
      const originIdx = dom.getActiveCardIdx();
      const jobMap = new Map();

      let list = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        await waitForCardLoaded(attempt === 1 ? 6000 : 4000);
        list = this.scanCurrentCard();
        if (list.length > 0) break;
        await utils.sleep(2500);
      }

      list.forEach(j => {
        const key = j.jobId || j.objectId || `idx${j.index}-${j.type}`;
        jobMap.set(key, j);
      });
      return Array.from(jobMap.values());
    },

    async scanAllCards(opts = {}) {
      const rounds = opts.rounds || 1;
      const tabs = dom.getCardTabs();
      const originIdx = dom.getActiveCardIdx();
      const jobMap = new Map();

      if (tabs.length <= 1) return await this.scanCurrent();

      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < tabs.length; i++) {
          const isOriginActive = (i === originIdx && round === 0);
          if (!isOriginActive) {
            tabs[i].click();
            await waitForCardLoaded(10000);
            await utils.sleep(round === 0 ? 500 : 300);
          } else {
            if (round === 0) await utils.sleep(600);
          }

          const list = this.scanCurrentCard();
          list.forEach(j => {
            const key = j.jobId || j.objectId || `card${i}-idx${j.index}-${j.type}`;
            const rec = { ...j, cardIndex: i, cardText: getCardText(tabs[i]) };
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

      const currentActive = dom.getActiveCardIdx();
      if (originIdx >= 0 && tabs[originIdx] && currentActive !== originIdx) {
        tabs[originIdx].click();
        await waitForCardLoaded(6000);
      }

      return Array.from(jobMap.values());
    }
  };
})();