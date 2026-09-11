(function () {
  'use strict';
  window.SP = window.SP || {};

  const AI_CONFIG_KEY = 'mimoConfig';
  const AUTO_ANSWER_KEY = 'autoAnswer';
  const AUTO_MUTE_KEY = 'autoMute';
  const DISRUPT_LOCK_KEY = 'disruptLock';
  const AUTO_CAPTCHA_OCR_KEY = 'autoCaptchaOCR';

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
      const merged = {};
      for (const k of Object.keys(AI_CONFIG_DEFAULT)) {
        merged[k] = (typeof saved[k] !== 'undefined') ? saved[k] : AI_CONFIG_DEFAULT[k];
      }
      return merged;
    },

    async saveAIConfig(cfg) {
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
    },

    // ★★★ 新增：自动识别验证码（默认开启）
    async getAutoCaptchaOCR() {
      const r = await chrome.storage.local.get(AUTO_CAPTCHA_OCR_KEY);
      return r[AUTO_CAPTCHA_OCR_KEY] !== false;
    },
    async setAutoCaptchaOCR(on) {
      await chrome.storage.local.set({ [AUTO_CAPTCHA_OCR_KEY]: !!on });
    }
  };
})();