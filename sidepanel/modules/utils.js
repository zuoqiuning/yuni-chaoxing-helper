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
    pendingResume: null,
    // ★ 答题逐题回读结果：[{ index, ok, via, reason, expected, actual }]
    fillResults: [],
    // ★ 待处理事件：kind -> { text, level }
    pending: {}
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

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  };

  // ============================================================
  // 运行态持久化（chrome.storage.session，内存态，扩展重载即清空）
  // 目的：侧边栏被误关 / 浏览器崩溃后，仍能知道上次跑到哪一节；
  //       尤其是「验证码通过 → 刷新页面」期间面板被关掉时，
  //       pendingResume 不再随内存一起丢失。
  // 注意：不做自动接管，只恢复状态并提示，避免双流程并发。
  // ============================================================
  const RUNTIME_KEY = '__sp_runtime';

  SP.runtime = {
    async save() {
      try {
        await chrome.storage.session.set({
          [RUNTIME_KEY]: {
            runningTabId: SP.state.runningTabId || null,
            runningSectionId: SP.state.runningSectionId || null,
            pendingResume: SP.state.pendingResume || null,
            updatedAt: Date.now()
          }
        });
      } catch (_) {}
    },

    async load() {
      try {
        const r = await chrome.storage.session.get(RUNTIME_KEY);
        return r[RUNTIME_KEY] || null;
      } catch (_) { return null; }
    },

    async clear() {
      try { await chrome.storage.session.remove(RUNTIME_KEY); } catch (_) {}
    }
  };
})();