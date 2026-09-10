(function () {
  'use strict';
  window.SP = window.SP || {};
  const U = SP.utils;
  const S = SP.scan;
  const R = SP.render;
  const Store = SP.storage;

  function getCourseIdFromUrl(url) {
    try { return new URL(url).searchParams.get('courseId'); }
    catch (_) { return null; }
  }

  async function jumpToSection(sectionId) {
    const jumpRes = await S.sendToTab('JUMP_SECTION', { sectionId }, 12000);
    const method = jumpRes?.method || 'unknown';
    U.log(`  [jump] 方式=${method}`);
    if (!jumpRes?.ok) {
      U.log(`  [jump] 失败: ${jumpRes?.error || 'unknown'}`, 'err');
      return false;
    }
    const loaded = await S.waitSectionChange(sectionId, 25000);
    if (!loaded) {
      U.log('跳转后页面未切换，超时', 'err');
      return false;
    }
    await U.sleep(method === 'reload' || method === 'reload-no-node' ? 1500 : 800);
    return true;
  }

  async function startAll() {
    // ★ 有任务在跑 → 提示，不重复启动
    if (SP.state.running) {
      U.log('已有任务正在运行，请先停止', 'err');
      return;
    }

    const tab = await S.getActiveTab();
    if (!tab || !tab.url || !tab.url.includes('chaoxing.com')) {
      U.log('请先打开学习通课程页', 'err');
      return;
    }
    const courseId = getCourseIdFromUrl(tab.url);
    if (!courseId) { U.log('无法解析 courseId', 'err'); return; }

    // ★ 记录跑任务的 tab
    SP.state.runningTabId = tab.id;

    const autoMute = await Store.getAutoMute();
    U.log(`自动静音: ${autoMute ? '开启' : '关闭'}`);

    U.setStatus(true);
    const startBtn = U.$('start'), stopBtn = U.$('stop');
    startBtn.disabled = true;
    stopBtn.disabled = false;

    const sectionRetryCount = {};
    const MAX_SECTION_RETRY = 3;
    const MAX_GLOBAL_ROUNDS = 5;

    try {
      U.log('=== 开始执行 ===', 'ok');
      await S.sendToTab('STOP');

      for (let round = 0; round < MAX_GLOBAL_ROUNDS; round++) {
        if (!SP.state.running) break;

        const catRes = await S.sendToTab('SCAN_CATALOG');
        if (!catRes.ok) { U.log('获取目录失败', 'err'); break; }
        const catalog = catRes.catalog || [];
        R.renderCatalog(catalog, null);

        const todo = catalog.filter(i => !i.finished);
        if (!todo.length) {
          U.log(`\n✓ 第 ${round + 1} 轮扫描：所有节已完成`, 'ok');
          break;
        }

        U.log(`\n=== 第 ${round + 1} 轮：待处理 ${todo.length} 节 ===`);

        for (let i = 0; i < todo.length; i++) {
          if (!SP.state.running) { U.log('已停止', 'err'); break; }

          const s = todo[i];
          const retry = sectionRetryCount[s.id] || 0;
          if (retry >= MAX_SECTION_RETRY) {
            U.log(`[${s.label}] ${s.name} 已达最大重试 ${MAX_SECTION_RETRY} 次，跳过`, 'err');
            continue;
          }

          U.log(`\n[${i + 1}/${todo.length}] [${s.label}] ${s.name}${retry > 0 ? ` (第 ${retry + 1} 次尝试)` : ''}`);
          U.setProgress(i + 1, todo.length, `第 ${i + 1}/${todo.length} 节 · ${s.label} ${s.name}`);
          R.markSectionCurrent(s.id);

          const curSectionId = await S.getCurrentSectionId();
          const onTarget = curSectionId === s.id;

          if (!onTarget) {
            const ok = await jumpToSection(s.id);
            if (!ok) {
              sectionRetryCount[s.id] = retry + 1;
              continue;
            }
          }

          const ready = await S.waitContentScript(15000);
          if (!ready) {
            U.log('页面未就绪，跳过', 'err');
            sectionRetryCount[s.id] = retry + 1;
            continue;
          }

          const jobRes = await S.sendToTab('SCAN_SECTION', {}, 90000);
          if (jobRes.ok) R.renderJobs(jobRes.jobs || []);
          else U.log('本节任务点扫描失败: ' + jobRes.error, 'err');

          const res = await S.sendToTab('PLAY_SECTION', {
            rate: 2, maxRetry: 2, maxPasses: 2, autoMute
          }, 3600000);

          if (res.stopped) { U.log('已停止', 'err'); break; }

          if (res.ok) {
            const level = res.total > 0 && res.done === res.total ? 'ok' : '';
            U.log(`本节完成: ${res.done}/${res.total}`, level);
          } else {
            U.log(`本节失败: ${res.error}`, 'err');
          }

          await U.sleep(2500);
          const recheck = await S.sendToTab('SCAN_CATALOG');
          if (recheck.ok) {
            const updated = (recheck.catalog || []).find(x => x.id === s.id);
            if (updated && updated.finished) {
              U.log(`✓ [${s.label}] 服务端已确认完成`, 'ok');
              R.markSectionDone(s.id);
            } else {
              U.log(`⚠ [${s.label}] 服务端未标记完成，将重试`, 'err');
              sectionRetryCount[s.id] = retry + 1;
            }
            R.renderCatalog(recheck.catalog || [], s.id);
          }

          await U.sleep(1500);
        }

        if (!SP.state.running) break;
      }

      if (SP.state.running) {
        U.log('\n=== 最终全局复查 ===', 'ok');
        const finalCheck = await S.sendToTab('SCAN_CATALOG');
        if (finalCheck.ok) {
          const finalCatalog = finalCheck.catalog || [];
          R.renderCatalog(finalCatalog, null);
          const finalTodo = finalCatalog.filter(i => !i.finished);

          if (finalTodo.length > 0) {
            U.log(`⚠ 最终复查发现 ${finalTodo.length} 节仍未完成:`, 'err');
            finalTodo.forEach(s => U.log(`  - [${s.label}] ${s.name} (id=${s.id})`, 'err'));

            for (let finalRound = 0; finalRound < 2 && SP.state.running; finalRound++) {
              U.log(`\n--- 最终补救第 ${finalRound + 1} 轮 ---`, 'err');
              let anyProgress = false;
              for (const s of finalTodo) {
                if (!SP.state.running) break;
                if (sectionRetryCount[s.id] >= MAX_SECTION_RETRY + 2) continue;

                U.log(`[补救] [${s.label}] ${s.name}`);
                const cur = await S.getCurrentSectionId();
                if (cur !== s.id) {
                  await S.sendToTab('JUMP_SECTION', { sectionId: s.id }, 12000);
                  await S.waitSectionChange(s.id, 25000);
                  await U.sleep(1500);
                }
                await S.waitContentScript(15000);
                const r = await S.sendToTab('PLAY_SECTION', {
                  rate: 2, maxRetry: 2, maxPasses: 1, autoMute
                }, 3600000);
                if (r && r.ok && r.done > 0) anyProgress = true;
                await U.sleep(2000);

                const ck = await S.sendToTab('SCAN_CATALOG');
                if (ck.ok) {
                  const u = (ck.catalog || []).find(x => x.id === s.id);
                  if (u && u.finished) {
                    U.log(`✓ [${s.label}] 补救成功`, 'ok');
                    R.markSectionDone(s.id);
                  } else {
                    sectionRetryCount[s.id] = (sectionRetryCount[s.id] || 0) + 1;
                  }
                }
              }
              if (!anyProgress) {
                U.log('补救无进展，退出', 'err');
                break;
              }
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
      U.setStatus(false);
      startBtn.disabled = false;
      stopBtn.disabled = true;
      U.setProgress(0, 0);
    }
  }

  async function stopAll() {
    if (!SP.state.running) return;
    SP.state.running = false;
    U.log('发送停止信号…', 'err');
    await S.sendToTab('STOP');
  }

  SP.task = { startAll, stopAll };
})();