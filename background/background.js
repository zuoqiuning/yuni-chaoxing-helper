'use strict';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[BG]', err));

console.log('[BG] background loaded');

// ============================================================
// 页面更新
// ============================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.url) return;
  if (!tab.url.includes('chaoxing.com')) return;

  // 详细日志（只在关键事件打）
  if (changeInfo.url) {
    console.log(`[BG] tab ${tabId} URL → ${tab.url.slice(0, 100)}`);
  }
  if (changeInfo.status === 'complete') {
    console.log(`[BG] tab ${tabId} 页面加载完成`);
  }

  // ★ 登录过期检测
  if (/passport2?\.chaoxing\.com|passport\.chaoxing\.com/.test(tab.url)) {
    console.log(`[BG] ⚠ 检测到登录过期`);
    chrome.runtime.sendMessage({
      type: 'ALERT',
      alertType: 'LOGIN_EXPIRED',
      detail: '页面跳转到登录页',
      url: tab.url,
      tabId
    }).catch(() => {});
  }

  // ★ 验证码页检测
  if (/antispider|showverify|checkcode|vercode|verify\.ac/i.test(tab.url)) {
    console.log(`[BG] ⚠ 检测到验证码页面 URL`);
    chrome.runtime.sendMessage({
      type: 'ALERT',
      alertType: 'CAPTCHA_PAGE',
      detail: '跳转到验证码页',
      url: tab.url,
      tabId
    }).catch(() => {});
  }

  if (changeInfo.status !== 'complete') return;

  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'TAB_UPDATED', tabId, url: tab.url }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.runtime.sendMessage({ type: 'TAB_CLOSED', tabId }).catch(() => {});
});

// ============================================================
// 消息路由
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  // 调试：记录所有 ALERT 消息
  if (msg.type === 'ALERT') {
    console.log(`[BG] 收到 ALERT:`, msg.alertType, msg.detail || '');
  }

  if (msg.type === 'MIMO_CHAT') {
    callMiMo(msg.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === 'NOTIFY') {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: ICON_DATA_URI,
        title: msg.title || '屿宁学习通助手',
        message: msg.message || ''
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[BG] 通知失败:', chrome.runtime.lastError.message);
        }
      });
      sendResponse({ ok: true });
    } catch (e) {
      console.warn('[BG] 通知异常:', e);
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  return false;
});

// ============================================================
// MiMo API 调用
// ============================================================
async function callMiMo({ apiKey, baseUrl, model, messages, thinkingType, max_tokens }) {
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: model || 'mimo-v2.5',
    messages: messages,
    stream: false,
    thinking: { type: thinkingType || 'disabled' }
  };

  if (max_tokens && typeof max_tokens === 'number' && max_tokens > 0) {
    body.max_tokens = max_tokens;
  }

  console.log(`[BG] 调用 MiMo API (thinking=${thinkingType}, max_tokens=${max_tokens || 'default'})`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`MiMo API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { ok: true, content, raw: data };
}

const ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';