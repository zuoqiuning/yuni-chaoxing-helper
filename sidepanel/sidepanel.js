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

  // ============================================================
  // 重置面板
  // ============================================================
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

  // ============================================================
  // 切 tab 时：重置 + 扫描新 tab
  // ============================================================
  async function handleTabChange(reason) {
    const tab = await S.getActiveTab();
    const tabId = tab && tab.id ? tab.id : null;

    if (tabId === SP.state.boundTabId) return;
    SP.state.boundTabId = tabId;

    // 判断当前 tab 是否是"正在跑任务"的那个
    const isRunningTab = SP.state.runningTabId && tabId === SP.state.runningTabId;

    // UI 状态跟 runningTabId 同步
    const dot = U.$('status-dot');
    if (dot) {
      dot.classList.toggle('running', !!isRunningTab);
      dot.title = isRunningTab ? '运行中' : '空闲';
    }
    U.$('start').disabled = !!isRunningTab;
    U.$('stop').disabled = !isRunningTab;

    if (isRunningTab) {
      // 切回跑任务的 tab，不重置
      console.log('[SP] 切回跑任务的 tab');
      return;
    }

    // 其他 tab：重置
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

  // ============================================================
  // 事件绑定
  // ============================================================
  U.$('refresh').onclick = () => {
    if (SP.state.running) { U.log('任务运行中，无法刷新', 'err'); return; }
    S.doScan(false);
  };
  U.$('start').onclick = () => Task.startAll();
  U.$('stop').onclick = () => Task.stopAll();
  U.$('scan-quiz').onclick = () => Quiz.scanQuiz();
  U.$('ask-ai').onclick = () => Quiz.askAiForQuiz();
  U.$('fill-answers').onclick = () => Quiz.fillQuizAnswers();
  U.$('settings').onclick = () => Settings.showSettings();

  // ============================================================
  // 消息处理（只处理来自 runningTabId 的业务消息）
  // ============================================================
  chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (!msg) return;

    // 业务消息只处理当前跑任务的 tab
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
        if (tab && msg.tabId === tab.id) {
          setTimeout(() => S.doScan(true), 1200);
        }
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
      if (!cfg.apiKey) {
        U.log('检测到答题页，但未设置 API Key', 'err');
        return;
      }
      U.log(`检测到答题页（${msg.count} 题），开始自动答题…`, 'ok');
      Quiz.autoAnswerFlow();
    }
  });

  // ============================================================
  // 启动
  // ============================================================
  window.addEventListener('load', async () => {
    if (SP.status && SP.status.refreshAiBanner) {
      await SP.status.refreshAiBanner();
    }
    setTimeout(() => handleTabChange('init'), 400);
  });

  chrome.tabs.onActivated.addListener(() => {
    setTimeout(() => handleTabChange('activated'), 300);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    S.getActiveTab().then(t => {
      if (t && t.id === tabId) {
        setTimeout(() => handleTabChange('updated'), 500);
      }
    });
  });

  console.log('[SP] modules loaded');
})();