(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;

  const STORAGE_KEY = 'sleepHintSeen';

  async function checkShowBanner() {
    const banner = U.$('sleep-banner');
    if (!banner) return;

    const r = await chrome.storage.local.get(STORAGE_KEY);
    const seen = r[STORAGE_KEY] === true;

    banner.style.display = seen ? 'none' : 'flex';
  }

  function hideBanner() {
    const banner = U.$('sleep-banner');
    if (banner) banner.style.display = 'none';
  }

  async function markSeen() {
    await chrome.storage.local.set({ [STORAGE_KEY]: true });
    hideBanner();
  }

  function showGuideModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal guide-modal">
        <div class="modal-title">建议关闭浏览器睡眠标签页</div>
        <div class="guide-body">
          <p>浏览器会在标签页闲置约 15 分钟后自动"睡眠"它，导致视频暂停、卡顿。刷课期间建议关闭此功能。</p>

          <div class="guide-section">
            <div class="guide-section-title">Edge 浏览器</div>
            <ol>
              <li>地址栏输入 <code>edge://settings/system</code> 并回车</li>
              <li>关闭「<strong>睡眠标签页</strong>」开关</li>
              <li>关闭「<strong>效率模式</strong>」开关</li>
              <li>开启「<strong>关闭 Edge 后继续运行后台扩展和应用</strong>」</li>
            </ol>
          </div>

          <div class="guide-section">
            <div class="guide-section-title">Chrome 浏览器</div>
            <ol>
              <li>地址栏输入 <code>chrome://settings/performance</code> 并回车</li>
              <li>关闭「<strong>内存节省程序</strong>」开关</li>
              <li>关闭「<strong>节能模式</strong>」开关</li>
            </ol>
          </div>

          <div class="guide-tip">
            提示：如不想全局关闭，可将 <code>chaoxing.com</code> 加入「永不休眠」白名单，仅对学习通生效。
          </div>
        </div>
        <div class="modal-buttons">
          <button id="guide-cancel">稍后再说</button>
          <button id="guide-close" class="primary">我知道了，不再提示</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#guide-cancel').onclick = () => {
      close();
    };
    overlay.querySelector('#guide-close').onclick = async () => {
      await markSeen();
      close();
    };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }

  async function reset() {
    await chrome.storage.local.remove(STORAGE_KEY);
    await checkShowBanner();
    U.log('已重置睡眠标签页提示', 'ok');
  }

  SP.guide = { checkShowBanner, hideBanner, markSeen, showGuideModal, reset };
})();