(function () {
  'use strict';
  const CXH = window.__CXH;
  if (!CXH) return;
  const SEL = CXH.SEL;
  const utils = CXH.utils;

  function isQuizPage() {
    if (/\/work\/dowork/.test(location.href)) return true;
    if (/\/work\/dowork/.test(location.pathname)) return true;
    if (document.querySelector(SEL.quizRootAny)) return true;
    return false;
  }

  function isOptionSelected(ab) {
    const letterEl = ab.querySelector(SEL.quizOptionLetter);
    return (letterEl && letterEl.classList.contains(SEL.quizSelectedClass))
      || ab.classList.contains(SEL.quizSelectedClass)
      || !!ab.querySelector(SEL.quizSelected)
      || ab.getAttribute('aria-checked') === 'true';
  }

  function extractOptionText(ab) {
    const answerP = ab.querySelector(SEL.quizOptionText);
    if (answerP) {
      const text = Array.from(answerP.querySelectorAll(SEL.quizParagraph))
        .map(p => p.textContent.trim()).filter(t => t).join(' ');
      if (text) return text;
    }
    const letterEl = ab.querySelector(SEL.quizOptionLetterOnly);
    let full = ab.textContent || '';
    if (letterEl) full = full.replace(letterEl.textContent, '');
    return full.trim();
  }

  function getOptionLetter(ab, index) {
    const letterEl = ab.querySelector(SEL.quizOptionLetter);
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

  // ============================================================
  // 判断题语义层（§4.1）
  // 中间表示用「语义」，不用「字母」——
  // 字母→语义的映射必须来自【页面选项文本】，绝不硬编码 A=TRUE。
  // ============================================================
  const TRUE_TEXTS  = /^(对|正确|是|是的|正确的|true|t|y|yes|√|✓)$/i;
  const FALSE_TEXTS = /^(错|错误|否|不是|错误的|false|f|n|no|×|✗|x)$/i;

  function normalizeSem(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    // 去掉可能残留的选项字母前缀（"A." / "B、"）
    s = s.replace(/^[A-Za-z]\s*[.、)）:：]?\s*/, '');
    s = s.replace(/[\s.。、,，:：;；!！?？"'`（）()\[\]【】]/g, '');
    if (!s) return null;
    if (TRUE_TEXTS.test(s)) return 'TRUE';
    if (FALSE_TEXTS.test(s)) return 'FALSE';
    return null;
  }

  // AI 的判断题答案（约定 A=正确 / B=错误）→ 规范语义
  function aiAnswerToSemantic(raw) {
    const s = String(raw == null ? '' : raw).trim();
    const upper = s.toUpperCase();
    if (upper === 'A') return 'TRUE';
    if (upper === 'B') return 'FALSE';
    return normalizeSem(s);   // 兼容 AI 直接返回「对 / 正确 / 是」
  }

  // 页面各字母对应的语义（来源=页面选项文本）
  function buildLetterSemantics(answerBgs) {
    const map = new Map();
    answerBgs.forEach((ab, i) => {
      map.set(getOptionLetter(ab, i), normalizeSem(extractOptionText(ab)));
    });
    return map;
  }

  // 从答案里抽字母（"ACD" 这类）
  function extractLetters(raw, maxCount) {
    const s = String(raw == null ? '' : raw);
    const clean = s.toUpperCase().replace(/[^A-Z]/g, '');
    const onlyLetterChars = s.replace(/[A-Za-z0-9\s,;，、。]/g, '') === '';
    if (onlyLetterChars && clean.length > 0 && clean.length <= maxCount && /^[A-Z]{1,10}$/.test(clean)) {
      return clean.split('');
    }
    return [];
  }

  // 文本匹配 → 目标字母（沿用原有精确 + 模糊打分逻辑）
  function resolveByText(question, answerRaw) {
    const answerBgs = Array.from(question.element.querySelectorAll(SEL.quizOption));
    const normAnswer = normalize(answerRaw);
    if (!normAnswer) return [];
    for (let i = 0; i < answerBgs.length; i++) {
      if (normalize(extractOptionText(answerBgs[i])) === normAnswer) {
        return [getOptionLetter(answerBgs[i], i)];
      }
    }
    let best = null, bestScore = 0;
    for (let i = 0; i < answerBgs.length; i++) {
      const normText = normalize(extractOptionText(answerBgs[i]));
      if (!normText) continue;
      let score = 0;
      if (normText === normAnswer) score = 100;
      else if (normText.includes(normAnswer)) score = 60 + normAnswer.length * 2;
      else if (normAnswer.includes(normText)) score = 40 + normText.length * 2;
      if (score > bestScore) { bestScore = score; best = getOptionLetter(answerBgs[i], i); }
    }
    return best ? [best] : [];
  }

  // 回读当前实际选中项（升序字母数组）
  function collectSelected(answerBgs) {
    const sel = [];
    answerBgs.forEach((ab, i) => {
      if (isOptionSelected(ab)) sel.push(getOptionLetter(ab, i));
    });
    return sel.sort();
  }

  // ============================================================
  // 统一「先清理、再设置」（§4.2）
  // 作用域严格限定在【本题】的 .answerBg 内，绝不跨题 ——
  // 写错范围会清掉用户在其他题的手动选择，比不清理更糟。
  // ============================================================
  function applySelection(question, targetLetters) {
    const answerBgs = Array.from(question.element.querySelectorAll(SEL.quizOption));
    const letterEls = new Map();
    answerBgs.forEach((ab, i) => letterEls.set(getOptionLetter(ab, i), ab));

    const target = new Set(targetLetters.map(l => String(l).toUpperCase()));
    let cleaned = 0, set = 0;

    // 第 1 步：清理不属于答案集的已选项（对单选/多选/判断统一适用，幂等）
    for (const [letter, ab] of letterEls) {
      if (target.has(letter)) continue;
      if (!isOptionSelected(ab)) continue;
      try { ab.click(); cleaned++; } catch (_) {}
    }
    // 第 2 步：设置答案集
    for (const letter of target) {
      const ab = letterEls.get(letter);
      if (!ab) continue;
      if (isOptionSelected(ab)) continue;
      try { ab.click(); set++; } catch (_) {}
    }
    return { cleaned, set };
  }

  function inferType(qEl, stemText, typeText) {
    const typename = qEl.getAttribute('typename') || '';
    const combined = typename + ' ' + typeText;
    if (combined.includes('单选')) return 'single';
    if (combined.includes('多选')) return 'multiple';
    if (combined.includes('判断')) return 'judge';
    if (combined.includes('填空')) return 'fill';
    if (combined.includes('简答') || combined.includes('论述') || combined.includes('问答')) return 'essay';
    const answerBgs = qEl.querySelectorAll(SEL.quizOption);
    const hasEditor = qEl.querySelector(SEL.quizEditor);
    const hasTextarea = qEl.querySelector(SEL.quizTextInput);
    if (hasEditor || hasTextarea) return 'fill';
    if (answerBgs.length === 2) {
      const texts = Array.from(answerBgs).map(a => a.textContent);
      if (texts.some(t => /对|错|正确|错误|是|否|true|false/i.test(t))) return 'judge';
      return 'single';
    }
    if (answerBgs.length > 0) {
      if (qEl.querySelector(SEL.quizMultiHint)) return 'multiple';
      return 'single';
    }
    return 'unknown';
  }

  function extractStem(qEl) {
    const stemEl = qEl.querySelector(SEL.quizStem);
    if (!stemEl) return '';
    const pEl = stemEl.querySelector(SEL.quizParagraph);
    let text = pEl ? pEl.textContent.trim() : stemEl.textContent.trim();
    text = text.replace(/^\s*\d+[\.\、\s]+/, '');
    text = text.replace(/[（(]([^）)]*?题)[）)]/g, '').trim();
    return text;
  }

  function extractOptions(qEl) {
    const options = [];
    const answerBgs = qEl.querySelectorAll(SEL.quizOption);
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
    let qEls = Array.from(document.querySelectorAll(SEL.quizRoot));
    if (qEls.length === 0) qEls = Array.from(document.querySelectorAll(SEL.quizRootAlt));
    if (qEls.length === 0) qEls = Array.from(document.querySelectorAll(SEL.quizRootAltPattern));
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

  // 统一入口：解析目标字母 → 清理+设置 → 回读校验
  async function fillChoiceByIndex(question, answerRaw) {
    const answer = String(answerRaw == null ? '' : answerRaw).trim();
    if (!answer) return { ok: false, reason: 'empty-answer' };

    const answerBgs = Array.from(question.element.querySelectorAll(SEL.quizOption));
    if (answerBgs.length === 0) return { ok: false, reason: 'no-options' };

    let targetLetters = [];
    let via = '';

    if (question.type === 'judge') {
      // 判断题：以语义对齐（字母→语义的映射来自【页面文本】，不是硬编码）
      const wantSem = aiAnswerToSemantic(answer);
      const letterSem = buildLetterSemantics(answerBgs);
      if (wantSem) {
        for (const [letter, sem] of letterSem) {
          if (sem === wantSem) { targetLetters = [letter]; break; }
        }
        if (targetLetters.length) via = `judge-semantic(${wantSem})`;
      }
      if (!targetLetters.length) {
        // 兜底：语义不可判定 → 回退字母通道（宁可可能填错，也不要完全没填）
        console.warn(`[CXH] 第${question.index + 1}题 判断题语义映射失败，回退字母通道: "${answer}"`);
        targetLetters = extractLetters(answer, answerBgs.length);
        via = 'judge-fallback-letter';
      }
    } else {
      targetLetters = extractLetters(answer, answerBgs.length);
      if (targetLetters.length) {
        via = 'letter';
      } else {
        targetLetters = resolveByText(question, answer);
        via = targetLetters.length ? 'text' : 'text-nomatch';
      }
    }

    if (!targetLetters.length) {
      console.warn(`[CXH] 第${question.index + 1}题 ✗ 未匹配: "${answer}"`);
      return { ok: false, reason: 'unmatched', via };
    }

    const { cleaned, set } = applySelection(question, targetLetters);

    // 回读校验前必须等一拍：.check_answer 之类标记可能是异步加上的
    // （某些平台的点击处理器有 100~300ms 延迟），否则会把「填上了」误判成「没填上」。
    await utils.sleep(200);

    const expected = targetLetters.map(l => String(l).toUpperCase()).sort();
    const actual = collectSelected(answerBgs);
    const ok = expected.length === actual.length && expected.every((l, i) => l === actual[i]);

    if (ok) {
      console.log(`[CXH] 第${question.index + 1}题 ✓ via=${via} 选中=[${actual}]${cleaned ? ` 清理=${cleaned}` : ''}`);
    } else {
      console.warn(`[CXH] 第${question.index + 1}题 回读不一致 via=${via} 期望=[${expected}] 实际=[${actual}] (cleaned=${cleaned}, set=${set})`);
    }
    return { ok, via, expected, actual, cleaned, set };
  }

  async function fillFill(question, answerText) {
    const qEl = question.element;
    if (!answerText) return { ok: false, reason: 'empty-answer' };

    const ueHolder = qEl.querySelector(SEL.quizEditorHolder);
    if (ueHolder) {
      try {
        const iframe = ueHolder.querySelector(SEL.iframe);
        if (iframe && iframe.contentDocument) {
          const body = iframe.contentDocument.body;
          if (body) {
            body.innerHTML = answerText;
            body.dispatchEvent(new Event('input', { bubbles: true }));
            body.dispatchEvent(new Event('change', { bubbles: true }));
            await utils.sleep(200);   // 同上：编辑器可能异步同步内部状态
            const got = String(body.textContent || '').trim();
            const ok = got.length > 0;
            if (!ok) console.warn(`[CXH] 第${question.index + 1}题 填空回读为空（UEditor）`);
            return { ok, via: 'ueditor', actual: got.slice(0, 50) };
          }
        }
      } catch (_) {}
    }

    const input = qEl.querySelector(SEL.quizTextInput);
    if (input) {
      input.value = answerText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await utils.sleep(200);
      const got = String(input.value || '').trim();
      const ok = got.length > 0;
      if (!ok) console.warn(`[CXH] 第${question.index + 1}题 填空回读为空（input）`);
      return { ok, via: 'input', actual: got.slice(0, 50) };
    }
    return { ok: false, reason: 'no-input' };
  }

  async function fillAnswerAsync(question, answer) {
    if (question.type === 'single' || question.type === 'multiple' || question.type === 'judge') {
      return await fillChoiceByIndex(question, answer);
    }
    if (question.type === 'fill' || question.type === 'essay') {
      return await fillFill(question, answer);
    }
    return { ok: false, reason: 'unknown-type' };
  }

  CXH.quiz = {
    isQuizPage,
    extractQuestions,
    fillAnswerAsync,
    submit() {
      const btn = document.querySelector(SEL.quizSubmit);
      if (btn) { btn.click(); return true; }
      return false;
    }
  };

  console.log('[CXH] quiz module loaded (v4)');
})();