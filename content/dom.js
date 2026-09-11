(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  const SEL = CXH.SEL;
  const dom = {
    getCardsIframe() { return document.getElementById(SEL.cardsIframeId); },

    getCardsDoc() {
      const f = this.getCardsIframe();
      if (!f) return null;
      try { return f.contentDocument; } catch (_) { return null; }
    },

    getCardTabs() {
      return Array.from(document.querySelectorAll(SEL.cardTabs));
    },

    getActiveCardIdx() {
      return this.getCardTabs().findIndex(t => t.classList.contains(SEL.cardActiveClass));
    },

    // ★★★ 新增：从 iframe.src 解析当前激活的 cardIndex
    // 超星 iframe 结构：/knowledge/cards?...&num=0（num 从 0 开始）
    getIframeCardIdx() {
      const ifr = this.getCardsIframe();
      if (!ifr || !ifr.src) return -1;
      try {
        const m = ifr.src.match(SEL.RE.cardNumParam);
        if (m) return parseInt(m[1], 10);
      } catch (_) {}
      return -1;
    },

    getAttachments() {
      const doc = this.getCardsDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll(SEL.attach));
    },

    getVideoIframe(attach) {
      if (!attach) return null;
      for (const f of attach.querySelectorAll(SEL.iframe)) {
        if (SEL.RE.videoIframe.test(f.src || '')) return f;
      }
      return null;
    },

    getDocIframe(attach) {
      if (!attach) return null;
      for (const f of attach.querySelectorAll(SEL.iframe)) {
        const src = f.src || '';
        if (SEL.RE.docIframe.test(src) || SEL.RE.docHost.test(src)) return f;
      }
      for (const f of attach.querySelectorAll(SEL.iframe)) {
        if ((f.src || '') && f.src !== 'about:blank') return f;
      }
      return null;
    },

    getVideoEl(videoIframe) {
      if (!videoIframe) return null;
      try {
        const doc = videoIframe.contentDocument;
        if (!doc) return null;
        return doc.querySelector(SEL.videoEl) || doc.querySelector('video') || null;
      } catch (_) { return null; }
    },

    getVideoPlayer(videoIframe) {
      if (!videoIframe) return null;
      try {
        const win = videoIframe.contentWindow;
        if (!win || typeof win.videojs !== 'function') return null;
        return win.videojs.getPlayer('video') || win.videojs('video');
      } catch (_) { return null; }
    },

    getCurrentSectionId() {
      try { return new URL(location.href).searchParams.get('chapterId'); }
      catch (_) { return null; }
    },

    getCurrentCourseId() {
      try { return new URL(location.href).searchParams.get('courseId'); }
      catch (_) { return null; }
    }
  };

  CXH.dom = dom;
})();