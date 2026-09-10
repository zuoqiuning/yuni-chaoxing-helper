(function () {
  'use strict';
  window.SP = window.SP || {};

  SP.state = {
    running: false,
    runningTabId: null,     // 正在跑任务的 tab id（仅用于阻止重复启动）
    boundTabId: null,       // 当前面板展示的 tab id
    scanning: false,
    currentJobs: [],
    catalogCache: [],
    quizQuestions: [],
    pendingAnswers: [],
    lastScrolledSectionId: null
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
      line.textContent = `[${t}] ${msg}`;
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

    setProgress(cur, total, label) {
      const wrap = this.$('progress-wrap');
      const text = this.$('progress-text');
      const pct = this.$('progress-percent');
      const inner = this.$('progress-inner');
      if (!wrap || !inner) return;

      if (total <= 0) {
        wrap.classList.remove('show');
        return;
      }

      wrap.classList.add('show');
      const p = Math.min(100, (cur / total) * 100);
      inner.style.width = p + '%';
      if (text) text.textContent = label || `第 ${cur}/${total} 节`;
      if (pct) pct.textContent = p.toFixed(0) + '%';
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  };
})();