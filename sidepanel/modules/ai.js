(function () {
  'use strict';
  window.SP = window.SP || {};

  const SYSTEM_PROMPT = `你是MiMo（中文名称也是MiMo），是小米公司研发的AI智能助手。你正在帮助用户回答学习通平台的题目。

请严格按照以下JSON格式返回答案，不要包含任何其他文字、不要包裹在markdown代码块里：
{"answers":[{"id":0,"answer":"A","confidence":0.95},{"id":1,"answer":"ACD","confidence":0.88}]}

规则：
- 单选题：answer 为单个大写字母，如 "B"
- 多选题：answer 为多个大写字母拼接，如 "ACD"
- 判断题：answer 为 "A"（正确/对）或 "B"（错误/错）
- 填空题/简答题：answer 为直接回答的文本内容
- confidence：0-1 之间的置信度，表示把握程度`;

  function buildPrompt(questions) {
    const lines = ['以下是需要回答的题目：\n'];
    questions.forEach((q, i) => {
      const typeLabel = {
        single: '单选题', multiple: '多选题', judge: '判断题',
        fill: '填空题', essay: '简答题'
      }[q.type] || q.type;
      lines.push(`【第${i + 1}题】(id=${q.id}, ${typeLabel})`);
      lines.push(`题目：${q.stem}`);
      if (q.options && q.options.length) {
        lines.push('选项：');
        q.options.forEach(o => lines.push(`  ${o.label}`));
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  function callMiMo({ apiKey, baseUrl, model, messages, thinkingType, maxTokens }) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MIMO_CHAT',
        payload: {
          apiKey, baseUrl, model, messages,
          thinkingType: thinkingType || 'disabled',
          max_tokens: maxTokens
        }
      }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { ok: false, error: 'no response' });
        }
      });
    });
  }

  function parseAnswers(content, total) {
    try {
      const m = content.match(/\{[\s\S]*"answers"[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.answers)) return parsed.answers;
      }
    } catch (_) {}

    const arr = [];
    const lines = content.split('\n').filter(Boolean);
    lines.forEach((line, i) => {
      if (i >= total) return;
      const m = line.match(/([A-Za-z]+)/);
      if (m) arr.push({ id: i, answer: m[1].toUpperCase(), confidence: 0.5 });
    });
    return arr;
  }

  // 验证 API Key + 模型
  async function verifyConfig(apiKey, baseUrl, model) {
    const resp = await callMiMo({
      apiKey, baseUrl, model,
      messages: [{ role: 'user', content: 'hi' }],
      thinkingType: 'disabled',
      maxTokens: 5
    });

    if (resp.ok) return { ok: true };

    const err = String(resp.error || '');
    let hint = err;
    if (err.includes('401') || err.includes('403')) hint = 'API Key 无效或已过期';
    else if (err.includes('404')) hint = '模型名不存在，请检查模型选择';
    else if (err.includes('429')) hint = '请求过于频繁，请稍后重试';
    else if (err.includes('timeout') || err.includes('fetch') || err.includes('Failed')) hint = '网络连接失败，请检查 Base URL';
    return { ok: false, error: hint, raw: err };
  }

  // 答题
  async function askQuiz(questions, cfg) {
    const userContent = buildPrompt(questions);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ];
    const resp = await callMiMo({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      messages,
      thinkingType: cfg.thinkingType
    });
    if (!resp.ok) return resp;
    return {
      ok: true,
      answers: parseAnswers(resp.content, questions.length),
      raw: resp.content
    };
  }

  SP.ai = { verifyConfig, askQuiz, buildPrompt, parseAnswers };
})();