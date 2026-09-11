(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;

  function typeLabel(type) {
    if (type === 'video') return '视频';
    if (type === 'document') return '文档';
    if (type === 'audio') return '音频';
    if (type === 'download') return '下载';
    return type || '未知';
  }

  function isJobPlaying(cardIndex, job) {
    if (SP.state.playingCardIdx === cardIndex
        && SP.state.playingJobIdx === job.index) {
      return true;
    }
    if (job.jobId && SP.state.playingJobId === job.jobId) {
      return true;
    }
    if (job.playing) return true;
    return false;
  }

  // ★★★ localDoneJobs 用 sectionId 前缀，跨节不串；不随 reset 清空
  function _sKey(sectionId) {
    return sectionId || SP.state.jobCardsSectionId || 'default';
  }

  function markLocalDone(sectionId, cardIndex, jobIndex, jobId) {
    const ld = SP.state.localDoneJobs || (SP.state.localDoneJobs = {});
    const s = _sKey(sectionId);
    if (cardIndex != null && jobIndex != null) {
      ld[`${s}:c${cardIndex}-i${jobIndex}`] = true;
    }
    if (jobId) {
      ld[`${s}:j:${jobId}`] = true;
    }
  }

  function isLocalDone(sectionId, cardIndex, jobIndex, jobId) {
    const ld = SP.state.localDoneJobs || {};
    const s = _sKey(sectionId);
    if (cardIndex != null && jobIndex != null && ld[`${s}:c${cardIndex}-i${jobIndex}`]) return true;
    if (jobId && ld[`${s}:j:${jobId}`]) return true;
    return false;
  }

  // 权威完成 = 本地记录（本次会话播放过）
  function isAuthoritativeDone(sectionId, cardIndex, job) {
    if (isLocalDone(sectionId, cardIndex, job.index, job.jobId)) return true;
    // content 侧发来的 localDone 字段（sessionStorage）
    if (job.localDone) return true;
    return false;
  }

  function renderOneCardHtml(card) {
    const sectionId = SP.state.jobCardsSectionId;
    const cJobs = card.jobs || [];
    const cTotal = cJobs.length;
    const cDone = cJobs.filter(j => isAuthoritativeDone(sectionId, card.cardIndex, j)).length;
    const cUndone = cTotal - cDone;

    let cardName = card.cardText || '';
    cardName = cardName.replace(/^\d+[\s.、]*/, '').trim();
    if (!cardName) cardName = '（未命名）';

    const displayIdx = card.cardIndex + 1;
    const completeMark = (cTotal > 0 && cUndone === 0) ? '✓' : '';
    const completeCls = (cTotal > 0 && cUndone === 0) ? 'complete' : '';

    const jobsHtml = cTotal === 0
      ? '<div class="job-card-empty">无任务点</div>'
      : cJobs.map((j, idx) => {
          const fullId = j.jobId || j.objectId || '';
          const done = isAuthoritativeDone(sectionId, card.cardIndex, j);
          const playing = !done && isJobPlaying(card.cardIndex, j);
          const cls = done ? 'done' : (playing ? 'playing' : 'pending');
          const label = typeLabel(j.type);
          const flag = done ? '✓' : (playing ? '▶' : '○');
          return `
            <div class="item job-item ${cls}"
                 data-job-id="${U.escapeHtml(fullId)}"
                 data-job-index="${j.index}"
                 data-card-index="${card.cardIndex}">
              <span class="item-label">${U.escapeHtml(label)}</span>
              <span class="item-name" title="${U.escapeHtml(fullId)}">#${idx + 1}</span>
              <span class="item-flag">${flag}</span>
            </div>
          `;
        }).join('');

    return `
      <div class="job-card-group ${completeCls}" data-card-index="${card.cardIndex}">
        <div class="job-card-title">
          <span class="job-card-badge">卡${displayIdx}</span>
          <span class="job-card-name" title="${U.escapeHtml(cardName)}">${U.escapeHtml(cardName)}</span>
          <span class="job-card-stat">${cDone}/${cTotal} ${completeMark}</span>
        </div>
        <div class="job-card-body">
          ${jobsHtml}
        </div>
      </div>
    `;
  }

  // ★ resetCardJobs 现在不清空 localDoneJobs
  function resetCardJobs() {
    SP.state.jobCards = [];
    SP.state.playingCardIdx = null;
    SP.state.playingJobIdx = null;
    SP.state.playingJobId = null;
    // ★★★ 不再清空 SP.state.localDoneJobs
    const el = U.$('jobs');
    if (el) el.innerHTML = '<div class="empty">加载中…</div>';
    const statEl = U.$('jobs-stat');
    if (statEl) statEl.textContent = '';
  }

  function renderCardJobs(cards) {
    const el = U.$('jobs');
    if (!el) return;

    SP.state.jobCards = cards || [];

    if (!cards || cards.length === 0) {
      el.innerHTML = '<div class="empty">未扫描</div>';
      const statEl = U.$('jobs-stat');
      if (statEl) statEl.textContent = '';
      return;
    }

    const sorted = [...cards].sort((a, b) => a.cardIndex - b.cardIndex);
    const sectionId = SP.state.jobCardsSectionId;

    let totalJobs = 0, undoneJobs = 0;
    sorted.forEach(card => {
      const cJobs = card.jobs || [];
      totalJobs += cJobs.length;
      undoneJobs += cJobs.filter(j => !isAuthoritativeDone(sectionId, card.cardIndex, j)).length;
    });

    el.innerHTML = sorted.map(c => renderOneCardHtml(c)).join('');

    const statEl = U.$('jobs-stat');
    if (statEl) statEl.textContent = `${totalJobs} 个 · 未完成 ${undoneJobs}`;
  }

  function updateOneCard(card, sectionId) {
    if (!card) return;

    // sectionId 变化时清空 current 数据但**保留 localDoneJobs**
    if (sectionId && SP.state.jobCardsSectionId && SP.state.jobCardsSectionId !== sectionId) {
      SP.state.jobCards = [];
      SP.state.playingCardIdx = null;
      SP.state.playingJobIdx = null;
      SP.state.playingJobId = null;
    }
    if (sectionId) SP.state.jobCardsSectionId = sectionId;

    if (!SP.state.jobCards) SP.state.jobCards = [];

    const idx = SP.state.jobCards.findIndex(c => c.cardIndex === card.cardIndex);
    if (idx >= 0) {
      SP.state.jobCards[idx] = { ...SP.state.jobCards[idx], ...card };
    } else {
      SP.state.jobCards.push(card);
      SP.state.jobCards.sort((a, b) => a.cardIndex - b.cardIndex);
    }

    const existing = document.querySelector(`#jobs .job-card-group[data-card-index="${card.cardIndex}"]`);
    const html = renderOneCardHtml(card);

    const container = U.$('jobs');
    if (existing) {
      const wasActive = existing.classList.contains('active');
      existing.outerHTML = html;
      if (wasActive) {
        const newEl = container.querySelector(`.job-card-group[data-card-index="${card.cardIndex}"]`);
        if (newEl) newEl.classList.add('active');
      }
    } else {
      if (container.querySelector('.empty')) container.innerHTML = '';
      renderCardJobs(SP.state.jobCards);
    }

    let total = 0, undone = 0;
    document.querySelectorAll('#jobs .job-card-group').forEach(group => {
      const items = group.querySelectorAll('.job-item');
      const t = items.length;
      const d = group.querySelectorAll('.job-item.done').length;
      total += t;
      undone += (t - d);
    });
    const statEl = U.$('jobs-stat');
    if (statEl) statEl.textContent = `${total} 个 · 未完成 ${undone}`;
  }

  function markCardActive(cardIndex) {
    document.querySelectorAll('#jobs .job-card-group').forEach(g => g.classList.remove('active'));
    const el = document.querySelector(`#jobs .job-card-group[data-card-index="${cardIndex}"]`);
    if (el) {
      el.classList.add('active');
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {
        el.scrollIntoView();
      }
    }
  }

  function renderJobs(jobs) {
    if (!jobs || jobs.length === 0) {
      renderCardJobs([]);
      return;
    }
    const grouped = {};
    jobs.forEach(j => {
      const ci = j.cardIndex || 0;
      if (!grouped[ci]) grouped[ci] = { cardIndex: ci, cardText: j.cardText || '', jobs: [] };
      grouped[ci].jobs.push(j);
    });
    renderCardJobs(Object.values(grouped));
  }

  function markJobPlaying(cardIndex, jobIndex, jobId) {
    SP.state.playingCardIdx = (cardIndex != null) ? cardIndex : null;
    SP.state.playingJobIdx = (jobIndex != null) ? jobIndex : null;
    SP.state.playingJobId = jobId || null;

    let el = null;
    if (cardIndex != null && jobIndex != null) {
      el = document.querySelector(
        `#jobs .job-card-group[data-card-index="${cardIndex}"] .job-item[data-job-index="${jobIndex}"]`
      );
    }
    if (!el && jobId) {
      el = document.querySelector(`#jobs .job-item[data-job-id="${jobId}"]`);
    }
    if (el) {
      el.classList.remove('pending', 'done');
      el.classList.add('playing');
      const f = el.querySelector('.item-flag');
      if (f) f.textContent = '▶';
    }
  }

  function markJobDone(jobId, cardIndex, jobIndex) {
    // ★ 加 sectionId 前缀记录
    markLocalDone(SP.state.jobCardsSectionId, cardIndex, jobIndex, jobId);

    if (SP.state.playingJobId === jobId
        || (cardIndex != null && jobIndex != null
            && SP.state.playingCardIdx === cardIndex
            && SP.state.playingJobIdx === jobIndex)) {
      SP.state.playingCardIdx = null;
      SP.state.playingJobIdx = null;
      SP.state.playingJobId = null;
    }

    let el = null;
    if (cardIndex != null && jobIndex != null) {
      el = document.querySelector(
        `#jobs .job-card-group[data-card-index="${cardIndex}"] .job-item[data-job-index="${jobIndex}"]`
      );
    }
    if (!el && jobId) {
      el = document.querySelector(`#jobs .job-item[data-job-id="${jobId}"]`);
    }
    if (el) {
      el.classList.remove('pending', 'playing');
      el.classList.add('done');
      const f = el.querySelector('.item-flag');
      if (f) f.textContent = '✓';
    }
    updateCardStatLocal();
  }

  function updateCardStatLocal() {
    let total = 0, undone = 0;
    document.querySelectorAll('#jobs .job-card-group').forEach(group => {
      const items = group.querySelectorAll('.job-item');
      const t = items.length;
      const d = group.querySelectorAll('.job-item.done').length;
      total += t;
      undone += (t - d);

      const statEl = group.querySelector('.job-card-stat');
      if (statEl) {
        const complete = t > 0 && d === t;
        statEl.textContent = `${d}/${t} ${complete ? '✓' : ''}`;
        group.classList.toggle('complete', complete);
      }
    });
    const statEl = U.$('jobs-stat');
    if (statEl) statEl.textContent = `${total} 个 · 未完成 ${undone}`;
  }

  function updateCardStat() { updateCardStatLocal(); }

  SP.jobs = {
    renderJobs, renderCardJobs, resetCardJobs,
    updateOneCard, markCardActive,
    markJobDone, markJobPlaying,
    updateCardStat
  };
})();