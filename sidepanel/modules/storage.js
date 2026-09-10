(function () {
  'use strict';
  window.SP = window.SP || {};

  const AI_CONFIG_KEY = 'mimoConfig';
  const AUTO_ANSWER_KEY = 'autoAnswer';
  const AUTO_MUTE_KEY = 'autoMute';

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

    // ---------- AI 配置 ----------
    async getAIConfig() {
      const r = await chrome.storage.local.get(AI_CONFIG_KEY);
      return Object.assign({}, AI_CONFIG_DEFAULT, r[AI_CONFIG_KEY] || {});
    },

    async saveAIConfig(cfg) {
      await chrome.storage.local.set({ [AI_CONFIG_KEY]: cfg });
    },

    // ---------- 自动答题开关 ----------
    async getAutoAnswer() {
      const r = await chrome.storage.local.get(AUTO_ANSWER_KEY);
      return r[AUTO_ANSWER_KEY] === true;
    },

    async setAutoAnswer(on) {
      await chrome.storage.local.set({ [AUTO_ANSWER_KEY]: !!on });
    },

    // ---------- 自动静音开关 ----------
    async getAutoMute() {
      const r = await chrome.storage.local.get(AUTO_MUTE_KEY);
      return r[AUTO_MUTE_KEY] === true;
    },

    async setAutoMute(on) {
      await chrome.storage.local.set({ [AUTO_MUTE_KEY]: !!on });
    }
  };
})();