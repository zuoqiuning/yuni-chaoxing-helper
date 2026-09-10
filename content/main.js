(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) {
    console.error('[CXH] modules not loaded');
    return;
  }
  if (window.__CXH_MAIN_LOADED) return;
  window.__CXH_MAIN_LOADED = true;

  console.log('[CXH] main loaded at', location.href);

  // ============================================================
  // 当前节识别
  // ============================================================
  function getCurrentSectionId() {
    const inp = document.getElementById('curChapterId');
    if (inp && inp.value) return inp.value;
    try { return new URL(location.href).searchParams.get('chapterId'); }
    catch (_) { return null; }
  }

  function getIframeKnowledgeId() {
    const ifr = document.getElementById('iframe');
    if (!ifr || !ifr.src) return null;
    try {
      const m = ifr.src.match(/knowledgeid=(\d+)/);
      return m ? m[1] : null;
    } catch (_) { return null; }
  }

  function findCatalogNode(sectionId) {
    return document.querySelector(`.posCatalog_select[id="cur${sectionId}"]`);
  }

  function waitFor(cond, timeoutMs) {
    return new Promise(resolve => {
      const start = Date.now();
      const t = setInterval(() => {
        if (cond()) { clearInterval(t); resolve(true); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); resolve(false); }
      }, 200);
    });
  }

  function isOnSection(sectionId) {
    if (getCurrentSectionId() === sectionId) return true;
    if (getIframeKnowledgeId() === sectionId) return true;
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('chapterId') === sectionId) return true;
    } catch (_) {}
    return false;
  }

  function doReload(sectionId) {
    setTimeout(() => {
      const url = new URL(location.href);
      url.searchParams.set('chapterId', sectionId);
      location.href = url.toString();
    }, 120);
  }

  async function smartJump(sectionId) {
    if (isOnSection(sectionId)) return { ok: true, method: 'already' };

    const node = findCatalogNode(sectionId);
    if (!node) {
      console.log('[CXH] jump: 找不到目录节点 cur' + sectionId + '，改用 reload');
      doReload(sectionId);
      return { ok: true, method: 'reload-no-node' };
    }

    const targets = [
      node,
      node.querySelector('.posCatalog_name'),
      node.querySelector('.posCatalog_title'),
      node.querySelector('.posCatalog_sbar')
    ].filter(Boolean);

    for (const t of targets) {
      try {
        t.click();
        await new Promise(r => setTimeout(r, 200));
        if (isOnSection(sectionId)) {
          console.log('[CXH] jump: SPA 成功');
          return { ok: true, method: 'spa' };
        }
      } catch (e) {
        console.log('[CXH] jump: click 异常: ' + e.message);
      }
    }

    const ok = await waitFor(() => isOnSection(sectionId), 8000);
    if (ok) {
      console.log('[CXH] jump: SPA 成功（延迟生效）');
      return { ok: true, method: 'spa-late' };
    }

    console.log('[CXH] jump: SPA 未生效，改用 reload');
    doReload(sectionId);
    return { ok: true, method: 'reload' };
  }

  // ============================================================
  // ★ 自动答题检测
  // ============================================================
  function isQuizPage() {
    if (/dowork/.test(location.href)) return true;
    if (document.querySelector('.stem_answer')) return true;
    return false;
  }

  async function checkAndNotifyQuiz() {
    if (!isQuizPage()) return;

    // 等页面稳定
    await new Promise(r => setTimeout(r, 2500));

    if (!isQuizPage()) return;

    const count = document.querySelectorAll('.stem_answer, .singleQuesId').length;
    console.log('[CXH] 检测到答题页，题目数约 =', count);

    // 通知 sidepanel
    try {
      chrome.runtime.sendMessage({
        type: 'QUIZ_PAGE_DETECTED',
        count,
        url: location.href
      });
    } catch (_) {}
  }

  // 页面加载后检测
  setTimeout(checkAndNotifyQuiz, 500);

  // 如果是 SPA 切换过来的，也检测一下 DOM 变化
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(checkAndNotifyQuiz, 500);
    }
  }, 1000);

  // ============================================================
  // 消息路由
  // ============================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handle(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  });

  async function handle(msg) {
    const { type, payload } = msg || {};
    switch (type) {
      case 'PING':
        return { ok: true, role: 'top', url: location.href };

      case 'SCAN_CATALOG':
        return { ok: true, catalog: CXH.catalog.scan() };

      case 'SCAN_SECTION':
        return { ok: true, jobs: await CXH.jobs.scanAllCards() };

      case 'PLAY_SECTION':
        return await CXH.section.processAllCards(payload?.rate || 2, payload || {});

      case 'STOP':
        CXH.player.setStopped(true);
        return { ok: true };

      case 'GET_CURRENT_SECTION':
        return {
          ok: true,
          sectionId: getCurrentSectionId(),
          iframeKnowledgeId: getIframeKnowledgeId()
        };

      case 'JUMP_SECTION':
        return await smartJump(payload.sectionId);

      // ============================================================
      // AI 答题
      // ============================================================
      case 'IS_QUIZ_PAGE':
        return { ok: true, isQuiz: isQuizPage() };

      case 'SCAN_QUIZ': {
        if (!CXH.quiz) {
          return { ok: false, error: 'quiz 模块未加载' };
        }
        if (!CXH.quiz.isQuizPage()) {
          return { ok: false, error: '当前页面不是答题页面' };
        }
        const questions = CXH.quiz.extractQuestions();
        return { ok: true, questions };
      }

      case 'FILL_QUIZ': {
        if (!CXH.quiz) {
          return { ok: false, error: 'quiz 模块未加载' };
        }
        const questions = CXH.quiz.extractQuestions();
        const answers = payload?.answers || [];
        let filled = 0;
        let failed = 0;

        for (const ans of answers) {
          const q = questions.find(x => x.id === ans.id);
          if (!q) { failed++; continue; }
          try {
            const ok = CXH.quiz.fillAnswer(q, ans.answer);
            if (ok) filled++;
            else failed++;
          } catch (e) {
            console.warn('[CXH] fill 失败 id=' + ans.id + ': ' + e.message);
            failed++;
          }
        }

        return { ok: true, filled, failed, total: questions.length };
      }

      default:
        return { ok: false, error: 'unknown: ' + type };
    }
  }
})();