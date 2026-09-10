(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const Store = SP.storage;
  const AI = SP.ai;

  // 自动答题流程锁，避免重复触发
  let autoAnswering = false;

  async function scanQuiz(silent = false) {
    const res = await S.sendToTab('SCAN_QUIZ', {}, 15000);
    if (!res.ok) {
      if (!silent) U.log('扫描题目失败: ' + res.error, 'err');
      return null;
    }

    SP.state.quizQuestions = res.questions || [];
    U.log(`发现 ${SP.state.quizQuestions.length} 道题目`);

    const el = U.$('quiz');
    if (el) el.innerHTML = SP.state.quizQuestions.map((q, i) => `
      <div class="item quiz-item" data-id="${q.id}">
        <span class="item-label">${i + 1}</span>
        <span class="item-name" title="${U.escapeHtml(q.stem)}">${U.escapeHtml(q.stem.slice(0, 40))}...</span>
        <span class="item-flag">待答</span>
      </div>
    `).join('');

    const panel = U.$('quiz-panel');
    if (panel) panel.style.display = 'block';
    const empty = U.$('quiz-empty');
    if (empty) empty.style.display = 'none';
    U.$('quiz-stat').textContent = `${SP.state.quizQuestions.length} 题`;

    return SP.state.quizQuestions;
  }

  async function askAiForQuiz(silent = false) {
    if (!SP.state.quizQuestions.length) {
      if (!silent) U.log('请先扫描题目', 'err');
      return null;
    }

    const cfg = await Store.getAIConfig();
    if (!cfg.apiKey) {
      if (!silent) U.log('请先点右上角 ⚙ 设置 API Key', 'err');
      return null;
    }

    U.log(`正在请求 AI 答案…（模型: ${cfg.model}, 思考: ${cfg.thinkingType}）`);
    const result = await AI.askQuiz(SP.state.quizQuestions, cfg);
    if (!result.ok) {
      if (!silent) U.log('AI 请求失败: ' + result.error, 'err');
      return null;
    }

    const answers = result.answers || [];
    U.log(`AI 返回 ${answers.length} 个答案`);

    answers.forEach(ans => {
      const el = document.querySelector(`.quiz-item[data-id="${ans.id}"]`);
      if (el) {
        const flag = el.querySelector('.item-flag');
        if (flag) {
          flag.textContent = ans.answer;
          flag.style.color = (ans.confidence || 0) > 0.8 ? '#2e7d32' : '#d32f2f';
          flag.title = `置信度 ${((ans.confidence || 0) * 100).toFixed(0)}%`;
        }
      }
    });

    SP.state.pendingAnswers = answers;
    U.log('答案已显示', 'ok');
    return answers;
  }

  async function fillQuizAnswers(silent = false) {
    const answers = SP.state.pendingAnswers || [];
    if (!answers.length) {
      if (!silent) U.log('没有待填入的答案', 'err');
      return null;
    }

    const res = await S.sendToTab('FILL_QUIZ', { answers }, 15000);
    if (res.ok) {
      U.log(`已填入 ${res.filled}/${res.total} 道题目`, 'ok');
      return res;
    } else {
      if (!silent) U.log('填入失败: ' + res.error, 'err');
      return null;
    }
  }

  // ============================================================
  // ★ 自动答题完整流程
  // ============================================================
  async function autoAnswerFlow() {
    if (autoAnswering) {
      U.log('自动答题已在执行中，跳过');
      return;
    }
    autoAnswering = true;
    try {
      U.log('=== 自动答题触发 ===', 'ok');

      const questions = await scanQuiz(true);
      if (!questions || !questions.length) {
        U.log('没有扫描到题目，退出', 'err');
        return;
      }

      const answers = await askAiForQuiz(true);
      if (!answers || !answers.length) {
        U.log('AI 没有返回答案，退出', 'err');
        return;
      }

      const filled = await fillQuizAnswers(true);
      if (filled && filled.ok) {
        U.log(`✓ 自动答题完成：填入 ${filled.filled}/${filled.total}`, 'ok');
      }
    } catch (e) {
      U.log('自动答题异常: ' + e.message, 'err');
    } finally {
      autoAnswering = false;
    }
  }

  SP.quiz = {
    scanQuiz: () => scanQuiz(false),
    askAiForQuiz: () => askAiForQuiz(false),
    fillQuizAnswers: () => fillQuizAnswers(false),
    autoAnswerFlow
  };
})();