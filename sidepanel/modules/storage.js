(function () {
  'use strict';
  window.SP = window.SP || {};

  const AI_CONFIG_KEY = 'mimoConfig';          // chrome.storage.local：仅存非敏感配置
  const AI_KEY_SESSION = 'mimoApiKey';         // chrome.storage.session：密钥（内存态）
  const AI_KEY_LOCAL = 'mimoApiKeyLocal';      // chrome.storage.local：仅在「记住 24 小时」时使用
  const AI_KEY_EXPIRE = 'mimoApiKeyExpireAt';  // chrome.storage.local：到期时间戳

  const AUTO_ANSWER_KEY = 'autoAnswer';
  const AUTO_MUTE_KEY = 'autoMute';
  const DISRUPT_LOCK_KEY = 'disruptLock';
  const AUTO_CAPTCHA_OCR_KEY = 'autoCaptchaOCR';

  const REMEMBER_MS = 24 * 60 * 60 * 1000;

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

  // ------------------------------------------------------------
  // 密钥存取
  // 默认只放 chrome.storage.session（纯内存，浏览器重启即清空，不落盘）；
  // 用户若勾选「记住 24 小时」，才额外写入 local，并带上到期时间戳。
  // ------------------------------------------------------------
  async function readSessionKey() {
    try {
      const r = await chrome.storage.session.get(AI_KEY_SESSION);
      const k = r[AI_KEY_SESSION];
      return typeof k === 'string' ? k : '';
    } catch (_) { return ''; }
  }

  async function readLocalKeyIfValid() {
    try {
      const r = await chrome.storage.local.get([AI_KEY_LOCAL, AI_KEY_EXPIRE]);
      const k = r[AI_KEY_LOCAL];
      const exp = r[AI_KEY_EXPIRE] || 0;
      if (typeof k !== 'string' || !k) return '';
      if (!exp || Date.now() > exp) {
        // 已过期：立即清掉，避免明文继续留在本机
        await chrome.storage.local.remove([AI_KEY_LOCAL, AI_KEY_EXPIRE]);
        return '';
      }
      return k;
    } catch (_) { return ''; }
  }

  async function resolveApiKey() {
    const s = await readSessionKey();
    if (s) return s;

    const l = await readLocalKeyIfValid();
    if (l) {
      // 从 local 恢复 → 迁回 session，本次运行不再依赖 local
      try { await chrome.storage.session.set({ [AI_KEY_SESSION]: l }); } catch (_) {}
      return l;
    }

    // 一次性迁移：旧版本把密钥明文写在 mimoConfig.apiKey 里
    try {
      const r = await chrome.storage.local.get(AI_CONFIG_KEY);
      const old = (r[AI_CONFIG_KEY] || {}).apiKey;
      if (typeof old === 'string' && old) {
        await chrome.storage.session.set({ [AI_KEY_SESSION]: old });
        const next = Object.assign({}, r[AI_CONFIG_KEY]);
        delete next.apiKey;
        await chrome.storage.local.set({ [AI_CONFIG_KEY]: next });
        console.log('[SP] 已将历史明文 API Key 迁移到 storage.session');
        return old;
      }
    } catch (_) {}
    return '';
  }

  SP.storage = {
    AI_CONFIG_DEFAULT,
    AI_MODELS,
    REMEMBER_MS,

    async getAIConfig() {
      const r = await chrome.storage.local.get(AI_CONFIG_KEY);
      const saved = r[AI_CONFIG_KEY] || {};
      const merged = {};
      for (const k of Object.keys(AI_CONFIG_DEFAULT)) {
        merged[k] = (typeof saved[k] !== 'undefined') ? saved[k] : AI_CONFIG_DEFAULT[k];
      }
      merged.apiKey = await resolveApiKey();
      return merged;
    },

    // opts.remember === true → 额外在本机明文保留 24 小时
    async saveAIConfig(cfg, opts = {}) {
      const clean = {};
      for (const k of Object.keys(AI_CONFIG_DEFAULT)) {
        if (k === 'apiKey') continue;   // 密钥绝不进 local 的 mimoConfig
        clean[k] = (typeof cfg[k] !== 'undefined') ? cfg[k] : AI_CONFIG_DEFAULT[k];
      }
      await chrome.storage.local.set({ [AI_CONFIG_KEY]: clean });

      const key = String(cfg.apiKey || '');
      try {
        if (key) await chrome.storage.session.set({ [AI_KEY_SESSION]: key });
        else await chrome.storage.session.remove(AI_KEY_SESSION);
      } catch (_) {}

      if (key && opts.remember === true) {
        await chrome.storage.local.set({
          [AI_KEY_LOCAL]: key,
          [AI_KEY_EXPIRE]: Date.now() + REMEMBER_MS
        });
      } else {
        await chrome.storage.local.remove([AI_KEY_LOCAL, AI_KEY_EXPIRE]);
      }
    },

    async isKeyRemembered() {
      try {
        const r = await chrome.storage.local.get([AI_KEY_LOCAL, AI_KEY_EXPIRE]);
        return !!(r[AI_KEY_LOCAL] && (r[AI_KEY_EXPIRE] || 0) > Date.now());
      } catch (_) { return false; }
    },

    async clearApiKey() {
      try { await chrome.storage.session.remove(AI_KEY_SESSION); } catch (_) {}
      try { await chrome.storage.local.remove([AI_KEY_LOCAL, AI_KEY_EXPIRE]); } catch (_) {}
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
