(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const SEL = CXH.SEL;
  const dom = CXH.dom;
  const utils = CXH.utils;

  // ============================================================
  // ★★★ 完成判断（多重策略，class 优先）
  // ============================================================
  function judgeDone(attach) {
    // 策略 1：attach 本身有 class
    if (attach.classList.contains(SEL.jobFinishedClass)) return true;

    // 策略 2：attach 内有 .ans-job-finished
    if (attach.querySelector(SEL.jobFinished)) return true;

    // 策略 3：找到 .ans-job-icon，检查它和它的所有祖先（最多 4 层）
    const icons = attach.querySelectorAll(SEL.jobIcon);
    for (const icon of icons) {
      let el = icon;
      for (let i = 0; i < 4 && el; i++) {
        try {
          if (el.classList && el.classList.contains(SEL.jobFinishedClass)) return true;
        } catch (_) {}
        el = el.parentElement;
      }
    }

    // 策略 4：找 .ans-job-icon 本身或祖先的 aria-label
    for (const icon of icons) {
      let el = icon;
      for (let i = 0; i < 4 && el; i++) {
        try {
          const aria = el.getAttribute && el.getAttribute('aria-label');
          if (aria && SEL.RE.jobDoneAria.test(aria)) return true;
        } catch (_) {}
        el = el.parentElement;
      }
    }

    return false;
  }

  // 详细诊断
  function diagnoseAttach(attach) {
    const icons = attach.querySelectorAll(SEL.jobIcon);
    const firstIcon = icons[0];
    const firstAria = firstIcon ? (firstIcon.getAttribute('aria-label') || '') : '';
    // 找 ans-job-finished 在哪
    let finishedEl = attach.querySelector(SEL.jobFinished);
    let finishedInAncestor = false;
    if (firstIcon) {
      let el = firstIcon;
      for (let i = 0; i < 4 && el; i++) {
        if (el.classList && el.classList.contains(SEL.jobFinishedClass)) {
          finishedInAncestor = true;
          break;
        }
        el = el.parentElement;
      }
    }
    return {
      iconCount: icons.length,
      firstAria,
      hasFinishedChild: !!finishedEl,
      finishedInAncestor,
      attachClasses: attach.className
    };
  }

  function classifyType(src) {
    if (!src) return 'unknown';
    if (SEL.RE.videoIframe.test(src)) return 'video';
    if (SEL.RE.downloadFile.test(src)) return 'attachment';
    if (SEL.RE.docIframeDoc.test(src)) return 'document';
    if (SEL.RE.docIframePdf.test(src)) return 'document';
    if (SEL.RE.docHost.test(src)) return 'document';
    if (SEL.RE.audioIframe.test(src)) return 'audio';
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
    const spanText = tab.querySelector(SEL.cardText);
    if (spanText && spanText.textContent.trim()) {
      return spanText.textContent.trim();
    }
    for (const sel of SEL.cardTextFallbacks) {
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
    const attaches = Array.from(doc.querySelectorAll(SEL.attach));
    if (!attaches.length) return '';
    return attaches.map(a => {
      const jid = extractAttr(a, SEL.jobIdAttr);
      const oid = extractAttr(a, SEL.objectIdAttr);
      const hasIcon = a.querySelector(SEL.jobIcon) ? '1' : '0';
      const finished = a.querySelector(SEL.jobFinished) || a.classList.contains(SEL.jobFinishedClass) ? '1' : '0';
      const iframes = Array.from(a.querySelectorAll(SEL.iframe));
      const srcs = iframes.map(f => (f.src || '').slice(-40)).join(',');
      return `${jid}|${oid}|${hasIcon}|${finished}|${srcs}`;
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
    classifyType,   // 纯函数，导出以便离线测试（test/pure-functions.test.js）

    scanCurrentCard() {
      const tabs = dom.getCardTabs();
      const originIdx = dom.getActiveCardIdx();
      const cardText = getCardText(tabs[originIdx]);

      const attaches = dom.getAttachments();
      const list = [];
      const diagLines = [];

      attaches.forEach((c, i) => {
        const icon = c.querySelector(SEL.jobIcon);
        if (!icon) {
          diagLines.push(`[${i}] 无 icon，跳过`);
          return;
        }

        const allIframes = Array.from(c.querySelectorAll(SEL.iframe));
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

        if (type === 'attachment') {
          diagLines.push(`[${i}] attachment，跳过`);
          return;
        }

        const done = judgeDone(c);
        const diag = diagnoseAttach(c);
        diagLines.push(`[${i}] type=${type} done=${done} aria="${diag.firstAria}" finishedChild=${diag.hasFinishedChild} finishedAncestor=${diag.finishedInAncestor}`);

        list.push({
          index: i,
          done,
          type,
          aria: diag.firstAria,
          src: pickedSrc,
          jobId: extractAttr(c, SEL.jobIdAttr),
          objectId: extractAttr(c, SEL.objectIdAttr),
          cardIndex: originIdx >= 0 ? originIdx : 0,
          cardText
        });
      });

      console.log(`[CXH] 卡片扫描 (卡${(originIdx >= 0 ? originIdx : 0) + 1}):`);
      diagLines.forEach(l => console.log('  ' + l));

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