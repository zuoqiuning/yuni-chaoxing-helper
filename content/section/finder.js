(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH || !CXH.P || !CXH.S) return;
  const SEL = CXH.SEL;
  const P = CXH.P;
  const S = CXH.S;
  const dom = CXH.dom;
  const jobs = CXH.jobs;
  const utils = CXH.utils;

  function classifyTypeSimple(src) {
    if (!src) return 'unknown';
    if (SEL.RE.videoIframe.test(src)) return 'video';
    if (SEL.RE.downloadFile.test(src)) return 'document';
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

  function findAttachInCurrentTab(job) {
    const attaches = dom.getAttachments();
    if (!attaches.length) return null;

    if (job.jobId) {
      for (const a of attaches) {
        if (extractAttr(a, SEL.jobIdAttr) === job.jobId) return a;
      }
    }
    if (job.objectId) {
      for (const a of attaches) {
        if (extractAttr(a, SEL.objectIdAttr) === job.objectId) return a;
      }
    }
    if (typeof job.index === 'number' && attaches[job.index]) {
      const a = attaches[job.index];
      const videoIfr = dom.getVideoIframe(a);
      const docIfr = dom.getDocIframe ? dom.getDocIframe(a) : null;
      const anyIfr = a.querySelector(SEL.iframe);
      const src = videoIfr?.src || docIfr?.src || anyIfr?.src || '';
      if (classifyTypeSimple(src) === job.type) return a;
    }
    const sameType = attaches.filter(a => {
      const videoIfr = dom.getVideoIframe(a);
      const docIfr = dom.getDocIframe ? dom.getDocIframe(a) : null;
      const anyIfr = a.querySelector(SEL.iframe);
      const src = videoIfr?.src || docIfr?.src || anyIfr?.src || '';
      return classifyTypeSimple(src) === job.type;
    });
    if (sameType.length === 1) return sameType[0];

    return null;
  }

  // ★★★ 新增：等待 iframe 切到目标 tab（通过 num= 参数确认）
  async function waitForTabSwitch(targetIdx, maxMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (P.stopped) return false;
      if (S.restartFlag) return false;

      const cur = dom.getIframeCardIdx();
      if (cur === targetIdx) {
        // 已经切到目标 tab，再等内容稳定
        const ok = await jobs.waitForCardLoaded(6000);
        if (!ok) {
          // 内容还在加载，但 iframe 已切到目标，额外再等一会儿
          await utils.sleep(1500);
        }
        // 二次确认：iframe 仍然是目标 tab（防止切换过程中又被改）
        return dom.getIframeCardIdx() === targetIdx;
      }
      await utils.sleep(300);
    }
    return false;
  }

  async function ensureJobReady(job, maxMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (P.stopped) return null;
      if (S.restartFlag) return null;

      const attach = findAttachInCurrentTab(job);
      if (attach) {
        if (job.type === 'video') {
          const ifr = dom.getVideoIframe(attach);
          if (ifr && ifr.src && ifr.src !== 'about:blank') return attach;
        } else if (job.type === 'document') {
          const ifr = dom.getDocIframe ? dom.getDocIframe(attach) : null;
          if (ifr && ifr.src && ifr.src !== 'about:blank') {
            try {
              const d = ifr.contentDocument;
              if (d && d.readyState === 'complete' && d.body) return attach;
            } catch (_) {}
          }
        } else {
          return attach;
        }
      }
      await utils.sleep(500);
    }
    return null;
  }

  function waitEndedWithSectionCheck(videoIframe, timeoutMs, expectedSectionId) {
    return new Promise(resolve => {
      const inner = CXH.player.waitEnded(videoIframe, timeoutMs);
      let done = false;
      const isOnSection = (id) => {
        if (!id) return true;
        return dom.getCurrentSectionId() === id;
      };
      const checker = setInterval(() => {
        if (done) return;
        if (S.restartFlag) {
          clearInterval(checker);
          done = true;
          resolve({ ok: false, error: 'interrupted' });
          return;
        }
        if (!isOnSection(expectedSectionId)) {
          clearInterval(checker);
          done = true;
          try { const v = dom.getVideoEl(videoIframe); if (v) v.pause(); } catch (_) {}
          resolve({ ok: false, sectionChanged: true });
        }
      }, 2000);
      inner.then(res => {
        if (done) return;
        done = true;
        clearInterval(checker);
        resolve(res);
      }).catch(e => {
        if (done) return;
        done = true;
        clearInterval(checker);
        resolve({ ok: false, error: String(e) });
      });
    });
  }

  CXH.sectionFinder = {
    findAttachInCurrentTab,
    waitForTabSwitch,
    ensureJobReady,
    waitEndedWithSectionCheck,
    classifyTypeSimple,
    extractAttr
  };
})();