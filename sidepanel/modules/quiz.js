(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const Store = SP.storage;
  const AI = SP.ai;

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
      <div class="item quiz-item" data-index="${i}">
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
      const el = document.querySelector(`.quiz-item[data-index="${ans.index}"]`);
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

    const res = await S.sendToTab('FILL_QUIZ', { answers }, 30000);
    if (res.ok) {
      U.log(`已填入 ${res.filled}/${res.total} 道题目`, res.filled > 0 ? 'ok' : 'err');
      return res;
    } else {
      if (!silent) U.log('填入失败: ' + res.error, 'err');
      return null;
    }
  }

  async function oneClickAnswer() {
    if (autoAnswering) { U.log('答题进行中…'); return; }
    autoAnswering = true;

    const btn = U.$('one-click');
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }

    try {
      U.log('=== 一键答题 ===', 'ok');

      U.log('[1/3] 扫描题目…');
      const questions = await scanQuiz(true);
      if (!questions || !questions.length) {
        U.log('未扫描到题目', 'err');
        return;
      }

      U.log('[2/3] AI 分析中…');
      const answers = await askAiForQuiz(true);
      if (!answers || !answers.length) {
        U.log('AI 未返回答案', 'err');
        return;
      }

      U.log('[3/3] 填入答案…');
      const filled = await fillQuizAnswers(true);
      if (filled && filled.ok) {
        U.log(`✓ 一键答题完成：${filled.filled}/${filled.total}`, 'ok');
        if (filled.filled < filled.total) {
          U.log(`  ⚠ ${filled.total - filled.filled} 道题未成功填入，请手动检查`, 'err');
        }
      }
    } catch (e) {
      U.log('异常: ' + e.message, 'err');
    } finally {
      autoAnswering = false;
      if (btn) { btn.disabled = false; btn.textContent = '一键答题'; }
    }
  }

  async function autoAnswerFlow() {
    await oneClickAnswer();
  }

  SP.quiz = {
    scanQuiz: () => scanQuiz(false),
    askAiForQuiz: () => askAiForQuiz(false),
    fillQuizAnswers: () => fillQuizAnswers(false),
    oneClickAnswer,
    autoAnswerFlow
  };
})();