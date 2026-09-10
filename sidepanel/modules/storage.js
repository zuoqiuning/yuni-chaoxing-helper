(function () {
  'use strict';
  window.SP = window.SP || {};

  const AI_CONFIG_KEY = 'mimoConfig';
  const AUTO_ANSWER_KEY = 'autoAnswer';
  const AUTO_MUTE_KEY = 'autoMute';
  const DISRUPT_LOCK_KEY = 'disruptLock';

  // ⚠️ 新增配置字段必须同步加到 AI_CONFIG_DEFAULT，
  //    否则 getAIConfig/saveAIConfig 的字段白名单会把它过滤掉
  const AI_CONFIG_DEFAULT = {
    apiKey: '',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5',
    thinkingType: 'disabled'
  };

  const AI_MODELS = [
    { value: 'mimo-v2.5', label: 'MiMo V2.5（全模态，默认）' },
    { value: 'mimo-v2.5-pro', label: 'MiMo V2.5 Pro（旗舰推理）' }
  ];

  SP.storage = {
    AI_CONFIG_DEFAULT,
    AI_MODELS,

    async getAIConfig() {
      const r = await chrome.storage.local.get(AI_CONFIG_KEY);
      const saved = r[AI_CONFIG_KEY] || {};
      // ★ 修复 #17：只保留已知字段，其余用默认值兜底
      // 同时剔除历史遗留的未知字段
      const merged = {};
      for (const k of Object.keys(AI_CONFIG_DEFAULT)) {
        merged[k] = (typeof saved[k] !== 'undefined') ? saved[k] : AI_CONFIG_DEFAULT[k];
      }
      return merged;
    },

    async saveAIConfig(cfg) {
      // 保存时也做一次字段过滤，避免脏数据
      const clean = {};
      for (const k of Object.keys(AI_CONFIG_DEFAULT)) {
        clean[k] = (typeof cfg[k] !== 'undefined') ? cfg[k] : AI_CONFIG_DEFAULT[k];
      }
      await chrome.storage.local.set({ [AI_CONFIG_KEY]: clean });
    },

    async getAutoAnswer() {
      const r = await chrome.storage.local.get(AUTO_ANSWER_KEY);
      return r[AUTO_ANSWER_KEY] === true;
    },
    async setAutoAnswer(on) {
      await chrome.storage.local.set({ [AUTO_ANSWER_KEY]: !!on });
    },

    async getAutoMute() {
      const r = await chrome.storage.local.get(AUTO_MUTE_KEY);
      return r[AUTO_MUTE_KEY] === true;
    },
    async setAutoMute(on) {
      await chrome.storage.local.set({ [AUTO_MUTE_KEY]: !!on });
    },

    async getDisruptLock() {
      const r = await chrome.storage.local.get(DISRUPT_LOCK_KEY);
      return r[DISRUPT_LOCK_KEY] !== false;
    },
    async setDisruptLock(on) {
      await chrome.storage.local.set({ [DISRUPT_LOCK_KEY]: !!on });
    }
  };
})();