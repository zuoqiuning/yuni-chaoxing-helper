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

  function resetPanel() {
    SP.state.catalogCache = [];
    SP.state.currentJobs = [];
    SP.state.quizQuestions = [];
    SP.state.pendingAnswers = [];
    SP.state.lastScrolledSectionId = null;

    const $ = (id) => document.getElementById(id);
    if ($('catalog')) $('catalog').innerHTML = '<div class="empty">加载中…</div>';
    if ($('catalog-stat')) $('catalog-stat').textContent = '';
    if ($('jobs')) $('jobs').innerHTML = '<div class="empty">未扫描</div>';
    if ($('jobs-stat')) $('jobs-stat').textContent = '';
    if ($('quiz')) $('quiz').innerHTML = '';
    if ($('quiz-panel')) $('quiz-panel').style.display = 'none';
    if ($('quiz-empty')) {
      $('quiz-empty').style.display = 'block';
      $('quiz-empty').textContent = '打开答题页面后点击"扫描题目"';
    }
    if ($('quiz-stat')) $('quiz-stat').textContent = '';
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
    U.$('start').disabled = !!isRunningTab;
    U.$('stop').disabled = !isRunningTab;
    if (U.$('pause')) U.$('pause').disabled = !isRunningTab;

    if (isRunningTab) { console.log('[SP] 切回跑任务的 tab'); return; }

    U.setProgress(0, 0);
    resetPanel();
    console.log('[SP] 切换标签页 →', tabId, '(' + reason + ')');

    if (!tab || !tab.url || !tab.url.includes('chaoxing.com')) {
      U.$('catalog').innerHTML = '<div class="empty">请打开学习通课程页</div>';
      U.$('jobs').innerHTML = '<div class="empty">—</div>';
      return;
    }
    if (/mooc2\/work\/dowork/.test(tab.url)) {
      U.$('catalog').innerHTML = '<div class="empty">当前标签页是答题页</div>';
      U.$('jobs').innerHTML = '<div class="empty">—</div>';
      U.$('quiz-empty').textContent = '点击"扫描题目"开始';
      return;
    }
    await S.doScan(true);
  }

  SP.tabs = { handleTabChange, resetPanel };

  U.$('refresh').onclick = async () => {
    const btn = U.$('refresh');
    btn.disabled = true;
    try {
      if (SP.state.running && SP.state.runningTabId) {
        U.log('任务运行中，重启当前节…');
        const r = await S.restartCurrent(SP.state.runningTabId);
        if (r.ok) U.log(`已重启当前节 (${r.sectionId})`, 'ok');
        else U.log('重启失败: ' + r.error, 'err');
      } else {
        await S.doScan(false);
      }
    } finally {
      btn.disabled = false;
    }
  };

  U.$('start').onclick = () => Task.startAll();
  U.$('stop').onclick = () => Task.stopAll();
  if (U.$('pause')) U.$('pause').onclick = () => Task.togglePause();
  U.$('scan-quiz').onclick = () => Quiz.scanQuiz();
  U.$('ask-ai').onclick = () => Quiz.askAiForQuiz();
  U.$('fill-answers').onclick = () => Quiz.fillQuizAnswers();
  U.$('settings').onclick = () => Settings.showSettings();

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
        U.setStatus(false);
        U.$('start').disabled = false;
        U.$('stop').disabled = true;
        if (U.$('pause')) {
          U.$('pause').disabled = true;
          U.$('pause').textContent = '暂停';
          U.$('pause').classList.remove('active');
        }
        U.setProgress(0, 0);
      }
      return;
    }

    // ★ 登录过期 / 验证码 → 暂停任务 + 通知
    if (msg.type === 'ALERT') {
      const { alertType, detail } = msg;
      if (alertType === 'LOGIN_EXPIRED') {
        U.log(`⚠ 检测到登录过期，任务已暂停。请重新登录后点"继续"`, 'err');
        await Task.pauseByAlert();
        chrome.runtime.sendMessage({
          type: 'NOTIFY',
          title: '屿宁学习助手 - 需要处理',
          message: '登录已过期，请重新登录后点"继续"'
        });
      } else if (alertType === 'CAPTCHA') {
        U.log(`⚠ 检测到验证码，任务已暂停。请处理后点"继续"`, 'err');
        U.log(`  详情: ${detail || '(无)'}`, 'err');
        await Task.pauseByAlert();
        chrome.runtime.sendMessage({
          type: 'NOTIFY',
          title: '屿宁学习助手 - 需要处理',
          message: '检测到验证码，请处理后点"继续"'
        });
      }
      return;
    }

    const isBizMsg = ['LOG', 'JOB_DONE', 'JOB_PLAYING', 'SECTION_DONE', 'BLOCKED', 'QUIZ_PAGE_DETECTED'].includes(msg.type);
    if (isBizMsg && sender && sender.tab && SP.state.runningTabId) {
      if (sender.tab.id !== SP.state.runningTabId) return;
    }

    if (msg.type === 'LOG') U.log(msg.text, msg.level || '');
    if (msg.type === 'JOB_DONE') R.markJobDone(msg.jobId);
    if (msg.type === 'JOB_PLAYING') R.markJobPlaying(msg.jobId);

    if (msg.type === 'SECTION_DONE') {
      if (!SP.state.running) setTimeout(() => S.doScan(true), 800);
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
      if (!SP.state.running) {
        const tab = await S.getActiveTab();
        if (tab && msg.tabId === tab.id) setTimeout(() => S.doScan(true), 1200);
      }
    }
    if (msg.type === 'QUIZ_PAGE_DETECTED') {
      const tab = await S.getActiveTab();
      if (!tab || !tab.id) return;
      if (SP.state.boundTabId && tab.id !== SP.state.boundTabId) return;
      const autoOn = await Store.getAutoAnswer();
      const cfg = await Store.getAIConfig();
      if (!autoOn) {
        U.log(`检测到答题页（${msg.count} 题），自动答题已关闭`, '');
        U.$('quiz-panel').style.display = 'block';
        U.$('quiz-empty').style.display = 'none';
        return;
      }
      if (!cfg.apiKey) { U.log('检测到答题页，但未设置 API Key', 'err'); return; }
      U.log(`检测到答题页（${msg.count} 题），开始自动答题…`, 'ok');
      Quiz.autoAnswerFlow();
    }
  });

  window.addEventListener('load', async () => {
    if (SP.status && SP.status.refreshAiBanner) await SP.status.refreshAiBanner();
    if (SP.guide && SP.guide.checkShowBanner) await SP.guide.checkShowBanner();
    setTimeout(() => handleTabChange('init'), 400);
  });

  chrome.tabs.onActivated.addListener(() => setTimeout(() => handleTabChange('activated'), 300));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    S.getActiveTab().then(t => {
      if (t && t.id === tabId) setTimeout(() => handleTabChange('updated'), 500);
    });
  });

  console.log('[SP] modules loaded');
})();