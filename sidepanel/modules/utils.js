(function () {
  'use strict';
  window.SP = window.SP || {};

  SP.state = {
    running: false,
    runningTabId: null,
    boundTabId: null,
    scanning: false,
    currentJobs: [],
    catalogCache: [],
    jobCards: [],
    jobCardsSectionId: null,
    quizQuestions: [],
    pendingAnswers: [],
    lastScrolledSectionId: null,
    playingCardIdx: null,
    playingJobIdx: null,
    playingJobId: null,
    localDoneJobs: {},
    // ★★★ 新增：验证码通过后等待页面刷新恢复
    pendingResume: null
  };

  SP.utils = {
    $(id) { return document.getElementById(id); },
    qs(sel, root) { return (root || document).querySelector(sel); },
    qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },

    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    },

    log(msg, level = '') {
      const el = this.$('log');
      if (!el) return;
      const line = document.createElement('div');
      line.className = 'log-line ' + level;
      const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });

      const ts = document.createElement('span');
      ts.className = 'ts';
      ts.textContent = t;

      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = msg;

      line.appendChild(ts);
      line.appendChild(txt);
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
      while (el.children.length > 300) el.removeChild(el.firstChild);
      console.log('[SP]', msg);
    },

    setStatus(run) {
      SP.state.running = run;
      const dot = this.$('status-dot');
      if (!dot) return;
      dot.classList.toggle('running', run);
      dot.title = run ? '运行中' : '空闲';
    },

    setProgress() { /* no-op */ },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  };
})();