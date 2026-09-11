(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const Store = SP.storage;
  const AI = SP.ai;

  let autoAnswering = false;

  // ★ 刷新 AI 卡片的 UI 状态
  function updateQuizUI() {
    const count = (SP.state.quizQuestions || []).length;
    const emptyEl = U.$('quiz-empty');
    const readyEl = U.$('quiz-ready');
    const statEl = U.$('quiz-stat');
    const countEl = U.$('quiz-detail-count');

    if (count === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (readyEl) readyEl.style.display = 'none';
      if (statEl) statEl.textContent = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (readyEl) readyEl.style.display = 'flex';
    if (statEl) statEl.textContent = `${count} 题`;
    if (countEl) countEl.textContent = `共 ${count} 题`;
  }

  async function scanQuiz(silent = false) {
    const res = await S.sendToTab('SCAN_QUIZ', {}, 15000);
    if (!res.ok) {
      if (!silent) U.log('扫描题目失败: ' + res.error, 'err');
      SP.state.quizQuestions = [];
      updateQuizUI();
      return null;
    }

    SP.state.quizQuestions = res.questions || [];
    SP.state.fillResults = [];   // 题目重扫 → 上一次的填入结果作废
    if (SP.state.quizQuestions.length > 0) {
      U.log(`发现 ${SP.state.quizQuestions.length} 道题目`);
    }
    updateQuizUI();
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

    U.log(`正在请求 AI 答案…（模型: ${cfg.model}）`);
    const result = await AI.askQuiz(SP.state.quizQuestions, cfg);
    if (!result.ok) {
      if (!silent) U.log('AI 请求失败: ' + result.error, 'err');
      return null;
    }

    const answers = result.answers || [];
    U.log(`AI 返回 ${answers.length} 个答案`);
    SP.state.pendingAnswers = answers;
    U.log('答案已就绪', 'ok');
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
      SP.state.fillResults = res.details || [];
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
    if (btn) { btn.disabled = true; }

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
          const bad = (filled.details || []).filter(d => !d.ok).map(d => `第${d.index + 1}题`);
          U.log(`  ⚠ ${filled.total - filled.filled} 道题未通过回读校验${bad.length ? '：' + bad.join('、') : ''}`, 'err');
          if (SP.pending) {
            SP.pending.set('quiz',
              `有 ${filled.total - filled.filled} 道题未能自动填对${bad.length ? '（' + bad.join('、') + '）' : ''}：请点「查看题目」核对后手动修正`,
              'warn');
          }
        } else if (SP.pending) {
          SP.pending.clear('quiz');
        }
      }
    } catch (e) {
      U.log('异常: ' + e.message, 'err');
    } finally {
      autoAnswering = false;
      if (btn) { btn.disabled = false; }
    }
  }

  async function autoAnswerFlow() {
    await oneClickAnswer();
  }

  // ★ 题目详情弹窗
  function showQuizDetailModal() {
    const questions = SP.state.quizQuestions || [];
    if (!questions.length) {
      U.log('暂无题目可查看', 'err');
      return;
    }
    const answers = SP.state.pendingAnswers || [];
    const answerMap = {};
    answers.forEach(a => { answerMap[a.index] = a; });
    const resultMap = {};
    (SP.state.fillResults || []).forEach(r => { resultMap[r.index] = r; });

    const typeLabelMap = {
      single: '单选', multiple: '多选', judge: '判断',
      fill: '填空', essay: '简答'
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const itemsHtml = questions.map((q, i) => {
      const a = answerMap[q.index];
      const typeLabel = typeLabelMap[q.type] || q.type || '题目';
      let answerHtml;
      if (a && a.answer !== undefined && a.answer !== null && a.answer !== '') {
        const conf = (typeof a.confidence === 'number')
          ? ` <span class="qdi-conf">${(a.confidence * 100).toFixed(0)}%</span>`
          : '';
        answerHtml = `<span class="qdi-answer">${U.escapeHtml(a.answer)}${conf}</span>`;
      } else {
        answerHtml = `<span class="qdi-answer empty">（未答）</span>`;
      }

      // 页面实际选中（回读结果）：用来核对「AI 说的」和「真正点上的」是否一致
      const rs = resultMap[q.index];
      let actualHtml = '';
      if (rs) {
        const got = (rs.actual && rs.actual.length) ? rs.actual.join('') : '（无）';
        const exp = (rs.expected && rs.expected.length) ? rs.expected.join('') : '—';
        actualHtml = `<span class="qdi-actual ${rs.ok ? 'ok' : 'bad'}" title="期望 ${U.escapeHtml(exp)}">实际 ${U.escapeHtml(got)}</span>`;
      }

      const optionsHtml = (q.options && q.options.length)
        ? `<div class="qdi-options">
             ${q.options.map(o => `<div class="qdi-opt">${U.escapeHtml(o.letter)}. ${U.escapeHtml(o.text)}</div>`).join('')}
           </div>`
        : '';

      return `
        <div class="quiz-detail-item">
          <div class="qdi-head">
            <span class="qdi-num">${i + 1}</span>
            <span class="qdi-type">${U.escapeHtml(typeLabel)}</span>
            ${answerHtml}
            ${actualHtml}
          </div>
          <div class="qdi-stem">${U.escapeHtml(q.stem || '(无题干)')}</div>
          ${optionsHtml}
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="modal quiz-detail-modal">
        <div class="modal-title">题目详情 · 共 ${questions.length} 题</div>
        <div class="quiz-detail-list">${itemsHtml}</div>
        <div class="modal-buttons">
          <button id="quiz-detail-close">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#quiz-detail-close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }

  SP.quiz = {
    scanQuiz: () => scanQuiz(false),
    askAiForQuiz: () => askAiForQuiz(false),
    fillQuizAnswers: () => fillQuizAnswers(false),
    oneClickAnswer,
    autoAnswerFlow,
    updateQuizUI,
    showQuizDetailModal
  };
})();