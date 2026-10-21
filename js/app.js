/* ============ 应用主逻辑 ============ */
const App = {
  state: {
    route: 'ledger',
    ledgers: [], categories: [], records: [], budgets: [], templates: [],
    currentLedgerId: null,
    ledgerMonth: thisMonth(),
    wish: { sort: 'date-desc', tag: '' },
    home: { view: 'week', anchor: todayStr(), sel: todayStr() },
    rentalMonth: thisMonth(),
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
    this.initHero();
    await this.loadData();
    if (!location.hash || location.hash === '#/') location.hash = '#/ledger';
    this.route();
  },

  /* ---------- 背景头图 ---------- */
  initHero() {
    const hero = document.getElementById('page-hero');
    if (!hero || this._heroBound) return;
    this._heroBound = true;
    this.hero = { img: '', x: 50, y: 50 };
    try {
      const s = JSON.parse(localStorage.getItem('fin_bg') || 'null');
      if (s && typeof s === 'object') {
        this.hero.img = typeof s.img === 'string' ? s.img : '';
        this.hero.x = Math.max(0, Math.min(100, Number(s.x) || 50));
        this.hero.y = Math.max(0, Math.min(100, Number(s.y) || 50));
      }
    } catch (e) { /* ignore */ }
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
    try { localStorage.setItem('fin_bg', JSON.stringify({ img: this.hero.img, x: this.hero.x, y: this.hero.y })); } catch (e) { /* ignore */ }
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
        for (const l of staleRental) {
          for (const r of records.filter(x => x.ledger_id === l.id)) await Store.remove('records', r.id);
          for (const c of categories.filter(x => x.ledger_id === l.id)) await Store.remove('categories', c.id);
          for (const b of budgets.filter(x => x.ledger_id === l.id)) await Store.remove('budgets', b.id);
          await Store.remove('ledgers', l.id);
        }
        changed = true;
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
      if (!this.state.currentLedgerId || !ledgers.find(l => l.id === this.state.currentLedgerId)) {
        this.state.currentLedgerId = (ledgers.find(l => l.type === 'personal') || ledgers[0] || {}).id || null;
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
    uc.onclick = () => this.confirmDialog('退出登录', '确定要退出当前账号吗？').then(ok => { if (ok) Store.signOut(); });
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
          ${groups[g].map(({ t, i }) => '<button type="button" class="chip accent" data-tpl="' + i + '">⚡ ' + esc(t.label || (t.category + ' · ' + t.sub)) + '</button>').join('')}
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
  recordsListHTML(ledgerId, month, onlyRental) {
    const recs = this.recsOf(ledgerId)
      .filter(r => monthOf(r.date) === month && (!onlyRental || r.rental))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1)));
    if (!recs.length) return '<div class="empty"><p>' + (onlyRental ? '本月还没有出租屋支出' : '本月还没有记录，记一笔吧') + '</p></div>';
    const days = {};
    recs.forEach(r => { (days[r.date] = days[r.date] || []).push(r); });
    return Object.keys(days).sort().reverse().map(d => {
      const dayExp = days[d].reduce((s, r) => s + ((r.kind || this.kindOf(ledgerId, r.category)) === 'expense' ? Number(r.amount) || 0 : 0), 0);
      const dayInc = days[d].reduce((s, r) => s + ((r.kind || this.kindOf(ledgerId, r.category)) === 'income' ? Number(r.amount) || 0 : 0), 0);
      return `
      <div class="rec-day">
        <div class="rec-day-head"><span>${d.slice(5).replace('-', ' 月 ')} 日</span><span>${dayInc ? '收入 ' + fmtMoney(dayInc, { plain: true }) + ' · ' : ''}支出 ${fmtMoney(dayExp, { plain: true })}</span></div>
        ${days[d].map(r => this.recItemHTML(r, ledgerId)).join('')}
      </div>`;
    }).join('');
  },

  recItemHTML(r, ledgerId) {
    const kind = r.kind || this.kindOf(ledgerId, r.category);
    const inc = kind === 'income';
    const rm = (r.category === RENTAL_CAT && RENTAL_META[r.sub]) ? RENTAL_META[r.sub] : null;
    return `
    <div class="rec-item${r.rental ? ' is-rental' : ''}" data-rid="${r.id}">
      <div class="rec-icon ${inc ? 'inc' : ''}"${rm ? ' style="background:' + rm.color + '1F;color:' + rm.color + '"' : ''}>${inc ? '收' : (rm ? rm.emoji : esc((r.category || '?').slice(0, 1)))}</div>
      <div class="rec-main">
        <div class="rec-title">${esc(r.category)} <span class="sub">· ${esc(r.sub)}</span>
          ${r.rental ? '<span class="badge badge-green" title="归入出租屋">🏠 出租屋</span>' : ''}
          ${r.favorite ? '<span class="badge badge-green">心仪</span>' : ''}</div>
        ${r.note ? '<div class="rec-note">' + esc(r.note) + '</div>' : ''}
      </div>
      <div class="rec-stars">${starsStr(r.rating)}</div>
      <div class="rec-amount ${inc ? 'income' : ''}">${inc ? '+' : '-'}${fmtMoney(r.amount)}</div>
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
      <input type="month" value="${month}" data-jump style="height:32px;border:1px solid var(--line);border-radius:9px;padding:0 8px;background:#fff">
    </div>`;
  },

  bindMonthSwitcher(root, key, rerender) {
    const month = this.state[key];
    const [y, m] = month.split('-').map(Number);
    root.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => {
        const d = new Date(y, m - 2 + (b.dataset.nav === 'next' ? 1 : -1), 1);
        this.state[key] = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        rerender();
      };
    });
    const jump = root.querySelector('[data-jump]');
    if (jump) jump.onchange = () => { this.state[key] = jump.value; rerender(); };
  },

  /* ---------- 视图：记账本 ---------- */
  renderLedger() {
    return this.renderLedgerHome();
  },

  /* ---------- 记账本主页（顶部快捷横排 + 日历） ---------- */
  renderLedgerHome() {
    const el = document.getElementById('view-ledger');
    const lid = this.state.currentLedgerId;
    const home = this.state.home;
    const s = this.monthSummary(lid, thisMonth());

    // 快捷记账：日历上方横排一行（日常 → 爱好 → 旅游）
    const quickHTML = QUICK_SECTIONS.map(sec => (DEFAULT_TEMPLATES || [])
      .filter(t => t.section === sec)
      .map(t => `
          <button class="qbtn" data-cat="${esc(t.category)}" data-sub="${esc(t.sub)}" title="${esc(t.category)} · ${esc(t.sub)}">
            <span class="qemoji">${t.emoji || '•'}</span>
            <span class="qlabel">${esc(quickShort(t.label))}</span>
          </button>`).join('')).join('');

    el.innerHTML = `
      <div class="home-summary">
        <div class="hs-item"><span>本月支出</span><b class="expense">${fmtMoney(s.expense)}</b></div>
        <div class="hs-item"><span>本月收入</span><b class="income">${fmtMoney(s.income)}</b></div>
        <div class="hs-item"><span>本月结余</span><b style="color:${s.balance >= 0 ? 'var(--purple)' : 'var(--danger)'}">${fmtMoney(s.balance)}</b></div>
      </div>
      <div class="qbar">${quickHTML}</div>
      <section class="cal-pane">
        <div class="cal-pane-bar">
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
        <div id="home-calendar"></div>
      </section>`;

    // 快捷按钮 → 带出分类记账
    el.querySelectorAll('.qbtn').forEach(b => {
      b.onclick = () => this.addRecordModal(lid, todayStr(), b.dataset.cat, b.dataset.sub);
    });
    // 视图切换 / 翻页
    el.querySelectorAll('[data-hv]').forEach(b => {
      b.onclick = () => { home.view = b.dataset.hv; this.renderLedgerHome(); };
    });
    el.querySelectorAll('[data-hnav]').forEach(b => {
      b.onclick = () => { this.homeNav(Number(b.dataset.hnav)); this.renderLedgerHome(); };
    });
    el.querySelector('[data-htoday]').onclick = () => { home.anchor = todayStr(); this.renderLedgerHome(); };

    this.renderHomeCalendar();
    this.enhanceSelects(el);
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
            <span>周${wd[(new Date(d + 'T00:00:00').getDay() + 6) % 7]}</span>
            <span class="wk-date">${d.slice(5).replace('-', '/')}</span>
          </div>
          <div class="wk-badge-wrap">
            ${recs.length
              ? '<span class="wk-badge">' + recs.length + '</span>'
              : '<button type="button" class="wk-plus" data-add="' + d + '">+</button>'}
          </div>
          <div class="wk-body">
            ${recs.length ? recs.map(r => {
              const inc = kindOfR(r) === 'income';
              return `<div class="wk-rec${inc ? ' income' : ''}" data-rid="${r.id}" title="${esc(r.category)}${r.sub ? ' · ' + esc(r.sub) : ''}｜${fmtMoney(r.amount)}${r.note ? '｜' + esc(r.note) : ''}">
                <div class="wk-rec-cat">${r.rental ? '<span class="wk-rental" title="出租屋">🏠</span>' : ''}${catEmoji(r.category)} ${esc(r.category)}</div>
                ${r.sub ? `<div class="wk-rec-sub">${subEmoji(r.sub)} ${esc(r.sub)}</div>` : ''}
                ${r.note ? `<div class="wk-rec-note">${esc(r.note)}</div>` : ''}
                <div class="wk-rec-amt">${inc ? '+' : ''}${fmtMoney(r.amount)}</div>
              </div>`;
            }).join('') : '<div class="wk-empty">无记录</div>'}
          </div>
        </div>`;
      }).join('') + '</div>';
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
            ${recs.length
              ? '<span class="m2-badge">' + recs.length + '</span>'
              : (out ? '' : '<button type="button" class="m2-plus" data-add="' + key + '">+</button>')}
          </div>
          <div class="m2-body">
            ${recs.slice(0, 2).map(r => {
              const inc = kindOfR(r) === 'income';
              return '<div class="m2-rec' + (inc ? ' income' : '') + '" data-rid="' + r.id + '" title="' + esc(r.category) + '｜' + fmtMoney(r.amount) + (r.note ? '｜' + esc(r.note) : '') + '">' +
                '<div class="m2-rec-cat">' + (r.rental ? '<span class="wk-rental" title="出租屋">🏠</span>' : '') + catEmoji(r.category) + ' ' + esc(r.category) + '</div>' +
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
      b.onclick = (e) => { e.stopPropagation(); this.addRecordModal(lid, b.dataset.add); };
    });
    host.querySelectorAll('.wk-rec, .m2-rec').forEach(item => {
      item.onclick = () => this.editRecord(item.dataset.rid, lid);
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

    let items = f.tag ? all.filter(r => recTags(r).includes(f.tag)) : all;
    const sorters = {
      'date-desc': (a, b) => (a.date < b.date ? 1 : -1),
      'date-asc': (a, b) => (a.date > b.date ? 1 : -1),
      'amt-desc': (a, b) => b.amount - a.amount,
      'days-desc': (a, b) => daysBetween(b.date) - daysBetween(a.date),
      'cost-asc': (a, b) => (a.amount / daysBetween(a.date)) - (b.amount / daysBetween(b.date))
    };
    items = [...items].sort(sorters[f.sort] || sorters['date-desc']);

    el.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">好物仓库</div>
            <div class="card-sub">${f.tag ? '标签 · ' + esc(goodsTagShort(f.tag)) + '　' : ''}共 ${items.length} 件 · 记账时勾选「心仪物品」并选择标签即可收入这里</div>
          </div>
        </div>
        <div class="tag-nav" id="w-tagnav">
          <button class="tag-chip${f.tag ? '' : ' on'}" data-tag="">全部<b>${all.length}</b></button>
          ${GOODS_TAG_GROUPS.map(g => {
            const tags = g.subs.length ? g.subs.map(s => g.name + '-' + s) : [g.name];
            return '<div class="tag-group"><span class="tag-group-name">' + esc(g.name) + '</span>' + tags.map(t =>
              '<button class="tag-chip' + (f.tag === t ? ' on' : '') + '" data-tag="' + esc(t) + '" title="' + esc(t) + '">' + esc(goodsTagShort(t)) + '<b>' + (tagCounts[t] || 0) + '</b></button>').join('') + '</div>';
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
    el.querySelectorAll('#w-tagnav .tag-chip').forEach(ch => {
      ch.onclick = () => { this.state.wish.tag = ch.dataset.tag; this.renderWishlist(); };
    });
    this.enhanceSelects(el);

    const grid = el.querySelector('#wish-grid');
    if (!items.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>' + (f.tag ? '该标签下还没有好物' : '还没有心仪物品<br>在记账时勾选「心仪物品」就会自动出现在这里') + '</p>';
      return;
    }
    grid.innerHTML = items.map(r => {
      const days = daysBetween(r.date);
      const cost = (Number(r.amount) || 0) / days;
      const name = r.note || (r.category + ' · ' + r.sub);
      const tags = recTags(r);
      return `
      <div class="wish-card" data-wid="${r.id}">
        <div class="wish-body">
          <div class="wish-name"><span>${esc(name)}</span><span class="badge ${r.favorite ? 'badge-green' : 'badge-gray'}">${r.favorite ? '使用中' : '已闲置'}</span></div>
          <div class="wish-amount">${fmtMoney(r.amount)}</div>
          <div class="wish-tags">${tags.length
            ? tags.map(t => '<span class="wtag" title="' + esc(t) + '">' + esc(goodsTagShort(t)) + '</span>').join('')
            : '<span class="wtag none">未贴标签</span>'}</div>
          <div class="wish-meta">
            <div>购入日期<b>${r.date}</b></div>
            <div>已陪伴<b>${days} 天</b></div>
            <div>每日成本<b>${fmtMoney(cost)}</b></div>
          </div>
        </div>
        <div class="wish-acts">
          <button class="btn btn-ghost btn-sm" data-act="edit">编辑</button>
          <button class="btn btn-danger btn-sm" data-act="del">删除</button>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.wish-card').forEach(card => {
      const rid = card.dataset.wid;
      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = async () => {
          const act = btn.dataset.act;
          const rec = this.state.records.find(r => r.id === rid);
          if (!rec) return;
          if (act === 'edit') {
            this.editRecord(rid, rec.ledger_id);
          } else if (act === 'del') {
            const ok = await this.confirmDialog('删除好物', '删除后无法恢复，确定删除吗？');
            if (!ok) return;
            await Store.remove('records', rid);
            this.toast('已删除');
            await this.loadData();
          }
        };
      });
    });
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
            ? '<label>月份</label><input type="month" id="st-month" value="' + st.month + '">'
            : '<label>年份</label><input type="number" id="st-year" min="2000" max="2100" value="' + st.year + '">'}</div>
          <div class="field"><label>小类明细大类</label>
            <select id="st-cat">${cats.map(c => '<option value="' + esc(c.name) + '" ' + (st.cat === c.name ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('')}</select>
          </div>
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
  goodsTagPickerHTML() {
    return GOODS_TAG_GROUPS.map(g => {
      const opts = g.subs.length
        ? g.subs.map(s => ({ tag: g.name + '-' + s, label: s }))
        : [{ tag: g.name, label: g.name }];
      return `
      <div class="tag-picker-group">
        <span class="tag-picker-name">${esc(g.name)}</span>
        <div class="tag-picker-opts">
          ${opts.map(o => '<label class="tag-opt"><input type="checkbox" value="' + esc(o.tag) + '"><span>' + esc(o.label) + '</span></label>').join('')}
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
  addRecordModal(ledgerId, date, preCat, preSub, rental) {
    const cats = this.catsOf(ledgerId);
    let rating = 0;
    if (rental && !preCat) preCat = RENTAL_CAT;
    this.openModal(`
      <div class="modal-title">新增记账 · ${esc(date)}<button class="icon-btn" style="display:flex" data-close>✕</button></div>
      <div class="field"><label>大类</label><select id="ad-cat">${cats.map(c => '<option value="' + esc(c.name) + '"' + (preCat && c.name === preCat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('')}</select></div>
      <div class="field"><label>小类</label><select id="ad-sub"></select></div>
      <div class="field"><label>金额（元）</label><input id="ad-amt" type="number" min="0" step="0.01" placeholder="0.00"></div>
      <div class="field"><label>备注</label><input id="ad-note" type="text" placeholder="选填"></div>
      <div class="field"><label>标记</label>
        <label class="fav-check"><input type="checkbox" id="ad-rental" ${rental ? 'checked' : ''}><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>归入出租屋账本</label>
      </div>
      <div class="field"><label>心仪物品</label>
        <label class="fav-check"><input type="checkbox" id="ad-fav"><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>收入好物仓库</label>
      </div>
      <div class="field" id="ad-tags-field" style="display:none"><label>好物标签（可多选）</label>
        <div class="tag-picker" id="ad-tagpicker">${this.goodsTagPickerHTML()}</div>
      </div>
      <div class="field"><label>评分</label><div class="stars" id="ad-stars">${[1, 2, 3, 4, 5].map(v => '<button type="button" data-v="' + v + '">★</button>').join('')}</div></div>
      <div class="modal-acts">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="ad-save">保存</button>
      </div>
    `);
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
    this.bindFavTags(document.getElementById('ad-fav'), document.getElementById('ad-tags-field'), '#ad-tagpicker');
    this.enhanceSelects(document.getElementById('modal-root'));
    document.querySelectorAll('#ad-stars button').forEach(b => {
      b.onclick = () => {
        const v = Number(b.dataset.v);
        rating = rating === v ? 0 : v;
        document.querySelectorAll('#ad-stars button').forEach(x => x.classList.toggle('on', Number(x.dataset.v) <= rating));
      };
    });
    document.getElementById('ad-save').onclick = async () => {
      const amount = parseFloat(document.getElementById('ad-amt').value);
      if (!amount || amount <= 0) return this.toast('请输入正确金额', 'err');
      const fav = document.getElementById('ad-fav').checked;
      try {
        await Store.insert('records', {
          ledger_id: ledgerId, category: catSel.value, sub: subSel.value, amount,
          note: document.getElementById('ad-note').value.trim(),
          favorite: fav,
          tags: fav ? this.pickedTags('#ad-tagpicker') : [],
          rental: document.getElementById('ad-rental').checked,
          rating, date, image: null, kind: this.kindOf(ledgerId, catSel.value)
        });
        this.closeModal();
        this.toast('已记账 ' + fmtMoney(amount), 'ok');
        await this.loadData();
      } catch (e) { this.toast(e.message, 'err'); }
    };
  },

  /* ---------- 视图：出租屋（主账本中标记了「出租屋」的记录） ---------- */
  renderRental() {
    const el = document.getElementById('view-rental');
    const lid = this.state.currentLedgerId;
    const month = this.state.rentalMonth;
    const rentalRecs = this.recsOf(lid).filter(r => r.rental);
    const monthRecs = rentalRecs.filter(r => monthOf(r.date) === month);
    const expense = monthRecs.reduce((s, r) => s + (Number(r.amount) || 0), 0);

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

    // 分类统计（按小类）
    const bySub = {};
    monthRecs.forEach(r => {
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

    // 近 6 个月趋势
    const trendLabels = [], trendData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(month.slice(0, 4), Number(month.slice(5, 7)) - 1 - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      trendLabels.push((d.getMonth() + 1) + ' 月');
      trendData.push(rentalRecs.filter(r => monthOf(r.date) === key).reduce((s, r) => s + (Number(r.amount) || 0), 0));
    }

    el.innerHTML = `
      <div class="rental-head">
        <div>
          <div class="card-title">出租屋</div>
          <div class="card-sub">主账本中标记为「出租屋」的支出，同时计入总账</div>
        </div>
        <button class="btn btn-accent" id="rental-add">＋ 记一笔出租屋支出</button>
      </div>
      <div class="grid grid-3" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">本月出租屋支出</div><div class="stat-value expense">${fmtMoney(expense)}</div><div class="stat-foot">${month.replace('-', ' 年 ')} 月 · ${monthRecs.length} 笔</div></div>
        <div class="stat-card"><div class="stat-label">记录总数</div><div class="stat-value">${rentalRecs.length}</div><div class="stat-foot">全部标记为出租屋的支出</div></div>
        <div class="stat-card"><div class="stat-label">月度固定费用合计</div><div class="stat-value" style="color:var(--accent-deep)">${fmtMoney(fixedTotal)}</div><div class="stat-foot">${RENTAL_FIXED.join(' / ')}</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">固定费用</div><div class="card-sub">设置每月金额，一键生成本月记录</div></div>
          <button class="btn btn-primary" id="gen-fixed">⚡ 一键生成本月记录</button>
        </div>
        ${fixedRows}
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">分类统计</div><div class="card-sub">${month.replace('-', ' 年 ')} 月各分类占比</div></div>
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
        ` : '<div class="empty"><p>本月暂无出租屋支出</p></div>'}
      </div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">近 6 个月趋势</div><div class="card-sub">出租屋月度支出</div></div></div>
        <div class="chart-box"><canvas id="rental-line" height="180"></canvas></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div class="card-title">出租屋明细</div>
          ${this.monthSwitcherHTML('rentalMonth', month)}
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

    const recs = el.querySelector('#rental-recs');
    recs.innerHTML = this.recordsListHTML(lid, month, true);
    this.bindRecordsList(recs, lid);
    const sw = recs.closest('.card').querySelector('.card-head');
    this.bindMonthSwitcher(sw, 'rentalMonth', () => this.renderRental());
    this.enhanceSelects(el);

    if (donutItems.length) Charts.donut(el.querySelector('#rental-donut'), donutItems, '本月合计');
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
        <div class="card-head"><div><div class="card-title">快捷模板</div><div class="card-sub">记账面板底部的一键模板</div></div></div>
        <div id="tpl-mgr"></div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <select id="tpl-cat" style="flex:1;min-width:130px;height:38px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff"></select>
          <select id="tpl-sub" style="flex:1;min-width:130px;height:38px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:#fff"></select>
          <button class="btn btn-primary" id="add-tpl">添加模板</button>
        </div>
      </div>`;

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
        const ok = await this.confirmDialog('导入数据', '导入将追加数据到当前模式（可能产生重复记录），确定继续吗？');
        if (!ok) return;
        await Store.importAll(data, false);
        this.toast('导入完成', 'ok');
        await this.loadData();
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
    const renderTplMgr = () => {
      const lid = ledgerSel.value;
      const tpls = this.state.templates.filter(t => t.ledger_id === lid);
      el.querySelector('#tpl-mgr').innerHTML = tpls.length ? tpls.map(t =>
        '<span class="chip purple" style="cursor:default">⚡ ' + esc(t.category) + ' · ' + esc(t.sub) + ' <button data-deltpl="' + t.id + '" style="color:var(--danger);font-weight:800">×</button></span>'
      ).join('') : '<span style="font-size:12.5px;color:var(--muted)">暂无模板</span>';
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
    this.openModal(`
      <div class="modal-title">编辑记录<button class="icon-btn" style="display:flex" data-close>✕</button></div>
      <div class="field"><label>大类</label><select id="ed-cat">${cats.map(c => '<option value="' + esc(c.name) + '" ' + (c.name === r.category ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('')}</select></div>
      <div class="field"><label>小类</label><select id="ed-sub"></select></div>
      <div class="field"><label>金额（元）</label><input id="ed-amt" type="number" min="0" step="0.01" value="${r.amount}"></div>
      <div class="field"><label>日期</label><input id="ed-date" class="cal-input" readonly placeholder="选择日期" value="${esc(r.date)}" data-date="${esc(r.date)}"></div>
      <div class="field"><label>备注</label><input id="ed-note" type="text" value="${esc(r.note || '')}"></div>
      <div class="field"><label>标记</label>
        <label class="fav-check"><input type="checkbox" id="ed-rental" ${r.rental ? 'checked' : ''}><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>归入出租屋账本</label>
      </div>
      <div class="field"><label>心仪物品</label>
        <label class="fav-check"><input type="checkbox" id="ed-fav" ${r.favorite ? 'checked' : ''}><span class="fav-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>收入好物仓库</label>
      </div>
      <div class="field" id="ed-tags-field" style="display:none"><label>好物标签（可多选）</label>
        <div class="tag-picker" id="ed-tagpicker">${this.goodsTagPickerHTML()}</div>
      </div>
      <div class="field" id="ed-img-field" style="display:none"><label>图片</label>
        <div class="rec-img-row">
          <div class="rec-img-prev" id="ed-img-prev">${r.image ? '<img src="' + r.image + '" alt="">' : '<span class="ph">暂无图片</span>'}</div>
          <div class="rec-img-btns">
            <button class="btn btn-ghost btn-sm" id="ed-img-up" type="button">${r.image ? '更换图片' : '上传图片'}</button>
            <button class="btn btn-ghost btn-sm" id="ed-img-del" type="button" style="display:${r.image ? '' : 'none'}">移除图片</button>
          </div>
        </div>
      </div>
      <div class="field"><label>评分</label><div class="stars" id="ed-stars">${[1, 2, 3, 4, 5].map(v => '<button type="button" data-v="' + v + '" class="' + (v <= rating ? 'on' : '') + '">★</button>').join('')}</div></div>
      <div class="modal-acts">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="ed-save">保存</button>
      </div>
    `);

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
    const imgPrev = document.getElementById('ed-img-prev');
    const imgUp = document.getElementById('ed-img-up');
    const imgDel = document.getElementById('ed-img-del');
    const syncImgField = () => { if (imgField) imgField.style.display = favEl.checked ? '' : 'none'; };
    favEl.addEventListener('change', syncImgField);
    syncImgField();
    imgUp.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
          this.toast('图片处理中…');
          const data = await compressImage(f);
          await Store.update('records', rid, { image: data });
          imgPrev.innerHTML = '<img src="' + data + '" alt="">';
          imgDel.style.display = '';
          imgUp.textContent = '更换图片';
          this.toast('图片已保存', 'ok');
          await this.loadData(true);
        } catch (e) { this.toast(e.message || '图片处理失败', 'err'); }
      };
      inp.click();
    };
    imgDel.onclick = async () => {
      try {
        await Store.update('records', rid, { image: null });
        imgPrev.innerHTML = '<span class="ph">暂无图片</span>';
        imgDel.style.display = 'none';
        imgUp.textContent = '上传图片';
        this.toast('图片已移除', 'ok');
        await this.loadData(true);
      } catch (e) { this.toast(e.message, 'err'); }
    };
    const edDate = document.getElementById('ed-date');
    edDate.onclick = () => this.openCalendar(edDate);
    document.querySelectorAll('#ed-stars button').forEach(b => {
      b.onclick = () => {
        const v = Number(b.dataset.v);
        rating = rating === v ? 0 : v;
        document.querySelectorAll('#ed-stars button').forEach(x => x.classList.toggle('on', Number(x.dataset.v) <= rating));
      };
    });
    document.getElementById('ed-save').onclick = async () => {
      const amount = parseFloat(document.getElementById('ed-amt').value);
      if (!amount || amount <= 0) return this.toast('请输入正确金额', 'err');
      const fav = document.getElementById('ed-fav').checked;
      try {
        await Store.update('records', rid, {
          category: catSel.value, sub: subSel.value, amount,
          date: document.getElementById('ed-date').dataset.date || r.date,
          note: document.getElementById('ed-note').value.trim(),
          favorite: fav,
          tags: fav ? this.pickedTags('#ed-tagpicker') : [],
          rental: document.getElementById('ed-rental').checked,
          rating, kind: this.kindOf(ledgerId, catSel.value)
        });
        this.closeModal();
        this.toast('已保存修改', 'ok');
        await this.loadData();
      } catch (e) { this.toast(e.message, 'err'); }
    };
  },

  /* ---------- 日历组件 ---------- */
  openCalendar(inp) {
    if (this._cal && this._cal.inp === inp) { this.closeCalendar(); return; }
    this.closeCalendar();
    const sel = inp.dataset.date || todayStr();
    const [y, m] = sel.split('-').map(Number);
    this._cal = { inp, y, m, sel };
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

  _renderCal() {
    const pop = document.getElementById('cal-pop');
    if (!pop || !this._cal) return;
    const { y, m, sel } = this._cal;
    const today = todayStr();
    const mk = (yy, mm, dd) => {
      const dt = new Date(yy, mm - 1, dd);
      return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    };
    const startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 周一为一周开始
    const dim = new Date(y, m, 0).getDate();
    const prevDim = new Date(y, m - 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = i - startDow + 1;
      if (d < 1) cells.push({ d: prevDim + d, out: true, key: mk(y, m - 1, prevDim + d) });
      else if (d > dim) cells.push({ d: d - dim, out: true, key: mk(y, m + 1, d - dim) });
      else cells.push({ d, out: false, key: mk(y, m, d) });
    }
    pop.innerHTML = `
      <div class="cal-card">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-nav="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button>
          <div class="cal-title">${y} 年 ${m} 月</div>
          <button type="button" class="cal-nav" data-nav="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button>
        </div>
        <div class="cal-grid">
          ${['一', '二', '三', '四', '五', '六', '日'].map(w => '<div class="cal-wd">' + w + '</div>').join('')}
          ${cells.map(c => '<button type="button" class="cal-cell' + (c.out ? ' out' : '') + (c.key === today ? ' today' : '') + (c.key === sel ? ' sel' : '') + '" data-key="' + c.key + '">' + c.d + '</button>').join('')}
        </div>
        <div class="cal-foot"><button type="button" class="cal-today-btn" data-today>回到今天</button></div>
      </div>`;

    pop.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => {
        const dt = new Date(this._cal.y, this._cal.m - 1 + Number(b.dataset.nav), 1);
        this._cal.y = dt.getFullYear();
        this._cal.m = dt.getMonth() + 1;
        this._renderCal();
      };
    });
    pop.querySelectorAll('.cal-cell').forEach(c => {
      c.onclick = () => {
        const key = c.dataset.key;
        const inp = this._cal.inp;
        inp.dataset.date = key;
        inp.value = key;
        this.closeCalendar();
      };
    });
    const tb = pop.querySelector('[data-today]');
    if (tb) tb.onclick = () => {
      const inp = this._cal.inp;
      inp.dataset.date = today;
      inp.value = today;
      this.closeCalendar();
    };
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

  openModal(html, wide) {
    this.closeModal();
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div>';
    mask.onclick = e => { if (e.target === mask) this.closeModal(); };
    mask.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closeModal());
    root.appendChild(mask);
    return mask;
  },
  closeModal() { document.getElementById('modal-root').innerHTML = ''; },

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
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    name text not null,
    kind text not null default 'expense',
    subs jsonb not null default '[]'::jsonb,
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
    tags text[] not null default '{}',
    rating integer not null default 0,
    date text not null default '',
    image text,
    kind text not null default 'expense',
    created_at timestamptz not null default now()
  ) $ddl$;

  -- 好物仓库多标签：已建库的旧版本补 tags 列（幂等）
  execute $ddl$ alter table records add column if not exists tags text[] not null default '{}' $ddl$;

  execute $ddl$ create table if not exists budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    amount numeric not null default 0,
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  -- 行级安全：每个用户只能读写自己的数据
  execute $ddl$ alter table ledgers    enable row level security $ddl$;
  execute $ddl$ alter table categories enable row level security $ddl$;
  execute $ddl$ alter table records    enable row level security $ddl$;
  execute $ddl$ alter table budgets    enable row level security $ddl$;
  execute $ddl$ alter table templates  enable row level security $ddl$;

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

  return 'done：5 张表已创建，RLS 已启用。可到 Database > Replication 开启实时同步。';
end
$fn$;`;

window.addEventListener('DOMContentLoaded', () => App.init());
