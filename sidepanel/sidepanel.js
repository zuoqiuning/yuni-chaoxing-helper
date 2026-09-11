(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const Quiz = SP.quiz;
  const Settings = SP.settings;
  const Task = SP.task;
  const Store = SP.storage;
  const R = SP.render;
  const Guide = SP.guide;
  const Captcha = SP.captcha;

  let lastTabUpdatedTime = 0;
  const TAB_UPDATE_THROTTLE = 2500;

  function resetPanel() {
    SP.state.catalogCache = [];
    SP.state.currentJobs = [];
    SP.state.jobCards = [];
    SP.state.jobCardsSectionId = null;
    SP.state.playingCardIdx = null;
    SP.state.playingJobIdx = null;
    SP.state.playingJobId = null;
    SP.state.quizQuestions = [];
    SP.state.pendingAnswers = [];
    SP.state.lastScrolledSectionId = null;

    const $ = (id) => document.getElementById(id);
    if ($('catalog')) $('catalog').innerHTML = '<div class="empty">加载中…</div>';
    if ($('catalog-stat')) $('catalog-stat').textContent = '';
    if ($('jobs')) $('jobs').innerHTML = '<div class="empty">未扫描</div>';
    if ($('jobs-stat')) $('jobs-stat').textContent = '';
    if ($('quiz-empty')) {
      $('quiz-empty').style.display = 'block';
      $('quiz-empty').textContent = '打开答题页面后自动识别';
    }
    if ($('quiz-ready')) $('quiz-ready').style.display = 'none';
    if ($('quiz-stat')) $('quiz-stat').textContent = '';
    if (Captcha) Captcha.hideState();
  }

  function resetButtons() {
    const startBtn = U.$('start');
    const stopBtn = U.$('stop');
    const pauseBtn = U.$('pause');
    if (startBtn) { startBtn.disabled = false; startBtn.title = ''; }
    if (stopBtn) stopBtn.disabled = true;
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.textContent = '暂停';
      pauseBtn.classList.remove('active');
    }
  }

  async function handleTabChange(reason) {
    const tab = await S.getActiveTab();
    const tabId = tab && tab.id ? tab.id : null;
    if (tabId === SP.state.boundTabId) return;
    SP.state.boundTabId = tabId;

    const isRunningTab = SP.state.runningTabId && tabId === SP.state.runningTabId;
    const dot = U.$('status-dot');
    if (dot) {
      dot.classList.toggle('running', !!isRunningTab);
      dot.title = isRunningTab ? '运行中' : '空闲';
    }
    const startBtn = U.$('start');
    const stopBtn = U.$('stop');
    const pauseBtn = U.$('pause');
    if (startBtn) startBtn.disabled = !!isRunningTab;
    if (stopBtn) stopBtn.disabled = !isRunningTab;
    if (pauseBtn) pauseBtn.disabled = !isRunningTab;

    if (isRunningTab) { console.log('[SP] 切回跑任务的 tab'); return; }

    resetPanel();
    console.log('[SP] 切换标签页 →', tabId, '(' + reason + ')');

    if (!tab || !tab.url || !tab.url.includes('chaoxing.com')) {
      U.$('catalog').innerHTML = '<div class="empty">请打开学习通课程页</div>';
      U.$('jobs').innerHTML = '<div class="empty">—</div>';
      return;
    }

    if (Captcha && Captcha.isCaptchaUrl(tab.url)) {
      U.$('catalog').innerHTML = '<div class="empty">验证码页面，正在处理…</div>';
      U.$('jobs').innerHTML = '<div class="empty">—</div>';
      return;
    }

    if (/work\/dowork/.test(tab.url) || /\/dowork/.test(tab.url)) {
      U.$('catalog').innerHTML = '<div class="empty">当前标签页是作业/答题页<br><span style="font-size:11px;color:#1976d2;">请使用下方 AI 答题功能</span></div>';
      U.$('jobs').innerHTML = '<div class="empty">—</div>';
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.title = '作业页无法刷课';
      }
      setTimeout(() => Quiz.scanQuiz(true), 800);
      return;
    }

    if (!SP.state.running && startBtn) {
      startBtn.disabled = false;
      startBtn.title = '';
    }

    await S.doScan(true, true);
  }

  SP.tabs = { handleTabChange, resetPanel };

  U.$('start').onclick = () => Task.startAll();
  U.$('stop').onclick = () => Task.stopAll();
  if (U.$('pause')) U.$('pause').onclick = () => Task.togglePause();
  if (U.$('one-click')) U.$('one-click').onclick = () => Quiz.oneClickAnswer();
  if (U.$('quiz-detail')) U.$('quiz-detail').onclick = () => Quiz.showQuizDetailModal();

  if (U.$('log-clear')) {
    U.$('log-clear').onclick = () => { const el = U.$('log'); if (el) el.innerHTML = ''; };
  }
  const logCard = U.$('log-card');
  const logToggle = U.$('log-toggle');
  if (logToggle && logCard) {
    logToggle.onclick = () => {
      const expanded = logCard.classList.toggle('expanded');
      logToggle.textContent = expanded ? '收起' : '展开';
    };
  }

  if (U.$('sleep-banner-btn')) U.$('sleep-banner-btn').onclick = () => Guide.showGuideModal();
  if (U.$('sleep-banner-close')) {
    U.$('sleep-banner-close').onclick = async () => { await Guide.markSeen(); };
  }

  chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (!msg) return;

    if (msg.type === 'TAB_CLOSED') {
      if (SP.state.runningTabId && msg.tabId === SP.state.runningTabId) {
        U.log('任务标签页已关闭，停止任务', 'err');
        SP.state.running = false;
        SP.state.runningTabId = null;
        SP.state.runningSectionId = null;
        SP.state.pendingResume = null;
        U.setStatus(false);
        U.$('start').disabled = false;
        U.$('stop').disabled = true;
        if (U.$('pause')) {
          U.$('pause').disabled = true;
          U.$('pause').textContent = '暂停';
          U.$('pause').classList.remove('active');
        }
      }
      return;
    }

    if (msg.type === 'ALERT') {
      const { alertType, detail } = msg;

      if (alertType === 'LOGIN_EXPIRED') {
        U.log(`⚠ 检测到登录过期，任务已暂停`, 'err');
        await Task.pauseByAlert();
        chrome.runtime.sendMessage({
          type: 'NOTIFY',
          title: '屿宁学习助手 - 需要处理',
          message: '登录已过期，请重新登录后点"继续"'
        });
        return;
      }

      if (alertType === 'CAPTCHA_PAGE' || alertType === 'CAPTCHA') {
        U.log(`⚠ 检测到验证码，任务已暂停`, 'err');
        if (detail) U.log(`  详情: ${detail}`, 'err');

        await Task.pauseByAlert();

        if (Captcha && Captcha.tryAutoRecognize) {
          Captcha.resetAttempts();
          Captcha.tryAutoRecognize({
            onSuccess: () => U.log('验证码已通过', 'ok')
          }).catch(e => {
            U.log('自动识别异常: ' + e.message, 'err');
          });
        }

        chrome.runtime.sendMessage({
          type: 'NOTIFY',
          title: '屿宁学习助手 - 需要处理',
          message: '检测到验证码，正在自动识别'
        });
        return;
      }
      return;
    }

    const isBizMsg = ['LOG', 'JOB_DONE', 'JOB_PLAYING', 'SECTION_DONE', 'BLOCKED', 'QUIZ_PAGE_DETECTED', 'CARD_JOBS', 'CARD_JOBS_UPDATE', 'CARD_ACTIVE', 'CARD_JOBS_RESET'].includes(msg.type);
    if (isBizMsg && sender && sender.tab && SP.state.runningTabId) {
      if (sender.tab.id !== SP.state.runningTabId) return;
    }

    if (msg.type === 'LOG') U.log(msg.text, msg.level || '');

    if (msg.type === 'JOB_PLAYING') {
      R.markJobPlaying(msg.cardIndex, msg.jobIndex, msg.jobId);
    }

    if (msg.type === 'JOB_DONE') {
      R.markJobDone(msg.jobId, msg.cardIndex, msg.jobIndex);
    }

    if (msg.type === 'CARD_JOBS_RESET') {
      R.resetCardJobs();
      return;
    }

    if (msg.type === 'CARD_JOBS') {
      if (msg.cards && msg.cards.length > 0) {
        R.renderCardJobs(msg.cards);
      }
      return;
    }

    if (msg.type === 'CARD_JOBS_UPDATE') {
      if (msg.card) {
        R.updateOneCard(msg.card, msg.sectionId);
      }
      return;
    }

    if (msg.type === 'CARD_ACTIVE') {
      R.markCardActive(msg.cardIndex);
      return;
    }

    if (msg.type === 'SECTION_DONE') {
      if (!SP.state.running) setTimeout(() => S.doScan(true, true), 800);
    }
    if (msg.type === 'BLOCKED') {
      U.log(`⚠ 弹窗阻挡，请手动处理: ${msg.text}`, 'err');
      chrome.runtime.sendMessage({
        type: 'NOTIFY',
        title: '屿宁学习助手 - 需要处理',
        message: '视频被弹窗阻挡，请查看页面'
      });
    }

    if (msg.type === 'TAB_UPDATED') {
      // ★★★ 优先处理：验证码刷新后的自动恢复
      const pr = SP.state.pendingResume;
      if (pr && pr.tabId === msg.tabId) {
        const age = Date.now() - pr.ts;
        if (age < 60000) {
          // ★★★ 关键：先清 pendingResume 防止重复触发
          SP.state.pendingResume = null;

          console.log('[SP] ==================== 验证码恢复流程开始 ====================');

          // ★★★ 步骤 1：先中止老流程
          U.log('验证码已通过，正在清理旧任务…', 'ok');
          SP.state.running = false;
          SP.state.runningTabId = null;
          SP.state.runningSectionId = null;

          // ★★★ 步骤 2：等老流程完全退出（关键！）
          await U.sleep(3000);

          // ★★★ 步骤 3：等 content script 就绪
          const ready = await S.waitContentScript(20000, msg.tabId);
          if (!ready) {
            U.log('content script 未就绪，无法恢复', 'err');
            return;
          }

          // ★★★ 步骤 4：再等页面完全稳定
          await U.sleep(2000);

          // ★★★ 步骤 5：用 force 模式重新启动（保留进度）
          U.log('开始从断点继续任务…', 'ok');
          Task.startAll({ force: true, skipClearProgress: true });
          return;
        } else {
          SP.state.pendingResume = null;
        }
      }

      const now = Date.now();
      if (now - lastTabUpdatedTime < TAB_UPDATE_THROTTLE) return;
      lastTabUpdatedTime = now;

      try {
        const t = await chrome.tabs.get(msg.tabId);
        if (t && Captcha && Captcha.isCaptchaUrl && Captcha.isCaptchaUrl(t.url)) {
          console.log('[SP] TAB_UPDATED → 验证码页');
          U.log('⚠ 检测到验证码页', 'err');
          await Task.pauseByAlert();
          if (Captcha && Captcha.tryAutoRecognize) {
            Captcha.resetAttempts();
            Captcha.tryAutoRecognize({
              onSuccess: () => U.log('验证码已通过', 'ok')
            }).catch(() => {});
          }
          return;
        }
      } catch (_) {}

      if (!SP.state.running) {
        const tab = await S.getActiveTab();
        if (tab && msg.tabId === tab.id) {
          setTimeout(() => S.doScan(true, true), 1200);
        }
      }
    }

    if (msg.type === 'QUIZ_PAGE_DETECTED') {
      const tab = await S.getActiveTab();
      if (!tab || !tab.id) return;
      if (SP.state.boundTabId && tab.id !== SP.state.boundTabId) return;
      const autoOn = await Store.getAutoAnswer();
      const cfg = await Store.getAIConfig();

      if (autoOn && cfg.apiKey) {
        U.log(`检测到答题页（${msg.count} 题），开始自动答题…`, 'ok');
        Quiz.autoAnswerFlow();
      } else {
        U.log(`检测到答题页（${msg.count} 题），点"一键答题"开始`, '');
        Quiz.scanQuiz(true);
      }
    }
  });

  window.addEventListener('load', async () => {
    SP.state.running = false;
    SP.state.runningTabId = null;
    SP.state.runningSectionId = null;
    SP.state.pendingResume = null;
    U.setStatus(false);
    resetButtons();

    try {
      const tab = await S.getActiveTab();
      if (tab && tab.url && tab.url.includes('chaoxing.com')) {
        const r = await S.sendToTab('CLEAR_STATE', {}, 2500);
        if (r && r.ok) {
          console.log('[SP] 已清理 content 侧状态');
        }
      }
    } catch (e) {
      console.warn('[SP] CLEAR_STATE 失败:', e);
    }

    if (SP.status && SP.status.refreshAiBanner) await SP.status.refreshAiBanner();
    if (SP.guide && SP.guide.checkShowBanner) await SP.guide.checkShowBanner();

    const initTab = await S.getActiveTab();
    if (initTab && Captcha && Captcha.isCaptchaUrl && Captcha.isCaptchaUrl(initTab.url)) {
      console.log('[SP] 启动时检测到验证码页');
      U.log('⚠ 检测到验证码页', 'err');
      if (Captcha.tryAutoRecognize) {
        Captcha.resetAttempts();
        Captcha.tryAutoRecognize({
          onSuccess: () => U.log('验证码已通过', 'ok')
        }).catch(() => {});
      }
      return;
    }

    handleTabChange('init');
  });

  chrome.tabs.onActivated.addListener(() => setTimeout(() => handleTabChange('activated'), 300));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    const now = Date.now();
    if (now - lastTabUpdatedTime < TAB_UPDATE_THROTTLE) return;
    lastTabUpdatedTime = now;

    if (Captcha && Captcha.isCaptchaUrl && tab && Captcha.isCaptchaUrl(tab.url)) {
      console.log('[SP] onUpdated → 验证码页');
      U.log('⚠ 检测到验证码页', 'err');
      Task.pauseByAlert().then(() => {
        if (Captcha.tryAutoRecognize) {
          Captcha.resetAttempts();
          Captcha.tryAutoRecognize({
            onSuccess: () => U.log('验证码已通过', 'ok')
          }).catch(() => {});
        }
      });
      return;
    }

    S.getActiveTab().then(t => {
      if (t && t.id === tabId) setTimeout(() => handleTabChange('updated'), 500);
    });
  });

  console.log('[SP] modules loaded');
})();