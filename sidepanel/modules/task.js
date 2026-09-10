(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const R = SP.render;
  const Store = SP.storage;

  let isPaused = false;

  function getCourseIdFromUrl(url) {
    try { return new URL(url).searchParams.get('courseId'); }
    catch (_) { return null; }
  }

  async function tabStillAlive(tabId) {
    if (!tabId) return false;
    const t = await chrome.tabs.get(tabId).catch(() => null);
    return !!t;
  }

  async function ensureOnSection(expectedId, tid, context) {
    const actual = await S.getCurrentSectionId(tid);
    if (actual === expectedId) return { ok: true, method: 'already' };
    U.log(`  [sync${context ? ':' + context : ''}] 节不一致 (期望=${expectedId} 实际=${actual})，切回`);
    await S.sendToTab('JUMP_SECTION', { sectionId: expectedId }, 12000, tid);
    const ok = await S.waitSectionChange(expectedId, 18000, tid);
    if (ok) {
      U.log(`  [sync] 已切回 ${expectedId}`, 'ok');
      return { ok: true, method: 'jumped' };
    }
    U.log(`  [sync] 切回失败`, 'err');
    return { ok: false, method: 'failed' };
  }

  async function jumpToSection(sectionId, tid) {
    const jumpRes = await S.sendToTab('JUMP_SECTION', { sectionId }, 12000, tid);
    const method = jumpRes?.method || 'unknown';
    if (!jumpRes?.ok) {
      U.log(`  [jump] 失败: ${jumpRes?.error || 'unknown'}`, 'err');
      return false;
    }
    const loaded = await S.waitSectionChange(sectionId, 25000, tid);
    if (!loaded) {
      U.log('跳转后页面未切换，超时', 'err');
      return false;
    }
    await U.sleep(method === 'reload' || method === 'reload-no-node' ? 1500 : 800);
    return true;
  }

  async function processOneSection(s, idx, total, tid, autoMute, MAX_SECTION_RETRY) {
    let attempt = 0;
    let sectionDone = false;

    while (attempt < MAX_SECTION_RETRY && !sectionDone) {
      if (!SP.state.running) break;
      if (!await tabStillAlive(tid)) break;

      attempt++;
      U.log(`\n[${idx + 1}/${total}] [${s.label}] ${s.name}${attempt > 1 ? ` (第 ${attempt} 次尝试)` : ''}`);
      U.setProgress(idx + 1, total, `第 ${idx + 1}/${total} 节 · ${s.label} ${s.name}`);
      R.markSectionCurrent(s.id);
      SP.state.runningSectionId = s.id;

      const curSectionId = await S.getCurrentSectionId(tid);
      if (curSectionId !== s.id) {
        const ok = await jumpToSection(s.id, tid);
        if (!ok) { await U.sleep(3000); continue; }
      }

      const ready = await S.waitContentScript(15000, tid);
      if (!ready) { await U.sleep(2000); continue; }

      const jobRes = await S.sendToTab('SCAN_SECTION', {}, 90000, tid);
      if (jobRes.ok) R.renderJobs(jobRes.jobs || []);
      else U.log('  本节任务点扫描失败: ' + jobRes.error, 'err');

      const res = await S.sendToTab('PLAY_SECTION', {
        rate: 2, maxRetry: 3, maxPasses: 2, autoMute,
        expectedSectionId: s.id
      }, 3600000, tid);

      if (!res) { await U.sleep(2000); continue; }

      if (res.stopped) {
        U.log('已停止', 'err');
        SP.state.running = false;
        return false;
      }

      if (res.sectionChanged) {
        U.log(`  本节被切换打断，准备切回并重试…`, 'err');
        const sync = await ensureOnSection(s.id, tid, 'retry');
        if (!sync.ok) U.log('  切回失败，稍后重试', 'err');
        await U.sleep(2000);
        continue;
      }

      if (res.ok) {
        const level = res.total > 0 && res.done === res.total ? 'ok' : '';
        U.log(`本节完成: ${res.done}/${res.total}`, level);
      } else {
        U.log(`本节异常: ${res.error || 'unknown'}`, 'err');
      }

      await U.sleep(2500);
      const sync = await ensureOnSection(s.id, tid, 'recheck');
      if (!sync.ok) { await U.sleep(2000); continue; }

      const recheck = await S.sendToTab('SCAN_CATALOG', {}, 15000, tid);
      if (!recheck.ok) { await U.sleep(2000); continue; }

      const updated = (recheck.catalog || []).find(x => x.id === s.id);
      R.renderCatalog(recheck.catalog || [], s.id);

      if (updated && updated.finished) {
        U.log(`✓ [${s.label}] 服务端已确认完成`, 'ok');
        R.markSectionDone(s.id);
        sectionDone = true;
        return true;
      }

      U.log(`⚠ [${s.label}] 服务端未标记完成`, 'err');
      if (attempt < MAX_SECTION_RETRY) {
        U.log(`  准备第 ${attempt + 1} 次重试…`);
        await U.sleep(3000);
      }
    }

    if (!sectionDone && attempt >= MAX_SECTION_RETRY) {
      U.log(`[${s.label}] 已达最大重试 ${MAX_SECTION_RETRY} 次，跳过`, 'err');
    }
    return sectionDone;
  }

  async function startAll() {
    if (SP.state.running) { U.log('已有任务正在运行，请先停止', 'err'); return; }

    const tab = await S.getActiveTab();
    if (!tab || !tab.url || !tab.url.includes('chaoxing.com')) {
      U.log('请先打开学习通课程页', 'err'); return;
    }
    const courseId = getCourseIdFromUrl(tab.url);
    if (!courseId) { U.log('无法解析 courseId', 'err'); return; }

    const tid = tab.id;
    SP.state.runningTabId = tid;
    isPaused = false;

    const autoMute = await Store.getAutoMute();
    const disruptLock = await Store.getDisruptLock();
    U.log(`自动静音: ${autoMute ? '开启' : '关闭'}`);
    U.log(`防打扰锁: ${disruptLock ? '开启' : '关闭'}`);
    U.log(`任务绑定标签页: ${tid}`);

    U.setStatus(true);
    const startBtn = U.$('start'), stopBtn = U.$('stop'), pauseBtn = U.$('pause');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = '暂停';
      pauseBtn.classList.remove('active');
    }

    // ★ 同步锁设置到 content
    await S.sendToTab('SET_LOCK', { enabled: disruptLock }, 3000, tid);

    const MAX_SECTION_RETRY = 3;
    const MAX_GLOBAL_ROUNDS = 5;

    try {
      U.log('=== 开始执行 ===', 'ok');
      await S.sendToTab('STOP', {}, 5000, tid);

      for (let round = 0; round < MAX_GLOBAL_ROUNDS; round++) {
        if (!SP.state.running) break;
        if (!await tabStillAlive(tid)) { U.log('任务标签页已关闭，停止任务', 'err'); break; }

        const catRes = await S.sendToTab('SCAN_CATALOG', {}, 15000, tid);
        if (!catRes.ok) { U.log('获取目录失败: ' + catRes.error, 'err'); break; }
        const catalog = catRes.catalog || [];
        R.renderCatalog(catalog, null);

        const todo = catalog.filter(i => !i.finished);
        if (!todo.length) {
          U.log(`\n✓ 第 ${round + 1} 轮扫描：所有节已完成`, 'ok');
          break;
        }

        U.log(`\n=== 第 ${round + 1} 轮：待处理 ${todo.length} 节 ===`);

        for (let i = 0; i < todo.length; i++) {
          if (!SP.state.running) break;
          if (!await tabStillAlive(tid)) {
            U.log('任务标签页已关闭，停止任务', 'err');
            SP.state.running = false;
            break;
          }
          await processOneSection(todo[i], i, todo.length, tid, autoMute, MAX_SECTION_RETRY);
        }
        if (!SP.state.running) break;
      }

      // 最终全局复查
      if (SP.state.running && await tabStillAlive(tid)) {
        U.log('\n=== 最终全局复查 ===', 'ok');
        const finalCheck = await S.sendToTab('SCAN_CATALOG', {}, 15000, tid);
        if (finalCheck.ok) {
          const finalCatalog = finalCheck.catalog || [];
          R.renderCatalog(finalCatalog, null);
          const finalTodo = finalCatalog.filter(i => !i.finished);

          if (finalTodo.length > 0) {
            U.log(`⚠ 最终复查发现 ${finalTodo.length} 节仍未完成:`, 'err');
            finalTodo.forEach(s => U.log(`  - [${s.label}] ${s.name}`, 'err'));
            for (let finalRound = 0; finalRound < 2 && SP.state.running; finalRound++) {
              if (!await tabStillAlive(tid)) break;
              U.log(`\n--- 最终补救第 ${finalRound + 1} 轮 ---`, 'err');
              let anyProgress = false;
              for (const s of finalTodo) {
                if (!SP.state.running) break;
                const done = await processOneSection(s, 0, finalTodo.length, tid, autoMute, 2);
                if (done) anyProgress = true;
              }
              if (!anyProgress) { U.log('补救无进展，退出', 'err'); break; }
            }
          } else {
            U.log('✓ 最终复查：所有章节已确认完成', 'ok');
          }
        } else {
          U.log('最终复查失败: ' + finalCheck.error, 'err');
        }
      }

      if (SP.state.running) {
        U.log('\n=== 全部完成 ===', 'ok');
        chrome.runtime.sendMessage({
          type: 'NOTIFY',
          title: '屿宁学习助手',
          message: '所有未完成节已跑完'
        });
      }
    } catch (e) {
      U.log('异常: ' + e.message, 'err');
    } finally {
      SP.state.runningTabId = null;
      SP.state.runningSectionId = null;
      isPaused = false;
      U.setStatus(false);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.textContent = '暂停';
        pauseBtn.classList.remove('active');
      }
      U.setProgress(0, 0);
    }
  }

  async function stopAll() {
    if (!SP.state.running) return;
    const tid = SP.state.runningTabId;
    SP.state.running = false;
    SP.state.runningSectionId = null;
    isPaused = false;
    U.log('发送停止信号…', 'err');
    if (tid) await S.sendToTab('STOP', {}, 5000, tid);
  }

  // ★ 暂停/继续
  async function togglePause() {
    if (!SP.state.running) return;
    const tid = SP.state.runningTabId;
    if (!tid) return;
    const pauseBtn = U.$('pause');

    if (isPaused) {
      const r = await S.sendToTab('RESUME', {}, 5000, tid);
      if (r.ok) {
        isPaused = false;
        U.log('已继续', 'ok');
        if (pauseBtn) {
          pauseBtn.textContent = '暂停';
          pauseBtn.classList.remove('active');
        }
      } else {
        U.log('继续失败: ' + r.error, 'err');
      }
    } else {
      const r = await S.sendToTab('PAUSE', {}, 5000, tid);
      if (r.ok) {
        isPaused = true;
        U.log('已暂停，点"继续"恢复', 'ok');
        if (pauseBtn) {
          pauseBtn.textContent = '继续';
          pauseBtn.classList.add('active');
        }
      } else {
        U.log('暂停失败: ' + r.error, 'err');
      }
    }
  }

  // ★ 被 ALERT 主动触发暂停
  async function pauseByAlert() {
    if (!SP.state.running) return;
    const tid = SP.state.runningTabId;
    if (!tid) return;
    if (isPaused) return;
    const pauseBtn = U.$('pause');
    await S.sendToTab('PAUSE', {}, 5000, tid);
    isPaused = true;
    U.log('任务已自动暂停', 'err');
    if (pauseBtn) {
      pauseBtn.textContent = '继续';
      pauseBtn.classList.add('active');
    }
  }

  SP.task = { startAll, stopAll, togglePause, pauseByAlert };
})();