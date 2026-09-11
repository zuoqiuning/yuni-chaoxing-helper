(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const Store = SP.storage;
  const AI = SP.ai;

  let autoAttempts = 0;
  const MAX_AUTO_ATTEMPTS = 3;

  let lastCaptureTime = 0;
  const CAPTURE_MIN_INTERVAL = 1500;
  let capturePending = null;

  let processing = false;
  let sessionId = 0;

  function isCaptchaUrl(url) {
    if (!url) return false;
    return /antispider|showverify|checkcode|vercode|verify\.ac/i.test(url);
  }

  function showState() {
    const el = document.getElementById('captcha-state');
    if (el) el.style.display = 'flex';
    const emptyEl = document.getElementById('quiz-empty');
    if (emptyEl) emptyEl.style.display = 'none';
    const readyEl = document.getElementById('quiz-ready');
    if (readyEl) readyEl.style.display = 'none';
  }

  function hideState() {
    const el = document.getElementById('captcha-state');
    if (el) el.style.display = 'none';
    const inputBox = document.getElementById('captcha-state-input');
    if (inputBox) inputBox.style.display = 'none';
    const input = document.getElementById('captcha-input');
    if (input) input.value = '';
    const emptyEl = document.getElementById('quiz-empty');
    if (emptyEl) emptyEl.style.display = 'block';
    const readyEl = document.getElementById('quiz-ready');
    if (readyEl) {
      if (SP.state.quizQuestions && SP.state.quizQuestions.length > 0) {
        readyEl.style.display = 'flex';
        emptyEl.style.display = 'none';
      }
    }
  }

  function setText(text, level) {
    const el = document.getElementById('captcha-state-text');
    if (el) {
      el.textContent = text;
      el.className = 'captcha-state-text' + (level ? ' ' + level : '');
    }
  }

  function showManualInput() {
    const el = document.getElementById('captcha-state-input');
    if (el) el.style.display = 'flex';
    setTimeout(() => {
      const input = document.getElementById('captcha-input');
      if (input) input.focus();
    }, 100);
  }

  function hideManualInput() {
    const el = document.getElementById('captcha-state-input');
    if (el) el.style.display = 'none';
  }

  async function captureTab(tabId) {
    if (capturePending) return capturePending;

    const now = Date.now();
    const elapsed = now - lastCaptureTime;
    if (elapsed < CAPTURE_MIN_INTERVAL) {
      await U.sleep(CAPTURE_MIN_INTERVAL - elapsed);
    }
    lastCaptureTime = Date.now();

    capturePending = (async () => {
      try {
        return await new Promise((resolve) => {
          chrome.tabs.get(tabId, (t) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            if (!t) { resolve({ ok: false, error: 'tab not found' }); return; }
            try {
              chrome.tabs.captureVisibleTab(t.windowId, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message });
                } else if (!dataUrl) {
                  resolve({ ok: false, error: 'empty screenshot' });
                } else {
                  console.log(`[Captcha] 截图成功 (${(dataUrl.length/1024).toFixed(0)} KB PNG)`);
                  resolve({ ok: true, dataUrl });
                }
              });
            } catch (e) {
              resolve({ ok: false, error: String(e) });
            }
          });
        });
      } finally {
        setTimeout(() => { capturePending = null; }, 100);
      }
    })();

    return capturePending;
  }

  async function shrinkImage(dataUrl, maxW = 1600, quality = 0.95) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / img.width);
          if (scale >= 1) {
            resolve(dataUrl);
            return;
          }
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function resolveTabId() {
    if (SP.state.runningTabId) return SP.state.runningTabId;
    if (SP.state.boundTabId) return SP.state.boundTabId;
    const tab = await S.getActiveTab();
    return tab && tab.id ? tab.id : null;
  }

  async function stillOnCaptchaPage(tabId) {
    try {
      const t = await chrome.tabs.get(tabId).catch(() => null);
      if (!t || !t.url) return false;
      if (isCaptchaUrl(t.url)) return true;
    } catch (_) {}

    try {
      const r = await S.sendToTab('CHECK_CAPTCHA_EXISTS', {}, 3000, tabId);
      if (r && r.ok && r.exists) return true;
      return false;
    } catch (e) {
      console.log(`[Captcha] 元素检测失败: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  // 通过后：关闭放大层 → 设置 pendingResume → 刷新页面
  // ============================================================
  async function onPassed(tabId, log) {
    // 1. 关闭放大层
    try {
      await S.sendToTab('CLOSE_ZOOM_LAYER', {}, 5000, tabId);
    } catch (_) {}

    // 2. 设置 pendingResume 标志
    SP.state.pendingResume = {
      tabId: tabId,
      sectionId: SP.state.runningSectionId,
      ts: Date.now()
    };
    console.log('[Captcha] 已设置 pendingResume:', SP.state.pendingResume);

    // 3. 显示状态
    setText('验证通过，正在刷新页面…', 'ok');

    // 4. 调用 RELOAD_PAGE
    try {
      const r = await S.sendToTab('RELOAD_PAGE', {}, 3000, tabId);
      log(`RELOAD_PAGE: ok=${r.ok}`);
    } catch (e) {
      log(`RELOAD_PAGE 失败: ${e.message}`, 'err');
      // 兜底：直接用 chrome.tabs.reload
      try {
        await chrome.tabs.reload(tabId);
      } catch (_) {}
    }
  }

  async function tryAutoRecognize(opts = {}) {
    if (processing) {
      console.log('[Captcha] 已有处理任务在跑，忽略');
      return { ok: false, error: 'already processing' };
    }
    processing = true;
    sessionId++;
    const sid = sessionId;
    console.log(`[Captcha] ========== 会话 #${sid} 开始 ==========`);

    try {
      return await doAutoRecognize(opts, sid);
    } finally {
      processing = false;
      console.log(`[Captcha] ========== 会话 #${sid} 结束 ==========`);
    }
  }

  async function doAutoRecognize(opts, sid) {
    const log = (msg, level) => {
      const prefix = `[Captcha #${sid}]`;
      console.log(prefix, msg);
      if (level === 'err') U.log(`验证码: ${msg}`, 'err');
      else if (level === 'ok') U.log(`验证码: ${msg}`, 'ok');
    };

    showState();
    hideManualInput();

    const tabId = await resolveTabId();
    log(`tabId=${tabId}`);
    if (!tabId) {
      setText('未找到目标标签页', 'err');
      return { ok: false, error: 'no tab' };
    }

    const onPage = await stillOnCaptchaPage(tabId);
    log(`是否在验证码页: ${onPage}`);

    const autoOCR = await Store.getAutoCaptchaOCR();
    if (!autoOCR) {
      log('自动识别已关闭', 'err');
      setText('自动识别已关闭，请手动输入验证码：', 'err');
      showManualInput();
      return { ok: false, error: 'auto disabled' };
    }

    // 清理放大层
    setText('正在清理放大层…');
    try {
      const closeRes = await S.sendToTab('CLOSE_ZOOM_LAYER', {}, 5000, tabId);
      log(`清理放大层: closed=${closeRes.closed}`);
      await U.sleep(300);
    } catch (e) {
      log(`清理放大层失败: ${e.message}`);
    }

    // 截图
    log('开始截图');
    setText('正在识别验证码…');
    const shot = await captureTab(tabId);
    if (!shot.ok) {
      log(`截图失败: ${shot.error}`, 'err');
      setText('截图失败: ' + shot.error, 'err');
      showManualInput();
      return { ok: false, error: shot.error };
    }

    const imgData = await shrinkImage(shot.dataUrl, 1600, 0.95);
    log(`图片压缩后 ${(imgData.length/1024).toFixed(0)} KB`);

    // AI 识别
    const cfg = await Store.getAIConfig();
    if (!cfg.apiKey) {
      log('未配置 API Key', 'err');
      setText('未配置 API Key，请手动输入：', 'err');
      showManualInput();
      return { ok: false, error: 'no api key' };
    }

    log(`调用 AI 识别`);
    setText(`正在识别验证码…（第 ${autoAttempts + 1} 次）`);

    const t0 = Date.now();
    const ocr = await AI.recognizeCaptchaFromScreenshot(imgData, cfg);
    const elapsed = Date.now() - t0;

    if (!ocr.ok) {
      autoAttempts++;
      log(`识别失败 (${elapsed}ms): ${ocr.error}`, 'err');
      if (ocr.raw) {
        log(`AI 原始输出: "${String(ocr.raw).slice(0, 100)}"`, 'err');
      }
      setText(`识别失败: ${ocr.error}，重试中…`, 'err');
      if (autoAttempts < MAX_AUTO_ATTEMPTS) {
        await U.sleep(1200);
        processing = false;
        return await tryAutoRecognize(opts);
      } else {
        setText('AI 无法识别，请手动输入验证码：', 'err');
        showManualInput();
        return { ok: false, error: ocr.error };
      }
    }

    log(`识别成功 (${elapsed}ms): "${ocr.code}"`, 'ok');

    // 提交
    setText(`识别到 "${ocr.code}"，正在提交…`);
    const fill = await S.sendToTab('FILL_CAPTCHA', { code: ocr.code }, 10000, tabId);
    log(`FILL_CAPTCHA: ok=${fill.ok}, submitted=${fill.submitted}, via=${fill.via}, value=${fill.value}, inputId=${fill.inputId}`);

    if (!fill.ok || !fill.submitted) {
      const errMsg = fill.error || 'unknown';
      setText(`填入失败: ${errMsg}`, 'err');
      showManualInput();
      autoAttempts++;
      return { ok: false, error: errMsg };
    }

    // 提交后清理放大层
    await U.sleep(300);
    try { await S.sendToTab('CLOSE_ZOOM_LAYER', {}, 5000, tabId); } catch (_) {}

    setText(`已提交 "${ocr.code}"，检查中…`);

    // 检查 3 次
    let passed = false;
    for (let i = 0; i < 3; i++) {
      await U.sleep(2000);
      const stillOn = await stillOnCaptchaPage(tabId);
      log(`检查 ${i + 1}/3: 仍在验证码页 = ${stillOn}`);

      if (!stillOn) {
        passed = true;
        break;
      }
      setText(`已提交 "${ocr.code}"，检查中…（${i + 1}/3）`);
    }

    if (passed) {
      autoAttempts = 0;
      log('✓ 验证码已通过', 'ok');

      // 通过后刷新页面
      await onPassed(tabId, log);

      return { ok: true, code: ocr.code };
    }

    autoAttempts++;
    log(`"${ocr.code}" 3 次检查均失败（第 ${autoAttempts} 次尝试）`, 'err');
    setText(`"${ocr.code}" 未通过（第 ${autoAttempts} 次），重新识别…`, 'err');

    if (autoAttempts < MAX_AUTO_ATTEMPTS) {
      await U.sleep(800);
      processing = false;
      return await tryAutoRecognize(opts);
    } else {
      setText('AI 多次失败，请手动输入验证码：', 'err');
      showManualInput();
      return { ok: false, error: 'all attempts failed' };
    }
  }

  function bindManualEvents() {
    const submitBtn = document.getElementById('captcha-submit');
    const input = document.getElementById('captcha-input');
    if (!submitBtn || submitBtn.__bound) return;
    submitBtn.__bound = true;

    const doSubmit = async () => {
      const code = (input.value || '').trim();
      if (!code) {
        setText('请输入验证码', 'err');
        return;
      }
      const tabId = await resolveTabId();
      if (!tabId) return;

      submitBtn.disabled = true;
      submitBtn.textContent = '提交中…';

      const r = await S.sendToTab('FILL_CAPTCHA', { code }, 10000, tabId);
      if (r.ok && r.submitted) {
        setText(`已提交 "${code}"，检查中…`);

        let passed = false;
        for (let i = 0; i < 3; i++) {
          await U.sleep(2000);
          const stillOn = await stillOnCaptchaPage(tabId);
          if (!stillOn) { passed = true; break; }
        }

        if (passed) {
          // ★★★ 通过后重置计数 + 刷新页面
          autoAttempts = 0;
          await onPassed(tabId, (msg, level) => {
            console.log(`[Captcha-manual] ${msg}`);
            U.log(`验证码: ${msg}`, level || '');
          });
        } else {
          setText('✗ 验证码错误，请重试', 'err');
          submitBtn.disabled = false;
          submitBtn.textContent = '提交';
        }
      } else {
        const msg = r.error || 'unknown';
        setText(`提交失败: ${msg}`, 'err');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交';
      }
    };

    submitBtn.onclick = doSubmit;
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSubmit();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindManualEvents);
  } else {
    bindManualEvents();
  }

  function resetAttempts() {
    autoAttempts = 0;
  }

  SP.captcha = {
    tryAutoRecognize,
    resetAttempts,
    isCaptchaUrl,
    showState,
    hideState
  };
})();