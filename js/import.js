/* ============ 数据导入页逻辑 ============
 * 读取用户本地选择的 Notion 导出 JSON，去重后批量写入云端 records 表。
 * 数据文件不经过任何服务器：文件选择 → 浏览器 → Supabase，全程在用户设备上完成。
 */
(function () {
  const $ = id => document.getElementById(id);
  const CHUNK = 100;
  let payload = null;

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
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.records) || !d.records.length) throw new Error('文件里没有 records 数据');
        payload = d;
        buildPlan();
      } catch (err) {
        alert('文件解析失败：' + err.message);
      }
    };
    rd.readAsText(f);
  };

  /* ---------- 生成导入计划（去重 + 分类补齐） ---------- */
  async function buildPlan() {
    $('imp-start').disabled = true;
    log('正在比对云端现有数据…');
    const ledgers = await Store.list('ledgers');
    const personal = ledgers.filter(l => l.type === 'personal');
    if (!personal.length) { log('✗ 云端没有个人账本，请先在 App 里登录一次'); return; }
    const cats = await Store.list('categories');
    const withCats = personal.find(l => cats.some(c => c.ledger_id === l.id));
    const ledger = withCats || personal[0];
    const existing = await Store.list('records');
    const key = r => [r.date, r.category, r.sub, Number(r.amount).toFixed(2), r.note || ''].join('|');
    const have = new Set(existing.map(key));
    const toInsert = payload.records.filter(r => !have.has(key(r)));
    const dupCount = payload.records.length - toInsert.length;

    // 分类补齐：缺的大类插入，缺的小类并进 subs
    const needCats = payload.categories || [];
    const catPlan = [];
    for (const nc of needCats) {
      const cur = cats.find(c => c.ledger_id === ledger.id && c.name === nc.name);
      if (!cur) { catPlan.push({ op: 'add', name: nc.name, kind: nc.kind, subs: nc.subs }); continue; }
      const miss = (nc.subs || []).filter(s => !(cur.subs || []).includes(s));
      if (miss.length) catPlan.push({ op: 'subs', id: cur.id, name: nc.name, miss });
    }

    const s = payload.summary || {};
    const byYear = Object.entries(s.byYear || {}).map(([y, n]) => y + '年 ' + n).join(' · ');
    $('imp-stats').innerHTML = [
      [s.total, '总记录数'], [s.expense, '支出'], [s.income, '收入'],
      [byYear ? Object.keys(s.byYear || {}).length : 0, '跨越年份'], [s.favorite || 0, '心仪'], [s.rental || 0, '出租屋'],
    ].map(([n, l]) => '<div class="cell"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>').join('');
    $('imp-dedup-tip').textContent =
      '云端现有 ' + existing.length + ' 条记录；其中 ' + dupCount + ' 条与文件重复将跳过，将新增 ' + toInsert.length + ' 条' +
      (catPlan.length ? '；另需补齐 ' + catPlan.length + ' 个分类的小类' : '') + '。' +
      (byYear ? '（' + byYear + '）' : '') +
      (payload.skipped && Object.keys(payload.skipped).length ? ' 构建时已跳过：' + Object.entries(payload.skipped).map(([k, v]) => k + ' ' + v + ' 条').join('、') : '');

    log('✓ 计划就绪：新增 ' + toInsert.length + ' 条，跳过重复 ' + dupCount + ' 条' + (catPlan.length ? '，补齐分类 ' + catPlan.length + ' 项' : ''));
    $('imp-plan').classList.remove('imp-hidden');
    $('imp-start').disabled = false;
    $('imp-start').onclick = () => runImport(ledger, catPlan, toInsert);
  }

  /* ---------- 执行导入 ---------- */
  async function runImport(ledger, catPlan, toInsert) {
    if (!window.confirm('确认导入 ' + toInsert.length + ' 条记录到「' + ledger.name + '」？\n重复记录会自动跳过，可反复运行。')) return;
    $('imp-start').disabled = true;
    $('imp-pick').disabled = true;
    let added = 0, failed = 0;

    // 1) 分类补齐
    for (const p of catPlan) {
      try {
        if (p.op === 'add') {
          await Store.insert('categories', { ledger_id: ledger.id, name: p.name, kind: p.kind || 'expense', subs: p.subs || [] });
          log('＋ 新增大类「' + p.name + '」（' + (p.subs || []).length + ' 个小类）');
        } else {
          const cur = (await Store.list('categories')).find(c => c.id === p.id);
          await Store.update('categories', p.id, { subs: [...(cur.subs || []), ...p.miss] });
          log('＋ 「' + p.name + '」补充小类：' + p.miss.join('、'));
        }
      } catch (e) { log('✗ 分类补齐失败「' + p.name + '」：' + e.message); }
    }

    // 2) 批量插入记录（每批 100 条；缺列自动剥离重试；整批失败退回逐条）
    const rows = toInsert.map(r => ({
      ledger_id: ledger.id, user_id: Store.user.id,
      category: r.category, sub: r.sub, amount: r.amount, note: r.note || '',
      date: r.date, kind: r.kind || 'expense', rating: r.rating || 0,
      favorite: !!r.favorite, rental: !!r.rental,
    }));
    const total = rows.length;
    for (let i = 0; i < total; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      let ok = false, stripTries = 0;
      while (!ok && stripTries < 4) {
        const payloadRows = chunk.map(r => Store._stripNoCols('records', r));
        const { error } = await Store.sb.from('records').insert(payloadRows).select();
        if (!error) { ok = true; added += chunk.length; break; }
        if (Store._isColErr(error)) {
          const col = Store._colName(error);
          if (col) { Store._noCols.add('records.' + col); log('⚠  records 表缺列 ' + col + '，已自动剥离后重试'); stripTries++; continue; }
        }
        log('✗ 第 ' + (i / CHUNK + 1) + ' 批失败：' + (error.message || error) + '，退回逐条插入');
        break;
      }
      if (!ok) {
        for (const r of chunk) {
          try { await Store.insert('records', r); added++; }
          catch (e) { failed++; log('✗ 单条失败 ' + r.date + ' ' + r.category + '：' + e.message); }
        }
      }
      const done = Math.min(i + CHUNK, total);
      $('imp-bar-fill').style.width = (done / total * 100).toFixed(1) + '%';
      log('进度 ' + done + ' / ' + total);
    }

    log('———');
    log('导入完成：新增 ' + added + ' 条' + (failed ? '，失败 ' + failed + ' 条' : '') + '。可关闭本页，打开财务管家查看（已实时同步）。');
    $('imp-start').textContent = '已完成';
    $('imp-start').disabled = true;
  }

  boot();
})();
