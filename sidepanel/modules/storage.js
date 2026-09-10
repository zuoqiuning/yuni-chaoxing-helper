(function () {
  'use strict';
  window.SP = window.SP || {};

  const AI_CONFIG_KEY = 'mimoConfig';
  const AUTO_ANSWER_KEY = 'autoAnswer';
  const AUTO_MUTE_KEY = 'autoMute';
  const DISRUPT_LOCK_KEY = 'disruptLock';

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
      return Object.assign({}, AI_CONFIG_DEFAULT, r[AI_CONFIG_KEY] || {});
    },
    async saveAIConfig(cfg) {
      await chrome.storage.local.set({ [AI_CONFIG_KEY]: cfg });
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
    // ★ 防打扰锁
    async getDisruptLock() {
      const r = await chrome.storage.local.get(DISRUPT_LOCK_KEY);
      return r[DISRUPT_LOCK_KEY] !== false;  // 默认开启
    },
    async setDisruptLock(on) {
      await chrome.storage.local.set({ [DISRUPT_LOCK_KEY]: !!on });
    }
  };
})();