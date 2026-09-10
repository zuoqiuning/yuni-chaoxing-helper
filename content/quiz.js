(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const utils = CXH.utils;

  function isQuizPage() {
    if (/\/work\/dowork/.test(location.href)) return true;
    if (/\/work\/dowork/.test(location.pathname)) return true;
    if (document.querySelector('.singleQuesId, .questionLi, .TiMu')) return true;
    return false;
  }

  function isOptionSelected(ab) {
    const letterEl = ab.querySelector('.num_option, span[data]');
    return (letterEl && letterEl.classList.contains('check_answer'))
      || ab.classList.contains('check_answer')
      || !!ab.querySelector('.check_answer')
      || ab.getAttribute('aria-checked') === 'true';
  }

  function extractOptionText(ab) {
    const answerP = ab.querySelector('.answer_p');
    if (answerP) {
      const text = Array.from(answerP.querySelectorAll('p'))
        .map(p => p.textContent.trim()).filter(t => t).join(' ');
      if (text) return text;
    }
    const letterEl = ab.querySelector('.num_option');
    let full = ab.textContent || '';
    if (letterEl) full = full.replace(letterEl.textContent, '');
    return full.trim();
  }

  function getOptionLetter(ab, index) {
    const letterEl = ab.querySelector('.num_option, span[data]');
    if (letterEl) {
      const l = (letterEl.getAttribute('data') || letterEl.textContent || '').trim().toUpperCase();
      if (/^[A-Z]$/.test(l)) return l;
    }
    return String.fromCharCode(65 + index);
  }

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '')
      .replace(/[，。、；：！？,.;:!?'"`（）()【】\[\]]/g, '').trim();
  }

  function inferType(qEl, stemText, typeText) {
    const typename = qEl.getAttribute('typename') || '';
    const combined = typename + ' ' + typeText;
    if (combined.includes('单选')) return 'single';
    if (combined.includes('多选')) return 'multiple';
    if (combined.includes('判断')) return 'judge';
    if (combined.includes('填空')) return 'fill';
    if (combined.includes('简答') || combined.includes('论述') || combined.includes('问答')) return 'essay';
    const answerBgs = qEl.querySelectorAll('.answerBg');
    const hasEditor = qEl.querySelector('.edui-editor-iframeholder, .edui-editor, .edui-body-container');
    const hasTextarea = qEl.querySelector('textarea, input[type="text"]');
    if (hasEditor || hasTextarea) return 'fill';
    if (answerBgs.length === 2) {
      const texts = Array.from(answerBgs).map(a => a.textContent);
      if (texts.some(t => /对|错|正确|错误|是|否|true|false/i.test(t))) return 'judge';
      return 'single';
    }
    if (answerBgs.length > 0) {
      if (qEl.querySelector('.num_option_dx, .checkbox, input[type="checkbox"]')) return 'multiple';
      return 'single';
    }
    return 'unknown';
  }

  function extractStem(qEl) {
    const stemEl = qEl.querySelector('.mark_name, .Zy_TItle, .newZy_TItle, .colorDeep.workTextWrap, .workTextWrap');
    if (!stemEl) return '';
    const pEl = stemEl.querySelector('p');
    let text = pEl ? pEl.textContent.trim() : stemEl.textContent.trim();
    text = text.replace(/^\s*\d+[\.\、\s]+/, '');
    text = text.replace(/[（(]([^）)]*?题)[）)]/g, '').trim();
    return text;
  }

  function extractOptions(qEl) {
    const options = [];
    const answerBgs = qEl.querySelectorAll('.answerBg');
    answerBgs.forEach((ab, oi) => {
      const letter = getOptionLetter(ab, oi);
      const text = extractOptionText(ab);
      const selected = isOptionSelected(ab);
      options.push({ index: oi, letter, text: text.slice(0, 300), selected });
    });
    return options;
  }

  function extractQuestions() {
    const questions = [];
    let qEls = Array.from(document.querySelectorAll('.singleQuesId'));
    if (qEls.length === 0) qEls = Array.from(document.querySelectorAll('.questionLi'));
    if (qEls.length === 0) qEls = Array.from(document.querySelectorAll('[id^="question"][class*="Ques"]'));
    if (qEls.length === 0) return questions;

    qEls.forEach((qEl, index) => {
      const stemText = extractStem(qEl);
      const fullText = qEl.textContent || '';
      const typeMatch = fullText.match(/[（(]([^）)]*?题)[）)]/);
      const typeText = typeMatch ? typeMatch[1] : '';
      const type = inferType(qEl, stemText, typeText);
      const options = extractOptions(qEl);

      questions.push({
        index,
        type,
        stem: stemText.slice(0, 500),
        options,
        element: qEl
      });
    });

    return questions;
  }

  function fillChoiceByIndex(question, answerRaw) {
    const answer = String(answerRaw || '').trim();
    if (!answer) return 0;

    const answerBgs = Array.from(question.element.querySelectorAll('.answerBg'));
    if (answerBgs.length === 0) return 0;

    const upper = answer.toUpperCase();
    const cleanLetters = upper.replace(/[^A-Z]/g, '');
    const onlyLetterChars = answer.replace(/[A-Za-z0-9\s,;，、。]/g, '') === '';
    const isLetterAnswer = onlyLetterChars && cleanLetters.length > 0
      && cleanLetters.length <= answerBgs.length && /^[A-Z]{1,10}$/.test(cleanLetters);

    let filled = 0;
    console.log(`[CXH] 第${question.index + 1}题: answer="${answer}" isLetter=${isLetterAnswer}`);

    if (isLetterAnswer) {
      const letters = cleanLetters.split('');
      const letterMap = new Map();
      answerBgs.forEach((ab, i) => letterMap.set(getOptionLetter(ab, i), ab));

      letters.forEach((letter) => {
        const ab = letterMap.get(letter);
        if (!ab) return;
        if (isOptionSelected(ab)) { filled++; console.log(`  ${letter} 已选中`); return; }
        try { ab.click(); filled++; console.log(`  ✓ 点击 ${letter}`); } catch (e) {}
      });
      return filled;
    }

    const normAnswer = normalize(answer);
    if (!normAnswer) return 0;

    for (const ab of answerBgs) {
      const text = extractOptionText(ab);
      if (normalize(text) === normAnswer) {
        if (isOptionSelected(ab)) { filled++; }
        else { try { ab.click(); filled++; console.log(`  ✓ 精确匹配: "${text}"`); } catch (e) {} }
        return filled;
      }
    }

    let bestMatch = null, bestScore = 0;
    for (const ab of answerBgs) {
      const text = extractOptionText(ab);
      const normText = normalize(text);
      if (!normText) continue;
      let score = 0;
      if (normText === normAnswer) score = 100;
      else if (normText.includes(normAnswer)) score = 60 + normAnswer.length * 2;
      else if (normAnswer.includes(normText)) score = 40 + normText.length * 2;
      if (score > bestScore) { bestScore = score; bestMatch = ab; }
    }
    if (bestMatch && bestScore > 0) {
      const text = extractOptionText(bestMatch);
      if (isOptionSelected(bestMatch)) { filled++; }
      else { try { bestMatch.click(); filled++; console.log(`  ✓ 模糊匹配: "${text}" (${bestScore})`); } catch (e) {} }
      return filled;
    }

    console.warn(`  ✗ 未匹配: "${answer}"`);
    return 0;
  }

  function fillFill(question, answerText) {
    const qEl = question.element;
    if (!answerText) return false;

    const ueHolder = qEl.querySelector('.edui-editor-iframeholder, .edui-editor');
    if (ueHolder) {
      try {
        const iframe = ueHolder.querySelector('iframe');
        if (iframe && iframe.contentDocument) {
          const body = iframe.contentDocument.body;
          if (body) {
            body.innerHTML = answerText;
            body.dispatchEvent(new Event('input', { bubbles: true }));
            body.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      } catch (_) {}
    }

    const input = qEl.querySelector('textarea, input[type="text"]');
    if (input) {
      input.value = answerText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillAnswerAsync(question, answer) {
    if (question.type === 'single' || question.type === 'multiple' || question.type === 'judge') {
      const n = fillChoiceByIndex(question, answer);
      if (n > 0) await utils.sleep(300);
      return n > 0;
    }
    if (question.type === 'fill' || question.type === 'essay') {
      const ok = fillFill(question, answer);
      if (ok) await utils.sleep(200);
      return ok;
    }
    return false;
  }

  CXH.quiz = {
    isQuizPage,
    extractQuestions,
    fillAnswerAsync,
    submit() {
      const btn = document.querySelector('.completeBtn');
      if (btn) { btn.click(); return true; }
      return false;
    }
  };

  console.log('[CXH] quiz module loaded (v4)');
})();