(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;

  let lockEnabled = true;
  let lastNotifyTime = 0;

  // ============================================================
  // Toast 提示
  // ============================================================
  let toastEl = null;
  let toastTimer = null;

  function showToast(msg, type) {
    if (toastEl) { toastEl.remove(); toastEl = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

    const el = document.createElement('div');
    el.textContent = msg;
    const bg = type === 'error' ? 'rgba(211, 47, 47, 0.95)' : 'rgba(25, 118, 210, 0.95)';
    el.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: ${bg}; color: #fff;
      padding: 10px 20px; border-radius: 6px; font-size: 13px;
      z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      pointer-events: none; opacity: 0; transition: opacity 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 80%; text-align: center;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    toastEl = el;
    toastTimer = setTimeout(() => {
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }
      if (toastEl === el) toastEl = null;
    }, 2500);
  }

  // ============================================================
  // 1. 目录点击拦截（防打扰锁）
  // ============================================================
  document.addEventListener('click', (e) => {
    if (!lockEnabled) return;
    if (window.__cxhInternalClick) return;

    const player = CXH.player;
    if (!player || !player.getExpectedSectionId) return;
    const expected = player.getExpectedSectionId();
    if (!expected) return;

    const t = e.target;
    if (!t || !t.closest) return;
    const node = t.closest('.posCatalog_select');
    if (!node) return;

    const clickedId = (node.id || '').replace(/^cur/, '');
    if (!clickedId) return;
    if (clickedId === expected) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    showToast('任务运行中，已阻止切换章节。如需切换请先停止任务', 'error');
  }, true);

  // ============================================================
  // 2. 验证码检测（登录过期检测改由 background 处理）
  // ============================================================
  function notifyCaptcha(detail) {
    const now = Date.now();
    if (now - lastNotifyTime < 30000) return;
    lastNotifyTime = now;

    console.log('[CXH] alert: CAPTCHA', detail);
    try {
      chrome.runtime.sendMessage({
        type: 'ALERT',
        alertType: 'CAPTCHA',
        detail: detail || '',
        url: location.href
      });
    } catch (_) {}
  }

  function checkCaptcha() {
    // 1. 超星特有的验证码容器
    const specific = ['.ans-job-verify', '#verifyImg', '.face-verify'];
    for (const sel of specific) {
      const el = document.querySelector(sel);
      if (el) {
        const st = getComputedStyle(el);
        if (st.display !== 'none' && st.visibility !== 'hidden') {
          return { selector: sel, text: (el.textContent || '').slice(0, 100) };
        }
      }
    }

    // 2. 通用 layui 弹层包含验证关键字
    const layers = document.querySelectorAll('.layui-layer:not(.layui-layer-hide)');
    for (const l of layers) {
      const text = (l.textContent || '').slice(0, 200);
      if (/验证码|人脸识别|安全验证|请输入验证|滑动|拖动|拼图/.test(text)) {
        return { selector: 'layui-layer', text: text.slice(0, 100) };
      }
    }

    // 3. 页面内检测到登录表单（原地弹出登录框，未跳转）
    const loginBox = document.querySelector('.login-box, .passport-login, #loginForm, .login-form');
    if (loginBox) {
      const st = getComputedStyle(loginBox);
      if (st.display !== 'none' && st.visibility !== 'hidden') {
        return { selector: 'login-form', text: '页面内检测到登录框' };
      }
    }

    return null;
  }

  function runCheck() {
    const captcha = checkCaptcha();
    if (captcha) notifyCaptcha(captcha.text);
  }

  setInterval(runCheck, 5000);
  setTimeout(runCheck, 2000);

  // ============================================================
  // 3. 对外接口
  // ============================================================
  CXH.interceptor = {
    setLock(v) {
      lockEnabled = !!v;
      console.log('[CXH] 防打扰锁:', lockEnabled ? '开' : '关');
      return { ok: true, lockEnabled };
    },
    isLockOn() { return lockEnabled; },
    showToast
  };
})();