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
      banner.innerHTML = `
        <span class="ai-banner-icon">●</span>
        <span class="ai-banner-text">AI 模型已接入，支持答题</span>
        <span class="ai-banner-model">${tags.join(' · ')}</span>
      `;
      banner.title = '点击修改 AI 配置';
    } else {
      banner.className = 'ai-banner warn';
      banner.innerHTML = `
        <span class="ai-banner-icon">●</span>
        <span class="ai-banner-text">未接入 AI 模型</span>
        <span class="ai-banner-action">点击接入 →</span>
      `;
      banner.title = '点击接入 MiMo 模型';
    }

    banner.onclick = () => {
      if (SP.settings && SP.settings.showSettings) {
        SP.settings.showSettings();
      }
    };
  }

  SP.status = { refreshAiBanner };
})();