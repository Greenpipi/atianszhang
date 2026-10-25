/* ============ Notion 账本数据导入（共享模块） ============
 * 被 import.html（独立导入页）和 App 设置页「导入数据」共用：
 * 识别 Notion 导出 JSON → 与云端比对去重 → 补齐分类 → 分批写入 records 表。
 * 数据全程在用户设备上完成，不经过任何中间服务器。
 */
const NotionImport = {
  /* 识别文件格式：'notion' = Notion 导出 JSON；'backup' = App 全量备份；null = 无法识别 */
  detect(data) {
    if (!data || typeof data !== 'object') return null;
    const recs = data.records;
    if (data.summary && Array.isArray(recs) && recs.length && recs.every(r => r && typeof r === 'object' && !('ledger_id' in r))) return 'notion';
    if (Array.isArray(data.ledgers) || Array.isArray(data.categories) || Array.isArray(recs)) return 'backup';
    return null;
  },

  /* 生成导入计划：选账本、去重、分类补齐清单 */
  async plan(payload) {
    const ledgers = await Store.list('ledgers');
    const personal = ledgers.filter(l => l.type === 'personal');
    if (!personal.length) throw new Error('云端没有个人账本，请先在 App 里登录一次');
    const cats = await Store.list('categories');
    const withCats = personal.find(l => cats.some(c => c.ledger_id === l.id));
    const ledger = withCats || personal[0];
    const existing = await Store.list('records');
    const key = r => [r.date, r.category, r.sub, Number(r.amount).toFixed(2), r.note || ''].join('|');
    const have = new Set(existing.map(key));
    const toInsert = [];
    const seenInFile = new Set();
    for (const r of payload.records) {
      const k = key(r);
      if (have.has(k) || seenInFile.has(k)) continue; // 云端已有或文件内重复都跳过
      seenInFile.add(k);
      toInsert.push(r);
    }
    const dupCount = payload.records.length - toInsert.length;
    // 分类补齐：缺的大类插入，缺的小类并进 subs
    const catPlan = [];
    for (const nc of (payload.categories || [])) {
      const cur = cats.find(c => c.ledger_id === ledger.id && c.name === nc.name);
      if (!cur) { catPlan.push({ op: 'add', name: nc.name, kind: nc.kind, subs: nc.subs }); continue; }
      const miss = (nc.subs || []).filter(s => !(cur.subs || []).includes(s));
      if (miss.length) catPlan.push({ op: 'subs', id: cur.id, name: nc.name, miss });
    }
    return { ledger, catPlan, toInsert, dupCount, existingCount: existing.length };
  },

  /* 执行导入。onProgress(done, total, msg) 每批回调；返回 { added, failed } */
  async run(payload, plan, onProgress) {
    const { ledger, catPlan, toInsert } = plan;
    const say = (done, total, msg) => { if (onProgress) onProgress(done, total, msg); };
    let added = 0, failed = 0;

    // 1) 分类补齐（缺大类插入、缺小类并入）
    for (const p of catPlan) {
      try {
        if (p.op === 'add') {
          await Store.insert('categories', { ledger_id: ledger.id, name: p.name, kind: p.kind || 'expense', subs: p.subs || [] });
        } else {
          const cur = (await Store.list('categories')).find(c => c.id === p.id);
          if (cur) await Store.update('categories', p.id, { subs: [...(cur.subs || []), ...p.miss] });
        }
      } catch (e) { console.warn('分类补齐失败', p.name, e); }
    }

    // 2) 批量插入记录（每批 100 条；缺列自动剥离重试；整批失败退回逐条）
    const CHUNK = 100;
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
          if (col) { Store._noCols.add('records.' + col); stripTries++; continue; }
        }
        break; // 非缺列错误 → 退回逐条
      }
      if (!ok) {
        for (const r of chunk) {
          try { await Store.insert('records', r); added++; }
          catch (e) { failed++; console.warn('单条插入失败', r, e); }
        }
      }
      say(Math.min(i + CHUNK, total), total, '正在写入');
    }
    return { added, failed };
  }
};
