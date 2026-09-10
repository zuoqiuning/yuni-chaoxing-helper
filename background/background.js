'use strict';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[BG]', err));

// ============================================================
// 页面更新 → 取消可丢弃 + 通知 sidepanel + 登录过期检测
// ============================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.url) return;
  if (!tab.url.includes('chaoxing.com')) return;

  // ★ 登录过期检测（跳转到 passport 域名）
  if (/passport2?\.chaoxing\.com|passport\.chaoxing\.com/.test(tab.url)) {
    chrome.runtime.sendMessage({
      type: 'ALERT',
      alertType: 'LOGIN_EXPIRED',
      detail: '页面跳转到登录页',
      url: tab.url,
      tabId
    }).catch(() => {});
  }

  if (changeInfo.status !== 'complete') return;

  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'TAB_UPDATED', tabId, url: tab.url }).catch(() => {});
});

// 标签页关闭 → 通知 sidepanel
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.runtime.sendMessage({ type: 'TAB_CLOSED', tabId }).catch(() => {});
});

// ============================================================
// 消息路由
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

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
        title: msg.title || '屿宁学习助手',
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
async function callMiMo({ apiKey, baseUrl, model, messages, thinkingType }) {
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: model || 'mimo-v2.5',
    messages: messages,
    stream: false,
    thinking: { type: thinkingType || 'disabled' }
  };

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