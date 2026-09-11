(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;

  // ============================================================
  // 待处理事件常驻区
  // 把「需要你动手」的事件从日志流里拎出来，解决后自动消失。
  // 日志是流水账，这个区是当前状态 —— 两者职责不同。
  // ============================================================
  function set(kind, text, level) {
    if (!kind) return;
    SP.state.pending[kind] = { text: String(text || ''), level: level || 'warn' };
    render();
  }

  function clear(kind) {
    if (SP.state.pending && SP.state.pending[kind]) {
      delete SP.state.pending[kind];
      render();
    }
  }

  function clearAll() {
    SP.state.pending = {};
    render();
  }

  function render() {
    const box = U.$('pending-area');
    if (!box) return;
    const keys = Object.keys(SP.state.pending || {});
    if (keys.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = keys.map((k) => {
      const it = SP.state.pending[k];
      return `<div class="pending-item ${U.escapeHtml(it.level)}">` +
             `<span class="pending-dot"></span>` +
             `<span class="pending-text">${U.escapeHtml(it.text)}</span>` +
             `</div>`;
    }).join('');
  }

  SP.pending = { set, clear, clearAll, render };
})();
