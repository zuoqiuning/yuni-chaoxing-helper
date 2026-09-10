(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const dom = CXH.dom;
  const utils = CXH.utils;

  function isQuizPage() {
    return /dowork/.test(location.href) || document.querySelector('.stem_answer') !== null;
  }

  function extractQuestions() {
    const container = document.querySelector('.stem_answer') || document.body;
    const questions = [];

    container.querySelectorAll('.singleQuesId, .stem_answer').forEach((qEl, index) => {
      const titleEl = qEl.querySelector('.newZy_TItle, .Zy_TItle, .mark_name');
      if (!titleEl) return;

      const titleText = titleEl.textContent.trim();
      const typeMatch = titleText.match(/[（(]([^）)]+)[）)]/);
      const typeText = typeMatch ? typeMatch[1] : '';

      let type = 'unknown';
      if (typeText.includes('单选')) type = 'single';
      else if (typeText.includes('多选')) type = 'multiple';
      else if (typeText.includes('判断')) type = 'judge';
      else if (typeText.includes('填空')) type = 'fill';
      else if (typeText.includes('简答') || typeText.includes('论述')) type = 'essay';
      else {
        // 通过 DOM 特征推断
        const options = qEl.querySelectorAll('.num_option, .num_option_dx');
        if (options.length === 2 && options[0].textContent.trim() === 'A') {
          const optB = options[1].textContent.trim();
          if (optB === 'B' || /对|错|正确|错误|是|否/.test(optB)) type = 'judge';
          else type = 'single';
        } else if (options.length > 2) {
          type = qEl.querySelector('.num_option_dx') ? 'multiple' : 'single';
        } else if (qEl.querySelector('.edui-editor-iframeholder, .edui-editor')) {
          type = 'fill';
        }
      }

      // 提取题干
      const stemEl = qEl.querySelector('.mark_name, .stem, .question');
      const stem = stemEl ? stemEl.textContent.trim() : titleText.replace(/[（(][^）)]+[）)]/, '').trim();

      // 提取选项
      const options = [];
      qEl.querySelectorAll('.answerBg .num_option, .answerBg .num_option_dx, .choice').forEach((optEl, oi) => {
        const label = optEl.textContent.trim();
        const dataAttr = optEl.getAttribute('data') || '';
        options.push({ index: oi, label, data: dataAttr });
      });

      questions.push({ id: index, type, stem, options, element: qEl });
    });

    return questions;
  }

  // 填充选择题答案
  function fillChoice(question, answerLetters) {
    const letters = answerLetters.replace(/[^A-Z]/gi, '').split('').filter(Boolean);
    const options = question.element.querySelectorAll('.answerBg .num_option, .answerBg .num_option_dx, .choice');
    let filled = 0;

    options.forEach(optEl => {
      const text = optEl.textContent.trim();
      const data = optEl.getAttribute('data') || '';
      const isTarget = letters.some(l => text === l || data === l);
      const isSelected = optEl.classList.contains('check_answer') || optEl.classList.contains('check_answer_dx');

      if (isTarget && !isSelected) {
        const parent = optEl.closest('.answerBg') || optEl.parentElement;
        if (parent) {
          parent.click();
        } else {
          optEl.click();
        }
        filled++;
      }
    });

    return filled;
  }

  // 填充填空题
  function fillFill(question, answerText) {
    const container = question.element;
    const ueHolder = container.querySelector('.edui-editor-iframeholder, .edui-editor');
    if (ueHolder) {
      try {
        const iframe = ueHolder.querySelector('iframe');
        if (iframe && iframe.contentDocument) {
          const body = iframe.contentDocument.body;
          if (body) {
            body.innerHTML = answerText;
            body.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
        }
      } catch (_) {}
    }

    const textarea = container.querySelector('textarea, input[type="text"]');
    if (textarea) {
      textarea.value = answerText;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  }

  CXH.quiz = {
    isQuizPage,
    extractQuestions,
    fillChoice,
    fillFill,

    fillAnswer(question, answer) {
      switch (question.type) {
        case 'single':
        case 'multiple':
        case 'judge':
          return this.fillChoice(question, answer);
        case 'fill':
        case 'essay':
          return this.fillFill(question, answer);
        default:
          return false;
      }
    }
  };
})();