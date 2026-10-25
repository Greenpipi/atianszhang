/* ============ 数据导入页逻辑（独立页面，UI  wrapper） ============
 * 业务逻辑在 js/notion-import.js（与 App 设置页「导入数据」共用），本文件只做界面。
 */
(function () {
  const $ = id => document.getElementById(id);
  const logEl = () => $('imp-log');
  const log = (msg) => {
    const el = logEl();
    el.textContent += msg + '\n';
    el.scrollTop = el.scrollHeight;
  };
  const setStatus = (txt, ok) => {
    $('imp-status').textContent = txt;
    $('imp-dot').classList.toggle('ok', !!ok);
  };

  Store.init();
  Store.setHandlers(null, null);

  /* ---------- 登录态 ---------- */
  async function boot() {
    if (Store.mode !== 'supabase') { setStatus('云端未配置，无法导入', false); return; }
    try {
      const u = await Store.restoreSession();
      if (u && u.id) ready(u.email);
      else needLogin();
    } catch (e) { needLogin(); }
  }
  function needLogin() {
    setStatus('未登录——请先登录（与 App 同一账号）', false);
    $('imp-login').classList.remove('imp-hidden');
  }
  function ready(email) {
    setStatus('已登录 ' + email + ' · 云端模式', true);
    $('imp-login').classList.add('imp-hidden');
    $('imp-ready').classList.remove('imp-hidden');
  }
  $('imp-login').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('imp-login-btn');
    btn.disabled = true; btn.textContent = '登录中…';
    try {
      const u = await Store.signIn($('imp-email').value.trim(), $('imp-pwd').value);
      ready(u.email);
    } catch (err) {
      setStatus('登录失败：' + (err.message || err), false);
    } finally { btn.disabled = false; btn.textContent = '登 录'; }
  };

  /* ---------- 选择数据文件 ---------- */
  $('imp-pick').onclick = () => $('imp-file').click();
  $('imp-file').onchange = () => {
    const f = $('imp-file').files && $('imp-file').files[0];
    if (!f) return;
    $('imp-file-name').textContent = f.name + '（' + Math.round(f.size / 1024) + 'KB）';
    const rd = new FileReader();
    rd.onload = async () => {
      let payload;
      try {
        payload = JSON.parse(rd.result);
        if (NotionImport.detect(payload) !== 'notion') throw new Error('不是 Notion 账本数据文件（summary/records 结构不匹配）');
      } catch (err) {
        alert('文件解析失败：' + err.message);
        return;
      }
      try {
        const plan = await NotionImport.plan(payload);
        renderPlan(payload, plan);
      } catch (err) {
        log('✗ ' + (err.message || err));
      }
    };
    rd.readAsText(f);
  };

  function renderPlan(payload, plan) {
    const s = payload.summary || {};
    const byYear = Object.entries(s.byYear || {}).map(([y, n]) => y + '年 ' + n).join(' · ');
    $('imp-stats').innerHTML = [
      [s.total, '总记录数'], [s.expense, '支出'], [s.income, '收入'],
      [byYear ? Object.keys(s.byYear || {}).length : 0, '跨越年份'], [s.favorite || 0, '心仪'], [s.rental || 0, '出租屋'],
    ].map(([n, l]) => '<div class="cell"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>').join('');
    $('imp-dedup-tip').textContent =
      '云端现有 ' + plan.existingCount + ' 条记录；其中 ' + plan.dupCount + ' 条与文件重复将跳过，将新增 ' + plan.toInsert.length + ' 条' +
      (plan.catPlan.length ? '；另需补齐 ' + plan.catPlan.length + ' 个分类的小类' : '') + '。' +
      (byYear ? '（' + byYear + '）' : '') +
      (payload.skipped && Object.keys(payload.skipped).length ? ' 构建时已跳过：' + Object.entries(payload.skipped).map(([k, v]) => k + ' ' + v + ' 条').join('、') : '');
    log('✓ 计划就绪：新增 ' + plan.toInsert.length + ' 条，跳过重复 ' + plan.dupCount + ' 条' + (plan.catPlan.length ? '，补齐分类 ' + plan.catPlan.length + ' 项' : ''));
    $('imp-plan').classList.remove('imp-hidden');
    $('imp-start').disabled = false;
    $('imp-start').onclick = () => runImport(payload, plan);
  }

  /* ---------- 执行导入 ---------- */
  async function runImport(payload, plan) {
    if (!window.confirm('确认导入 ' + plan.toInsert.length + ' 条记录到「' + plan.ledger.name + '」？\n重复记录会自动跳过，可反复运行。')) return;
    $('imp-start').disabled = true;
    $('imp-pick').disabled = true;
    log('开始导入…');
    const r = await NotionImport.run(payload, plan, (done, total) => {
      $('imp-bar-fill').style.width = (done / total * 100).toFixed(1) + '%';
      if (done % 500 < 100 || done === total) log('进度 ' + done + ' / ' + total);
    });
    log('———');
    log('导入完成：新增 ' + r.added + ' 条' + (r.failed ? '，失败 ' + r.failed + ' 条' : '') + '。可关闭本页，打开财务管家查看（已实时同步）。');
    $('imp-start').textContent = '已完成';
    $('imp-start').disabled = true;
  }

  boot();
})();
