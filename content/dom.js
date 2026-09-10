(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  const dom = {
    getCardsIframe() { return document.getElementById('iframe'); },

    getCardsDoc() {
      const f = this.getCardsIframe();
      if (!f) return null;
      try { return f.contentDocument; } catch (_) { return null; }
    },

    getCardTabs() {
      return Array.from(document.querySelectorAll('#prev_tab .prev_ul > li'));
    },

    getActiveCardIdx() {
      return this.getCardTabs().findIndex(t => t.classList.contains('active'));
    },

    getAttachments() {
      const doc = this.getCardsDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('.ans-attach-ct'));
    },

    getVideoIframe(attach) {
      if (!attach) return null;
      for (const f of attach.querySelectorAll('iframe')) {
        if (/ananas\/modules\/video/.test(f.src || '')) return f;
      }
      return null;
    },

    getVideoEl(videoIframe) {
      if (!videoIframe) return null;
      try {
        const doc = videoIframe.contentDocument;
        if (!doc) return null;
        return doc.querySelector('video#video') || doc.querySelector('video') || null;
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