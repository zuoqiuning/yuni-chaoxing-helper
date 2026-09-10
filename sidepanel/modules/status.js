(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const Store = SP.storage;

  async function refreshAiBanner() {
    const cfg = await Store.getAIConfig();
    const autoOn = await Store.getAutoAnswer();
    const banner = U.$('ai-banner');
    if (!banner) return;

    const hasKey = !!(cfg.apiKey && cfg.apiKey.trim());

    if (hasKey) {
      banner.className = 'ai-banner ok';
      const tags = [];
      tags.push(U.escapeHtml(cfg.model));
      if (cfg.thinkingType === 'enabled') tags.push('思考');
      if (autoOn) tags.push('自动答题');
      // ★ 保留 banner-tools 区域（工具栏）
      banner.innerHTML = `
        <span class="ai-banner-icon">●</span>
        <span class="ai-banner-text">AI 模型已接入，支持答题</span>
        <span class="ai-banner-model">${tags.join(' · ')}</span>
        <div class="banner-tools" id="banner-tools">
          <span class="status-dot" id="status-dot" title="空闲"></span>
          <button class="icon-btn" id="refresh" title="重新扫描">↻</button>
          <button class="icon-btn" id="settings" title="设置">⚙</button>
        </div>
      `;
      banner.title = '点击修改 AI 配置';
    } else {
      banner.className = 'ai-banner warn';
      banner.innerHTML = `
        <span class="ai-banner-icon">●</span>
        <span class="ai-banner-text">未接入 AI 模型</span>
        <span class="ai-banner-action">点击接入 →</span>
        <div class="banner-tools" id="banner-tools">
          <span class="status-dot" id="status-dot" title="空闲"></span>
          <button class="icon-btn" id="refresh" title="重新扫描">↻</button>
          <button class="icon-btn" id="settings" title="设置">⚙</button>
        </div>
      `;
      banner.title = '点击接入 MiMo 模型';
    }

    // ★ 重新绑定事件（innerHTML 重建后需要）
    bindBannerEvents();

    // 同步状态点到当前运行状态
    const dot = U.$('status-dot');
    if (dot) dot.classList.toggle('running', !!SP.state.running);

    const refreshBtn = U.$('refresh');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        try {
          if (SP.state.running && SP.state.runningTabId) {
            U.log('任务运行中，重启当前节…');
            const r = await SP.scan.restartCurrent(SP.state.runningTabId);
            if (r.ok) U.log(`已重启当前节 (${r.sectionId})`, 'ok');
            else U.log('重启失败: ' + r.error, 'err');
          } else {
            await SP.scan.doScan(false);
          }
        } finally {
          refreshBtn.disabled = false;
        }
      };
    }

    const settingsBtn = U.$('settings');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        if (SP.settings && SP.settings.showSettings) SP.settings.showSettings();
      };
    }
  }

  function bindBannerEvents() {
    const banner = U.$('ai-banner');
    if (!banner) return;
    banner.onclick = (e) => {
      // 点击工具栏区域不触发"打开设置"
      if (e.target.closest && e.target.closest('.banner-tools')) return;
      if (SP.settings && SP.settings.showSettings) {
        SP.settings.showSettings();
      }
    };
  }

  SP.status = { refreshAiBanner };
})();