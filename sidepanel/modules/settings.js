(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const Store = SP.storage;
  const AI = SP.ai;

  async function showSettings() {
    const cfg = await Store.getAIConfig();
    const autoAnswer = await Store.getAutoAnswer();
    const autoMute = await Store.getAutoMute();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">屿宁学习助手 · 设置</div>

        <label class="modal-label">API Key</label>
        <input type="password" id="ai-key" placeholder="sk-..." value="${U.escapeHtml(cfg.apiKey)}">

        <label class="modal-label">Base URL</label>
        <input type="text" id="ai-base" value="${U.escapeHtml(cfg.baseUrl)}">

        <label class="modal-label">模型</label>
        <select id="ai-model">
          ${Store.AI_MODELS.map(m =>
            `<option value="${m.value}" ${cfg.model === m.value ? 'selected' : ''}>${m.label}</option>`
          ).join('')}
        </select>

        <label class="modal-label">思考模式</label>
        <select id="ai-thinking">
          <option value="disabled" ${cfg.thinkingType === 'disabled' ? 'selected' : ''}>关闭（默认，更快）</option>
          <option value="enabled" ${cfg.thinkingType === 'enabled' ? 'selected' : ''}>开启（更准，更慢）</option>
        </select>

        <div style="margin-top:16px;border-top:1px solid #f0f0f0;padding-top:12px;">
          <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px;">
            <input type="checkbox" id="auto-answer" ${autoAnswer ? 'checked' : ''} style="width:auto;">
            <span>检测到答题页自动填写答案</span>
          </label>

          <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:10px;">
            <input type="checkbox" id="auto-mute" ${autoMute ? 'checked' : ''} style="width:auto;">
            <span>自动静音播放（推荐）</span>
          </label>
          <div style="font-size:11px;color:#999;margin-top:4px;margin-left:22px;">
            开启后视频默认静音播放，避免浏览器自动播放拦截
          </div>
        </div>

        <div id="ai-status" class="ai-status"></div>

        <div class="modal-buttons">
          <button id="ai-cancel">取消</button>
          <button id="ai-save" class="primary">保存并验证</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const statusEl = overlay.querySelector('#ai-status');
    const close = () => overlay.remove();
    overlay.querySelector('#ai-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    overlay.querySelector('#ai-save').onclick = async () => {
      const apiKey = overlay.querySelector('#ai-key').value.trim();
      const baseUrl = overlay.querySelector('#ai-base').value.trim() || Store.AI_CONFIG_DEFAULT.baseUrl;
      const model = overlay.querySelector('#ai-model').value;
      const thinkingType = overlay.querySelector('#ai-thinking').value;
      const autoOn = overlay.querySelector('#auto-answer').checked;
      const autoMuteOn = overlay.querySelector('#auto-mute').checked;

      if (!apiKey) {
        statusEl.className = 'ai-status err';
        statusEl.textContent = '请填写 API Key';
        return;
      }

      const saveBtn = overlay.querySelector('#ai-save');
      saveBtn.disabled = true;
      saveBtn.textContent = '验证中…';
      statusEl.className = 'ai-status';
      statusEl.textContent = '正在验证 API Key 和模型…';

      const result = await AI.verifyConfig(apiKey, baseUrl, model);

      if (result.ok) {
        await Store.saveAIConfig({ apiKey, baseUrl, model, thinkingType });
        await Store.setAutoAnswer(autoOn);
        await Store.setAutoMute(autoMuteOn);
        statusEl.className = 'ai-status ok';
        statusEl.textContent = `✓ 验证通过（${model}）`;
        U.log(`配置已保存（模型: ${model}, 自动答题: ${autoOn ? '开' : '关'}, 自动静音: ${autoMuteOn ? '开' : '关'}）`, 'ok');
        if (SP.status && SP.status.refreshAiBanner) {
          SP.status.refreshAiBanner();
        }
        setTimeout(close, 1200);
      } else {
        statusEl.className = 'ai-status err';
        statusEl.textContent = `✗ ${result.error}`;
        U.log(`AI 验证失败: ${result.error}`, 'err');
        saveBtn.disabled = false;
        saveBtn.textContent = '保存并验证';
      }
    };
  }

  SP.settings = { showSettings };
})();