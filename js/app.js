/* ============ 应用主逻辑 ============ */
/* 好物状态排序权重：使用中 → 未使用 → 闲置中 → 已弃用 → 已磬用（已弃用/已磬用 始终最后） */
const STATUS_RANK = { '使用中': 0, '未使用': 1, '闲置中': 2, '已弃用': 3, '已磬用': 4 };

/* 旧版季节自动切换会把好物的 status_since 重置为切换当天（已陪伴天数因此显示 1 天）。
 * 缺陷窗口：2026-10-26 18:17（3702a14 起写入 todayStr()）~ 2026-10-27 11:55（5f89928 修复为止）。
 * 该窗口内被自动切换过的好物，status_since 精确等于 2026-10-26 或 2026-10-27 → 即被污染值。 */
const WISH_STATUS_BUG_DATES = ['2026-10-26', '2026-10-27'];
const App = {
  state: {
    route: 'ledger',
    ledgers: [], categories: [], records: [], budgets: [], templates: [],
    currentLedgerId: null,
    ledgerMonth: thisMonth(),
    wish: { sort: 'date-desc', tag: '', cats: [], open: [] },
    home: { view: 'week', anchor: todayStr(), sel: todayStr(), mode: 'calendar' },
    search: { q: '', cats: [], ledgers: [], from: '', to: '' },
    list: { sortKey: 'date', sortDir: 'desc', page: 1 },
    rentalMonth: thisMonth(),
    rentalScope: 'month',   // 出租屋统计范围：month 本月 / year 本年 / all 总计
    stats: { period: 'month', month: thisMonth(), year: String(new Date().getFullYear()), scope: 'ledger', cat: '日常支出', pie: 'expense' },
    settingsLedgerType: 'personal',
    rating: 0,
    loading: false
  },

  /* ---------- 启动 ---------- */
  async init() {
    Store.init();
    Store.setHandlers(() => this.onDataChange(), () => this.onAuthChange());
    Store.onCloudMissing = () => this.toast('云端数据表尚未创建，已自动切换为本地记账（在 Supabase 执行建表 SQL 后恢复云同步）', '');
    this.bindChrome();

    let user = null;
    try { user = await Store.restoreSession(); }
    catch (e) { console.warn(e); }

    window.addEventListener('hashchange', () => this.route());
    // 标签页重新可见时检测是否跨入新月份，触发季节自动切换（非实时轮询）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.state.records.length) {
        this.applySeasonStatus().catch(e => console.warn('季节自动切换失败', e));
      }
    });
    this.updateOnline();
    window.addEventListener('online', () => this.updateOnline());
    window.addEventListener('offline', () => this.updateOnline());

    if (user) { await this.enterApp(); } else { this.showLogin(); }
  },

  bindChrome() {
    const $ = id => document.getElementById(id);
    $('menu-btn').onclick = () => {
      $('sidebar').classList.toggle('open');
      $('sidebar-mask').classList.toggle('show');
    };
    $('sidebar-mask').onclick = () => {
      $('sidebar').classList.remove('open');
      $('sidebar-mask').classList.remove('show');
    };
    document.querySelectorAll('.nav-item').forEach(a => {
      a.addEventListener('click', () => {
        $('sidebar').classList.remove('open');
        $('sidebar-mask').classList.remove('show');
      });
    });
    $('toggle-signup').onclick = () => this.toggleSignup();
    $('login-form').onsubmit = e => { e.preventDefault(); this.doLogin(); };
    this.bindSearchShortcut();
  },

  /* ---------- 在线状态 ---------- */
  updateOnline() {
    const off = !navigator.onLine;
    document.getElementById('offline-banner').hidden = !off;
    this.renderSyncChip();
  },

  renderSyncChip() {
    const chip = document.getElementById('sync-chip');
    const off = !navigator.onLine;
    chip.className = 'sync-chip' + (Store.mode === 'local' ? ' local' : '') + (off ? ' off' : '');
    const label = off ? '离线' : (Store.mode === 'supabase' ? '云端模式' : '本地模式');
    chip.innerHTML = '<span class="sync-dot"></span><span>' + label + '</span>';
    chip.title = off ? '网络已断开' : (Store.mode === 'supabase' ? '数据实时云端同步' : '数据仅保存在本浏览器');
  },

  /* ---------- 登录 ---------- */
  showLogin() {
    document.getElementById('login-view').hidden = false;
    document.getElementById('app-view').hidden = true;
    const tip = document.getElementById('login-mode-tip');
    if (Store.mode === 'supabase') {
      tip.textContent = '使用邮箱登录，数据云端同步 · 行级安全隔离';
    } else {
      tip.textContent = '未检测到 Supabase 配置，当前为本地演示模式（数据仅存本浏览器）';
    }
  },

  toggleSignup() {
    this.state.signup = !this.state.signup;
    const btn = document.getElementById('login-btn');
    const toggle = document.getElementById('toggle-signup');
    btn.textContent = this.state.signup ? '注 册' : '登 录';
    toggle.textContent = this.state.signup ? '已有账号？去登录' : '没有账号？注册一个';
    this._loginErr('');
  },

  _loginErr(msg) {
    const el = document.getElementById('login-error');
    if (!msg) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = msg;
  },

  async doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-password').value;
    if (!email || !pwd) return this._loginErr('请输入邮箱和密码');
    this._loginErr('');
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = '处理中…';
    try {
      if (this.state.signup) {
        const r = await Store.signUp(email, pwd);
        if (r.needConfirm) {
          this._loginErr('注册成功！请先到邮箱完成验证，再返回登录。');
          this.state.signup = false;
          this.toggleSignup();
          return;
        }
        this.toast('注册成功，欢迎使用', 'ok');
      } else {
        await Store.signIn(email, pwd);
        this.toast('登录成功', 'ok');
      }
      await this.enterApp();
    } catch (e) {
      this._loginErr(e.message || '登录失败');
    } finally {
      btn.disabled = false;
      btn.textContent = this.state.signup ? '注 册' : '登 录';
    }
  },

  async onAuthChange() {
    if (!Store.user) this.showLogin();
  },

  /* ---------- 进入应用 ---------- */
  async enterApp() {
    document.getElementById('login-view').hidden = true;
    document.getElementById('app-view').hidden = false;
    this.initNavToggle();
    // banner 配置与本地迁移检查互相独立，并行发起省一个来回（弱网下登录后内容出现更快）
    await Promise.all([this.initHero(), this.migrateLocalIfNeeded()]);
    // 离线优先：先用本地快照即时渲染（秒开），再后台拉云端刷新，不再等往返
    this.paintFromCache();
    await this.loadData();
    // 好物数据自动自愈：补定格快照 + 恢复被误重置的已陪伴天数（无需用户任何操作）
    this.autoRepairWishData().then(n => {
      if (n) {
        if (this.state.route === 'wishlist') this.renderWishlist();
        this.toast('已自动修复 ' + n + ' 件好物数据', 'ok');
      }
    }).catch(e => console.warn('好物数据自愈失败', e));
    // 季节自动切换：打开应用时执行一次（不阻塞渲染，后台完成）
    this.applySeasonStatus().catch(e => console.warn('季节自动切换失败', e));
    if (!location.hash || location.hash === '#/') location.hash = '#/ledger';
    this.route();
  },

  /* ---------- 本地数据自动上云（一次性，幂等去重） ---------- */
  async migrateLocalIfNeeded() {
    if (Store.mode !== 'supabase' || !Store.user) return;
    const email = Store.user.email || '';
    const marker = 'fin_migrated_v2_' + email; // v2：旧标记可能是缺陷版逻辑打的，不再采信
    try { if (localStorage.getItem(marker)) return; } catch (e) { return; }
    let db = null;
    try { db = JSON.parse(localStorage.getItem('fin_db_' + email) || 'null'); } catch (e) { /* ignore */ }
    const tables = ['ledgers', 'categories', 'records', 'budgets', 'templates'];
    const hasData = db && typeof db === 'object' && tables.some(t => Array.isArray(db[t]) && db[t].length);
    if (!hasData) { try { localStorage.setItem(marker, '1'); } catch (e) { /* ignore */ } return; }
    try {
      // 云端现状：账本按 name+type 配对复用（种子账本不重复建），其余按自然键/ID 去重
      const [cloudLedgers, cloudCats, cloudBudgets, cloudTpls, cloudRecs] = await Promise.all([
        Store.list('ledgers'), Store.list('categories'), Store.list('budgets'), Store.list('templates'), Store.list('records')
      ]);
      const lidMap = {}; // 本地账本 id → 云端账本 id
      let n = 0;
      const put = async (t, row) => {
        try { await Store.insert(t, row); n++; return true; }
        catch (e) { console.warn('迁移跳过 ' + t, (e && e.message) || e); return false; }
      };
      const clean = r => { const x = { ...r }; delete x.user_id; delete x.created_at; return x; };
      // 本地账本按 name+type 先去重（本地数据历史上也可能有重复，只搬一个，避免云端插出两个同名账本）
      const localLedgers = [];
      const localKey = l => (l.name || '') + '|' + (l.type || 'personal');
      for (const l of (db.ledgers || [])) {
        const kept = localLedgers.find(x => localKey(x) === localKey(l));
        if (kept) { lidMap[l.id] = kept.id; continue; } // 本地重复账本：子数据改挂到保留的那个
        localLedgers.push(l);
      }
      for (const l of localLedgers) {
        const exist = cloudLedgers.find(c => c.name === l.name && (c.type || 'personal') === (l.type || 'personal'));
        if (exist) { lidMap[l.id] = exist.id; continue; }
        if (await put('ledgers', clean(l))) cloudLedgers.push({ ...l }); // 更新快照，防止本地其余同名账本再插一遍
      }
      const hasCat = (lid, name) => cloudCats.some(c => c.ledger_id === lid && c.name === name);
      const hasBudget = (lid, cat, sub) => cloudBudgets.some(b => b.ledger_id === lid && b.category === cat && (b.sub || '') === (sub || ''));
      const hasTpl = (lid, cat, sub) => cloudTpls.some(t => t.ledger_id === lid && t.category === cat && (t.sub || '') === (sub || ''));
      const recIds = new Set(cloudRecs.map(r => r.id));
      for (const c of (db.categories || [])) {
        const lid = lidMap[c.ledger_id] || c.ledger_id;
        if (hasCat(lid, c.name)) continue;
        if (await put('categories', clean({ ...c, ledger_id: lid }))) cloudCats.push({ ...c, ledger_id: lid }); // 回写快照，本地自身重复时不会插出两份
      }
      for (const b of (db.budgets || [])) {
        const lid = lidMap[b.ledger_id] || b.ledger_id;
        if (hasBudget(lid, b.category, b.sub)) continue;
        if (await put('budgets', clean({ ...b, ledger_id: lid }))) cloudBudgets.push({ ...b, ledger_id: lid });
      }
      for (const t of (db.templates || [])) {
        const lid = lidMap[t.ledger_id] || t.ledger_id;
        if (hasTpl(lid, t.category, t.sub)) continue;
        if (await put('templates', clean({ ...t, ledger_id: lid }))) cloudTpls.push({ ...t, ledger_id: lid });
      }
      for (const r of (db.records || [])) {
        if (recIds.has(r.id)) continue; // 已在云端（含此前缺陷版搬过去的）
        await put('records', clean({ ...r, ledger_id: lidMap[r.ledger_id] || r.ledger_id }));
      }
      try { localStorage.setItem(marker, '1'); } catch (e) { /* ignore */ }
      if (n) this.toast('本地数据已同步到云端（' + n + ' 条）', 'ok');
    } catch (e) {
      console.warn('本地数据迁移失败', e);
    }
  },

  /* ---------- 导航栏收起/展开 ---------- */
  initNavToggle() {
    const shell = document.getElementById('app-view');
    const btn = document.getElementById('nav-collapse');
    if (!shell || !btn || this._navBound) return;
    this._navBound = true;
    try { if (localStorage.getItem('fin_nav_collapsed') === '1') shell.classList.add('nav-collapsed'); } catch (e) { /* ignore */ }
    const sync = () => {
      const collapsed = shell.classList.contains('nav-collapsed');
      btn.title = collapsed ? '展开导航栏' : '收起导航栏';
    };
    sync();
    btn.onclick = () => {
      shell.classList.toggle('nav-collapsed');
      try { localStorage.setItem('fin_nav_collapsed', shell.classList.contains('nav-collapsed') ? '1' : '0'); } catch (e) { /* ignore */ }
      sync();
    };
  },

  /* ---------- 背景头图 ---------- */
  async initHero() {
    const hero = document.getElementById('page-hero');
    if (!hero || this._heroBound) return;
    this._heroBound = true;
    this.hero = { img: '', x: 50, y: 50 };
    const s = await Store.getBanner();
    if (s && typeof s === 'object') {
      this.hero.img = typeof s.img === 'string' ? s.img : '';
      this.hero.x = Math.max(0, Math.min(100, Number(s.x) || 50));
      this.hero.y = Math.max(0, Math.min(100, Number(s.y) || 50));
    }
    this.applyHero();

    const file = document.getElementById('hero-file');
    const btnChange = document.getElementById('hero-change');
    const btnReset = document.getElementById('hero-reset');
    const btnAdjust = document.getElementById('hero-adjust');
    const hint = document.getElementById('hero-hint');

    btnChange.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        this.hero.img = await compressImage(f, 1600, 0.82);
        this.hero.x = 50; this.hero.y = 50;
        this.saveHero(); this.applyHero();
        this.toast('背景已更换', 'ok');
      } catch (e) { this.toast(e.message || '图片读取失败', 'err'); }
      file.value = '';
    };
    btnReset.onclick = () => {
      this.hero.img = ''; this.hero.x = 50; this.hero.y = 50;
      this.saveHero(); this.applyHero();
      this.toast('已恢复默认背景', 'ok');
    };
    btnAdjust.onclick = () => {
      this.heroAdjusting = !this.heroAdjusting;
      hero.classList.toggle('adjusting', !!this.heroAdjusting);
      hint.hidden = !this.heroAdjusting;
      btnAdjust.textContent = this.heroAdjusting ? '保存位置' : '调整位置';
      if (!this.heroAdjusting) { this.saveHero(); this.toast('位置已保存', 'ok'); }
    };
    // 拖动调整（鼠标 + 触摸统一走 pointer 事件）
    let drag = null;
    hero.addEventListener('pointerdown', e => {
      if (!this.heroAdjusting) return;
      if (e.target.closest('.hero-tools')) return; // 工具按钮不触发拖动
      drag = { sx: e.clientX, sy: e.clientY, x: this.hero.x, y: this.hero.y };
      try { hero.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      e.preventDefault();
    });
    hero.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = hero.clientWidth || 1, h = hero.clientHeight || 1;
      this.hero.x = Math.max(0, Math.min(100, drag.x - (e.clientX - drag.sx) / w * 100));
      this.hero.y = Math.max(0, Math.min(100, drag.y - (e.clientY - drag.sy) / h * 100));
      this.applyHero();
    });
    const endDrag = () => { drag = null; };
    hero.addEventListener('pointerup', endDrag);
    hero.addEventListener('pointercancel', endDrag);
  },
  applyHero() {
    const hero = document.getElementById('page-hero');
    if (!hero) return;
    hero.style.backgroundImage = 'url("' + (this.hero.img || HERO_DEFAULT_BG) + '")';
    hero.style.backgroundPosition = this.hero.x + '% ' + this.hero.y + '%';
    const r = document.getElementById('hero-reset');
    if (r) r.hidden = !this.hero.img;
  },
  saveHero() {
    Promise.resolve(Store.saveBanner(this.hero)).catch(() => { /* ignore */ });
  },

  /* ---------- 数据加载 ---------- */
  async loadData(silent = false) {
    if (this.state.loading && silent) return;
    this.state.loading = true;
    try {
      const [ledgers, categories, records, budgets, templates] = await Promise.all([
        Store.list('ledgers'), Store.list('categories'), Store.list('records'), Store.list('budgets'), Store.list('templates')
      ]);
      let changed = false;
      if (!ledgers.length) {
        for (const l of DEFAULT_LEDGERS) await Store.insert('ledgers', l);
        changed = true;
      }
      // 旧版数据清理：出租屋曾是独立账本，现改为主账本的记录标记
      const staleRental = ledgers.filter(l => l.type === 'rental');
      if (staleRental.length) {
        const ops = [];
        for (const l of staleRental) {
          for (const r of records.filter(x => x.ledger_id === l.id)) ops.push(Store.remove('records', r.id));
          for (const c of categories.filter(x => x.ledger_id === l.id)) ops.push(Store.remove('categories', c.id));
          for (const b of budgets.filter(x => x.ledger_id === l.id)) ops.push(Store.remove('budgets', b.id));
          ops.push(Store.remove('ledgers', l.id));
        }
        await Promise.all(ops); // 并行清理，避免串行多个来回（弱网下登录要等很久）
        changed = true;
      }
      // 同名同类型账本合并（历史迁移 bug 曾造成云端重复账本：保留最早的一个，
      // 把重复账本的分类/记录/预算/模板并过去后删除；分类同名则记录改挂后跳过）
      const dupKey = l => (l.name || '') + '|' + (l.type || 'personal');
      const keepMap = {};
      const dupLedgers = [];
      for (const l of ledgers) {
        if (keepMap[dupKey(l)]) dupLedgers.push(l);
        else keepMap[dupKey(l)] = l;
      }
      if (dupLedgers.length) {
        const movedCats = [], movedTpls = []; // 已改挂到保留账本的（内存数组不随 update 更新，靠它们防同批重复）
        for (const d of dupLedgers) {
          const keep = keepMap[dupKey(d)];
          const ops = []; // 同一账本的子数据并行改挂/删除，最后并行提交
          for (const c of categories.filter(x => x.ledger_id === d.id)) {
            const dupInKeep = categories.some(x => x.ledger_id === keep.id && x.name === c.name) || movedCats.some(x => x.name === c.name);
            if (dupInKeep) {
              ops.push(Store.remove('categories', c.id)); // 保留侧已有同名分类
            } else {
              ops.push(Store.update('categories', c.id, { ledger_id: keep.id }));
              movedCats.push(c);
            }
          }
          for (const r of records.filter(x => x.ledger_id === d.id)) ops.push(Store.update('records', r.id, { ledger_id: keep.id }));
          for (const b of budgets.filter(x => x.ledger_id === d.id)) ops.push(Store.update('budgets', b.id, { ledger_id: keep.id }));
          for (const t of templates.filter(x => x.ledger_id === d.id)) {
            const sameTpl = x => x.category === t.category && (x.sub || '') === (t.sub || '');
            const dupInKeep = templates.some(x => x.ledger_id === keep.id && sameTpl(x)) || movedTpls.some(sameTpl);
            if (dupInKeep) {
              ops.push(Store.remove('templates', t.id)); // 保留侧已有同模板（category+sub 相同）
            } else {
              ops.push(Store.update('templates', t.id, { ledger_id: keep.id }));
              movedTpls.push(t);
            }
          }
          ops.push(Store.remove('ledgers', d.id));
          await Promise.all(ops);
        }
        changed = true;
      }
      // 快捷模板去重：同一账本下 category+sub 只保留一条（历史迁移/账本合并曾造成重复，
      // 表现为设置页「快捷模板」一长条重复 n 个）；优先保留元数据完整的一条，其余删除
      {
        const tplKeep = {};
        const dupTpls = [];
        for (const t of templates) {
          const k = (t.ledger_id || '') + '|' + (t.category || '') + '|' + (t.sub || '');
          const kept = tplKeep[k];
          if (!kept) { tplKeep[k] = t; continue; }
          const full = x => x.label && x.section && x.emoji;
          if (full(t) && !full(kept)) { dupTpls.push(kept); tplKeep[k] = t; }
          else dupTpls.push(t);
        }
        if (dupTpls.length) {
          const dead = new Set(dupTpls.map(t => t.id));
          // 并行删除 + 同步裁剪内存数组：n 条重复只花一个来回，且不再触发整体重载
          //（串行删除时弱网下登录光等删除就要几十秒——用户实测「加载那么慢」的直接原因）
          await Promise.all(dupTpls.map(t => Store.remove('templates', t.id)));
          templates.splice(0, templates.length, ...templates.filter(t => !dead.has(t.id)));
        }
      }
      if (!categories.length) {
        const ls = await Store.list('ledgers');
        for (const l of ls) {
          const defs = DEFAULT_CATEGORIES[l.type] || [];
          for (const c of defs) await Store.insert('categories', { ledger_id: l.id, name: c.name, kind: c.kind, subs: c.subs });
        }
        changed = true;
      } else {
        // 老用户补「出租屋」大类
        const personal = (await Store.list('ledgers')).find(l => l.type === 'personal') || ledgers[0];
        if (personal && !categories.some(c => c.ledger_id === personal.id && c.name === RENTAL_CAT)) {
          const def = (DEFAULT_CATEGORIES.personal || []).find(c => c.name === RENTAL_CAT);
          if (def) { await Store.insert('categories', { ledger_id: personal.id, name: def.name, kind: def.kind, subs: def.subs }); changed = true; }
        }
      }
      if (!templates.length) {
        const ls = await Store.list('ledgers');
        for (const t of DEFAULT_TEMPLATES) {
          const l = ls.find(x => x.type === t.ledger);
          if (l) await Store.insert('templates', { ledger_id: l.id, category: t.category, sub: t.sub, label: t.label, section: t.section, emoji: t.emoji });
        }
        changed = true;
      }
      // 老模板补 label/section/emoji（此前缺列被剥离入库的模板，按 category+sub 回填默认值；每会话只试一次防递归）
      if (!this._tplMetaMigrated && templates.length && templates.some(t => !t.label || !t.section || !t.emoji)) {
        this._tplMetaMigrated = true;
        let fixed = 0;
        for (const t of templates) {
          const def = DEFAULT_TEMPLATES.find(d => d.category === t.category && d.sub === t.sub);
          if (!def || (t.label && t.section && t.emoji)) continue;
          if (await Store.update('templates', t.id, { label: def.label, section: def.section, emoji: def.emoji })) fixed++;
        }
        if (fixed) changed = true;
      }
      if (changed) return this.loadData(silent);

      // 好物仓库多标签迁移：老数据无 tags 字段，按分类名匹配补默认标签（每次会话最多尝试一次，防止缺列时无限递归）
      const needTags = !this._wishTagsMigrated && records.filter(r => r.favorite && r.tags == null);
      if (needTags.length) {
        this._wishTagsMigrated = true;
        for (const r of needTags) await Store.update('records', r.id, { tags: legacyGoodsTags(r) });
        changed = true;
      }
      if (changed) return this.loadData(silent);

      this.state.ledgers = ledgers;
      this.state.categories = categories;
      this.state.records = records;
      this.state.budgets = budgets;
      this.state.templates = templates;
      this._cacheSnapshot();
      if (!this.state.currentLedgerId || !ledgers.find(l => l.id === this.state.currentLedgerId)) {
        const personal = ledgers.filter(l => l.type === 'personal');
        // 优先选挂着分类的个人账本（历史重复账本遗留时，避免选到空账本导致「大类小类无选项」）
        const withCats = personal.find(l => categories.some(c => c.ledger_id === l.id));
        this.state.currentLedgerId = (withCats || personal[0] || ledgers[0] || {}).id || null;
      }
      this.renderChrome();
      if (!silent) this.renderView();
      else if (!document.querySelector('.modal-mask')) this.renderView();
    } catch (e) {
      this.toast(e.message || '数据加载失败', 'err');
    } finally {
      this.state.loading = false;
    }
  },

  /* ---------- 本地快照缓存（离线优先秒开） ---------- */
  _cacheKey() {
    try { return 'fin_cache_' + (Store.user ? (Store.user.email || '') : ''); } catch (e) { return ''; }
  },
  _clearCache() {
    try { const k = this._cacheKey(); if (k) localStorage.removeItem(k); } catch (e) {}
  },
  _cacheSnapshot() {
    try {
      const key = this._cacheKey();
      if (!key || Store.mode !== 'supabase' || !Store.user) return;
      const snap = {
        ts: Date.now(),
        ledgers: this.state.ledgers, categories: this.state.categories,
        records: this.state.records, budgets: this.state.budgets, templates: this.state.templates,
        currentLedgerId: this.state.currentLedgerId
      };
      localStorage.setItem(key, JSON.stringify(snap));
    } catch (e) { /* 隐私模式/容量超限忽略 */ }
  },
  // 用上次成功的快照即时渲染，避免每次刷新都等云端往返；返回是否命中缓存
  paintFromCache() {
    try {
      const key = this._cacheKey();
      if (!key) return false;
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.records)) return false;
      this.state.ledgers = s.ledgers || [];
      this.state.categories = s.categories || [];
      this.state.records = s.records || [];
      this.state.budgets = s.budgets || [];
      this.state.templates = s.templates || [];
      const valid = s.currentLedgerId && this.state.ledgers.some(l => l.id === s.currentLedgerId);
      this.state.currentLedgerId = valid ? s.currentLedgerId : (this.state.ledgers[0] && this.state.ledgers[0].id) || null;
      this.renderChrome();
      this.renderView();
      return true;
    } catch (e) { return false; }
  },

  onDataChange() {
    if (!Store.user) return;
    // 有弹窗或正在输入时仅静默刷新数据，避免打断
    const ae = document.activeElement;
    const typing = ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName);
    this.loadData(true);
    if (!typing && !document.querySelector('.modal-mask')) this.renderView();
  },

  /* ---------- 路由 ---------- */
  route() {
    const r = (location.hash || '#/ledger').replace('#/', '') || 'ledger';
    const names = { ledger: '记账本', wishlist: '好物仓库', stats: '统计', rental: '出租屋', budget: '预算设置', settings: '设置' };
    this.state.route = names[r] ? r : 'ledger';
    document.getElementById('page-title').textContent = names[this.state.route];
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.route === this.state.route);
    });
    this.renderChrome();
    this.renderView();
    this.renderSearchUI();
    window.scrollTo({ top: 0 });
  },

  renderChrome() {
    this.renderSyncChip();
    // 账本切换
    const sw = document.getElementById('ledger-switch');
    sw.innerHTML = this.state.ledgers.map(l =>
      '<button data-lid="' + l.id + '" class="' + (l.id === this.state.currentLedgerId ? 'active' : '') + '">' + esc(l.name) + '</button>'
    ).join('');
    sw.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        this.state.currentLedgerId = b.dataset.lid;
        this.renderChrome();
        this.renderView();
      };
    });
    // 用户信息
    const uc = document.getElementById('user-chip');
    const email = Store.user ? Store.user.email : '';
    uc.innerHTML = '<div class="avatar">' + esc(email.slice(0, 1).toUpperCase()) + '</div><span class="mail">' + esc(email) + '</span>';
    uc.title = '点击退出登录';
    uc.style.cursor = 'pointer';
    uc.onclick = () => this.confirmDialog('退出登录', '确定要退出当前账号吗？').then(ok => { if (ok) { this._clearCache(); Store.signOut(); } });
    // 侧栏底部
    document.getElementById('sidebar-foot').innerHTML =
      (Store.mode === 'supabase' ? '☁ 云端模式 · 实时同步' : '📦 本地模式') + '<br>' + esc(email);
  },

  renderView() {
    const map = {
      ledger: () => this.renderLedger(),
      wishlist: () => this.renderWishlist(),
      stats: () => this.renderStats(),
      rental: () => this.renderRental(),
      budget: () => this.renderBudget(),
      settings: () => this.renderSettings()
    };
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + this.state.route);
    view.classList.add('active');
    (map[this.state.route] || (() => {})).call(this);
  },

  /* ---------- 通用查询助手 ---------- */
  curLedger() { return this.state.ledgers.find(l => l.id === this.state.currentLedgerId) || null; },
  catsOf(ledgerId) { return this.state.categories.filter(c => c.ledger_id === ledgerId); },
  catByName(ledgerId, name) { return this.catsOf(ledgerId).find(c => c.name === name) || null; },
  kindOf(ledgerId, catName) {
    const c = this.catByName(ledgerId, catName);
    return c ? c.kind : 'expense';
  },
  recsOf(ledgerId) { return this.state.records.filter(r => r.ledger_id === ledgerId); },
  budgetOf(ledgerId, category, sub) {
    return this.state.budgets.find(b => b.ledger_id === ledgerId && b.category === category && b.sub === sub) || null;
  },
  monthUsed(ledgerId, category, sub, month) {
    return this.recsOf(ledgerId)
      .filter(r => monthOf(r.date) === month && r.category === category && r.sub === sub)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  },

  /* ---------- 月度汇总卡片 ---------- */
  monthSummary(ledgerId, month) {
    const recs = this.recsOf(ledgerId).filter(r => monthOf(r.date) === month);
    let income = 0, expense = 0;
    recs.forEach(r => {
      const kind = r.kind || this.kindOf(ledgerId, r.category);
      if (kind === 'income') income += Number(r.amount) || 0; else expense += Number(r.amount) || 0;
    });
    return { income, expense, balance: income - expense, count: recs.length };
  },

  budgetAlerts(ledgerId, month) {
    const alerts = [];
    this.state.budgets.filter(b => b.ledger_id === ledgerId).forEach(b => {
      const used = this.monthUsed(ledgerId, b.category, b.sub, month);
      const limit = Number(b.amount) || 0;
      if (limit <= 0) return;
      const pct = used / limit;
      if (pct > 1) alerts.push({ ...b, used, limit, pct, level: 'over' });
      else if (pct >= 0.7) alerts.push({ ...b, used, limit, pct, level: 'warn' });
    });
    return alerts.sort((a, b2) => b2.pct - a.pct);
  },

  /* ---------- 记账表单（记账本 / 出租屋共用） ---------- */
  entryFormHTML(ledgerId) {
    const cats = this.catsOf(ledgerId);
    const cat0 = cats[0] ? cats[0].name : '';
    const cat0subs = (this.catByName(ledgerId, cat0) || { subs: [] }).subs || [];
    const l = this.curLedger();
    return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">记一笔</div>
          <div class="card-sub">当前账本：${esc(l ? l.name : '')}</div>
        </div>
        <span class="badge badge-purple">${esc(l ? l.name : '')}</span>
      </div>
      <div class="entry-grid">
        <div class="field f-cat">
          <label>大类</label>
          <select id="en-cat">${cats.map(c => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('')}</select>
        </div>
        <div class="field f-sub">
          <label>小类</label>
          <select id="en-sub">${cat0subs.map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('')}</select>
        </div>
        <div class="field f-amt">
          <label>金额（元）</label>
          <input id="en-amt" type="number" min="0" step="0.01" placeholder="0.00">
        </div>
        <div class="field f-date">
          <label>日期</label>
          <input id="en-date" class="cal-input" readonly placeholder="选择日期" value="${todayStr()}" data-date="${todayStr()}">
        </div>
        <div class="field f-note">
          <label>备注</label>
          <input id="en-note" type="text" placeholder="选填，如：和光酱的午餐">
        </div>
        <div class="f-fav">
          <label class="fav-check">
            <input type="checkbox" id="en-fav"><span class="fav-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
            </span>心仪物品
          </label>
        </div>
        <div class="f-tags" id="en-tags-field" style="display:none">
          <label>好物标签（可多选）</label>
          <div class="tag-picker" id="en-tagpicker">${this.goodsTagPickerHTML()}</div>
        </div>
        <div class="f-star">
          <label>评分</label>
          <div class="stars" id="en-stars">
            ${[1, 2, 3, 4, 5].map(v => '<button type="button" data-v="' + v + '">★</button>').join('')}
            <button type="button" class="star-clear">清除</button>
          </div>
        </div>
        <div class="f-actions">
          <button class="btn btn-ghost" id="en-reset" type="button">清空</button>
          <button class="btn btn-primary" id="en-save" type="button">保存记账</button>
        </div>
      </div>
      <div class="tpl-row" id="en-tpls">
        <div class="tpl-label">一键记账模板</div>
        ${this.templatesHTML(ledgerId)}
      </div>
    </div>`;
  },

  templatesHTML(ledgerId) {
    const tpls = this.state.templates.filter(t => t.ledger_id === ledgerId);
    if (!tpls.length) return '<span style="font-size:12.5px;color:var(--muted)">暂无模板，可在「设置」中添加</span>';
    const order = ['日常支出板块', '爱好就是一切板块', '旅游外出板块', '其他模板'];
    const groups = {};
    tpls.forEach((t, i) => { const g = t.section || '其他模板'; (groups[g] = groups[g] || []).push({ t, i }); });
    const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return keys.map(g => `
      <div class="tpl-section">
        <div class="tpl-label">${esc(g)}</div>
        <div class="tpl-chips">
          ${groups[g].map(({ t, i }) => '<button type="button" class="chip accent" data-tpl="' + i + '">' + tplEmoji(t) + ' ' + esc(t.label || (t.category + ' · ' + t.sub)) + '</button>').join('')}
        </div>
      </div>`).join('');
  },

  bindEntryForm(root, ledgerId) {
    const $ = id => root.querySelector('#' + id);
    const cat = $('en-cat'), sub = $('en-sub');
    this.state.rating = 0;
    const paintStars = () => {
      root.querySelectorAll('#en-stars button[data-v]').forEach(b => {
        b.classList.toggle('on', Number(b.dataset.v) <= this.state.rating);
      });
    };
    paintStars();
    root.querySelectorAll('#en-stars button[data-v]').forEach(b => {
      b.onclick = () => {
        const v = Number(b.dataset.v);
        this.state.rating = (this.state.rating === v) ? 0 : v;
        paintStars();
      };
    });
    root.querySelector('.star-clear').onclick = () => { this.state.rating = 0; paintStars(); };

    cat.onchange = () => {
      const c = this.catByName(ledgerId, cat.value);
      sub.innerHTML = ((c && c.subs) || []).map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
    };

    const dateInp = $('en-date');
    dateInp.onclick = () => this.openCalendar(dateInp);

    this.bindFavTags($('en-fav'), $('en-tags-field'), '#en-tagpicker');

    root.querySelectorAll('[data-tpl]').forEach(btn => {
      btn.onclick = () => {
        const t = this.state.templates.filter(x => x.ledger_id === ledgerId)[Number(btn.dataset.tpl)];
        if (!t) return;
        cat.value = t.category;
        cat.onchange();
        sub.value = t.sub;
        this.enhanceSelects(root);
        $('en-amt').focus();
        this.toast('已带出：' + t.category + ' · ' + t.sub);
      };
    });

    const reset = () => {
      $('en-amt').value = ''; $('en-note').value = ''; $('en-fav').checked = false;
      this.state.rating = 0; paintStars();
      $('en-date').value = todayStr(); $('en-date').dataset.date = todayStr();
      document.querySelectorAll('#en-tagpicker input[type=checkbox]').forEach(i => { i.checked = false; });
      $('en-tags-field').style.display = 'none';
    };
    $('en-reset').onclick = reset;

    $('en-save').onclick = async () => {
      const amount = parseFloat($('en-amt').value);
      if (!amount || amount <= 0) return this.toast('请输入正确金额', 'err');
      const date = $('en-date').dataset.date || todayStr();
      const fav = $('en-fav').checked;
      try {
        await Store.insert('records', {
          ledger_id: ledgerId,
          category: cat.value,
          sub: sub.value,
          amount,
          note: $('en-note').value.trim(),
          favorite: fav,
          tags: fav ? this.pickedTags('#en-tagpicker') : [],
          rating: this.state.rating,
          date,
          image: null,
          kind: this.kindOf(ledgerId, cat.value)
        });
        this.toast('已记账 ' + fmtMoney(amount), 'ok');
        reset();
        await this.loadData();
      } catch (e) { this.toast(e.message, 'err'); }
    };
  },

  /* ---------- 记录列表 ---------- */
  recordsListHTML(ledgerId, month, onlyRental, scope) {
    const sc = scope || 'month';
    const curYear = String(new Date().getFullYear());
    const recs = this.recsOf(ledgerId)
      .filter(r => (onlyRental ? r.rental : true)
        && (sc === 'all' ? true
          : sc === 'year' ? String(r.date || '').slice(0, 4) === curYear
          : monthOf(r.date) === month))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1)));
    if (!recs.length) return '<div class="empty"><p>' + (onlyRental ? (sc === 'month' ? '本月还没有出租屋支出' : sc === 'year' ? '本年还没有出租屋支出' : '还没有出租屋支出') : '本月还没有记录，记一笔吧') + '</p></div>';
    const days = {};
    recs.forEach(r => { (days[r.date] = days[r.date] || []).push(r); });
    return Object.keys(days).sort().reverse().map(d => {
      const dayExp = days[d].reduce((s, r) => s + ((r.kind || this.kindOf(ledgerId, r.category)) === 'expense' ? Number(r.amount) || 0 : 0), 0);
      const dayInc = days[d].reduce((s, r) => s + ((r.kind || this.kindOf(ledgerId, r.category)) === 'income' ? Number(r.amount) || 0 : 0), 0);
      return `
      <div class="rec-day">
        <div class="rec-day-head"><span>${d.slice(5).replace('-', ' 月 ')} 日</span><span>${dayInc ? '收入 ' + fmtMoney(dayInc, { plain: true }) + ' · ' : ''}支出 ${fmtMoney(dayExp, { plain: true })}</span></div>
        ${days[d].map(r => this.recItemHTML(r, ledgerId, !!onlyRental)).join('')}
      </div>`;
    }).join('');
  },

  recItemHTML(r, ledgerId, hideRentalBadge) {
    const kind = r.kind || this.kindOf(ledgerId, r.category);
    const inc = kind === 'income';
    const rm = (r.category === RENTAL_CAT && RENTAL_META[r.sub]) ? RENTAL_META[r.sub] : null;
    return `
    <div class="rec-item${r.rental ? ' is-rental' : ''}" data-rid="${r.id}">
      <div class="rec-icon ${inc ? 'inc' : ''}"${rm ? ' style="background:' + rm.color + '1F;color:' + rm.color + '"' : ''}>${inc ? '收' : (rm ? rm.emoji : esc((r.category || '?').slice(0, 1)))}</div>
      <div class="rec-main">
        <div class="rec-title">${esc(r.category)}
          ${r.rating ? '<span class="rec-stars">' + '★'.repeat(Math.round(r.rating)) + '</span>' : ''}
          ${r.rental && !hideRentalBadge ? '<span class="badge badge-green" title="归入出租屋">🏠 出租屋</span>' : ''}
          ${r.favorite ? '<span class="badge badge-green">心仪</span>' : ''}</div>
        ${(r.sub || r.note) ? '<div class="rec-note">' + esc(r.sub || '') + (r.sub && r.note ? ' · ' : '') + esc(r.note || '') + '</div>' : ''}
      </div>
      <div class="rec-side">
        <div class="rec-amount ${inc ? 'income' : ''}">${inc ? '+' : '-'}${fmtMoney(r.amount)}</div>
      </div>
      <div class="rec-acts">
        <button data-act="edit" title="编辑">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button data-act="del" title="删除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  },

  bindRecordsList(root, ledgerId) {
    root.querySelectorAll('.rec-item').forEach(item => {
      const rid = item.dataset.rid;
      item.querySelector('[data-act="edit"]').onclick = () => this.editRecord(rid, ledgerId);
      item.querySelector('[data-act="del"]').onclick = async () => {
        const ok = await this.confirmDialog('删除记录', '删除后无法恢复，确定删除这条记录吗？');
        if (!ok) return;
        try { await Store.remove('records', rid); this.toast('已删除'); await this.loadData(); }
        catch (e) { this.toast(e.message, 'err'); }
      };
    });
  },

  monthSwitcherHTML(key, month) {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
    const f = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return `
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn btn-ghost btn-sm" data-nav="prev">‹ 上月</button>
      <b style="font-size:13.5px;min-width:76px;text-align:center">${y} 年 ${m} 月</b>
      <button class="btn btn-ghost btn-sm" data-nav="next">下月 ›</button>
      <input type="text" class="cal-input" readonly value="${month}" data-month="${month}" data-cal-mode="month" data-jump placeholder="跳转月份" style="width:112px;height:32px;border:1px solid var(--line);border-radius:9px;padding:0 8px;background:#fff;font-size:12.5px;color:var(--text)">
    </div>`;
  },

  bindMonthSwitcher(root, key, rerender) {
    const month = this.state[key];
    const [y, m] = month.split('-').map(Number);
    root.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => {
        // 上月=monthIndex-1，下月=monthIndex+1（new Date 的月份从 0 起，m-1 即本月）
        const d = new Date(y, m - 1 + (b.dataset.nav === 'next' ? 1 : -1), 1);
        this.state[key] = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        rerender();
      };
    });
    const jump = root.querySelector('[data-jump]');
    if (jump) {
      jump.onclick = () => this.openCalendar(jump, 'month');
      jump.onchange = () => { this.state[key] = jump.value; rerender(); };
    }
  },

  /* ---------- 视图：记账本 ---------- */
  renderLedger() {
    return this.renderLedgerHome();
  },

  /* ---------- 记账本主页（顶部快捷横排 + 日历/列表视图） ---------- */
  // 快捷按钮使用记录（localStorage，按设备）：最近使用的小类排最前
  quickMru() {
    try { return JSON.parse(localStorage.getItem('fin_quick_mru') || '[]'); } catch (_) { return []; }
  },
  touchQuickMru(cat, sub) {
    const key = (cat || '') + '||' + (sub || '');
    const arr = this.quickMru().filter(k => k !== key);
    arr.unshift(key);
    try { localStorage.setItem('fin_quick_mru', JSON.stringify(arr.slice(0, 32))); } catch (_) {}
  },
  renderLedgerHome() {
    const el = document.getElementById('view-ledger');
    const lid = this.state.currentLedgerId;
    const home = this.state.home;
    const searching = this.searchActive();
    const showList = searching || home.mode === 'list';
    // 搜索框在列表区、随视图重渲染，先记住焦点，渲染后恢复（防抖触发重渲染时不丢焦点）
    const searchFocused = document.activeElement && document.activeElement.id === 'search-input';
    const s = this.monthSummary(lid, thisMonth());

    // 快捷记账：日历上方横排一行，按钮直接取自本账本的「快捷模板」（设置页增删即时生效）；
    // 最近使用的排最前，其余保持模板顺序。该账本没有模板时整条隐藏。
    const mru = this.quickMru();
    const qTpls = this.state.templates.filter(t => t.ledger_id === lid).slice().sort((a, b) => {
      const ia = mru.indexOf(a.category + '||' + a.sub), ib = mru.indexOf(b.category + '||' + b.sub);
      return (ia >= 0 ? ia : 9999) - (ib >= 0 ? ib : 9999);
    });
    const quickHTML = qTpls.map(t => `
          <button class="qbtn" data-cat="${esc(t.category)}" data-sub="${esc(t.sub)}" title="${esc(t.category)} · ${esc(t.sub)}">
            <span class="qemoji">${tplEmoji(t)}</span>
            <span class="qlabel">${esc(tplShort(t))}</span>
          </button>`).join('');

    const listRecs = showList ? this.filteredRecs() : [];
    el.innerHTML = `
      <div class="home-summary">
        <div class="hs-item"><span>本月支出</span><b class="expense">${fmtMoney(s.expense)}</b></div>
        <div class="hs-item"><span>本月收入</span><b class="income">${fmtMoney(s.income)}</b></div>
        <div class="hs-item"><span>本月结余</span><b style="color:${s.balance >= 0 ? 'var(--purple)' : 'var(--danger)'}">${fmtMoney(s.balance)}</b></div>
      </div>
      ${qTpls.length ? `<div class="qwrap" id="qwrap">
        <button type="button" class="qnav qnav-l" id="qnav-l" aria-label="上一页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="qbar" id="qbar">${quickHTML}</div>
        <button type="button" class="qnav qnav-r" id="qnav-r" aria-label="下一页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
      </div>` : ''}
      <div class="home-view-bar">
        <div class="seg">
          <button data-lm="calendar" class="${showList ? '' : 'on'}">日历</button>
          <button data-lm="list" class="${showList ? 'on' : ''}">列表</button>
        </div>
        ${showList ? '<span class="hvb-count">共 ' + listRecs.length + ' 条' + (searching ? '（搜索结果）' : '') + '</span>' : ''}
      </div>
      <section class="cal-pane">
        <div class="pane-search-row">
          <div class="search-box" id="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
            <input id="search-input" type="text" placeholder="搜索账单（备注 / 大类 / 小类 / 金额 / 日期）" autocomplete="off" value="${esc(this.state.search.q)}">
            <button type="button" class="ts-clear" id="search-clear"${this.state.search.q ? '' : ' hidden'} title="清空">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
            <span class="ts-div"></span>
            <button type="button" class="ts-filter${this.hasFilters() ? ' on' : ''}" id="filter-btn" title="筛选（大类 / 账本 / 日期范围）">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
            </button>
          </div>
        </div>
        <div id="search-banner-slot">${this.searchBannerHTML()}</div>
        <div class="cal-pane-bar"${showList ? ' hidden' : ''}>
          <div class="seg">
            <button data-hv="week" class="${home.view === 'week' ? 'on' : ''}">周</button>
            <button data-hv="month" class="${home.view === 'month' ? 'on' : ''}">月</button>
            <button data-hv="year" class="${home.view === 'year' ? 'on' : ''}">年</button>
          </div>
          <div class="cal-pane-nav">
            <button class="btn btn-ghost btn-sm" data-hnav="-1">‹</button>
            <b id="hp-title" style="min-width:120px;text-align:center;font-size:15px"></b>
            <button class="btn btn-ghost btn-sm" data-hnav="1">›</button>
            <button class="btn btn-ghost btn-sm" data-htoday>今天</button>
          </div>
        </div>
        <div id="home-calendar"${showList ? ' hidden' : ''}></div>
        <div id="home-list"${showList ? '' : ' hidden'}></div>
      </section>`;

    // 快捷按钮 → 带出分类记账
    el.querySelectorAll('.qbtn').forEach(b => {
      b.onclick = () => this.addRecordModal(lid, todayStr(), b.dataset.cat, b.dataset.sub);
    });
    // 快捷条翻页：溢出时悬停/滑动出现模糊+左右箭头，点击滑动一页（PC 悬停、移动端滑动均可见）
    const qwrapEl = document.getElementById('qwrap');
    const qbarEl = document.getElementById('qbar');
    if (qwrapEl && qbarEl) {
      const qL = document.getElementById('qnav-l'), qR = document.getElementById('qnav-r');
      const qUpd = () => {
        const max = qbarEl.scrollWidth - qbarEl.clientWidth;
        // 两侧渐隐/箭头只在「该方向还有内容可滚」时出现；到边界的一侧必须隐藏
        const canL = qbarEl.scrollLeft > 2, canR = qbarEl.scrollLeft < max - 2;
        qwrapEl.classList.toggle('can-l', canL);
        qwrapEl.classList.toggle('can-r', canR);
        qL.classList.toggle('on', canL);
        qR.classList.toggle('on', canR);
      };
      qL.onclick = () => qbarEl.scrollBy({ left: -qbarEl.clientWidth, behavior: 'smooth' });
      qR.onclick = () => qbarEl.scrollBy({ left: qbarEl.clientWidth, behavior: 'smooth' });
      let qTimer = null;
      qbarEl.addEventListener('scroll', () => {
        qwrapEl.classList.add('qtouch');
        clearTimeout(qTimer);
        qTimer = setTimeout(() => { qUpd(); qwrapEl.classList.remove('qtouch'); }, 1200);
        qUpd();
      }, { passive: true });
      qUpd();
    }
    // 日历 / 列表视图切换（搜索中点任一视图 = 退出搜索并切到该视图）
    el.querySelectorAll('[data-lm]').forEach(b => {
      b.onclick = () => {
        const m = b.dataset.lm;
        if (this.searchActive()) {
          this.clearSearch();
          this.state.home.mode = m;
          this.renderLedgerHome();
          return;
        }
        home.mode = m; this.renderLedgerHome();
      };
    });
    // 周/月/年切换 / 翻页
    el.querySelectorAll('[data-hv]').forEach(b => {
      b.onclick = () => { home.view = b.dataset.hv; this.renderLedgerHome(); };
    });
    el.querySelectorAll('[data-hnav]').forEach(b => {
      b.onclick = () => { this.homeNav(Number(b.dataset.hnav)); this.renderLedgerHome(); };
    });
    el.querySelector('[data-htoday]').onclick = () => { home.anchor = todayStr(); this.renderLedgerHome(); };

    // 搜索横幅：筛选条件 chip 移除 / 一键清除
    this.bindSearchBanner(el);

    // 搜索框 / 筛选按钮（元素随视图重渲染，每次重新绑定）
    this.bindSearchBox();

    if (showList) this.renderRecTable(el.querySelector('#home-list'), listRecs, { kw: this.state.search.q });
    else this.renderHomeCalendar();
    this.enhanceSelects(el);

    // 恢复搜索框焦点与光标（意外重渲染不该打断输入）
    if (searchFocused) {
      const si = el.querySelector('#search-input');
      if (si) {
        si.focus();
        const n = si.value.length;
        try { si.setSelectionRange(n, n); } catch (e) { /* ignore */ }
      }
    }
  },

  /* 搜索横幅事件绑定（chip 移除 / 清除）；root 为视图或横幅 slot */
  bindSearchBanner(root) {
    if (!root) return;
    root.querySelectorAll('[data-rm]').forEach(b => {
      b.onclick = () => {
        const s = this.state.search, v = b.dataset.v;
        if (b.dataset.rm === 'cat') s.cats = s.cats.filter(x => x !== v);
        else if (b.dataset.rm === 'ledger') s.ledgers = s.ledgers.filter(x => x !== v);
        else { s.from = ''; s.to = ''; }
        this.state.list.page = 1;
        this.refreshResults();
      };
    });
    const sc = root.querySelector('[data-sbclear]');
    if (sc) sc.onclick = () => this.clearSearch();
  },

  /* ---------- 局部刷新记账本面板（搜索输入时用）----------
   * 只更新 视图切换条/横幅/日历与列表显隐，不重建搜索框等框架元素——
   * 重建会取消中文输入法（IME）的拼音组合，导致永远输不完中文 */
  refreshLedgerPane() {
    if (this.state.route !== 'ledger') return;
    const el = document.getElementById('view-ledger');
    if (!el) return;
    const searching = this.searchActive();
    const showList = searching || this.state.home.mode === 'list';

    // 视图切换条：高亮 + 计数
    const bar = el.querySelector('.home-view-bar');
    if (bar) {
      bar.querySelectorAll('[data-lm]').forEach(b => b.classList.toggle('on', (b.dataset.lm === 'list') === showList));
      let cnt = bar.querySelector('.hvb-count');
      if (showList) {
        const n = this.filteredRecs().length;
        if (!cnt) { cnt = document.createElement('span'); cnt.className = 'hvb-count'; bar.appendChild(cnt); }
        cnt.textContent = '共 ' + n + ' 条' + (searching ? '（搜索结果）' : '');
      } else if (cnt) cnt.remove();
    }

    // 搜索横幅
    const slot = el.querySelector('#search-banner-slot');
    if (slot) {
      slot.innerHTML = this.searchBannerHTML();
      this.bindSearchBanner(slot);
    }

    // 日历 / 列表显隐与内容
    const calBar = el.querySelector('.cal-pane-bar');
    const cal = el.querySelector('#home-calendar');
    const list = el.querySelector('#home-list');
    if (calBar) calBar.hidden = showList;
    if (cal) cal.hidden = showList;
    if (list) list.hidden = !showList;
    if (showList) this.renderRecTable(list, this.filteredRecs(), { kw: this.state.search.q });
    else this.renderHomeCalendar();

    this.renderSearchUI();
  },

  /* ---------- 搜索 / 筛选 ---------- */
  searchActive() {
    const s = this.state.search;
    return !!(s.q || s.cats.length || s.ledgers.length || s.from || s.to);
  },
  hasFilters() {
    const s = this.state.search;
    return !!(s.cats.length || s.ledgers.length || s.from || s.to);
  },
  /* 关键词命中：大类 / 小类 / 备注 / 金额 / 日期（日期支持 2025-12-15、12-15、12/15、20251215、12月15日） */
  matchQuery(r, kw) {
    if (!kw) return true;
    const k = String(kw).toLowerCase();
    const amt = Number(r.amount) || 0;
    const fields = [
      r.category, r.sub, r.note, r.date,
      r.date.slice(5), r.date.slice(5).replace('-', '/'), r.date.replace(/-/g, ''),
      r.date.slice(0, 4) + '年' + r.date.slice(5, 7) + '月' + r.date.slice(8, 10) + '日',
      String(amt), String(Math.abs(amt)), amt.toFixed(2), Math.abs(amt).toFixed(2), fmtMoney(amt)
    ];
    return fields.some(f => f != null && String(f).toLowerCase().indexOf(k) >= 0);
  },
  /* 全量筛选 + 排序（搜索与账单列表共用） */
  filteredRecs() {
    const st = this.state;
    const recs = st.records.filter(r => {
      if (!this.matchQuery(r, st.search.q)) return false;
      if (st.search.cats.length && st.search.cats.indexOf(r.category) < 0) return false;
      if (st.search.ledgers.length && st.search.ledgers.indexOf(r.ledger_id) < 0) return false;
      if (st.search.from && r.date < st.search.from) return false;
      if (st.search.to && r.date > st.search.to) return false;
      return true;
    });
    const dir = st.list.sortDir === 'asc' ? 1 : -1;
    recs.sort((a, b) => {
      let c = 0;
      if (st.list.sortKey === 'amount') c = (Number(a.amount) || 0) - (Number(b.amount) || 0);
      else if (st.list.sortKey === 'category') c = String(a.category || '').localeCompare(String(b.category || ''), 'zh-Hans-CN');
      else c = a.date < b.date ? -1 : a.date > b.date ? 1 : (String(a.created_at || '') < String(b.created_at || '') ? -1 : 1);
      return c * dir;
    });
    return recs;
  },
  searchBannerHTML() {
    const s = this.state.search;
    if (!this.searchActive()) return '';
    const n = this.filteredRecs().length;
    const chips = [];
    if (s.q) chips.push('<span class="sf-chip">「' + esc(s.q) + '」</span>');
    s.cats.forEach(c => chips.push('<span class="sf-chip">大类：' + esc(c) + '<button type="button" data-rm="cat" data-v="' + esc(c) + '" title="移除该筛选">✕</button></span>'));
    s.ledgers.forEach(id => {
      const l = this.state.ledgers.find(x => x.id === id);
      chips.push('<span class="sf-chip">账本：' + esc(l ? l.name : '') + '<button type="button" data-rm="ledger" data-v="' + id + '" title="移除该筛选">✕</button></span>');
    });
    if (s.from || s.to) chips.push('<span class="sf-chip">' + (s.from || '最早') + ' 至 ' + (s.to || '最近') + '<button type="button" data-rm="date" title="移除该筛选">✕</button></span>');
    return '<div class="search-banner">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>'
      + '<span class="sb-count">命中 <b>' + n + '</b> 条</span>'
      + '<div class="sb-chips">' + chips.join('') + '</div>'
      + '<button type="button" class="sb-clear" data-sbclear>清除</button>'
      + '</div>';
  },

  /* ---------- 账单列表（表格：表头排序 + 每页 50 条 + 关键词高亮） ---------- */
  renderRecTable(host, recs, opts) {
    if (!host) return;
    const kw = (opts && opts.kw) || '';
    const st = this.state.list;
    const total = recs.length;
    const shown = Math.min(total, st.page * LIST_PAGE_SIZE);
    const multiLedger = this.state.ledgers.length > 1;
    const colspan = multiLedger ? 6 : 5;
    const arrow = k => '<span class="sort-arrow' + (st.sortKey === k ? ' on' : '') + '">' + (st.sortKey === k ? (st.sortDir === 'asc' ? '▲' : '▼') : '⇅') + '</span>';
    host.innerHTML = `
      <div class="rt-scroll">
        <table class="rec-table">
          <thead><tr>
            <th data-sort="date" class="c-date">日期${arrow('date')}</th>
            <th data-sort="category">大类${arrow('category')}</th>
            <th>小类</th>
            <th data-sort="amount" class="c-amt">金额${arrow('amount')}</th>
            <th class="c-note">备注</th>
            ${multiLedger ? '<th>账本</th>' : ''}
          </tr></thead>
          <tbody>
            ${recs.slice(0, shown).map(r => {
      const inc = (r.kind || this.kindOf(r.ledger_id, r.category)) === 'income';
      const amt = Number(r.amount) || 0;
      const sign = amt < 0 ? '-' : (inc ? '+' : '-');
      const lg = this.state.ledgers.find(l => l.id === r.ledger_id);
      return '<tr data-rid="' + r.id + '" data-lid="' + r.ledger_id + '">'
        + '<td class="c-date">' + hlKw(r.date, kw) + '</td>'
        + '<td><span class="rt-cat">' + catEmoji(r.category) + ' ' + hlKw(r.category, kw) + '</span></td>'
        + '<td class="c-sub">' + (r.sub ? hlKw(r.sub, kw) : '<span class="rt-dim">—</span>') + '</td>'
        + '<td class="c-amt' + (inc ? ' income' : '') + '">' + sign + hlKw(fmtMoney(Math.abs(amt)), kw) + '</td>'
        + '<td class="c-note" title="' + esc(r.note || '') + '">' + (r.note ? hlKw(r.note, kw) : '<span class="rt-dim">—</span>') + '</td>'
        + (multiLedger ? '<td class="c-ledger">' + esc(lg ? lg.name : '') + '</td>' : '')
        + '</tr>';
    }).join('') || '<tr><td colspan="' + colspan + '" class="rt-empty">' + (this.searchActive() ? '没有匹配的账单，换个关键词或放宽筛选试试' : '还没有账单记录，记一笔吧') + '</td></tr>'}
          </tbody>
        </table>
      </div>
      ${total > shown
        ? '<div class="rt-foot"><button class="btn btn-ghost" data-more>加载更多（还有 ' + (total - shown) + ' 条）</button></div>'
        : '<div class="rt-foot rt-count">共 ' + total + ' 条' + (total > LIST_PAGE_SIZE ? ' · 已全部加载' : '') + '</div>'}`;

    // 表头点击排序（再点反向）
    host.querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const k = th.dataset.sort;
        if (st.sortKey === k) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
        else { st.sortKey = k; st.sortDir = 'desc'; }
        st.page = 1;
        this.renderRecTable(host, this.filteredRecs(), { kw: this.state.search.q });
        const cnt = document.querySelector('#view-ledger .hvb-count');
        if (cnt) cnt.textContent = '共 ' + this.filteredRecs().length + ' 条' + (this.searchActive() ? '（搜索结果）' : '');
      };
    });
    // 行点击 → 编辑弹窗
    host.querySelectorAll('tbody tr[data-rid]').forEach(tr => {
      tr.onclick = () => this.editRecord(tr.dataset.rid, tr.dataset.lid);
    });
    // 加载更多
    const more = host.querySelector('[data-more]');
    if (more) more.onclick = () => { st.page++; this.renderRecTable(host, this.filteredRecs(), { kw: this.state.search.q }); };
  },

  /* ---------- 顶部搜索框 / 筛选浮层 ---------- */
  /* 「/」快捷聚焦搜索框（document 级只绑一次；非记账本页先跳过去） */
  bindSearchShortcut() {
    if (this._searchCutBound) return;
    this._searchCutBound = true;
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const ae = document.activeElement;
      if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
      if (document.getElementById('app-view').hidden) return;
      e.preventDefault();
      const focusIt = () => { const si = document.getElementById('search-input'); if (si) si.focus(); };
      if (this.state.route !== 'ledger') { location.hash = '#/ledger'; setTimeout(focusIt, 80); }
      else focusIt();
    });
  },
  /* 搜索框 / 清空 / 筛选按钮：元素在列表区内、随 renderLedgerHome 重建，每次渲染后重新绑定 */
  bindSearchBox() {
    const $ = id => document.getElementById(id);
    const inp = $('search-input');
    if (!inp) return;
    let timer = null;
    let composing = false; // 中文输入法拼音组合中：不搜索、不重渲染（否则组合被取消，永远输不完中文）
    const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(() => this.applySearch(inp.value), ms); };
    inp.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
    inp.addEventListener('compositionend', () => { composing = false; schedule(140); }); // 选词落字后才搜索
    inp.addEventListener('input', e => {
      if (composing || (e && e.isComposing)) return; // 拼音字母逐个落入框里，忽略
      schedule(140);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); this.applySearch(inp.value); }
      if (e.key === 'Escape') { clearTimeout(timer); inp.value = ''; this.applySearch(''); inp.blur(); }
    });
    const clr = $('search-clear');
    if (clr) clr.onclick = () => { inp.value = ''; this.applySearch(''); inp.focus(); };
    const fb = $('filter-btn');
    if (fb) fb.onclick = e => { e.stopPropagation(); this.toggleFilterPop(); };
    this.renderSearchUI();
  },
  applySearch(q) {
    const v = (q || '').trim();
    const wasActive = this.searchActive();
    const changed = v !== this.state.search.q;
    this.state.search.q = v;
    this.state.list.page = 1;
    const nowActive = this.searchActive();
    if (nowActive && !wasActive) this._modeBeforeSearch = this.state.home.mode; // 记住进入搜索前的视图
    if (!nowActive && wasActive && this._modeBeforeSearch) this.state.home.mode = this._modeBeforeSearch;
    if (nowActive && this.state.route !== 'ledger') {
      this.state.home.mode = 'list';
      location.hash = '#/ledger'; // hashchange → route() → 列表结果
      this.renderSearchUI();
      return;
    }
    if (changed || nowActive) this.refreshLedgerPane(); // 局部刷新：不重建搜索框（IME 组合不被打断）
    this.renderSearchUI();
  },
  clearSearch() {
    const s = this.state.search;
    s.q = ''; s.cats = []; s.ledgers = []; s.from = ''; s.to = '';
    this.state.list.page = 1;
    if (this._modeBeforeSearch) { this.state.home.mode = this._modeBeforeSearch; this._modeBeforeSearch = null; }
    const inp = document.getElementById('search-input');
    if (inp) inp.value = '';
    this.closeFilterPop();
    this.renderSearchUI();
    if (this.state.route === 'ledger') this.refreshLedgerPane();
  },
  refreshResults() {
    if (this.searchActive()) {
      if (this.state.route !== 'ledger') { this.state.home.mode = 'list'; location.hash = '#/ledger'; }
      else this.refreshLedgerPane();
    } else if (this.state.route === 'ledger') {
      this.refreshLedgerPane();
    }
    this.renderSearchUI();
    const cnt = document.getElementById('fp-count');
    if (cnt) cnt.textContent = '命中 ' + this.filteredRecs().length + ' 条';
  },
  renderSearchUI() {
    const clr = document.getElementById('search-clear');
    if (clr) clr.hidden = !this.state.search.q;
    const fb = document.getElementById('filter-btn');
    if (fb) fb.classList.toggle('on', this.hasFilters());
  },
  toggleFilterPop() {
    if (document.getElementById('filter-pop')) this.closeFilterPop();
    else this.openFilterPop();
  },
  openFilterPop() {
    this.closeFilterPop();
    const s = this.state.search;
    const catNames = [];
    this.state.categories.forEach(c => { if (c.name && catNames.indexOf(c.name) < 0) catNames.push(c.name); });
    const pop = document.createElement('div');
    pop.className = 'filter-pop';
    pop.id = 'filter-pop';
    pop.innerHTML = `
      <div class="fp-sec">
        <div class="fp-title">账本</div>
        <div class="fp-opts">${this.state.ledgers.map(l =>
      '<label class="fp-opt"><input type="checkbox" data-f="ledger" value="' + l.id + '"' + (s.ledgers.indexOf(l.id) >= 0 ? ' checked' : '') + '><span>' + esc(l.name) + '</span></label>').join('') || '<div class="fp-empty">暂无账本</div>'}</div>
      </div>
      <div class="fp-sec">
        <div class="fp-title">大类</div>
        <div class="fp-cats">${catNames.map(c =>
      '<label class="fp-opt"><input type="checkbox" data-f="cat" value="' + esc(c) + '"' + (s.cats.indexOf(c) >= 0 ? ' checked' : '') + '><span>' + esc(c) + '</span></label>').join('')}</div>
      </div>
      <div class="fp-sec">
        <div class="fp-title">日期范围</div>
        <div class="fp-dates">
          <input type="text" class="cal-input" readonly placeholder="开始日期" data-f="from" data-cal-mode="day" value="${esc(s.from)}">
          <span>至</span>
          <input type="text" class="cal-input" readonly placeholder="结束日期" data-f="to" data-cal-mode="day" value="${esc(s.to)}">
        </div>
      </div>
      <div class="fp-foot">
        <button type="button" class="btn btn-ghost btn-sm" data-freset>重置</button>
        <span class="fp-count" id="fp-count"></span>
      </div>`;
    document.body.appendChild(pop);
    // 定位到筛选按钮下方居中
    const btn = document.getElementById('filter-btn');
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8)) + 'px';
    pop.style.top = (r.bottom + 8) + 'px';
    // 勾选/改期即时生效
    pop.addEventListener('change', e => {
      const t = e.target, f = t.dataset.f;
      if (f === 'ledger') s.ledgers = Array.from(pop.querySelectorAll('[data-f="ledger"]:checked')).map(i => i.value);
      else if (f === 'cat') s.cats = Array.from(pop.querySelectorAll('[data-f="cat"]:checked')).map(i => i.value);
      else if (f === 'from' || f === 'to') s[f] = t.value;
      else return;
      this.state.list.page = 1;
      this.refreshResults();
    });
    pop.querySelector('[data-freset]').onclick = () => {
      s.cats = []; s.ledgers = []; s.from = ''; s.to = '';
      this.state.list.page = 1;
      this.closeFilterPop();
      this.refreshResults();
    };
    const cnt = document.getElementById('fp-count');
    if (cnt) cnt.textContent = '命中 ' + this.filteredRecs().length + ' 条';
    this._fpOut = e => {
      if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) this.closeFilterPop();
    };
    this._fpKey = e => { if (e.key === 'Escape') this.closeFilterPop(); };
    setTimeout(() => {
      document.addEventListener('mousedown', this._fpOut, true);
      document.addEventListener('keydown', this._fpKey, true);
    }, 0);
  },
  closeFilterPop() {
    const p = document.getElementById('filter-pop');
    if (p) p.remove();
    if (this._fpOut) { document.removeEventListener('mousedown', this._fpOut, true); this._fpOut = null; }
    if (this._fpKey) { document.removeEventListener('keydown', this._fpKey, true); this._fpKey = null; }
  },

  homeNav(step) {
    const home = this.state.home;
    if (home.view === 'week') {
      const d = new Date(home.anchor + 'T00:00:00');
      d.setDate(d.getDate() + step * 7);
      home.anchor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } else if (home.view === 'month') {
      const [y, m] = home.anchor.split('-').map(Number);
      const d = new Date(y, m - 1 + step, 1);
      home.anchor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    } else {
      const y = Number(home.anchor.slice(0, 4)) + step;
      home.anchor = y + '-01-01';
    }
  },

  weekDays(anchor) {
    const d = new Date(anchor + 'T00:00:00');
    const dow = (d.getDay() + 6) % 7; // 周一=0
    const out = [];
    for (let i = 0; i < 7; i++) {
      const x = new Date(d);
      x.setDate(d.getDate() - dow + i);
      out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'));
    }
    return out;
  },

  renderHomeCalendar() {
    const el = document.getElementById('view-ledger');
    const lid = this.state.currentLedgerId;
    const home = this.state.home;
    const host = el.querySelector('#home-calendar');
    const kindOfR = r => r.kind || this.kindOf(lid, r.category);
    const titleEl = el.querySelector('#hp-title');

    if (home.view === 'week') {
      const days = this.weekDays(home.anchor);
      const [y0, m0] = days[0].split('-').map(Number);
      const [y1, m1, d1] = days[6].split('-').map(Number);
      titleEl.textContent = (y0 === y1 ? '' : y0 + ' 年 ') + m0 + ' 月 ' + days[0].slice(8) + ' 日 - ' + m1 + ' 月 ' + d1 + ' 日';
      const recsByDate = {};
      this.recsOf(lid).forEach(r => { (recsByDate[r.date] = recsByDate[r.date] || []).push(r); });
      const wd = '一二三四五六日';
      host.innerHTML = '<div class="wk-grid">' + days.map(d => {
        const recs = recsByDate[d] || [];
        const tdy = d === todayStr();
        return `
        <div class="wk-col${tdy ? ' today' : ''}" data-date="${d}">
          <div class="wk-col-head">
            <span class="wk-head-mid"><span class="wk-wd">周${wd[(new Date(d + 'T00:00:00').getDay() + 6) % 7]}</span><span class="wk-date">${d.slice(5).replace('-', '/')}</span></span>
            <button type="button" class="wk-plus" data-add="${d}" title="记一笔">+</button>
          </div>
          <div class="wk-body">
            ${recs.length ? recs.map(r => {
              const inc = kindOfR(r) === 'income';
              return `<div class="wk-rec${inc ? ' income' : ''}" data-rid="${r.id}" title="${esc(r.category)}${r.sub ? ' · ' + esc(r.sub) : ''}｜${fmtMoney(r.amount)}${r.note ? '｜' + esc(r.note) : ''}">
                <div class="wk-rec-cat">${catEmoji(r.category)} ${esc(r.category)}</div>
                ${r.sub ? `<div class="wk-rec-sub">${subEmoji(r.sub)} ${esc(r.sub)}</div>` : ''}
                ${r.note ? `<div class="wk-rec-note">${esc(r.note)}</div>` : ''}
                <div class="wk-rec-amt">${inc ? '+' : ''}${fmtMoney(r.amount)}</div>
              </div>`;
            }).join('') : '<div class="wk-empty">无记录</div>'}
          </div>
        </div>`;
      }).join('') + '</div>';
      // 移动端周视图横向滚动：本周自动定位到今日（居中），非本周停周一
      const grid = host.querySelector('.wk-grid');
      if (grid) {
        const todayCol = grid.querySelector('.wk-col.today');
        if (todayCol) {
          const left = (todayCol.offsetLeft - grid.offsetLeft) - (grid.clientWidth - todayCol.offsetWidth) / 2;
          grid.scrollLeft = Math.max(0, left);
        } else {
          grid.scrollLeft = 0;
        }
      }
    } else if (home.view === 'month') {
      const [y, m] = home.anchor.split('-').map(Number);
      titleEl.textContent = y + ' 年 ' + m + ' 月';
      const dim = new Date(y, m, 0).getDate();
      const startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 周一起始
      const prevDim = new Date(y, m - 1, 0).getDate();
      const mk = (yy, mm, dd) => {
        const dt = new Date(yy, mm - 1, dd);
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      };
      const recsByDate = {};
      this.recsOf(lid).forEach(r => { (recsByDate[r.date] = recsByDate[r.date] || []).push(r); });
      const mkCell = (dd, key, out) => {
        const recs = out ? [] : (recsByDate[key] || []);
        const tdy = key === todayStr();
        const sel = !out && key === home.sel;
        return `
        <div class="m2cell${out ? ' out' : ''}${tdy ? ' today' : ''}${sel ? ' sel' : ''}" data-date="${key}">
          <div class="m2-top">
            <span class="m2-num">${dd}</span>
            ${recs.length ? '<span class="m2-badge">' + recs.length + '</span>' : ''}
            ${out ? '' : '<button type="button" class="m2-plus" data-add="' + key + '" title="记一笔">+</button>'}
          </div>
          <div class="m2-body">
            ${recs.slice(0, 2).map(r => {
              const inc = kindOfR(r) === 'income';
              return '<div class="m2-rec' + (inc ? ' income' : '') + '" data-rid="' + r.id + '" title="' + esc(r.category) + '｜' + fmtMoney(r.amount) + (r.note ? '｜' + esc(r.note) : '') + '">' +
                '<div class="m2-rec-cat">' + catEmoji(r.category) + ' ' + esc(r.category) + '</div>' +
                (r.sub ? '<div class="m2-rec-sub">' + subEmoji(r.sub) + ' ' + esc(r.sub) + '</div>' : '') +
                (r.note ? '<div class="m2-rec-note">' + esc(r.note) + '</div>' : '') +
                '<div class="m2-rec-amt">' + (inc ? '+' : '') + fmtMoney(r.amount) + '</div></div>';
            }).join('')}
            ${recs.length > 2 ? '<div class="m2-more">+' + (recs.length - 2) + ' 笔</div>' : ''}
          </div>
        </div>`;
      };
      let cells = '';
      for (let i = 0; i < startDow; i++) cells += mkCell(prevDim - startDow + 1 + i, mk(y, m - 1, prevDim - startDow + 1 + i), true);
      for (let dd = 1; dd <= dim; dd++) cells += mkCell(dd, mk(y, m, dd), false);
      const tail = (7 - (startDow + dim) % 7) % 7;
      for (let i = 1; i <= tail; i++) cells += mkCell(i, mk(y, m + 1, i), true);
      const wdHead = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(w => '<div class="m2-wd">' + w + '</div>').join('');
      host.innerHTML = '<div class="m2-head">' + wdHead + '</div><div class="m2-grid">' + cells + '</div>';
    } else {
      const y = Number(home.anchor.slice(0, 4));
      titleEl.textContent = y + ' 年';
      const months = [];
      let exp = 0;
      for (let mm = 1; mm <= 12; mm++) {
        const month = y + '-' + String(mm).padStart(2, '0');
        const ss = this.monthSummary(lid, month);
        exp += ss.expense;
        months.push({ mm, ...ss });
      }
      host.innerHTML = '<div class="y2-grid">' + months.map(o => `
        <button class="y2-card" data-ym="${y}-${String(o.mm).padStart(2, '0')}-01">
          <div class="y2-m">${o.mm} 月</div>
          <div class="y2-row"><span>总支出</span><b class="expense">${fmtMoney(o.expense, { plain: true })}</b></div>
        </button>`).join('') + '</div>';
    }

    // 事件绑定
    host.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); this.addRecordModal(lid, b.dataset.add, null, null, false, true); };
    });
    host.querySelectorAll('.wk-rec, .m2-rec').forEach(item => {
      item.onclick = () => {
        if (item._skipClick) { item._skipClick = false; return; }
        this.editRecord(item.dataset.rid, lid);
      };
      // 右键菜单：删除该账单
      item.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openRecMenu(e.clientX, e.clientY, item.dataset.rid);
      };
      // 拖拽改期
      this.bindRecDrag(item);
    });
    host.querySelectorAll('.wk-col, .m2cell').forEach(col => {
      col.onclick = (e) => {
        if (e.target.closest('.wk-rec, .m2-rec, [data-add]')) return;
        if (col.classList.contains('out')) return;
        if (col.classList.contains('m2cell')) home.sel = col.dataset.date;
        this.addRecordModal(lid, col.dataset.date);
      };
    });
    host.querySelectorAll('.y2-card').forEach(c => {
      c.onclick = () => { home.view = 'month'; home.anchor = c.dataset.ym; home.sel = c.dataset.ym; this.renderLedgerHome(); };
    });
  },

  alertStripHTML(alerts) {
    const over = alerts.filter(a => a.level === 'over');
    const warn = alerts.filter(a => a.level === 'warn');
    const cls = over.length ? 'red' : '';
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>';
    const parts = [];
    if (over.length) parts.push('<b>' + over.length + ' 个小类已超支：</b>' + over.map(a => esc(a.sub)).join('、'));
    if (warn.length) parts.push('<b>' + warn.length + ' 个小类接近限额：</b>' + warn.map(a => esc(a.sub) + '（' + Math.round(a.pct * 100) + '%）').join('、'));
    return '<div class="alert-strip ' + cls + '">' + icon + '<span>' + parts.join('；') + '</span></div>';
  },

  /* ---------- 视图：好物仓库（多标签） ---------- */
  renderWishlist() {
    const el = document.getElementById('view-wishlist');
    const lid = this.state.currentLedgerId;
    const all = this.recsOf(lid).filter(r => r.favorite);
    const f = this.state.wish;

    // 标签导航计数（按全部好物统计，一个物品可计入多个标签）
    const tagCounts = {};
    all.forEach(r => recTags(r).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    // 各大类物品总数
    const catCounts = {};
    GOODS_TAG_GROUPS.forEach(g => {
      const tags = g.subs.length ? g.subs.map(s => g.name + '-' + s) : [g.name];
      catCounts[g.name] = tags.reduce((n, t) => n + (tagCounts[t] || 0), 0);
    });
    const openCats = Array.isArray(f.open) ? f.open : [];

    let items = all;
    const cats = Array.isArray(f.cats) ? f.cats : [];
    if (f.tag) items = all.filter(r => recTags(r).includes(f.tag));
    else if (cats.length) items = all.filter(r => { const ts = recTags(r); return cats.some(c => ts.includes(c) || ts.some(t => t.indexOf(c + '-') === 0)); });
    const sorters = {
      'date-desc': (a, b) => (a.date < b.date ? 1 : -1),
      'date-asc': (a, b) => (a.date > b.date ? 1 : -1),
      'amt-desc': (a, b) => b.amount - a.amount,
      'days-desc': (a, b) => this.wishDaysCost(b).days - this.wishDaysCost(a).days,
      'cost-asc': (a, b) => {
        const v = r => { const p = parseFloat(this.wishDaysCost(r).costText); return isFinite(p) ? p : Infinity; };
        const va = v(a), vb = v(b);
        return va === vb ? 0 : (va < vb ? -1 : 1);
      }
    };
    if (f.sort === 'status' || !sorters[f.sort]) f.sort = 'date-desc'; // 旧配置归一
    // 排序固定按状态分组（使用中→未使用→闲置中→已弃用），组内按所选维度次级排序；已弃用始终最后
    const sec = sorters[f.sort];
    items = [...items].sort((a, b) => {
      const ra = STATUS_RANK[this.wishStatusOf(a).key], rb = STATUS_RANK[this.wishStatusOf(b).key];
      if (ra !== rb) return ra - rb;
      return sec(a, b);
    });

    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">好物仓库</div>
            <div class="card-sub">${f.tag ? '标签 · ' + this.tagEmoHTML(f.tag) + esc(goodsTagShort(f.tag)) + '　' : cats.length ? '分类 · ' + cats.map(esc).join('、') + '　' : ''}共 ${items.length} 件 · 记账时勾选「心仪物品」并选择标签即可收入这里</div>
          </div>
        </div>
        <div class="wish-cats" id="w-cats">
          <div class="wc-row">
            <button class="wc-chip${(!f.tag && !cats.length) ? ' on' : ''}" data-cat="">全部<b>${all.length}</b></button>
            ${GOODS_TAG_GROUPS.map(g =>
              '<button class="wc-chip' + (cats.includes(g.name) ? ' on' : '') + '" data-cat="' + esc(g.name) + '" title="点击选中/取消，再点展开小类">' + esc(g.name) + '<b>' + (catCounts[g.name] || 0) + '</b>' + (g.subs.length ? '<i class="wc-ar">▾</i>' : '') + '</button>').join('')}
          </div>
          ${GOODS_TAG_GROUPS.filter(g => openCats.includes(g.name)).map(g => {
            const tags = g.subs.length ? g.subs.map(s => g.name + '-' + s) : [g.name];
            return '<div class="wc-subs">' + tags.map(t =>
              '<button class="wc-sub' + (f.tag === t ? ' on' : '') + ((tagCounts[t] || 0) ? '' : ' zero') + '" data-tag="' + esc(t) + '" title="' + esc(t) + '">' + this.tagEmoHTML(t) + esc(goodsTagShort(t)) + '<b>' + (tagCounts[t] || 0) + '</b></button>').join('') + '</div>';
          }).join('')}
        </div>
        <div class="filter-bar">
          <div class="field" style="min-width:190px"><label>排序</label>
            <select id="w-sort">
              <option value="date-desc" ${f.sort === 'date-desc' ? 'selected' : ''}>日期 · 最新</option>
              <option value="date-asc" ${f.sort === 'date-asc' ? 'selected' : ''}>日期 · 最早</option>
              <option value="amt-desc" ${f.sort === 'amt-desc' ? 'selected' : ''}>金额 · 从高到低</option>
              <option value="days-desc" ${f.sort === 'days-desc' ? 'selected' : ''}>陪伴天数 · 从长到短</option>
              <option value="cost-asc" ${f.sort === 'cost-asc' ? 'selected' : ''}>每日成本 · 从低到高</option>
            </select>
          </div>
        </div>
      </div>
      <div class="wish-grid" id="wish-grid"></div>`;

    el.querySelector('#w-sort').onchange = e => { this.state.wish.sort = e.target.value; this.renderWishlist(); };
    el.querySelectorAll('#w-cats .wc-chip[data-cat]').forEach(ch => {
      ch.onclick = () => {
        const cat = ch.dataset.cat;
        const w = this.state.wish;
        if (!cat) { w.cats = []; w.tag = ''; w.open = []; } // 「全部」：清空分类与展开态
        else {
          const i = w.cats.indexOf(cat);
          if (i >= 0) { // 再点：取消勾选并收起
            w.cats.splice(i, 1);
            const j = w.open.indexOf(cat);
            if (j >= 0) w.open.splice(j, 1);
          } else { // 首点：勾选高亮并展开小类
            w.cats.push(cat); w.tag = '';
            if (!w.open.includes(cat)) w.open.push(cat);
          }
        }
        this.renderWishlist();
      };
    });
    el.querySelectorAll('#w-cats .wc-sub[data-tag]').forEach(ch => {
      ch.onclick = () => {
        const t = ch.dataset.tag;
        this.state.wish.tag = this.state.wish.tag === t ? '' : t;
        this.renderWishlist();
      };
    });
    this.enhanceSelects(el);

    const grid = el.querySelector('#wish-grid');
    if (!items.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>' + (f.tag || cats.length ? '该分类下还没有好物' : '还没有心仪物品<br>在记账时勾选「心仪物品」就会自动出现在这里') + '</p>';
      return;
    }
    grid.innerHTML = items.map(r => {
      const name = r.note || (r.category + ' · ' + r.sub);
      const st = this.wishStatusOf(r);
      const imgs = this.recImages(r);
      return `
      <div class="wish-card" data-wid="${r.id}">
        <div class="wish-top">
          <div class="wish-info">
            <div class="wish-name"><span class="wn-txt">${esc(name)}</span></div>
            ${r.attribute ? '<div class="wish-attr">' + esc(r.attribute) + '</div>' : ''}
            <div class="wish-amount">${fmtMoney(r.amount)}</div>
          </div>
          <div class="wish-imgbox" data-act="img" title="${imgs.length ? '点击查看大图' : '点击添加图片'}">
            ${imgs.length
              ? '<img src="' + esc(imgs[0]) + '" alt="">' + (imgs.length > 1 ? '<span class="wi-cnt">1/' + imgs.length + '</span>' : '')
              : '<span class="wi-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.4-2h6.8l1.4 2h1.7A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><circle cx="12" cy="12.5" r="3.2"/></svg>添加图片</span>'}
          </div>
        </div>
        <div class="wish-status">
          <button type="button" class="wst st-${st.cls}" data-act="status" title="点击切换状态">${st.key}</button>
        </div>
        <div class="wish-meta">${this.wishMetaHTML(r)}</div>
        <div class="wish-tags" data-act="tags" title="点击编辑标签">${this.wishTagsHTML(recTags(r))}</div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.wish-card').forEach(card => {
      const rid = card.dataset.wid;
      card.onclick = () => {
        const rec = this.state.records.find(r => r.id === rid);
        if (rec) this.editRecord(rid, rec.ledger_id);
      };
      card.querySelectorAll('[data-act]').forEach(el => {
        el.onclick = async (e) => {
          e.stopPropagation(); // 图片框/状态/标签不触发整卡编辑
          const act = el.dataset.act;
          const rec = this.state.records.find(r => r.id === rid);
          if (!rec) return;
          if (act === 'img') {
            const imgs = this.recImages(rec);
            if (imgs.length) this.openWishLight(imgs, 0);
            else await this.addWishImages(rid);
          } else if (act === 'status') {
            this.openWishStatusPop(rid, el);
          } else if (act === 'tags') {
            this.openWishTagPop(rid, el);
          }
        };
      });
    });
  },

  /* ---------- 好物卡片：图片/状态/标签辅助与浮层 ---------- */
  /* 有效图片列表（images 多图列权威；缺列时回退老数据单图 image） */
  recImages(r) {
    if (Array.isArray(r && r.images)) return r.images.filter(x => typeof x === 'string' && x);
    return r && r.image ? [r.image] : [];
  },
  /* 选本地图片（可多选）并压缩，返回 dataURL 数组 */
  pickImages() {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = async () => {
        const files = Array.from(inp.files || []);
        const out = [];
        for (const f of files) {
          try { out.push(await compressImage(f)); }
          catch (e) { this.toast(e.message || '图片处理失败', 'err'); }
        }
        resolve(out);
      };
      inp.click();
    });
  },
  /* 卡片占位图点击：直接选图上传（多张） */
  async addWishImages(rid) {
    if (Store.missingCol('records', 'images')) { this.toast('请先到设置页补一次建表 SQL（补 images 列）'); return; }
    this.toast('图片处理中…');
    const added = await this.pickImages();
    if (!added.length) return;
    const rec = this.state.records.find(r => r.id === rid);
    if (!rec) return;
    const next = [...this.recImages(rec), ...added];
    const ok = await Store.update('records', rid, { images: next });
    if (ok === false) { this.toast('图片保存失败，请重试'); return; }
    rec.images = next;
    const box = document.querySelector('.wish-card[data-wid="' + rid + '"] [data-act="img"]');
    if (box) {
      box.innerHTML = '<img src="' + esc(next[0]) + '" alt="">' + (next.length > 1 ? '<span class="wi-cnt">1/' + next.length + '</span>' : '');
      box.title = '点击查看大图';
    }
    this.toast('已添加 ' + added.length + ' 张图片', 'ok');
  },
  /* 合法图片链接（http/https；拒绝 javascript: 等伪协议） */
  isImgUrl(s) {
    try { const u = new URL(String(s || '').trim()); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch (e) { return false; }
  },
  /* 粘贴图片链接加入 images：只存 URL 字符串，不下载不转存，零存储占用 */
  /* 图片链接输入（校验+去重），返回新的图片数组；取消/非法返回 null（不入库） */
  async promptImageLink(curImgs) {
    const url = await this.promptDialog('图片链接', '粘贴图片网址（http:// 或 https:// 开头）');
    if (!url) return null;
    if (!this.isImgUrl(url)) { this.toast('链接格式不正确，需以 http:// 或 https:// 开头', 'err'); return null; }
    if (curImgs.includes(url)) { this.toast('该链接已经添加过了', 'err'); return null; }
    return [...curImgs, url];
  },
  async addImageLink(rid, curImgs, onAdded) {
    if (Store.missingCol('records', 'images')) { this.toast('请先到设置页补一次建表 SQL（补 images 列）'); return; }
    const next = await this.promptImageLink(curImgs);
    if (!next) return;
    const ok = await Store.update('records', rid, { images: next });
    if (ok === false) { this.toast('保存失败，请重试', 'err'); return; }
    onAdded(next);
    this.toast('已添加图片链接', 'ok');
  },
  /* 大图查看：左右箭头切换 + 计数 + 点背景/Esc 关闭；网络图片显示「打开原图」 */
  openWishLight(imgs, idx) {
    this.closeWishLight();
    let i = idx;
    const wrap = document.createElement('div');
    wrap.className = 'wish-light';
    wrap.id = 'wish-light';
    wrap.innerHTML =
      '<button type="button" class="wl-btn wl-prev" title="上一张" style="display:' + (imgs.length > 1 ? '' : 'none') + '">‹</button>' +
      '<img id="wl-img" src="' + esc(imgs[i]) + '" alt="">' +
      '<button type="button" class="wl-btn wl-next" title="下一张" style="display:' + (imgs.length > 1 ? '' : 'none') + '">›</button>' +
      '<div class="wl-cnt">' + (i + 1) + ' / ' + imgs.length + '</div>' +
      '<a class="wl-open" id="wl-open" href="' + esc(imgs[i]) + '" target="_blank" rel="noopener" title="打开原图" style="display:none">↗</a>' +
      '<button type="button" class="wl-close" title="关闭">✕</button>';
    document.body.appendChild(wrap);
    const img = wrap.querySelector('#wl-img'), cnt = wrap.querySelector('.wl-cnt'), openBtn = wrap.querySelector('#wl-open');
    const show = () => {
      img.src = imgs[i];
      cnt.textContent = (i + 1) + ' / ' + imgs.length;
      const net = /^https?:\/\//i.test(imgs[i]);
      openBtn.style.display = net ? '' : 'none';
      if (net) openBtn.href = imgs[i];
    };
    img.onerror = () => { if (/^https?:\/\//i.test(imgs[i])) this.toast('图片加载失败，对方网站可能不允许外嵌，可点右上角「打开原图」', 'err'); };
    wrap.querySelector('.wl-prev').onclick = e => { e.stopPropagation(); i = (i - 1 + imgs.length) % imgs.length; show(); };
    wrap.querySelector('.wl-next').onclick = e => { e.stopPropagation(); i = (i + 1) % imgs.length; show(); };
    wrap.querySelector('.wl-close').onclick = e => { e.stopPropagation(); this.closeWishLight(); };
    wrap.onclick = () => this.closeWishLight();
    this._wlKey = e => {
      if (e.key === 'Escape') this.closeWishLight();
      if (e.key === 'ArrowLeft' && imgs.length > 1) { i = (i - 1 + imgs.length) % imgs.length; show(); }
      if (e.key === 'ArrowRight' && imgs.length > 1) { i = (i + 1) % imgs.length; show(); }
    };
    document.addEventListener('keydown', this._wlKey, true);
  },
  closeWishLight() {
    const p = document.getElementById('wish-light');
    if (p) p.remove();
    if (this._wlKey) { document.removeEventListener('keydown', this._wlKey, true); this._wlKey = null; }
  },
  /* 当前状态（老数据无 status：心标 → 使用中，否则闲置中） */
  wishStatusOf(r) {
    const s = String((r && r.status) || '').trim();
    return WISH_STATUS_LIST.find(x => x.key === s) || (r && r.favorite ? WISH_STATUS_LIST[0] : WISH_STATUS_LIST[1]);
  },

  /* ---------- 季节自动切换（好物仓库） ---------- */
  seasonCfgKey() { try { return 'fin_season_' + (Store.user ? (Store.user.email || 'local') : 'local'); } catch (e) { return 'fin_season_local'; } },
  seasonLockKey() { try { return 'fin_season_lock_' + (Store.user ? (Store.user.email || 'local') : 'local'); } catch (e) { return 'fin_season_lock_local'; } },
  loadSeasonConfig() {
    try {
      const raw = localStorage.getItem(this.seasonCfgKey());
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') { const d = defaultSeasonMonths(); for (let i = 1; i <= 12; i++) if (!p[i]) p[i] = d[i]; return p; }
      }
    } catch (e) { /* ignore */ }
    return defaultSeasonMonths();
  },
  saveSeasonConfig(cfg) { try { localStorage.setItem(this.seasonCfgKey(), JSON.stringify(cfg)); } catch (e) { /* ignore */ } },
  loadSeasonLocks() { try { const raw = localStorage.getItem(this.seasonLockKey()); return new Set(raw ? JSON.parse(raw) : []); } catch (e) { return new Set(); } },
  /* 手动改过状态的好物，加入锁定集合，自动季节逻辑不再触碰它 */
  addSeasonLock(id) { try { const s = this.loadSeasonLocks(); s.add(id); localStorage.setItem(this.seasonLockKey(), JSON.stringify([...s])); } catch (e) { /* ignore */ } },
  currentSeason() { return seasonOfMonth(this.loadSeasonConfig(), new Date().getMonth() + 1); },
  /* 执行一次季节自动切换：仅切换「衣裤鞋袜」类、有季节标签、且当前为 使用中/闲置中 的好物；跳过 未使用/已弃用 与手动锁定项 */
  async applySeasonStatus() {
    const season = this.currentSeason();
    const locks = this.loadSeasonLocks();
    const updates = [];
    for (const r of this.state.records) {
      if (!r.favorite) continue;
      const target = seasonTargetStatus(r, season);
      if (!target) continue;
      const cur = this.wishStatusOf(r).key;
      if (cur !== '使用中' && cur !== '闲置中') continue; // 未使用/已弃用 不受自动切换影响
      if (locks.has(r.id)) continue; // 手动覆盖优先
      if (target === cur) continue;
      updates.push({ r, target });
    }
    for (const { r, target } of updates) {
      // 仅在 使用中↔闲置中 间切换状态，保留原 status_since（已陪伴天数不清零、不跳变）
      const ok = await Store.update('records', r.id, { status: target });
      if (ok !== false) { r.status = target; }
    }
    if (updates.length && this.state.route === 'wishlist') this.renderWishlist();
    return updates.length;
  },
  /* 旧版季节自动切换曾把 status_since 重置为切换当天（已陪伴天数因此变成 1 天）：
   * 若该好物未手动锁定、且起始日落在旧版缺陷窗口内 → 判定为被误重置 */
  isSinceClobbered(r, since) {
    if (!since) return false;
    if (this.loadSeasonLocks().has(r.id)) return false;
    if (!r.date || !(r.date < since)) return false;
    return WISH_STATUS_BUG_DATES.indexOf(since) >= 0;
  },
  /* 自动自愈好物数据（进入应用时静默执行，用户无需任何操作）：
   *  1) 已弃用 / 已磬用：补写定格快照（购入日 → 弃用日 的天数 + 每日成本），写入后永久冻结
   *  2) 使用中 / 闲置中：旧版季节自动切换把 status_since 重置成切换日（已陪伴显示 1 天）→ 恢复为按购入日起算
   * 幂等：修完即为正确值，再次执行无任何改动 */
  async autoRepairWishData() {
    const ACTIVE = ['使用中', '闲置中'], FROZEN = ['已弃用', '已磬用'];
    const locks = this.loadSeasonLocks();
    const todo = [];
    for (const r of this.state.records) {
      if (!r.favorite) continue;
      const key = this.wishStatusOf(r).key;
      const fz = parseWishSince(r.status_since);
      if (FROZEN.includes(key)) {
        if (fz.snap) continue; // 已有定格快照
        const end = fz.date || todayStr();              // 弃用日
        const days = daysBetween(r.date || end, end);   // 购入日 → 弃用日
        const cost = days > 0 ? (Number(r.amount) || 0) / days : NaN;
        const val = fmtWishSince(end, days, isFinite(cost) ? cost : null);
        if (val !== (r.status_since || '')) todo.push({ id: r.id, patch: { status_since: val } });
      } else if (ACTIVE.includes(key)) {
        if (!fz.date || locks.has(r.id)) continue;        // 手动改过状态的以用户设置为准
        if (!this.isSinceClobbered(r, fz.date)) continue;  // 起始日不在旧版缺陷窗口 → 非被重置
        todo.push({ id: r.id, patch: { status_since: r.date } }); // 恢复按购入日起算
      }
    }
    let n = 0;
    for (const u of todo) {
      const ok = await Store.update('records', u.id, u.patch);
      if (ok !== false) {
        const rec = this.state.records.find(x => x.id === u.id);
        if (rec) Object.assign(rec, u.patch);
        n++;
      }
    }
    return n;
  },
  /* 已陪伴天数 + 每日成本（按当前状态计算）：
   *  使用中 / 闲置中：从状态起始日(status_since)起算，每日成本 = 金额 / 天数，实时累计（季节自动切换不重置）
   *  未使用：不显示已陪伴，每日成本占位「-」
   *  已弃用 / 已磬用：显示定格快照（status_since 内冻结的天数 + 每日成本），数字永久不再变动、也不清零 */
  wishDaysCost(r) {
    const key = this.wishStatusOf(r).key;
    const amount = Number(r.amount) || 0;
    if (key === '未使用') return { days: 0, showDays: false, costText: '-' };
    const fz = parseWishSince(r.status_since);
    if (key === '已弃用' || key === '已磬用') {
      if (fz.snap) {
        return { days: fz.days, showDays: true, costText: fz.cost == null ? '-' : Number(fz.cost).toFixed(2) };
      }
      // 旧数据未冻结：按「购入日 → 弃用日」回退估算（自愈补写快照后即真正冻结）
      const end = fz.date || todayStr();
      const days = daysBetween(r.date || end, end);
      const cost = days > 0 ? amount / days : NaN;
      return { days, showDays: true, costText: isFinite(cost) ? cost.toFixed(2) : '-' };
    }
    const since = fz.date || r.date;
    const days = daysBetween(since, null);
    const cost = days > 0 ? amount / days : NaN; // 使用中 / 闲置中
    return { days, showDays: true, costText: isFinite(cost) ? cost.toFixed(2) : '-' };
  },
  /* 卡片标签区 HTML（与 wish-tags 局部刷新共用） */
  wishTagsHTML(tags) {
    return tags && tags.length
      ? tags.map(t => '<span class="wtag" title="' + esc(t) + '">' + this.tagEmoHTML(t) + esc(goodsTagShort(t)) + '</span>').join('')
      : '<span class="wtag none">未贴标签</span>';
  },
  /* 卡片 meta 区 HTML（购买日期 + 已陪伴 + 每日成本；状态切换后局部刷新共用） */
  wishMetaHTML(r) {
    const dc = this.wishDaysCost(r);
    return `
          <div class="wm-row wm-date"><span class="wm-item"><span class="wm-lab">购买日期</span><span class="wm-val"><b class="wm-dim">${r.date}${r.purchase_platform ? ' ' + esc(r.purchase_platform) : ''}</b></span></span></div>
          <div class="wm-row wm-duo">
            ${dc.showDays ? '<span class="wm-item"><span class="wm-lab">已陪伴</span><span class="wm-val"><b class="wm-badge wm-purple">' + dc.days + '</b><span class="wm-unit">天</span></span></span>' : ''}
            <span class="wm-item"><span class="wm-lab">每日</span><span class="wm-val"><b class="wm-badge wm-blue">${dc.costText}</b>${dc.costText === '-' ? '' : '<span class="wm-unit">元</span>'}</span></span>
          </div>
        `;
  },
  /* 分类导航计数刷新（增删标签后大类/小类 chip 数字同步） */
  updateWishTagCounts() {
    const all = this.recsOf(this.state.currentLedgerId).filter(r => r.favorite);
    const counts = {};
    all.forEach(r => recTags(r).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const catCount = name => GOODS_TAG_GROUPS.filter(g => g.name === name).reduce((n, g) =>
      n + (g.subs.length ? g.subs.map(s => g.name + '-' + s) : [g.name]).reduce((m, t) => m + (counts[t] || 0), 0), 0);
    document.querySelectorAll('#w-cats .wc-chip[data-cat]').forEach(ch => {
      const b = ch.querySelector('b');
      if (!b) return;
      const cat = ch.dataset.cat;
      b.textContent = cat ? (catCount(cat) || 0) : all.length;
    });
    document.querySelectorAll('#w-cats .wc-sub[data-tag]').forEach(ch => {
      const b = ch.querySelector('b');
      if (b) b.textContent = counts[ch.dataset.tag] || 0;
    });
  },
  /* 标签菜单：复用记账弹窗的标签多选面板，勾选即存 */
  openWishTagPop(rid, anchor) {
    this.closeWishPop();
    const rec = this.state.records.find(r => r.id === rid);
    if (!rec) return;
    const cur = recTags(rec);
    const pop = document.createElement('div');
    pop.className = 'wish-pop';
    pop.id = 'wish-pop';
    pop.innerHTML = '<div class="wp-title">标签（可多选）</div><div class="tag-picker">' + this.goodsTagPickerHTML() + '</div>';
    document.body.appendChild(pop);
    this._placeWishPop(pop, anchor);
    pop.querySelectorAll('.tag-opt input').forEach(i => { i.checked = cur.includes(i.value); });
    pop.addEventListener('change', async e => {
      const t = e.target.value;
      if (!t) return;
      const next = e.target.checked ? normGoodsTags([...cur, t]) : cur.filter(x => x !== t);
      if (Store.missingCol('records', 'tags')) { this.toast('标签列缺失：请先到设置页补一次建表 SQL'); return; }
      const ok = await Store.update('records', rid, { tags: next });
      if (ok === false) { this.toast('标签保存失败，请重试'); return; }
      rec.tags = next;
      cur.length = 0; cur.push(...next);
      const card = document.querySelector('.wish-card[data-wid="' + rid + '"]');
      if (card) card.querySelector('.wish-tags').innerHTML = this.wishTagsHTML(next);
      this.updateWishTagCounts();
    });
    this._bindWishPopOut(pop, anchor);
  },
  /* 状态菜单：四选一，选中即存并更新卡片 */
  openWishStatusPop(rid, anchor) {
    this.closeWishPop();
    const rec = this.state.records.find(r => r.id === rid);
    if (!rec) return;
    const cur = this.wishStatusOf(rec);
    const pop = document.createElement('div');
    pop.className = 'wish-pop';
    pop.id = 'wish-pop';
    pop.innerHTML = '<div class="wp-title">状态</div><div class="wp-opts">' + WISH_STATUS_LIST.map(x =>
      '<button type="button" class="wp-st st-' + x.cls + (x.key === cur.key ? ' on' : '') + '" data-st="' + esc(x.key) + '"><i></i>' + esc(x.key) + '</button>').join('') + '</div>';
    document.body.appendChild(pop);
    this._placeWishPop(pop, anchor);
    pop.querySelectorAll('[data-st]').forEach(b => {
      b.onclick = async () => {
        const label = b.dataset.st;
        if (Store.missingCol('records', 'status')) { this.toast('请先到设置页补一次建表 SQL（补 status 列）'); return; }
        const ACTIVE = ['使用中', '闲置中'], FROZEN = ['已弃用', '已磬用'];
        const curKey = cur.key;                    // 老数据 status 为空时按 favorite 推导
        const wasActive = ACTIVE.includes(curKey);
        const wasFrozen = FROZEN.includes(curKey);
        const fz = parseWishSince(rec.status_since);
        let status_since = rec.status_since || '';
        const patch = { status: label };
        if (ACTIVE.includes(label)) {
          // 使用中 / 闲置中：原本就在用则沿用起始日（天数连续累积，不重置为 1 天）；从其它状态转入则今天重新起算
          if (!wasActive) status_since = todayStr();
          patch.status_since = status_since;
        } else if (label === '未使用') {
          status_since = '';                         // 未使用：清空已陪伴天数、每日成本占位「-」
          patch.status_since = '';
        } else if (FROZEN.includes(label)) {
          if (wasFrozen && fz.snap) {
            status_since = rec.status_since;         // 已弃用 ↔ 已磬用：保留原定格快照，数值不变
          } else {
            // 变为已弃用 / 已磬用的当天：定格「当天的已陪伴天数 + 每日成本」，此后不再随日期 / 金额变化
            const end = (wasFrozen && fz.date) ? fz.date : todayStr();  // 已是冻结态但缺快照 → 沿用原弃用日
            const base = (wasActive && fz.date && !this.isSinceClobbered(rec, fz.date)) ? fz.date : (rec.date || end);
            const d = daysBetween(base, end);
            const c = d > 0 ? (Number(rec.amount) || 0) / d : NaN;
            status_since = fmtWishSince(end, d, isFinite(c) ? c : null);
          }
          patch.status_since = status_since;
        }
        const ok = await Store.update('records', rid, patch);
        if (ok === false) { this.toast('状态保存失败，请重试'); return; }
        rec.status = label;
        rec.status_since = status_since;
        this.addSeasonLock(rid); // 手动改状态 → 永久锁定，季节自动切换不再动它
        const st = this.wishStatusOf(rec);
        const card = document.querySelector('.wish-card[data-wid="' + rid + '"]');
        if (card) {
          const btn = card.querySelector('[data-act="status"]');
          if (btn) { btn.textContent = st.key; btn.className = 'wst st-' + st.cls; }
          const meta = card.querySelector('.wish-meta');
          if (meta) meta.innerHTML = this.wishMetaHTML(rec); // 状态变更后已陪伴/每日成本立即刷新
        }
        this.closeWishPop();
      };
    });
    this._bindWishPopOut(pop, anchor);
  },
  _placeWishPop(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + 'px';
    pop.style.top = Math.min(r.bottom + 6, Math.max(8, window.innerHeight - ph - 10)) + 'px';
  },
  _bindWishPopOut(pop, anchor) {
    this._wpOut = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) this.closeWishPop(); };
    this._wpKey = e => { if (e.key === 'Escape') this.closeWishPop(); };
    setTimeout(() => {
      document.addEventListener('mousedown', this._wpOut, true);
      document.addEventListener('keydown', this._wpKey, true);
    }, 0);
  },
  closeWishPop() {
    const p = document.getElementById('wish-pop');
    if (p) p.remove();
    if (this._wpOut) { document.removeEventListener('mousedown', this._wpOut, true); this._wpOut = null; }
    if (this._wpKey) { document.removeEventListener('keydown', this._wpKey, true); this._wpKey = null; }
  },

  /* ---------- 视图：统计 ---------- */
  renderStats() {
    const el = document.getElementById('view-stats');
    const st = this.state.stats;
    const scopeLedgerId = st.scope === 'all' ? null : this.state.currentLedgerId;
    const recs = this.state.records.filter(r => (!scopeLedgerId || r.ledger_id === scopeLedgerId));
    const period = st.period === 'month' ? st.month : st.year;
    const inPeriod = recs.filter(r => st.period === 'month' ? monthOf(r.date) === period : yearOf(r.date) === period);
    const kindOfRec = r => r.kind || (scopeLedgerId ? this.kindOf(scopeLedgerId, r.category) : (this.catByName(r.ledger_id, r.category) || {}).kind || 'expense');

    let income = 0, expense = 0;
    inPeriod.forEach(r => { const v = Number(r.amount) || 0; if (kindOfRec(r) === 'income') income += v; else expense += v; });

    // 分类占比
    const byCat = {};
    inPeriod.filter(r => kindOfRec(r) === st.pie).forEach(r => {
      byCat[r.category] = (byCat[r.category] || 0) + (Number(r.amount) || 0);
    });
    const pieItems = Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
    const pieTotal = pieItems.reduce((s, i) => s + i.value, 0);

    // 趋势
    let labels = [], incSeries = [], expSeries = [];
    if (st.period === 'month') {
      const [y, m] = st.month.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      for (let d = 1; d <= days; d++) labels.push(m + '/' + d);
      incSeries = new Array(days).fill(0); expSeries = new Array(days).fill(0);
      inPeriod.forEach(r => {
        const d = parseInt(r.date.slice(8), 10) - 1;
        const v = Number(r.amount) || 0;
        if (kindOfRec(r) === 'income') incSeries[d] += v; else expSeries[d] += v;
      });
    } else {
      const y = st.year;
      labels = Array.from({ length: 12 }, (_, i) => (i + 1) + '月');
      incSeries = new Array(12).fill(0); expSeries = new Array(12).fill(0);
      inPeriod.forEach(r => {
        const m = parseInt(r.date.slice(5, 7), 10) - 1;
        const v = Number(r.amount) || 0;
        if (kindOfRec(r) === 'income') incSeries[m] += v; else expSeries[m] += v;
      });
    }

    // 小类明细
    const lid = scopeLedgerId || this.state.currentLedgerId;
    const cats = this.catsOf(lid);
    if (!cats.find(c => c.name === st.cat)) st.cat = (cats.find(c => c.name === '日常支出') || cats[0] || { name: '' }).name;
    const catObj = this.catByName(lid, st.cat);
    const subRows = ((catObj && catObj.subs) || []).map(sub => {
      const used = inPeriod.filter(r => r.category === st.cat && r.sub === sub)
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const b = this.budgetOf(lid, st.cat, sub);
      const limit = b ? Number(b.amount) || 0 : 0;
      const pct = limit > 0 ? used / limit : 0;
      return { sub, used, limit, pct };
    }).sort((a, b) => b.used - a.used);
    const subMax = Math.max(...subRows.map(r => r.used), 1);

    const nowYear = new Date().getFullYear();

    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">统计分析</div>
            <div class="card-sub">按周期查看收支汇总、分类占比与趋势</div>
          </div>
        </div>
        <div class="filter-bar">
          <div class="field"><label>账本范围</label>
            <select id="st-scope">
              <option value="ledger" ${st.scope === 'ledger' ? 'selected' : ''}>当前账本</option>
              <option value="all" ${st.scope === 'all' ? 'selected' : ''}>全部账本</option>
            </select>
          </div>
          <div class="field"><label>周期</label>
            <select id="st-period">
              <option value="month" ${st.period === 'month' ? 'selected' : ''}>月度</option>
              <option value="year" ${st.period === 'year' ? 'selected' : ''}>年度</option>
            </select>
          </div>
          <div class="field">${st.period === 'month'
            ? '<label>月份</label><input type="text" id="st-month" class="cal-input" readonly placeholder="选择月份" value="' + st.month + '" data-month="' + st.month + '" data-cal-mode="month">'
            : '<label>年份</label><input type="text" id="st-year" class="cal-input" readonly placeholder="选择年份" value="' + st.year + '" data-year="' + st.year + '" data-cal-mode="year">'}</div>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">${st.period === 'month' ? '本月' : '本年'}总收入</div><div class="stat-value income">${fmtMoney(income)}</div></div>
        <div class="stat-card"><div class="stat-label">${st.period === 'month' ? '本月' : '本年'}总支出</div><div class="stat-value expense">${fmtMoney(expense)}</div></div>
        <div class="stat-card"><div class="stat-label">结余</div><div class="stat-value" style="color:${income - expense >= 0 ? 'var(--purple)' : 'var(--danger)'}">${fmtMoney(income - expense)}</div></div>
        <div class="stat-card"><div class="stat-label">记录数</div><div class="stat-value">${inPeriod.length}</div></div>
      </div>

      <div class="grid grid-2" style="margin-bottom:20px">
        <div class="card">
          <div class="card-head">
            <div><div class="card-title">分类占比</div><div class="card-sub">${st.pie === 'expense' ? '支出' : '收入'}按大类划分</div></div>
            <select id="st-pie" style="height:34px;border:1px solid var(--line);border-radius:9px;padding:0 10px;background:#fff">
              <option value="expense" ${st.pie === 'expense' ? 'selected' : ''}>支出</option>
              <option value="income" ${st.pie === 'income' ? 'selected' : ''}>收入</option>
            </select>
          </div>
          <div class="chart-box"><canvas id="pie-canvas" height="240"></canvas></div>
          <div class="chart-legend">
            ${pieItems.map(i => '<div class="legend-item"><span class="legend-dot" style="background:' + i.color + '"></span>' + esc(i.label) + ' <span class="val">' + fmtMoney(i.value, { plain: true }) + '</span></div>').join('') || '<span style="font-size:12.5px;color:var(--muted)">暂无数据</span>'}
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div><div class="card-title">收支趋势</div><div class="card-sub">${st.period === 'month' ? '按日' : '按月'}对比</div></div>
          </div>
          <div class="chart-box"><canvas id="line-canvas" height="240"></canvas></div>
          <div class="chart-legend">
            <div class="legend-item"><span class="legend-dot" style="background:#34D399"></span>收入</div>
            <div class="legend-item"><span class="legend-dot" style="background:#3B82F6"></span>支出</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">${esc(st.cat)} · 小类消费情况</div><div class="card-sub">${st.period === 'month' ? st.month : st.year}${st.scope === 'all' ? ' · 全部账本' : ''}</div></div>
          <select id="st-cat" style="height:34px;border:1px solid var(--line);border-radius:9px;padding:0 10px;background:#fff">
            ${cats.map(c => '<option value="' + esc(c.name) + '" ' + (st.cat === c.name ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('')}
          </select>
        </div>
        <div class="mini-bars">
          ${subRows.map(r => `
            <div class="mini-bar-row">
              <div class="mini-bar-top"><span>${esc(r.sub)} ${r.limit ? '<span style="color:var(--muted);font-weight:500">/ 限额 ' + fmtMoney(r.limit, { plain: true }) + '</span>' : ''}</span><b>${fmtMoney(r.used, { plain: true })}</b></div>
              <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.min(100, r.used / subMax * 100)}%;${r.limit ? (r.pct > 1 ? 'background:var(--danger)' : r.pct >= .7 ? 'background:var(--warn)' : '') : ''}"></div></div>
            </div>`).join('') || '<div class="empty"><p>该大类下暂无小类</p></div>'}
        </div>
      </div>`;

    // 绑定
    el.querySelector('#st-scope').onchange = e => { st.scope = e.target.value; this.renderStats(); };
    el.querySelector('#st-period').onchange = e => { st.period = e.target.value; this.renderStats(); };
    const mi = el.querySelector('#st-month'), yi = el.querySelector('#st-year');
    if (mi) mi.onchange = e => { st.month = e.target.value || st.month; this.renderStats(); };
    if (yi) yi.onchange = e => { st.year = String(Math.max(2000, Math.min(2100, Number(e.target.value) || nowYear))); this.renderStats(); };
    el.querySelector('#st-cat').onchange = e => { st.cat = e.target.value; this.renderStats(); };
    el.querySelector('#st-pie').onchange = e => { st.pie = e.target.value; this.renderStats(); };

    Charts.donut(el.querySelector('#pie-canvas'), pieItems, { label: '合计', value: fmtMoney(pieTotal, { plain: true }) });
    Charts.line(el.querySelector('#line-canvas'), labels, [
      { name: '收入', color: '#34D399', data: incSeries },
      { name: '支出', color: '#3B82F6', data: expSeries }
    ]);
    this.enhanceSelects(el);
  },
  /* ---------- 好物标签多选面板（记账/编辑弹窗共用） ---------- */
  /* 标签图标 HTML（无图标返回空字符串） */
  tagEmoHTML(tag) {
    const em = goodsTagEmoji(tag);
    return em ? '<span class="tag-emo">' + em + '</span>' : '';
  },
  goodsTagPickerHTML() {
    return GOODS_TAG_GROUPS.map(g => {
      const opts = g.subs.length
        ? g.subs.map(s => ({ tag: g.name + '-' + s, label: s }))
        : [{ tag: g.name, label: g.name }];
      return `
      <div class="tag-picker-group">
        <span class="tag-picker-name">${esc(g.name)}</span>
        <div class="tag-picker-opts">
          ${opts.map(o => '<label class="tag-opt"><input type="checkbox" value="' + esc(o.tag) + '"><span>' + this.tagEmoHTML(o.tag) + esc(o.label) + '</span></label>').join('')}
        </div>
      </div>`;
    }).join('');
  },
  /* 勾选/取消「收入好物仓库」时显示/隐藏标签面板，取消时清空已选 */
  bindFavTags(favEl, fieldEl, pickerSel) {
    if (!favEl || !fieldEl) return;
    const sync = () => {
      fieldEl.style.display = favEl.checked ? '' : 'none';
      if (!favEl.checked) document.querySelectorAll(pickerSel + ' input[type=checkbox]').forEach(i => { i.checked = false; });
    };
    favEl.onchange = sync;
    sync();
  },
  /* 读取面板内勾选的标签（规范化） */
  pickedTags(pickerSel) {
    return normGoodsTags(Array.from(document.querySelectorAll(pickerSel + ' input[type=checkbox]:checked')).map(i => i.value));
  },

  /* ---------- 新增记账弹窗 ---------- */
  addRecordModal(ledgerId, date, preCat, preSub, rental, continuous) {
    const cats = this.catsOf(ledgerId);
    let rating = 0;
    let adImgs = [];
    if (rental && !preCat) preCat = RENTAL_CAT;
    const adMask = this.openModal(`
      <div class="modal-title"><span id="ad-title">新增记账 · ${esc(date)}</span><button class="icon-btn" style="display:flex" data-close>✕</button></div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field"><label>大类</label><select id="ad-cat">${cats.map(c => '<option value="' + esc(c.name) + '"' + (preCat && c.name === preCat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('')}</select></div>
          <div class="field"><label>小类</label><select id="ad-sub"></select></div>
          <div class="field"><label>日期</label><input id="ad-date" class="cal-input" readonly placeholder="选择日期" value="${esc(date)}" data-date="${esc(date)}"></div>
        </div>
        <div class="field"><label>金额（元）</label><input id="ad-amt" class="amt-input" type="number" min="0" step="0.01" placeholder="0.00"></div>
        <div class="field"><label>评分</label><div class="stars" id="ad-stars">${[1, 2, 3, 4, 5].map(v => '<button type="button" data-v="' + v + '">★</button>').join('')}</div></div>
        <div class="field"><label>描述</label><input id="ad-note" type="text" placeholder="选填"></div>
        <div class="field"><label>备注</label><textarea id="ad-remark" rows="2"></textarea></div>
        <div class="field-row">
          <div class="field"><label>购买平台</label><input id="ad-platform" type="text" placeholder="如 淘宝 / 京东"></div>
          <div class="field"><label>属性</label><input id="ad-attr" type="text" placeholder="如 黑色 128G"></div>
        </div>
        <div class="field"><label>标记</label>
          <label class="fav-check"><input type="checkbox" id="ad-rental" ${rental ? 'checked' : ''}><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>归入出租屋账本</label>
        </div>
        <div class="field"><label>心仪物品</label>
          <label class="fav-check"><input type="checkbox" id="ad-fav"><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>收入好物仓库</label>
        </div>
        <div class="field" id="ad-tags-field" style="display:none"><label>好物标签（可多选）</label>
          <div class="tag-picker" id="ad-tagpicker">${this.goodsTagPickerHTML()}</div>
        </div>
        <div class="field" id="ad-img-field" style="display:none"><label>图片（可多张）</label>
          <div class="rec-img-grid" id="ad-img-grid"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-ghost btn-sm" id="ad-img-up" type="button">上传图片</button>
            <button class="btn btn-ghost btn-sm" id="ad-img-link" type="button">图片链接</button>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <div class="modal-acts">
          <button class="btn btn-ghost" data-close>${continuous ? '完成' : '取消'}</button>
          <button class="btn btn-primary" id="ad-save">${continuous ? '保存并继续' : '保存'}</button>
        </div>
      </div>
    `, false, 'edit-modal', 'form-mask');
    const catSel = document.getElementById('ad-cat'), subSel = document.getElementById('ad-sub');
    const fillSubs = () => {
      const cc = this.catByName(ledgerId, catSel.value);
      subSel.innerHTML = ((cc && cc.subs) || []).map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
      this.enhanceSelects(subSel);
    };
    fillSubs();
    if (preSub) {
      const subSel = document.getElementById('ad-sub');
      if (Array.from(subSel.options).some(o => o.value === preSub)) subSel.value = preSub;
      this.enhanceSelects(subSel);
    }
    catSel.onchange = fillSubs;
    // 日期字段：点开日历选择，选中后同步弹窗标题
    const adDate = document.getElementById('ad-date');
    adDate.onclick = () => this.openCalendar(adDate);
    adDate.addEventListener('change', () => {
      const t = document.getElementById('ad-title');
      if (t) t.textContent = '新增记账 · ' + (adDate.dataset.date || date);
    });
    this.bindFavTags(document.getElementById('ad-fav'), document.getElementById('ad-tags-field'), '#ad-tagpicker');
    this.enhanceSelects(document.getElementById('modal-root'));
    document.querySelectorAll('#ad-stars button').forEach(b => {
      b.onclick = () => {
        const v = Number(b.dataset.v);
        rating = rating === v ? 0 : v;
        document.querySelectorAll('#ad-stars button').forEach(x => x.classList.toggle('on', Number(x.dataset.v) <= rating));
      };
    });
    // 图片区（与编辑弹窗一致：勾选「心仪物品」后出现，图片随记录一起入库）
    const favEl = document.getElementById('ad-fav');
    const imgField = document.getElementById('ad-img-field');
    const imgGrid = document.getElementById('ad-img-grid');
    const renderImgGrid = () => {
      imgGrid.innerHTML = adImgs.length
        ? adImgs.map((src, i) => '<div class="ri-cell"><img src="' + esc(src) + '" alt=""><button type="button" class="ri-del" data-i="' + i + '" title="删除这张">✕</button></div>').join('')
        : '<span class="ph">暂无图片</span>';
      imgGrid.querySelectorAll('.ri-del').forEach(b => {
        b.onclick = () => { adImgs.splice(Number(b.dataset.i), 1); renderImgGrid(); };
      });
    };
    const syncImgField = () => { if (imgField) imgField.style.display = favEl.checked ? '' : 'none'; };
    favEl.addEventListener('change', syncImgField);
    syncImgField();
    renderImgGrid();
    document.getElementById('ad-img-up').onclick = async () => {
      if (Store.missingCol('records', 'images')) { this.toast('请先到设置页补一次建表 SQL（补 images 列）'); return; }
      this.toast('图片处理中…');
      const added = await this.pickImages();
      if (!added.length) return;
      adImgs = [...adImgs, ...added];
      renderImgGrid();
      this.toast('已添加 ' + added.length + ' 张图片', 'ok');
    };
    document.getElementById('ad-img-link').onclick = async () => {
      const next = await this.promptImageLink(adImgs);
      if (!next) return;
      adImgs = next;
      renderImgGrid();
      this.toast('已添加图片链接', 'ok');
    };
    // 备注 textarea：高度随内容自适应
    const remarkEl = document.getElementById('ad-remark');
    const fitRemark = () => { remarkEl.style.height = 'auto'; remarkEl.style.height = Math.max(64, remarkEl.scrollHeight) + 'px'; };
    remarkEl.addEventListener('input', fitRemark);
    fitRemark();
    // 滚动条：滚动时显示浅灰细线，停止后隐藏
    const bindThinScroll = (elm) => {
      if (!elm) return;
      let tm = null;
      elm.addEventListener('scroll', () => {
        elm.classList.add('mscrolling');
        clearTimeout(tm);
        tm = setTimeout(() => elm.classList.remove('mscrolling'), 900);
      }, { passive: true });
    };
    bindThinScroll(adMask && adMask.querySelector('.modal-body'));
    bindThinScroll(document.getElementById('ad-tagpicker'));
    document.getElementById('ad-save').onclick = async () => {
      const amount = parseFloat(document.getElementById('ad-amt').value);
      if (!amount || amount <= 0) return this.toast('请输入正确金额', 'err');
      const fav = document.getElementById('ad-fav').checked;
      try {
        const row = await Store.insert('records', {
          ledger_id: ledgerId, category: catSel.value, sub: subSel.value, amount,
          note: document.getElementById('ad-note').value.trim(),
          remark: document.getElementById('ad-remark').value.trim(),
          favorite: fav,
          tags: fav ? this.pickedTags('#ad-tagpicker') : [],
          rental: document.getElementById('ad-rental').checked,
          images: adImgs,
          purchase_platform: document.getElementById('ad-platform').value.trim(),
          attribute: document.getElementById('ad-attr').value.trim(),
          rating, date: document.getElementById('ad-date').dataset.date || date, image: null, kind: this.kindOf(ledgerId, catSel.value)
        });
        // 即存即显：把新记录乐观加入内存并局部刷新日历/列表，避免全量重载的秒级延迟
        if (row && row.id) this.state.records.push(row);
        this.touchQuickMru(catSel.value, subSel.value); // 快捷条：最近使用的排最前
        this.refreshLedgerPane();
        if (continuous) {
          // 连续记账：重置表单（保留日期/大类/小类），弹窗不关，可继续记下一笔
          document.getElementById('ad-amt').value = '';
          document.getElementById('ad-note').value = '';
          document.getElementById('ad-remark').value = '';
          fitRemark();
          document.getElementById('ad-platform').value = '';
          document.getElementById('ad-attr').value = '';
          adImgs = [];
          renderImgGrid();
          document.getElementById('ad-fav').checked = false;
          document.getElementById('ad-tags-field').style.display = 'none';
          document.querySelectorAll('#ad-tagpicker input').forEach(i => { i.checked = false; });
          document.getElementById('ad-rental').checked = false;
          rating = 0;
          document.querySelectorAll('#ad-stars button').forEach(x => x.classList.remove('on'));
          document.getElementById('ad-amt').focus();
          this.toast('已保存，可继续记下一笔', 'ok');
          this.loadData(true); // 后台静默同步，不阻塞
          return;
        }
        this.closeModal();
        this.toast('已记账 ' + fmtMoney(amount), 'ok');
        this.loadData(true); // 后台静默同步，不阻塞
      } catch (e) { this.toast(e.message, 'err'); }
    };
  },

  /* ---------- 视图：出租屋（主账本中标记了「出租屋」的记录） ---------- */
  renderRental() {
    const el = document.getElementById('view-rental');
    const lid = this.state.currentLedgerId;
    const scope = this.state.rentalScope || 'month';   // month 本月 / year 本年 / all 总计
    const month = this.state.rentalMonth;
    const curMonth = thisMonth();
    const curYear = String(new Date().getFullYear());
    const rentalRecs = this.recsOf(lid).filter(r => r.rental);

    // 统计范围筛选：本月（可翻月）/ 本年累计 / 全部历史累计
    const scopeRecs = scope === 'all' ? rentalRecs
      : scope === 'year' ? rentalRecs.filter(r => String(r.date || '').slice(0, 4) === curYear)
      : rentalRecs.filter(r => monthOf(r.date) === month);
    // 固定费用始终按所选月份（不随统计范围变化）
    const monthRecs = rentalRecs.filter(r => monthOf(r.date) === month);

    // 收入 / 支出 / 结余（按范围）
    let income = 0, expense = 0;
    scopeRecs.forEach(r => {
      const kind = r.kind || this.kindOf(lid, r.category);
      if (kind === 'income') income += Number(r.amount) || 0; else expense += Number(r.amount) || 0;
    });
    const balance = income - expense;
    const scopeName = scope === 'all' ? '总计' : scope === 'year' ? '本年' : '本月';
    const scopeDesc = scope === 'all' ? '全部历史累计'
      : scope === 'year' ? (curYear + ' 年累计')
      : (month.replace('-', ' 年 ') + ' 月');

    // 固定费用月金额（挂在「出租屋」大类下）
    const fixedBudget = name => {
      const b = this.state.budgets.find(x => x.ledger_id === lid && x.category === RENTAL_CAT && x.sub === name);
      return b ? Number(b.amount) || 0 : 0;
    };
    const fixedTotal = RENTAL_FIXED.reduce((s, n) => s + fixedBudget(n), 0);
    const fixedRows = RENTAL_FIXED.map(name => {
      const limit = fixedBudget(name);
      const generated = monthRecs.some(r => r.sub === name);
      return `
      <div class="budget-row">
        <div class="budget-top">
          <div class="budget-name">${(RENTAL_META[name] || {}).emoji || '•'} ${esc(name)}</div>
          <input class="budget-input" type="number" min="0" step="0.01" value="${limit || ''}" placeholder="月金额" data-fixed="${esc(name)}">
          <span class="badge ${generated ? 'badge-green' : 'badge-gray'}">${generated ? '本月已生成' : '待生成'}</span>
        </div>
      </div>`;
    }).join('');

    // 分类统计（按小类，范围口径）
    const bySub = {};
    scopeRecs.forEach(r => {
      const k = r.sub || '其他';
      bySub[k] = bySub[k] || { amount: 0, count: 0 };
      bySub[k].amount += Number(r.amount) || 0;
      bySub[k].count += 1;
    });
    const subRows = Object.keys(bySub).sort((a, b) => bySub[b].amount - bySub[a].amount);
    const subMax = Math.max(...subRows.map(k => bySub[k].amount), 1);
    const donutItems = subRows.map((k, i) => ({
      label: k, value: bySub[k].amount,
      color: (RENTAL_META[k] || {}).color || PALETTE[i % PALETTE.length]
    }));

    // 趋势：总计=历史按月（本年=12 个月，本月=近 6 个月）
    const trendLabels = [], trendData = [];
    const sumMonth = key => rentalRecs.filter(r => monthOf(r.date) === key).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (scope === 'all') {
      const months = [...new Set(rentalRecs.map(r => monthOf(r.date)).filter(Boolean))].sort().slice(-24);
      months.forEach(k => { trendLabels.push(k.slice(5).replace('-', ' 月')); trendData.push(sumMonth(k)); });
    } else if (scope === 'year') {
      for (let m = 1; m <= 12; m++) {
        trendLabels.push(m + ' 月');
        trendData.push(sumMonth(curYear + '-' + String(m).padStart(2, '0')));
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(month.slice(0, 4), Number(month.slice(5, 7)) - 1 - i, 1);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        trendLabels.push((d.getMonth() + 1) + ' 月');
        trendData.push(sumMonth(key));
      }
    }
    const trendTitle = scope === 'all' ? '历史支出趋势' : scope === 'year' ? '本年支出趋势' : '近 6 个月趋势';

    el.innerHTML = `
      <div class="rental-head">
        <div class="scope-seg" id="rental-scope">
          <button type="button" data-scope="month" class="${scope === 'month' ? 'on' : ''}">本月</button>
          <button type="button" data-scope="year" class="${scope === 'year' ? 'on' : ''}">本年</button>
          <button type="button" data-scope="all" class="${scope === 'all' ? 'on' : ''}">总计</button>
        </div>
        <button class="btn btn-accent" id="rental-add">＋ 记一笔出租屋支出</button>
      </div>
      <div class="grid grid-3" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">${scopeName}支出</div><div class="stat-value expense">${fmtMoney(expense)}</div><div class="stat-foot">${scopeDesc} · ${scopeRecs.length} 笔</div></div>
        <div class="stat-card"><div class="stat-label">记录数</div><div class="stat-value">${scopeRecs.length}</div><div class="stat-foot">${scopeName}出租屋记录</div></div>
        <div class="stat-card"><div class="stat-label">月度固定费用合计</div><div class="stat-value" style="color:var(--accent-deep)">${fmtMoney(fixedTotal)}</div><div class="stat-foot">${RENTAL_FIXED.join(' / ')}</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">固定费用</div><div class="card-sub">设置每月金额，一键生成本月记录</div></div>
          <button class="btn btn-primary" id="gen-fixed">⚡ 一键生成本月记录</button>
        </div>
        ${fixedRows}
      </div>

      <div class="grid grid-2" style="margin-bottom:18px;align-items:stretch">
        <div class="card">
          <div class="card-head">
            <div><div class="card-title">分类统计</div><div class="card-sub">${scopeDesc}各分类占比</div></div>
          </div>
          ${subRows.length ? `
            <div class="rental-stat-grid">
              <div class="chart-box" style="max-width:280px;margin:0 auto"><canvas id="rental-donut" height="240"></canvas></div>
              <div class="mini-bars">
                ${subRows.map(k => {
                  const meta = RENTAL_META[k] || {};
                  return `
                  <div class="mini-bar-row">
                    <div class="mini-bar-top"><span>${meta.emoji || '•'} ${esc(k)} <span style="color:var(--muted)">×${bySub[k].count}</span></span><b>${fmtMoney(bySub[k].amount)}</b></div>
                    <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.max(2, bySub[k].amount / subMax * 100)}%;background:${meta.color || 'var(--accent)'}"></div></div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          ` : `<div class="empty"><p>${scopeName}暂无出租屋支出</p></div>`}
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">${trendTitle}</div><div class="card-sub">出租屋月度支出</div></div></div>
          <div class="chart-box"><canvas id="rental-line" height="180"></canvas></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div class="card-title">出租屋明细</div>
          ${scope === 'month' ? this.monthSwitcherHTML('rentalMonth', month) : `<span style="font-size:12.5px;color:var(--muted)">${scope === 'year' ? curYear + ' 年全部记录' : '全部历史记录'}</span>`}
        </div>
        <div id="rental-recs"></div>
      </div>`;

    // 固定费用金额设置
    el.querySelectorAll('[data-fixed]').forEach(inp => {
      inp.onchange = async () => {
        const name = inp.dataset.fixed;
        const v = parseFloat(inp.value) || 0;
        try {
          const b = this.state.budgets.find(x => x.ledger_id === lid && x.category === RENTAL_CAT && x.sub === name);
          if (b) await Store.update('budgets', b.id, { amount: v });
          else if (v > 0) await Store.insert('budgets', { ledger_id: lid, category: RENTAL_CAT, sub: name, amount: v });
          this.toast(name + ' 月金额已设为 ' + fmtMoney(v, { plain: true }), 'ok');
          await this.loadData();
          this.renderRental();
        } catch (e) { this.toast(e.message, 'err'); }
      };
    });

    // 一键生成
    el.querySelector('#gen-fixed').onclick = async () => {
      const isCur = month === thisMonth();
      const date = isCur ? todayStr() : month + '-01';
      let n = 0;
      for (const name of RENTAL_FIXED) {
        const amt = fixedBudget(name);
        if (amt <= 0) continue;
        if (monthRecs.some(r => r.sub === name)) continue;
        try {
          await Store.insert('records', {
            ledger_id: lid, category: RENTAL_CAT, sub: name, amount: amt,
            note: '本月固定费用', favorite: false, rental: true, rating: 0, date, image: null, kind: 'expense'
          });
          n++;
        } catch (e) { this.toast(e.message, 'err'); }
      }
      this.toast(n ? '已生成 ' + n + ' 条固定费用记录' : '本月固定费用已全部生成', n ? 'ok' : '');
      await this.loadData();
      this.renderRental();
    };

    el.querySelector('#rental-add').onclick = () => {
      const isCur = month === thisMonth();
      this.addRecordModal(lid, isCur ? todayStr() : month + '-01', RENTAL_CAT, null, true);
    };

    // 统计范围切换：本月 / 本年 / 总计
    el.querySelectorAll('#rental-scope [data-scope]').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.scope;
        if (this.state.rentalScope === v) return;
        this.state.rentalScope = v;
        // 切到「本年/总计」时回到当月，保证「记一笔 / 一键生成本月记录」始终是当月语义
        if (v !== 'month') this.state.rentalMonth = thisMonth();
        this.renderRental();
      };
    });

    const recs = el.querySelector('#rental-recs');
    recs.innerHTML = this.recordsListHTML(lid, month, true, scope);
    this.bindRecordsList(recs, lid);
    if (scope === 'month') {
      const sw = recs.closest('.card').querySelector('.card-head');
      this.bindMonthSwitcher(sw, 'rentalMonth', () => this.renderRental());
    }
    this.enhanceSelects(el);

    if (donutItems.length) Charts.donut(el.querySelector('#rental-donut'), donutItems, scopeName + '合计');
    Charts.line(el.querySelector('#rental-line'), trendLabels, [{ name: '出租屋支出', color: '#3B82F6', data: trendData }]);
  },

  /* ---------- 视图：预算设置 ---------- */
  renderBudget() {
    const el = document.getElementById('view-budget');
    const lid = this.state.currentLedgerId;
    const month = thisMonth();
    const rows = [];
    this.catsOf(lid).forEach(c => {
      (c.subs || []).forEach(sub => {
        const b = this.budgetOf(lid, c.name, sub);
        const used = this.monthUsed(lid, c.name, sub, month);
        const limit = b ? Number(b.amount) || 0 : 0;
        const pct = limit > 0 ? used / limit : 0;
        rows.push({ cat: c.name, sub, used, limit, pct, id: b ? b.id : null, kind: c.kind });
      });
    });

    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">月度预算</div><div class="card-sub">为每个小类设置月度限额 · ${esc(this.curLedger() ? this.curLedger().name : '')} · 留空表示不限额</div></div>
        </div>
        <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>大类</th><th>小类</th><th class="num">月度限额</th><th class="num">本月已用</th><th style="width:32%">进度</th></tr></thead>
          <tbody>
            ${rows.map(r => `
            <tr data-bid="${r.id || ''}" data-cat="${esc(r.cat)}" data-sub="${esc(r.sub)}">
              <td>${esc(r.cat)}</td>
              <td>${esc(r.sub)}</td>
              <td class="num"><input class="budget-input" type="number" min="0" step="0.01" value="${r.limit || ''}" placeholder="不限" data-binput></td>
              <td class="num">${fmtMoney(r.used, { plain: true })}</td>
              <td>
                <div class="bar"><div class="bar-fill ${r.pct > 1 ? 'over' : r.pct >= 0.7 ? 'warn' : ''}" style="width:${r.limit ? Math.min(100, r.pct * 100) : 0}%"></div></div>
                <div style="font-size:11px;color:var(--muted);margin-top:3px">${r.limit ? (r.pct > 1 ? '已超支 ' + Math.round((r.pct - 1) * 100) + '%' : '已用 ' + Math.round(r.pct * 100) + '%') : ''}</div>
              </td>
            </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px">该账本暂无分类</td></tr>'}
          </tbody>
        </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px">颜色规则</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)">
          <span><span class="legend-dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#34D399;margin-right:6px"></span>70% 以下 · 绿色正常</span>
          <span><span class="legend-dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#F59E0B;margin-right:6px"></span>70%–100% · 黄色警告</span>
          <span><span class="legend-dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#EF4444;margin-right:6px"></span>超过 100% · 红色超支</span>
        </div>
      </div>`;

    el.querySelectorAll('[data-binput]').forEach(inp => {
      inp.onchange = async () => {
        const tr = inp.closest('tr');
        const cat = tr.dataset.cat, sub = tr.dataset.sub, bid = tr.dataset.bid;
        const v = parseFloat(inp.value) || 0;
        try {
          if (bid) await Store.update('budgets', bid, { amount: v });
          else if (v > 0) await Store.insert('budgets', { ledger_id: lid, category: cat, sub, amount: v });
          this.toast(sub + ' 预算已更新', 'ok');
          await this.loadData();
        } catch (e) { this.toast(e.message, 'err'); }
      };
    });
  },

  /* ---------- 视图：设置 ---------- */
  renderSettings() {
    const el = document.getElementById('view-settings');
    const mode = Store.mode;
    el.innerHTML = `
      <div class="grid grid-2" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">当前账号</div>
          <div class="stat-value" style="font-size:18px">${esc(Store.user ? Store.user.email : '')}</div>
          <div class="stat-foot">${mode === 'supabase' ? '云端模式 · 数据实时同步' : '本地模式 · 数据仅存本浏览器'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">数据概览</div>
          <div class="stat-value" style="font-size:18px">${this.state.records.length} 笔记录</div>
          <div class="stat-foot">${this.state.ledgers.length} 个账本 · ${this.state.categories.length} 个大类 · ${this.state.budgets.length} 项预算</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">云端同步（Supabase）</div><div class="card-sub">填入你的项目 URL 与 anon key 后即可云端同步</div></div>
          <span class="badge ${mode === 'supabase' ? 'badge-green' : 'badge-gray'}">${mode === 'supabase' ? '已连接' : '未连接'}</span>
        </div>
        <div class="grid grid-2">
          <div class="field"><label>Project URL</label><input id="cfg-url" type="text" value="${esc(Store.cfg.url)}" placeholder="https://xxxx.supabase.co"></div>
          <div class="field"><label>anon / publishable key</label><input id="cfg-key" type="text" value="${esc(Store.cfg.key)}" placeholder="sb_publishable_..."></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn btn-primary" id="cfg-save">保存并连接</button>
          <button class="btn btn-ghost" id="cfg-test">测试连接</button>
          <button class="btn btn-ghost" id="cfg-local">切回本地模式</button>
        </div>
        <details style="margin-top:16px">
          <summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--purple)">首次使用？点此执行建表 SQL（含行级安全 RLS）</summary>
          <p style="font-size:12.5px;color:var(--muted);margin:10px 0">共 2 步（你的项目一次只接受单条 SQL）：<br>
            <b>第 1 步</b>：复制下面整段 → Supabase SQL Editor → 粘贴并 Run（无输出即成功）<br>
            <b>第 2 步</b>：点「复制执行命令」→ 新建查询 → 粘贴并 Run，看到 done 即成功</p>
          <div style="position:relative">
            <pre id="sql-block" style="background:#0F1730;color:#D6E0F5;border-radius:12px;padding:16px;font-size:11.5px;line-height:1.6;overflow:auto;max-height:320px">${esc(SQL_SCHEMA)}</pre>
            <button class="btn btn-sm btn-accent" id="sql-copy" style="position:absolute;top:10px;right:10px">复制 SQL</button>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-sm btn-purple" id="sql-copy-run">复制执行命令（第 2 步）</button>
            <code style="font-size:12px;color:var(--muted)">select public.setup_finance_tables();</code>
          </div>
        </details>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px dashed var(--line)">
          <button class="btn btn-ghost" id="data-export">导出数据（JSON）</button>
          <button class="btn btn-ghost" id="data-import">导入数据</button>
          <button class="btn btn-ghost" id="data-dedup">数据去重</button>
          <input type="file" id="import-file" accept=".json" hidden>
          ${mode === 'supabase' ? '<button class="btn btn-purple" id="data-migrate">迁移本地数据到云端</button>' : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">分类管理</div><div class="card-sub">增删改查大类与小类</div></div>
          <select id="cfg-ledger" style="height:36px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff">
            ${this.state.ledgers.map(l => '<option value="' + l.id + '" ' + (l.type === this.state.settingsLedgerType ? 'selected' : '') + '>' + esc(l.name) + '</option>').join('')}
          </select>
        </div>
        <div id="cat-mgr"></div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <input id="new-cat-name" placeholder="新大类名称" style="flex:1;min-width:140px;height:38px;border:1px solid var(--line);border-radius:10px;padding:0 12px;background:#fff">
          <select id="new-cat-kind" style="height:38px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff">
            <option value="expense">支出</option><option value="income">收入</option>
          </select>
          <button class="btn btn-primary" id="add-cat">添加大类</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">快捷模板</div><div class="card-sub">首页快捷按钮</div></div></div>
        <div id="tpl-mgr"></div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <select id="tpl-cat" style="flex:1;min-width:130px;height:38px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff"></select>
          <select id="tpl-sub" style="flex:1;min-width:130px;height:38px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff"></select>
          <button class="btn btn-primary" id="add-tpl">添加模板</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">季节自动切换</div><div class="card-sub">衣裤鞋袜类好物按季节自动切换使用状态</div></div>
          <span class="badge badge-green" id="season-now">当前：夏季</span>
        </div>
        <p class="season-note">系统按当前月份判断季节，自动把「衣裤鞋袜」类、且打了对应季节标签（夏季 / 冬季 / 春秋季）的好物设为<b class="u-using">使用中</b>，其余季节的设为<b class="u-idle">闲置中</b>。仅在「使用中 ↔ 闲置中」之间切换；<b class="u-unused">未使用</b> 与 <b class="u-dropped">已弃用</b>/<b class="u-depleted">已磬用</b> 不受影响。手动改过状态的单件好物，自动切换不再动它。</p>
        <div class="season-grid" id="season-grid"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn btn-primary" id="season-save">保存季节配置</button>
          <button class="btn btn-ghost" id="season-apply">立即应用切换</button>
        </div>
      </div>
`;

    /* --- 云端配置 --- */
    el.querySelector('#cfg-save').onclick = async () => {
      const url = el.querySelector('#cfg-url').value.trim();
      const key = el.querySelector('#cfg-key').value.trim();
      if (!url || !key) return this.toast('请填写完整的 URL 和 key', 'err');
      const mode2 = Store.saveCfg({ url, key });
      if (mode2 === 'supabase') { this.toast('已连接 Supabase', 'ok'); location.reload(); }
      else this.toast('配置已保存，但 Supabase SDK 未加载（检查网络）', 'err');
    };
    el.querySelector('#cfg-test').onclick = async () => {
      const url = el.querySelector('#cfg-url').value.trim();
      const key = el.querySelector('#cfg-key').value.trim();
      if (url !== Store.cfg.url || key !== Store.cfg.key) Store.saveCfg({ url, key });
      const r = await Store.testConnection();
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      this.renderChrome();
    };
    el.querySelector('#cfg-local').onclick = async () => {
      const ok = await this.confirmDialog('切回本地模式', '将断开 Supabase，数据只保存在本浏览器。确定吗？');
      if (!ok) return;
      Store.clearCfg();
      location.reload();
    };
    el.querySelector('#sql-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(SQL_SCHEMA); this.toast('第 1 步 SQL 已复制，粘贴并 Run 后再执行第 2 步', 'ok'); }
      catch (e) { this.toast('复制失败，请手动选择复制', 'err'); }
    };
    el.querySelector('#sql-copy-run').onclick = async () => {
      try { await navigator.clipboard.writeText('select public.setup_finance_tables();'); this.toast('执行命令已复制，粘贴并 Run 即可', 'ok'); }
      catch (e) { this.toast('复制失败，请手动选择复制', 'err'); }
    };
    el.querySelector('#data-export').onclick = async () => {
      try { const d = await Store.exportAll(); downloadJSON(d, '财务管家数据备份-' + todayStr() + '.json'); this.toast('已导出', 'ok'); }
      catch (e) { this.toast(e.message, 'err'); }
    };
    const fileInp = el.querySelector('#import-file');
    el.querySelector('#data-import').onclick = () => fileInp.click();
    fileInp.onchange = async () => {
      try {
        const data = await readJSONFile(fileInp);
        const kind = (typeof NotionImport !== 'undefined' && NotionImport.detect(data)) || null;
        if (kind === 'notion') {
          // Notion 账本导出：去重 + 补齐分类 + 分批写入（与导入页同一套逻辑）
          const plan = await NotionImport.plan(data);
          const ok = await this.confirmDialog('导入 Notion 数据',
            '将与云端现有记录比对去重：预计新增 ' + plan.toInsert.length + ' 条' +
            (plan.dupCount ? '（跳过重复 ' + plan.dupCount + ' 条）' : '') +
            (plan.catPlan.length ? '，补齐 ' + plan.catPlan.length + ' 个分类的小类' : '') + '。确定导入吗？');
          if (!ok) return;
          const ov = document.createElement('div');
          ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:200';
          ov.innerHTML = '<div style="background:#fff;border-radius:14px;padding:22px 26px;min-width:250px;text-align:center;box-shadow:0 12px 40px rgba(15,23,42,.18)">' +
            '<div style="font-weight:800;margin-bottom:8px">正在导入 Notion 数据</div>' +
            '<div class="imp-pct" style="font-size:13px;color:var(--muted)">准备中…</div>' +
            '<div style="font-size:11.5px;color:#F97316;margin-top:10px">导入期间请勿关闭或刷新页面</div></div>';
          document.getElementById('modal-root').appendChild(ov);
          const pct = ov.querySelector('.imp-pct');
          try {
            const r = await NotionImport.run(data, plan, (done, total) => { pct.textContent = done + ' / ' + total; });
            this.toast('导入完成：新增 ' + r.added + ' 条' + (r.failed ? '，失败 ' + r.failed + ' 条' : ''), r.failed ? 'err' : 'ok');
          } finally { ov.remove(); }
          await this.loadData();
          return;
        }
        if (kind === 'backup') {
          const ok = await this.confirmDialog('导入数据', '导入将追加数据到当前模式（可能产生重复记录），确定继续吗？');
          if (!ok) return;
          await Store.importAll(data, false);
          this.toast('导入完成', 'ok');
          await this.loadData();
          return;
        }
        this.toast('文件格式无法识别（支持 Notion 导出 JSON 或本 App 的数据备份）', 'err');
      } catch (e) { this.toast(e.message, 'err'); }
      fileInp.value = '';
    };
    const mig = el.querySelector('#data-migrate');
    if (mig) mig.onclick = async () => {
      const email = Store.user ? Store.user.email : '';
      const local = JSON.parse(localStorage.getItem('fin_db_' + email) || 'null');
      if (!local) return this.toast('没有找到本地数据', 'err');
      const ok = await this.confirmDialog('迁移到云端', '将把本浏览器的本地数据（已存在云端的记录会跳过）迁移到 Supabase，确定吗？');
      if (!ok) return;
      try {
        const exist = await Promise.all(['ledgers', 'categories', 'records', 'budgets', 'templates'].map(t => Store.list(t)));
        const existIds = new Set(exist.flat().map(r => r.id));
        let n = 0;
        for (const table of ['ledgers', 'categories', 'records', 'budgets', 'templates']) {
          for (const r of (local[table] || [])) {
            if (existIds.has(r.id)) continue;
            const row = { ...r }; delete row.user_id; delete row.created_at;
            try { await Store.insert(table, row); n++; } catch (e2) { console.warn(e2); }
          }
        }
        this.toast('已迁移 ' + n + ' 条数据', 'ok');
        await this.loadData();
      } catch (e) { this.toast(e.message, 'err'); }
    };

    /* --- 数据去重：同账本下 日期+类型+大类+小类+金额+备注 全同视为重复，
           每组保留一条（优先有收藏/评分的，其次最早写入的），其余批量删除 --- */
    const dedupBtn = el.querySelector('#data-dedup');
    if (dedupBtn) dedupBtn.onclick = async () => {
      try {
        const recs = this.state.records || [];
        const key = r => [r.ledger_id || '', r.date, r.kind || 'expense', r.category, r.sub || '', Number(r.amount).toFixed(2), r.note || ''].join('|');
        const groups = new Map();
        for (const r of recs) {
          const k = key(r);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(r);
        }
        let dupGroups = 0;
        const toDelete = [];
        for (const [, g] of groups) {
          if (g.length < 2) continue;
          dupGroups++;
          g.sort((a, b) => {
            const fa = (a.favorite ? 2 : 0) + ((a.rating || 0) > 0 ? 1 : 0);
            const fb = (b.favorite ? 2 : 0) + ((b.rating || 0) > 0 ? 1 : 0);
            if (fa !== fb) return fb - fa;
            return String(a.created_at || '').localeCompare(String(b.created_at || ''));
          });
          for (let i = 1; i < g.length; i++) toDelete.push(g[i].id);
        }
        if (!toDelete.length) { this.toast('没有重复记录'); return; }
        const ok = await this.confirmDialog('数据去重',
          '发现 ' + dupGroups + ' 组完全重复的记录（日期、大类、小类、金额、备注全部相同），每组保留一条，将删除 ' + toDelete.length + ' 条。删除后无法恢复，确定吗？');
        if (!ok) return;
        let n = 0;
        for (let i = 0; i < toDelete.length; i += 100) n += await Store.removeMany('records', toDelete.slice(i, i + 100));
        this.toast('已删除 ' + n + ' 条重复记录', 'ok');
        await this.loadData();
      } catch (e) { this.toast(e.message, 'err'); }
    };

    /* --- 季节自动切换配置 --- */
    {
      const grid = el.querySelector('#season-grid');
      const nowEl = el.querySelector('#season-now');
      const refreshNow = () => { if (nowEl) nowEl.textContent = '当前：' + this.currentSeason(); };
      if (grid) {
        const cfg = this.loadSeasonConfig();
        refreshNow();
        grid.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m =>
          '<div class="season-cell"><span class="sc-m">' + m + '月</span>' +
          '<select class="sc-sel" data-m="' + m + '">' +
          SEASON_TAGS.map(s => '<option value="' + s + '"' + (cfg[m] === s ? ' selected' : '') + '>' + s + '</option>').join('') +
          '</select></div>').join('');
        this.enhanceSelects(grid);
        const saveBtn = el.querySelector('#season-save');
        if (saveBtn) saveBtn.onclick = () => {
          const cfg2 = {};
          grid.querySelectorAll('.sc-sel').forEach(s => { cfg2[Number(s.dataset.m)] = s.value; });
          this.saveSeasonConfig(cfg2);
          refreshNow();
          this.toast('季节配置已保存（' + this.currentSeason() + '）', 'ok');
        };
        const applyBtn = el.querySelector('#season-apply');
        if (applyBtn) applyBtn.onclick = async () => {
          const n = await this.applySeasonStatus();
          this.toast(n ? ('已切换 ' + n + ' 件好物状态') : '没有需要切换的好物', n ? 'ok' : '');
        };
      }
    }

    /* --- 分类管理 --- */
    const ledgerSel = el.querySelector('#cfg-ledger');
    const renderCatMgr = () => {
      const lid = ledgerSel.value;
      const cats = this.catsOf(lid);
      el.querySelector('#cat-mgr').innerHTML = cats.map(c => `
        <div class="budget-row" data-catid="${c.id}">
          <div class="budget-top">
            <div class="budget-name">${esc(c.name)} <span class="badge ${c.kind === 'income' ? 'badge-green' : 'badge-blue'}">${c.kind === 'income' ? '收入' : '支出'}</span></div>
            <button class="btn btn-ghost btn-sm" data-ren>重命名</button>
            <button class="btn btn-danger btn-sm" data-delcat>删除大类</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center">
            ${(c.subs || []).map(s => '<span class="chip" style="cursor:default">' + esc(s) + ' <button data-delsub="' + esc(s) + '" style="color:var(--danger);font-weight:800">×</button></span>').join('')}
            <input placeholder="+ 小类名称" data-newsub style="width:120px;height:30px;border:1.5px dashed var(--line);border-radius:999px;padding:0 12px;background:transparent;outline:none;font-size:12.5px">
          </div>
        </div>`).join('') || '<div class="empty"><p>暂无大类，请在下方添加</p></div>';

      el.querySelectorAll('#cat-mgr [data-catid]').forEach(row => {
        const cid = row.dataset.catid;
        const cat = this.state.categories.find(c => c.id === cid);
        row.querySelector('[data-ren]').onclick = async () => {
          const v = await this.promptDialog('重命名大类', '请输入新名称', cat.name);
          if (!v) return;
          await Store.update('categories', cid, { name: v });
          // 同步更新该大类下记录的 category 字段
          for (const r of this.state.records.filter(r => r.ledger_id === cat.ledger_id && r.category === cat.name)) {
            await Store.update('records', r.id, { category: v });
          }
          this.toast('已重命名', 'ok');
          await this.loadData();
        };
        row.querySelector('[data-delcat]').onclick = async () => {
          const ok = await this.confirmDialog('删除大类', '删除「' + cat.name + '」及其 ' + (cat.subs || []).length + ' 个小类，历史记录会保留但不再显示该分类。确定吗？');
          if (!ok) return;
          await Store.remove('categories', cid);
          this.toast('已删除');
          await this.loadData();
          renderCatMgr();
        };
        row.querySelectorAll('[data-delsub]').forEach(b => {
          b.onclick = async () => {
            const s = b.dataset.delsub;
            const subs = (cat.subs || []).filter(x => x !== s);
            await Store.update('categories', cid, { subs });
            this.toast('已删除小类 ' + s);
            await this.loadData();
            renderCatMgr();
          };
        });
        const ns = row.querySelector('[data-newsub]');
        ns.onkeydown = async e => {
          if (e.key !== 'Enter') return;
          const v = ns.value.trim();
          if (!v) return;
          if ((cat.subs || []).includes(v)) return this.toast('小类已存在', 'err');
          await Store.update('categories', cid, { subs: [...(cat.subs || []), v] });
          this.toast('已添加小类 ' + v, 'ok');
          await this.loadData();
          renderCatMgr();
        };
      });
    };
    ledgerSel.onchange = () => { this.state.settingsLedgerType = this.state.ledgers.find(l => l.id === ledgerSel.value).type; renderCatMgr(); this.renderTplMgr(el); };
    renderCatMgr();

    /* --- 模板管理 --- */
    const editTpl = t => {
      const m = this.openModal(`
        <div class="modal-title">编辑快捷模板<button class="icon-btn" style="display:flex" data-close>✕</button></div>
        <p style="font-size:12.5px;color:var(--muted);margin:-6px 0 12px">${esc(t.category)} · ${esc(t.sub)}</p>
        <div class="field"><label>简称（首页快捷按钮显示）</label><input id="tpl-lab" type="text" maxlength="4" value="${esc(t.label || tplShort(t))}" placeholder="如：咖啡"></div>
        <div class="field"><label>emoji</label><input id="tpl-emo" type="text" maxlength="4" value="${esc(t.emoji || tplEmoji(t))}" placeholder="☕"></div>
        <div class="modal-acts">
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-primary" data-save>保存</button>
        </div>`);
      const lab = m.querySelector('#tpl-lab'), emo = m.querySelector('#tpl-emo');
      lab.focus(); lab.select();
      m.querySelector('[data-save]').onclick = async () => {
        const label = lab.value.trim(), emoji = emo.value.trim();
        this.closeModal();
        await Store.update('templates', t.id, { label, emoji });
        this.toast('模板已更新', 'ok');
        await this.loadData();
        renderTplMgr();
      };
    };
    const renderTplMgr = () => {
      const lid = ledgerSel.value;
      const tpls = this.state.templates.filter(t => t.ledger_id === lid);
      el.querySelector('#tpl-mgr').innerHTML = tpls.length ? tpls.map(t =>
        '<span class="chip purple" style="cursor:pointer" data-tplchip="' + t.id + '" title="点击改简称 / emoji">' +
          tplEmoji(t) + ' ' + esc(t.category) + ' · ' + esc(t.sub) +
          (t.label ? ' <span style="opacity:.7">（' + esc(t.label) + '）</span>' : '') +
          ' <button data-deltpl="' + t.id + '" style="color:var(--danger);font-weight:800">×</button>' +
        '</span>'
      ).join('') : '<span style="font-size:12.5px;color:var(--muted)">暂无模板</span>';
      el.querySelectorAll('[data-tplchip]').forEach(c => {
        c.onclick = e => {
          if (e.target.closest('[data-deltpl]')) return;
          const t = this.state.templates.find(x => x.id === c.dataset.tplchip);
          if (t) editTpl(t);
        };
      });
      el.querySelectorAll('[data-deltpl]').forEach(b => {
        b.onclick = async () => {
          await Store.remove('templates', b.dataset.deltpl);
          this.toast('已删除模板');
          await this.loadData();
          renderTplMgr();
        };
      });
      const cats = this.catsOf(lid);
      const cSel = el.querySelector('#tpl-cat'), sSel = el.querySelector('#tpl-sub');
      cSel.innerHTML = cats.map(c => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
      this.enhanceSelects(cSel);
      const fillSubs = () => {
        const c = this.catByName(lid, cSel.value);
        sSel.innerHTML = ((c && c.subs) || []).map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
        this.enhanceSelects(sSel);
      };
      fillSubs();
      cSel.onchange = fillSubs;
      el.querySelector('#add-tpl').onclick = async () => {
        const cat = cSel.value, sub = sSel.value;
        if (!cat || !sub) return;
        if (tpls.some(t => t.category === cat && t.sub === sub)) return this.toast('模板已存在', 'err');
        await Store.insert('templates', { ledger_id: lid, category: cat, sub });
        this.toast('模板已添加', 'ok');
        await this.loadData();
        renderTplMgr();
      };
    };
    this.renderTplMgr = renderTplMgr;
    renderTplMgr();

    /* --- 添加大类 --- */
    el.querySelector('#add-cat').onclick = async () => {
      const name = el.querySelector('#new-cat-name').value.trim();
      const kind = el.querySelector('#new-cat-kind').value;
      if (!name) return this.toast('请输入大类名称', 'err');
      if (this.catByName(ledgerSel.value, name)) return this.toast('大类已存在', 'err');
      await Store.insert('categories', { ledger_id: ledgerSel.value, name, kind, subs: [] });
      el.querySelector('#new-cat-name').value = '';
      this.toast('已添加大类 ' + name, 'ok');
      await this.loadData();
      renderCatMgr();
    };
    this.enhanceSelects(el);
  },

  /* ---------- 编辑记录弹窗 ---------- */
  editRecord(rid, ledgerId) {
    const r = this.state.records.find(x => x.id === rid);
    if (!r) return;
    const cats = this.catsOf(ledgerId);
    let rating = r.rating || 0;
    const edMask = this.openModal(`
      <div class="modal-title">编辑记录<button class="icon-btn" style="display:flex" data-close>✕</button></div>
      <div class="modal-body">
      <div class="field-row">
        <div class="field"><label>大类</label><select id="ed-cat">${cats.map(c => '<option value="' + esc(c.name) + '" ' + (c.name === r.category ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('')}</select></div>
        <div class="field"><label>小类</label><select id="ed-sub"></select></div>
        <div class="field"><label>日期</label><input id="ed-date" class="cal-input" readonly placeholder="选择日期" value="${esc(r.date)}" data-date="${esc(r.date)}"></div>
      </div>
      <div class="field"><label>金额（元）</label><input id="ed-amt" class="amt-input" type="number" min="0" step="0.01" value="${(Number(r.amount) || 0).toFixed(2)}"></div>
      <div class="field"><label>评分</label><div class="stars" id="ed-stars">${[1, 2, 3, 4, 5].map(v => '<button type="button" data-v="' + v + '" class="' + (v <= rating ? 'on' : '') + '">★</button>').join('')}</div></div>
      <div class="field"><label>描述</label><input id="ed-note" type="text" value="${esc(r.note || '')}"></div>
      <div class="field"><label>备注</label><textarea id="ed-remark" rows="2">${esc(r.remark || '')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>购买平台</label><input id="ed-platform" type="text" value="${esc(r.purchase_platform || '')}" placeholder="如 淘宝 / 京东"></div>
        <div class="field"><label>属性</label><input id="ed-attr" type="text" value="${esc(r.attribute || '')}" placeholder="如 黑色 128G"></div>
      </div>
      <div class="field"><label>标记</label>
        <label class="fav-check"><input type="checkbox" id="ed-rental" ${r.rental ? 'checked' : ''}><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>归入出租屋账本</label>
      </div>
      <div class="field"><label>心仪物品</label>
        <label class="fav-check"><input type="checkbox" id="ed-fav" ${r.favorite ? 'checked' : ''}><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>收入好物仓库</label>
      </div>
      <div class="field" id="ed-tags-field" style="display:none"><label>好物标签（可多选）</label>
        <div class="tag-picker" id="ed-tagpicker">${this.goodsTagPickerHTML()}</div>
      </div>
      <div class="field" id="ed-img-field" style="display:none"><label>图片（可多张）</label>
        <div class="rec-img-grid" id="ed-img-grid"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-ghost btn-sm" id="ed-img-up" type="button">上传图片</button>
          <button class="btn btn-ghost btn-sm" id="ed-img-link" type="button">图片链接</button>
        </div>
      </div>
      </div>
      <div class="modal-foot">
        <div class="modal-acts">
          <button class="btn btn-danger" id="ed-del" style="margin-right:auto">删除</button>
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-primary" id="ed-save">保存</button>
        </div>
      </div>
    `, false, 'edit-modal', 'form-mask');

    const catSel = document.getElementById('ed-cat'), subSel = document.getElementById('ed-sub');
    const fillSubs = (keep) => {
      const c = this.catByName(ledgerId, catSel.value);
      subSel.innerHTML = ((c && c.subs) || []).map(s => '<option value="' + esc(s) + '" ' + (s === keep ? 'selected' : '') + '>' + esc(s) + '</option>').join('');
      this.enhanceSelects(subSel);
    };
    fillSubs(r.sub);
    catSel.onchange = () => fillSubs();
    this.enhanceSelects(document.getElementById('modal-root'));
    // 好物标签：回显已选 + 勾选仓库时显示面板/图片
    const favEl = document.getElementById('ed-fav');
    recTags(r).forEach(t => {
      const box = document.querySelector('#ed-tagpicker input[value="' + t.replace(/"/g, '\\"') + '"]');
      if (box) box.checked = true;
    });
    this.bindFavTags(favEl, document.getElementById('ed-tags-field'), '#ed-tagpicker');
    const imgField = document.getElementById('ed-img-field');
    const imgGrid = document.getElementById('ed-img-grid');
    const imgUp = document.getElementById('ed-img-up');
    let edImgs = this.recImages(r);
    const renderImgGrid = () => {
      imgGrid.innerHTML = edImgs.length
        ? edImgs.map((src, i) => '<div class="ri-cell"><img src="' + esc(src) + '" alt=""><button type="button" class="ri-del" data-i="' + i + '" title="删除这张">✕</button></div>').join('')
        : '<span class="ph">暂无图片</span>';
      imgGrid.querySelectorAll('.ri-del').forEach(b => {
        b.onclick = async () => {
          if (Store.missingCol('records', 'images')) { this.toast('请先到设置页补一次建表 SQL（补 images 列）'); return; }
          const i = Number(b.dataset.i);
          const next = edImgs.filter((_, k) => k !== i);
          const ok = await Store.update('records', rid, { images: next });
          if (ok === false) { this.toast('删除失败，请重试'); return; }
          edImgs = next;
          r.images = next;
          renderImgGrid();
          this.toast('图片已删除', 'ok');
        };
      });
    };
    const syncImgField = () => { if (imgField) imgField.style.display = favEl.checked ? '' : 'none'; };
    favEl.addEventListener('change', syncImgField);
    syncImgField();
    renderImgGrid();
    imgUp.onclick = async () => {
      if (Store.missingCol('records', 'images')) { this.toast('请先到设置页补一次建表 SQL（补 images 列）'); return; }
      this.toast('图片处理中…');
      const added = await this.pickImages();
      if (!added.length) return;
      const next = [...edImgs, ...added];
      const ok = await Store.update('records', rid, { images: next });
      if (ok === false) { this.toast('图片保存失败，请重试'); return; }
      edImgs = next;
      r.images = next;
      renderImgGrid();
      this.toast('已添加 ' + added.length + ' 张图片', 'ok');
    };
    const edDate = document.getElementById('ed-date');
    edDate.onclick = () => this.openCalendar(edDate);
    // 备注 textarea：高度随内容自适应
    const remarkEl = document.getElementById('ed-remark');
    const fitRemark = () => { remarkEl.style.height = 'auto'; remarkEl.style.height = Math.max(64, remarkEl.scrollHeight) + 'px'; };
    remarkEl.addEventListener('input', fitRemark);
    fitRemark();
    // 滚动条：滚动时显示浅灰细线，停止后隐藏（弹窗主滚动条 + 好物标签框）
    const bindThinScroll = (elm) => {
      if (!elm) return;
      let tm = null;
      elm.addEventListener('scroll', () => {
        elm.classList.add('mscrolling');
        clearTimeout(tm);
        tm = setTimeout(() => elm.classList.remove('mscrolling'), 900);
      }, { passive: true });
    };
    bindThinScroll(edMask && edMask.querySelector('.modal-body'));
    bindThinScroll(document.getElementById('ed-tagpicker'));
    document.getElementById('ed-img-link').onclick = () => {
      this.addImageLink(rid, edImgs, next => { edImgs = next; r.images = next; renderImgGrid(); });
    };
    document.querySelectorAll('#ed-stars button').forEach(b => {
      b.onclick = () => {
        const v = Number(b.dataset.v);
        rating = rating === v ? 0 : v;
        document.querySelectorAll('#ed-stars button').forEach(x => x.classList.toggle('on', Number(x.dataset.v) <= rating));
      };
    });
    document.getElementById('ed-del').onclick = async () => {
      const ok = await this.confirmDialog('删除记录', '确定删除这笔账单吗？删除后不可恢复。');
      if (!ok) return; // 取消：底层编辑窗原样保持（栈式弹窗，无需重开）
      try {
        await Store.remove('records', rid);
        this.closeModal(); // 关掉底层编辑窗（确认框已被 confirmDialog 关闭）
        this.toast('已删除', 'ok');
        await this.loadData();
      } catch (e) { this.toast(e.message, 'err'); }
    };
    document.getElementById('ed-save').onclick = async () => {
      const amount = parseFloat(document.getElementById('ed-amt').value);
      if (!amount || amount <= 0) return this.toast('请输入正确金额', 'err');
      const fav = document.getElementById('ed-fav').checked;
      const patch = {
        category: catSel.value, sub: subSel.value, amount,
        date: document.getElementById('ed-date').dataset.date || r.date,
        note: document.getElementById('ed-note').value.trim(),
        remark: document.getElementById('ed-remark').value.trim(),
        favorite: fav,
        tags: fav ? this.pickedTags('#ed-tagpicker') : [],
        rental: document.getElementById('ed-rental').checked,
        images: edImgs,
        rating, kind: this.kindOf(ledgerId, catSel.value),
        purchase_platform: document.getElementById('ed-platform').value.trim(),
        attribute: document.getElementById('ed-attr').value.trim()
      };
      try {
        await Store.update('records', rid, patch);
        this.touchQuickMru(catSel.value, subSel.value); // 快捷条：最近使用的排最前
        const rec = this.state.records.find(x => x.id === rid);
        if (rec) Object.assign(rec, patch);
        this.refreshLedgerPane(); // 即时刷新日历/列表
        this.closeModal();
        this.toast('已保存修改', 'ok');
        this.loadData(true); // 后台静默同步，不阻塞
      } catch (e) { this.toast(e.message, 'err'); }
    };
  },

  /* ---------- 自定义日历（日 / 月 / 年 三级联动，替代浏览器原生日期控件） ---------- */
  openCalendar(inp, mode) {
    mode = mode || inp.dataset.calMode || 'day';
    if (this._cal && this._cal.inp === inp) { this.closeCalendar(); return; }
    this.closeCalendar();
    const now = new Date();
    const c = {
      inp: inp, mode: mode,
      view: mode === 'day' ? 'day' : (mode === 'month' ? 'month' : 'year'),
      y: now.getFullYear(), m: now.getMonth() + 1,
      selY: now.getFullYear(), selM: now.getMonth() + 1, selD: now.getDate(),
      yBase: 2000
    };
    let raw = '';
    if (mode === 'day') raw = String(inp.dataset.date || '').trim();
    else if (mode === 'month') raw = String(inp.dataset.month || '').trim();
    else raw = String(inp.dataset.year || '').trim();
    if (!raw && inp.value) raw = String(inp.value).trim();
    const p = raw.split('-');
    const py = parseInt(p[0], 10), pm = parseInt(p[1], 10), pd = parseInt(p[2], 10);
    if (py) { c.selY = py; c.y = py; }
    if (pm) { c.selM = pm; c.m = pm; }
    if (pd) c.selD = pd;
    c.yBase = 2000 + Math.floor((c.y - 2000) / 12) * 12;
    this._cal = c;
    const pop = document.createElement('div');
    pop.className = 'cal-pop';
    pop.id = 'cal-pop';
    document.body.appendChild(pop);
    this._renderCal();
    this._positionCal();

    this._calOutside = (e) => {
      if (!pop.contains(e.target) && e.target !== inp) this.closeCalendar();
    };
    this._calKey = (e) => { if (e.key === 'Escape') this.closeCalendar(); };
    this._calRepos = () => { if (this._cal) this._positionCal(); };
    setTimeout(() => {
      document.addEventListener('mousedown', this._calOutside, true);
      document.addEventListener('keydown', this._calKey, true);
      window.addEventListener('resize', this._calRepos);
      window.addEventListener('scroll', this._calRepos, true);
    }, 0);
  },

  _positionCal() {
    const pop = document.getElementById('cal-pop');
    if (!pop || !this._cal) return;
    const r = this._cal.inp.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  },

  closeCalendar() {
    const pop = document.getElementById('cal-pop');
    if (pop) pop.remove();
    if (this._calOutside) { document.removeEventListener('mousedown', this._calOutside, true); this._calOutside = null; }
    if (this._calKey) { document.removeEventListener('keydown', this._calKey, true); this._calKey = null; }
    if (this._calRepos) { window.removeEventListener('resize', this._calRepos); window.removeEventListener('scroll', this._calRepos, true); this._calRepos = null; }
    this._cal = null;
  },

  _calCommit(kind, val) {
    const inp = this._cal.inp;
    if (kind === 'day') { inp.dataset.date = val; inp.value = val; }
    else if (kind === 'month') { inp.dataset.month = val; inp.value = val; }
    else { inp.dataset.year = val; inp.value = val; }
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    this.closeCalendar();
  },

  _renderCal() {
    const pop = document.getElementById('cal-pop');
    if (!pop || !this._cal) return;
    const cal = this._cal;
    const today = todayStr();
    const pad = n => String(n).padStart(2, '0');
    const mkDate = (yy, mm, dd) => {
      const dt = new Date(yy, mm - 1, dd);
      return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
    };
    const chev = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      (d < 0 ? '<path d="m15 5-7 7 7 7"/>' : '<path d="m9 5 7 7-7 7"/>') + '</svg>';

    let head = '', body = '';
    if (cal.view === 'day') {
      head = '<button type="button" class="cal-nav" data-nav="-1">' + chev(-1) + '</button>' +
        '<button type="button" class="cal-title" data-goto="month">' + cal.y + ' 年 ' + cal.m + ' 月</button>' +
        '<button type="button" class="cal-nav" data-nav="1">' + chev(1) + '</button>';
      const startDow = (new Date(cal.y, cal.m - 1, 1).getDay() + 6) % 7; // 周一为一周开始
      const dim = new Date(cal.y, cal.m, 0).getDate();
      const prevDim = new Date(cal.y, cal.m - 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = i - startDow + 1;
        if (d < 1) cells.push({ d: prevDim + d, out: true, key: mkDate(cal.y, cal.m - 1, prevDim + d) });
        else if (d > dim) cells.push({ d: d - dim, out: true, key: mkDate(cal.y, cal.m + 1, d - dim) });
        else cells.push({ d, out: false, key: mkDate(cal.y, cal.m, d) });
      }
      const selKey = mkDate(cal.selY, cal.selM, cal.selD);
      body = '<div class="cal-grid">' +
        ['一', '二', '三', '四', '五', '六', '日'].map(w => '<div class="cal-wd">' + w + '</div>').join('') +
        cells.map(c => '<button type="button" class="cal-cell' + (c.out ? ' out' : '') + (c.key === today ? ' today' : '') + (c.key === selKey ? ' sel' : '') + '" data-key="' + c.key + '">' + c.d + '</button>').join('') +
        '</div>' +
        '<div class="cal-foot"><button type="button" class="cal-today-btn" data-quick="0">今天</button><button type="button" class="cal-today-btn" data-quick="1">昨天</button><button type="button" class="cal-today-btn" data-quick="2">前天</button></div>';
    } else if (cal.view === 'month') {
      head = '<button type="button" class="cal-nav" data-nav="-1">' + chev(-1) + '</button>' +
        '<button type="button" class="cal-title" data-goto="year">' + cal.y + ' 年</button>' +
        '<button type="button" class="cal-nav" data-nav="1">' + chev(1) + '</button>';
      let cells = '';
      for (let i = 1; i <= 12; i++) {
        const on = (cal.selY === cal.y && cal.selM === i);
        cells += '<button type="button" class="cal-cell cal-mcell' + (on ? ' sel' : '') + '" data-mon="' + i + '">' + i + ' 月</button>';
      }
      body = '<div class="cal-mgrid">' + cells + '</div>' +
        '<div class="cal-foot"><button type="button" class="cal-today-btn" data-gomon="1">本月</button></div>';
    } else {
      head = '<button type="button" class="cal-nav" data-nav="-1">' + chev(-1) + '</button>' +
        '<div class="cal-title cal-title-static">' + cal.yBase + ' - ' + (cal.yBase + 11) + '</div>' +
        '<button type="button" class="cal-nav" data-nav="1">' + chev(1) + '</button>';
      let cells = '';
      for (let i = 0; i < 12; i++) {
        const yy = cal.yBase + i;
        const on = (cal.selY === yy);
        cells += '<button type="button" class="cal-cell cal-ycell' + (on ? ' sel' : '') + '" data-year="' + yy + '">' + yy + '</button>';
      }
      body = '<div class="cal-ygrid">' + cells + '</div>' +
        '<div class="cal-foot"><button type="button" class="cal-today-btn" data-goyear="1">今年</button></div>';
    }

    pop.innerHTML = '<div class="cal-card"><div class="cal-head">' + head + '</div>' + body + '</div>';

    // 左右箭头：日视图切月 / 月视图切年 / 年视图切年段
    pop.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => {
        const d = Number(b.dataset.nav);
        const c = this._cal;
        if (c.view === 'day') {
          const dt = new Date(c.y, c.m - 1 + d, 1);
          c.y = dt.getFullYear();
          c.m = dt.getMonth() + 1;
        } else if (c.view === 'month') {
          c.y += d;
        } else {
          c.yBase += d * 12;
          c.y = c.yBase;
        }
        this._renderCal();
      };
    });
    // 标题联动：日 → 月 → 年
    pop.querySelectorAll('[data-goto]').forEach(b => {
      b.onclick = () => {
        this._cal.view = b.dataset.goto;
        this._renderCal();
      };
    });
    // 选日
    pop.querySelectorAll('[data-key]').forEach(c => {
      c.onclick = () => { this._calCommit('day', c.dataset.key); };
    });
    // 选月
    pop.querySelectorAll('[data-mon]').forEach(c => {
      c.onclick = () => {
        const mm = Number(c.dataset.mon);
        const cc = this._cal;
        if (cc.mode === 'month') { this._calCommit('month', cc.y + '-' + pad(mm)); return; }
        cc.selY = cc.y; cc.selM = mm; cc.m = mm;
        cc.view = 'day';
        this._renderCal();
      };
    });
    // 选年
    pop.querySelectorAll('[data-year]').forEach(c => {
      c.onclick = () => {
        const yy = Number(c.dataset.year);
        const cc = this._cal;
        if (cc.mode === 'year') { this._calCommit('year', String(yy)); return; }
        cc.selY = yy; cc.y = yy;
        cc.view = 'month';
        this._renderCal();
      };
    });
    // 快捷选项：今天 / 昨天 / 前天（方便补记）
    pop.querySelectorAll('[data-quick]').forEach(b => {
      b.onclick = () => {
        const d = new Date();
        d.setDate(d.getDate() - Number(b.dataset.quick));
        this._calCommit('day', d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
      };
    });
    // 本月
    pop.querySelectorAll('[data-gomon]').forEach(b => {
      b.onclick = () => {
        const cc = this._cal;
        const now = new Date();
        if (cc.mode === 'month') { this._calCommit('month', now.getFullYear() + '-' + pad(now.getMonth() + 1)); return; }
        cc.selY = now.getFullYear(); cc.selM = now.getMonth() + 1;
        cc.y = cc.selY; cc.m = cc.selM; cc.view = 'day';
        this._renderCal();
      };
    });
    // 今年
    pop.querySelectorAll('[data-goyear]').forEach(b => {
      b.onclick = () => {
        const cc = this._cal;
        const now = new Date().getFullYear();
        if (cc.mode === 'year') { this._calCommit('year', String(now)); return; }
        cc.selY = now; cc.y = now; cc.view = 'month';
        this._renderCal();
      };
    });
  },

  /* ---------- 账单卡片右键菜单（删除） ---------- */
  openRecMenu(x, y, rid) {
    this.closeRecMenu();
    const r = this.state.records.find(v => v.id === rid);
    if (!r) return;
    const menu = document.createElement('div');
    menu.className = 'rec-menu';
    menu.id = 'rec-menu';
    menu.innerHTML = '<button type="button" class="rec-menu-item danger" data-act="del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>删除该账单</button>';
    document.body.appendChild(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + 'px';
    menu.querySelector('[data-act="del"]').onclick = async () => {
      this.closeRecMenu();
      const ok = await this.confirmDialog('删除账单', '确定删除「' + (r.sub || r.category) + '」' + fmtMoney(r.amount) + ' 这笔吗？删除后无法恢复。');
      if (!ok) return;
      await Store.remove('records', rid);
      this.toast('已删除');
      await this.loadData();
    };
    this._recMenuOut = (e) => { if (!menu.contains(e.target)) this.closeRecMenu(); };
    this._recMenuKey = (e) => { if (e.key === 'Escape') this.closeRecMenu(); };
    setTimeout(() => {
      document.addEventListener('mousedown', this._recMenuOut, true);
      document.addEventListener('keydown', this._recMenuKey, true);
    }, 0);
  },
  closeRecMenu() {
    const m = document.getElementById('rec-menu');
    if (m) m.remove();
    if (this._recMenuOut) { document.removeEventListener('mousedown', this._recMenuOut, true); this._recMenuOut = null; }
    if (this._recMenuKey) { document.removeEventListener('keydown', this._recMenuKey, true); this._recMenuKey = null; }
  },

  /* ---------- 账单卡片拖拽改期 ---------- */
  bindRecDrag(el) {
    if (!el || el._dragBound) return;
    el._dragBound = true;
    let sx = 0, sy = 0, gx = 0, gy = 0, started = false, clone = null, overCol = null, timer = null;
    const clearOver = () => {
      document.querySelectorAll('.wk-col.drop-target, .m2cell.drop-target').forEach(c => c.classList.remove('drop-target'));
      overCol = null;
    };
    const placeGhost = (x, y) => {
      if (!clone) return;
      clone.style.left = (x - gx) + 'px';
      clone.style.top = (y - gy) + 'px';
      const t = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      const col = t && t.closest ? t.closest('.wk-col:not(.out), .m2cell:not(.out)') : null;
      if (col !== overCol) {
        clearOver();
        overCol = col;
        if (col) col.classList.add('drop-target');
      }
    };
    const start = (x, y) => {
      started = true;
      const rect = el.getBoundingClientRect();
      gx = sx - rect.left; gy = sy - rect.top;
      clone = el.cloneNode(true);
      clone.classList.add('drag-ghost');
      clone.style.width = rect.width + 'px';
      document.body.appendChild(clone);
      el.classList.add('dragging');
      el.style.pointerEvents = 'none';
      el.style.touchAction = 'none';
      window.addEventListener('touchmove', blockTouch, { passive: false });
      placeGhost(x, y);
    };
    const blockTouch = (e) => { if (started) e.preventDefault(); };
    const finish = (commit) => {
      if (timer) { clearTimeout(timer); timer = null; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', blockTouch);
      document.removeEventListener('keydown', onKey);
      if (clone) { clone.remove(); clone = null; }
      el.classList.remove('dragging');
      el.style.pointerEvents = '';
      el.style.touchAction = '';
      const target = overCol;
      clearOver();
      const wasStarted = started;
      started = false;
      if (wasStarted) el._skipClick = true; // 只要真正拖拽过（含 Esc/取消/无目标），后续 click 一律不触发编辑
      if (!wasStarted || !commit || !target) return; // 未真正拖动 / 松手时无目标格子 / Esc → 取消
      this.changeRecDate(el.dataset.rid, target.dataset.date);
    };
    function onMove(e) {
      if (!started) {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (e.pointerType === 'touch') {
          if (Math.hypot(dx, dy) > 10) { if (timer) { clearTimeout(timer); timer = null; } finish(false); } // 手指移动 = 页面滚动，放弃拖拽
          return;
        }
        if (Math.hypot(dx, dy) > 6) start(e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      placeGhost(e.clientX, e.clientY);
    }
    function onUp() { finish(true); }
    function onCancel() { finish(false); } // 手势被浏览器中断（如滚动接管）→ 取消，不改期
    function onKey(e) { if (e.key === 'Escape') finish(false); }
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
      sx = e.clientX; sy = e.clientY; started = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      document.addEventListener('keydown', onKey);
      if (e.pointerType === 'touch') {
        timer = setTimeout(() => { timer = null; if (!started) start(sx, sy); }, 350); // 触屏长按 350ms 才进入拖拽，避免和滚动冲突
      }
    });
  },
  async changeRecDate(rid, date) {
    const r = this.state.records.find(v => v.id === rid);
    if (!r || !date || r.date === date) return;
    try {
      await Store.update('records', rid, { date });
      this.toast('已改期到 ' + date.slice(5).replace('-', '/'), 'ok');
      await this.loadData();
    } catch (e) { this.toast(e.message, 'err'); }
  },

  /* ---------- 弹窗 / 提示 ---------- */
  /* ---------- 统一自定义下拉菜单（替代原生 select） ---------- */
  enhanceSelects(root) {
    root = root || document;
    const scope = (typeof root.querySelectorAll === 'function') ? root : document;
    scope.querySelectorAll('select').forEach(sel => {
      if (!sel._csel) this.buildCsel(sel);
      else this.syncCsel(sel);
    });
  },
  buildCsel(sel) {
    const wrap = document.createElement('div');
    wrap.className = 'csel';
    // 复制布局相关内联样式（flex / min-width / width 等）到外层，保持原排版
    const style = sel.getAttribute('style') || '';
    const take = ['flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'min-width', 'width', 'max-width'];
    const picked = take.map(p => {
      const m = style.match(new RegExp(p.replace('-', '\\-') + '\\s*:\\s*([^;]+)', 'i'));
      return m ? p + ':' + m[1].trim() : null;
    }).filter(Boolean);
    if (picked.length) wrap.setAttribute('style', picked.join(';'));

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('csel-native');
    sel.style.cssText = ''; // 原内联视觉样式已隐藏，清空避免干扰

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'csel-btn'; btn.tabIndex = 0;
    const val = document.createElement('span'); val.className = 'csel-val';
    const arrow = document.createElement('span'); arrow.className = 'csel-arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    btn.appendChild(val); btn.appendChild(arrow);

    const pop = document.createElement('div'); pop.className = 'csel-pop';
    const opts = document.createElement('div'); opts.className = 'csel-opts';
    pop.appendChild(opts);
    wrap.appendChild(btn); wrap.appendChild(pop);

    sel._csel = { wrap, btn, val, pop, opts };

    btn.addEventListener('click', e => { e.stopPropagation(); this.toggleCsel(sel); });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openCsel(sel); }
    });
    opts.addEventListener('click', e => {
      const opt = e.target.closest('.csel-opt');
      if (!opt) return;
      sel.value = opt.dataset.value;
      this.syncCsel(sel);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      this.closeAllCsel(sel);
      this.enhanceSelects(document); // 同步依赖项（如小类随大类联动）
    });

    this.syncCsel(sel);
    this._bindCselGlobalOnce();
  },
  syncCsel(sel) {
    const o = sel._csel; if (!o) return;
    const cur = sel.value;
    let text = '';
    if (sel.selectedOptions && sel.selectedOptions.length) text = sel.selectedOptions[0].textContent;
    else if (sel.options.length) text = sel.options[0].textContent;
    o.val.textContent = text || '请选择';
    o.opts.innerHTML = '';
    Array.from(sel.options).forEach(op => {
      const d = document.createElement('div');
      d.className = 'csel-opt' + (op.value === cur ? ' sel' : '');
      d.dataset.value = op.value;
      d.textContent = op.textContent;
      o.opts.appendChild(d);
    });
    if (o.wrap.classList.contains('open')) {
      const selOpt = o.opts.querySelector('.csel-opt.sel');
      if (selOpt) selOpt.scrollIntoView({ block: 'nearest' });
    }
  },
  toggleCsel(sel) {
    if (sel._csel.wrap.classList.contains('open')) this.closeAllCsel(sel);
    else this.openCsel(sel);
  },
  openCsel(sel) {
    this.closeAllCsel(sel);
    const o = sel._csel; o.wrap.classList.add('open');
    const selOpt = o.opts.querySelector('.csel-opt.sel');
    if (selOpt) selOpt.scrollIntoView({ block: 'nearest' });
  },
  closeAllCsel(except) {
    const exWrap = except && except._csel ? except._csel.wrap : null;
    document.querySelectorAll('.csel.open').forEach(w => { if (w !== exWrap) w.classList.remove('open'); });
  },
  _bindCselGlobalOnce() {
    if (this._cselBound) return; this._cselBound = true;
    document.addEventListener('click', () => this.closeAllCsel());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeAllCsel(); });
  },

  openModal(html, wide, cls, maskCls) {
    // 栈式弹窗：不再预清空，支持嵌套（如在编辑弹窗内再弹输入框）；后开的叠在上层
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask' + (maskCls ? ' ' + maskCls : '');
    mask.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '') + '">' + html + '</div>';
    mask.onclick = e => { if (e.target === mask) this.closeModal(); };
    mask.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closeModal());
    root.appendChild(mask);
    return mask;
  },
  closeModal() {
    // 只关最顶层弹窗（嵌套时底层编辑弹窗保持打开）
    const root = document.getElementById('modal-root');
    if (root.lastElementChild) root.lastElementChild.remove();
  },

  confirmDialog(title, msg) {
    return new Promise(resolve => {
      const m = this.openModal(`
        <div class="modal-title">${esc(title)}<button class="icon-btn" style="display:flex" data-close>✕</button></div>
        <p style="font-size:13.5px;color:var(--muted)">${esc(msg)}</p>
        <div class="modal-acts">
          <button class="btn btn-ghost" data-no>取消</button>
          <button class="btn btn-primary" data-yes>确定</button>
        </div>`);
      m.querySelector('[data-no]').onclick = () => { this.closeModal(); resolve(false); };
      m.querySelector('[data-yes]').onclick = () => { this.closeModal(); resolve(true); };
      m.querySelector('[data-close]').onclick = () => { this.closeModal(); resolve(false); };
    });
  },

  promptDialog(title, msg, def) {
    return new Promise(resolve => {
      const m = this.openModal(`
        <div class="modal-title">${esc(title)}<button class="icon-btn" style="display:flex" data-close>✕</button></div>
        <div class="field"><label>${esc(msg)}</label><input id="prm-val" type="text" value="${esc(def || '')}"></div>
        <div class="modal-acts">
          <button class="btn btn-ghost" data-no>取消</button>
          <button class="btn btn-primary" data-yes>确定</button>
        </div>`);
      const inp = m.querySelector('#prm-val');
      inp.focus(); inp.select();
      m.querySelector('[data-no]').onclick = () => { this.closeModal(); resolve(null); };
      m.querySelector('[data-close]').onclick = () => { this.closeModal(); resolve(null); };
      m.querySelector('[data-yes]').onclick = () => { this.closeModal(); resolve(inp.value.trim() || null); };
    });
  },

  toast(msg, type) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2400);
    setTimeout(() => t.remove(), 2800);
  }
};

/* ============ 建表 SQL ============ */
const SQL_SCHEMA = `-- ============================================================
-- 财务管家 · Supabase 建表脚本（单语句兼容版）
-- 你的项目执行通道一次只接受一条 SQL（多语句报 Only singular query allowed）
-- 因此分两步运行，每步都是单条语句：
--
--   第 1 步：把本文件全部内容粘贴进 SQL Editor，点 Run（无输出即成功）
--   第 2 步：新建查询，粘贴下面这一行，点 Run，看到 done 即建表成功
--       select public.setup_finance_tables();
--
-- 幂等安全：重复执行不会报错，只会补齐缺失的表/列/策略。
-- ============================================================
create or replace function public.setup_finance_tables() returns text
language plpgsql
as $fn$
begin
  execute $ddl$ create table if not exists ledgers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    type text not null default 'personal',
    kind text not null default '',
    icon text not null default '',
    color text not null default '',
    sort integer not null default 0,
    archived boolean not null default false,
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    name text not null,
    kind text not null default 'expense',
    subs jsonb not null default '[]'::jsonb,
    icon text not null default '',
    sort integer not null default 0,
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists records (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    amount numeric not null default 0,
    note text not null default '',
    favorite boolean not null default false,
    rating integer not null default 0,
    date text not null default '',
    image text,
    kind text not null default 'expense',
    status text not null default '',
    images text[] not null default '{}'::text[],
    purchase_platform text not null default '',
    attribute text not null default '',
    status_since text not null default '',
    remark text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    amount numeric not null default 0,
    month text not null default '',
    note text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    label text not null default '',
    section text not null default '',
    emoji text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  -- 顶部横幅配置（每用户一行，banner 图 + 位置）
  execute $ddl$ create table if not exists banners (
    user_id uuid primary key references auth.users(id) on delete cascade,
    img text not null default '',
    pos_x double precision not null default 50,
    pos_y double precision not null default 30,
    updated_at timestamptz not null default now()
  ) $ddl$;

  -- 账单标签列（多选标签，文本数组）
  execute $ddl$ alter table records add column if not exists tags text[] not null default '{}'::text[] $ddl$;

  -- 好物使用状态（使用中/闲置中/未使用/已弃用，存中文 label）
  execute $ddl$ alter table records add column if not exists status text not null default '' $ddl$;

  -- 好物多图（images 优先，兼容老数据单图 image 列）
  execute $ddl$ alter table records add column if not exists images text[] not null default '{}'::text[] $ddl$;

  -- 好物购买平台 / 属性 / 状态起始日（status_since 同时承载已弃用/已磬用的定格快照：弃用日|天数|每日成本）
  execute $ddl$ alter table records add column if not exists purchase_platform text not null default '' $ddl$;
  execute $ddl$ alter table records add column if not exists attribute text not null default '' $ddl$;
  execute $ddl$ alter table records add column if not exists status_since text not null default '' $ddl$;

  -- 编辑弹窗「备注」多行文本框（与 note/描述 分开）
  execute $ddl$ alter table records add column if not exists remark text not null default '' $ddl$;

  -- 老表补列（create table if not exists 不会给已存在的表加列，这里逐列补齐，幂等）
  execute $ddl$ alter table ledgers    add column if not exists kind     text         not null default '' $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists icon     text         not null default '' $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists color    text         not null default '' $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists sort     integer      not null default 0 $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists archived boolean     not null default false $ddl$;
  execute $ddl$ alter table categories add column if not exists icon     text         not null default '' $ddl$;
  execute $ddl$ alter table categories add column if not exists sort     integer      not null default 0 $ddl$;
  execute $ddl$ alter table templates  add column if not exists label    text         not null default '' $ddl$;
  execute $ddl$ alter table templates  add column if not exists section  text         not null default '' $ddl$;
  execute $ddl$ alter table templates  add column if not exists emoji    text         not null default '' $ddl$;
  execute $ddl$ alter table budgets    add column if not exists month    text         not null default '' $ddl$;
  execute $ddl$ alter table budgets    add column if not exists note     text         not null default '' $ddl$;

  -- 行级安全：每个用户只能读写自己的数据
  execute $ddl$ alter table ledgers    enable row level security $ddl$;
  execute $ddl$ alter table categories enable row level security $ddl$;
  execute $ddl$ alter table records    enable row level security $ddl$;
  execute $ddl$ alter table budgets    enable row level security $ddl$;
  execute $ddl$ alter table templates  enable row level security $ddl$;
  execute $ddl$ alter table banners    enable row level security $ddl$;

  execute $ddl$ drop policy if exists "own ledgers" on ledgers $ddl$;
  execute $ddl$ create policy "own ledgers" on ledgers for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own categories" on categories $ddl$;
  execute $ddl$ create policy "own categories" on categories for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own records" on records $ddl$;
  execute $ddl$ create policy "own records" on records for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own budgets" on budgets $ddl$;
  execute $ddl$ create policy "own budgets" on budgets for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own templates" on templates $ddl$;
  execute $ddl$ create policy "own templates" on templates for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own banners" on banners $ddl$;
  execute $ddl$ create policy "own banners" on banners for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  return 'done：6 张表已创建（含 banners），records.tags 列与 templates/ledgers 等全部所需列已补齐，RLS 已启用。可到 Database > Replication 开启实时同步。';
end
$fn$;`;

window.addEventListener('DOMContentLoaded', async () => {
  if (!window.supabase) {
    // vendor 未加载（极端情况）：从 CDN 兜底加载 supabase-js
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
        s.crossOrigin = 'anonymous';
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    } catch (e) { /* 兜底失败，App.init 会继续处理连接异常 */ }
  }
  App.init();
});
