(function () {
  'use strict';
  if (window.__CXH) return;
  window.__CXH = {};

  const utils = {
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

    async waitFor(condition, opts = {}) {
      const timeout = opts.timeout || 15000;
      const interval = opts.interval || 300;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const r = condition();
          if (r) return r;
        } catch (_) {}
        await this.sleep(interval);
      }
      return null;
    },

    log(text, level) {
      const msg = String(text);
      try {
        chrome.runtime.sendMessage({ type: 'LOG', text: msg, level: level || '' });
      } catch (_) {}
      console.log('[CXH]', msg);
    },

    sendMsg(msg) {
      try { chrome.runtime.sendMessage(msg); } catch (_) {}
    }
  };

  window.__CXH.utils = utils;
})();