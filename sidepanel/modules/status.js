(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const Store = SP.storage;

  // ★ 修复隐患 2：banner 只更新文本，不重建整个 innerHTML
  // 避免 status-dot / refresh / settings 反复销毁重建导致闪烁
  let bound = false;

  async function refreshAiBanner() {
    const cfg = await Store.getAIConfig();
    const autoOn = await Store.getAutoAnswer();
    const banner = U.$('ai-banner');
    if (!banner) return;

    const hasKey = !!(cfg.apiKey && cfg.apiKey.trim());

    banner.className = 'ai-banner ' + (hasKey ? 'ok' : 'warn');

    const textEl = banner.querySelector('.ai-banner-text');
    const metaEl = banner.querySelector('.ai-banner-model, .ai-banner-action');

    if (hasKey) {
      const tags = [cfg.model];
      if (cfg.thinkingType === 'enabled') tags.push('思考');
      if (autoOn) tags.push('自动答题');
      if (textEl) textEl.textContent = 'AI 模型已接入，支持答题';
      if (metaEl) {
        metaEl.className = 'ai-banner-model';
        metaEl.textContent = tags.join(' · ');
      }
      banner.title = '点击修改 AI 配置';
    } else {
      if (textEl) textEl.textContent = '未接入 AI 模型';
      if (metaEl) {
        metaEl.className = 'ai-banner-action';
        metaEl.textContent = '点击接入 →';
      }
      banner.title = '点击接入 MiMo 模型';
    }

    // 同步状态点（HTML 里的元素不会被重建，直接改 class）
    const dot = U.$('status-dot');
    if (dot) dot.classList.toggle('running', !!SP.state.running);

    // ★ 事件只绑定一次
    if (bound) return;
    bound = true;

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

    banner.onclick = (e) => {
      if (e.target.closest && e.target.closest('.banner-tools')) return;
      if (SP.settings && SP.settings.showSettings) {
        SP.settings.showSettings();
      }
    };
  }

  SP.status = { refreshAiBanner };
})();