/* ============ 数据层：Supabase / 本地双模式 ============ */
const Store = {
  mode: 'local',          // 'local' | 'supabase'
  sb: null,
  user: null,             // { id, email }
  cfg: { url: '', key: '' },
  _realtimeOn: false,
  _noCols: new Set(),       // 已知缺失的「表.列」（PGRST204），后续不再发送
  billsMissing: false,      // 云端尚未创建 bills 表（true 时账单页提示补建表，但不影响账册）
  _onDataChange: null,
  _onAuthChange: null,

  /* ---------- 初始化 ---------- */
  init() {
    try {
      const c = JSON.parse(localStorage.getItem('fin_cfg') || 'null');
      if (c && c.url && c.key) this.cfg = c;
    } catch (e) { /* ignore */ }
    if (!this.cfg.url) { this.cfg = { ...DEFAULT_CFG }; }
    this._initClient();
  },

  _initClient() {
    this.mode = 'local';
    this.sb = null;
    this.billsMissing = false;
    if (this.cfg.url && this.cfg.key && window.supabase && window.supabase.createClient) {
      try {
        this.sb = window.supabase.createClient(this.cfg.url, this.cfg.key, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
        this.mode = 'supabase';
      } catch (e) {
        console.warn('Supabase 初始化失败，回退本地模式', e);
      }
    }
    return this.mode;
  },

  saveCfg(cfg) {
    this.cfg = { url: (cfg.url || '').trim(), key: (cfg.key || '').trim() };
    localStorage.setItem('fin_cfg', JSON.stringify(this.cfg));
    return this._initClient();
  },

  clearCfg() {
    localStorage.removeItem('fin_cfg');
    this.cfg = { url: '', key: '' };
    return this._initClient();
  },

  setHandlers(onDataChange, onAuthChange) {
    this._onDataChange = onDataChange;
    this._onAuthChange = onAuthChange;
  },

  _emitData() { if (this._onDataChange) this._onDataChange(); },
  _emitAuth() { if (this._onAuthChange) this._onAuthChange(); },

  /* ---------- 认证 ---------- */
  async restoreSession() {
    if (this.mode === 'supabase') {
      const { data, error } = await this.sb.auth.getSession();
      if (error) throw error;
      if (data.session && data.session.user) {
        this.user = { id: data.session.user.id, email: data.session.user.email };
        this._watchAuth();
        this._subscribeRealtime();
        return this.user;
      }
      this._watchAuth();
      return null;
    }
    const email = localStorage.getItem('fin_local_user');
    if (email) { this.user = { id: 'local-' + email, email }; return this.user; }
    return null;
  },

  _watchAuth() {
    if (this._authWatching) return;
    this._authWatching = true;
    this.sb.auth.onAuthStateChange((event, session) => {
      const u = session && session.user;
      this.user = u ? { id: u.id, email: u.email } : null;
      this._emitAuth();
      if (u) this._subscribeRealtime();
    });
  },

  async signIn(email, password) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(this._authErr(error));
      this.user = { id: data.user.id, email: data.user.email };
      return this.user;
    }
    localStorage.setItem('fin_local_user', email);
    this.user = { id: 'local-' + email, email };
    return this.user;
  },

  async signUp(email, password) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.sb.auth.signUp({ email, password });
      if (error) throw new Error(this._authErr(error));
      if (data.session) {
        this.user = { id: data.user.id, email: data.user.email };
        return { needConfirm: false };
      }
      return { needConfirm: true };
    }
    localStorage.setItem('fin_local_user', email);
    this.user = { id: 'local-' + email, email };
    return { needConfirm: false };
  },

  _authErr(e) {
    const m = (e && e.message) || '操作失败';
    if (/Invalid login/i.test(m)) return '邮箱或密码错误';
    if (/already registered/i.test(m)) return '该邮箱已注册，请直接登录';
    if (/Password should be/i.test(m)) return '密码至少 6 位';
    if (/Email not confirmed/i.test(m)) return '邮箱尚未验证，请先到邮箱完成确认（或在 Supabase 关闭邮箱确认）';
    return m;
  },

  async signOut() {
    if (this.mode === 'supabase') { await this.sb.auth.signOut(); }
    localStorage.removeItem('fin_local_user');
    this.user = null;
    this._emitAuth();
  },

  /* ---------- 本地模式存储 ---------- */
  _localKey() { return 'fin_db_' + (this.user ? this.user.email : 'anon'); },
  _localRead() {
    try { return JSON.parse(localStorage.getItem(this._localKey()) || 'null'); }
    catch (e) { return null; }
  },
  _localWrite(db) { localStorage.setItem(this._localKey(), JSON.stringify(db)); },

  /* ---------- 云端表缺失自动降级 ---------- */
  _isTableErr(e) {
    const m = (e && e.message) || String(e || '');
    // 只认「表不存在」；列缺失（PGRST204）走 _isColErr 自动剥离重试，不当成表缺失回退本地
    return /Could not find the table/i.test(m)
      || /PGRST205/i.test(m)
      || (/relation/i.test(m) && /does not exist/i.test(m));
  },
  /* 列缺失（PGRST204：Could not find the 'x' column of 't' in the schema cache）：
     记下该列后续不再发送，剥离后重试——表结构升级前功能不中断、不掉本地 */
  _isColErr(e) {
    const m = (e && e.message) || String(e || '');
    return /PGRST204/.test(m) || /Could not find the '.*' column/i.test(m);
  },
  _colName(e) {
    const mm = ((e && e.message) || '').match(/Could not find the '([^']+)' column/);
    return mm ? mm[1] : null;
  },
  _stripNoCols(table, obj) {
    const p = { ...obj };
    this._noCols.forEach(key => {
      if (key.indexOf(table + '.') === 0) delete p[key.slice(table.length + 1)];
    });
    return p;
  },
  missingCol(table, col) { return this._noCols.has(table + '.' + col); },
  _fallbackToLocal() {
    if (this.mode !== 'supabase') return;
    this.mode = 'local';
    this._realtimeOn = false;
    if (this.onCloudMissing) this.onCloudMissing();
  },

  /* ---------- 通用 CRUD（按用户隔离） ---------- */
  /* list：分页拉全。PostgREST 有单次返回行数上限（Supabase 项目默认 1000），
     一次 select('*') 只会拿到前 N 行——云端 2701 条时永远只显示最早的 1000 条，
     且导入去重比对也看不到全部，导致重复导入。按 500/页循环拉全。 */
  async _listPaged(table) {
    const all = [];
    const PAGE = 500;
    let from = 0;
    for (;;) {
      const { data, error } = await this.sb.from(table).select('*').order('created_at', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) all.push(r);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  },

  async list(table) {
    if (this.mode === 'supabase') {
      try {
        return await this._listPaged(table);
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead();
    return db ? (db[table] || []) : [];
  },

  /* 待办账单专用：表缺失时不回退本地（避免把整个 App 切成离线模式），
     返回空数组并置 billsMissing，由「待办账单」页提示补建表。 */
  async listBills() {
    if (this.mode === 'supabase' && this.user) {
      try {
        const rows = await this._listPaged('bills');
        this.billsMissing = false;
        return rows;
      } catch (e) {
        if (this._isTableErr(e)) { this.billsMissing = true; return []; }
        throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead();
    return db ? (db.bills || []) : [];
  },

  /* 批量删除（去重用）：一次删多个 id，100 个一批由调用方控制 */
  async removeMany(table, ids) {
    if (!ids || !ids.length) return 0;
    if (this.mode === 'supabase') {
      const { error } = await this.sb.from(table).delete().in('id', ids);
      if (error) throw new Error(this._dbErr(error));
      return ids.length;
    }
    const db = this._localRead();
    if (!db || !db[table]) return 0;
    const dead = new Set(ids);
    db[table] = db[table].filter(x => !dead.has(x.id));
    this._localWrite(db);
    return ids.length;
  },

  async insert(table, row) {
    if (this.mode === 'supabase') {
      try {
        const { data, error } = await this.sb.from(table).insert(this._stripNoCols(table, { ...row, user_id: this.user.id })).select().single();
        if (error) {
          if (this._isColErr(error)) {
            const col = this._colName(error);
            if (col) { this._noCols.add(table + '.' + col); return this.insert(table, row); }
          }
          throw error;
        }
        return data;
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead() || {};
    const r = { ...row, id: row.id || uid(), created_at: new Date().toISOString() };
    db[table] = db[table] || [];
    db[table].push(r);
    this._localWrite(db);
    return r;
  },

  async update(table, id, patch) {
    if (this.mode === 'supabase') {
      try {
        const p = this._stripNoCols(table, patch);
        if (Object.keys(p).length) {
          const { error } = await this.sb.from(table).update(p).eq('id', id);
          if (error) {
            if (this._isColErr(error)) {
              const col = this._colName(error);
              if (col) { this._noCols.add(table + '.' + col); return this.update(table, id, patch); }
            }
            throw error;
          }
          return true;
        }
        return false; // 字段全部缺失被剥离：未发送任何更新
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead() || {};
    db[table] = (db[table] || []).map(r => r.id === id ? { ...r, ...patch } : r);
    this._localWrite(db);
    return true;
  },

  async remove(table, id) {
    if (this.mode === 'supabase') {
      try {
        const { error } = await this.sb.from(table).delete().eq('id', id);
        if (error) throw error;
        return;
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead() || {};
    db[table] = (db[table] || []).filter(r => r.id !== id);
    this._localWrite(db);
  },

  /* ---------- 背景头图配置（云端 banners 表；表未建时回退本地） ---------- */
  async getBanner() {
    if (this.mode === 'supabase' && this.user) {
      try {
        const { data, error } = await this.sb.from('banners').select('img, pos_x, pos_y').single();
        if (!error && data) {
          return {
            img: typeof data.img === 'string' ? data.img : '',
            x: data.pos_x == null ? 50 : Number(data.pos_x),
            y: data.pos_y == null ? 50 : Number(data.pos_y)
          };
        }
        if (error && this._isTableErr(error)) {
          // 表尚未创建：过渡期回退本地配置
          try { return JSON.parse(localStorage.getItem('fin_bg') || 'null'); } catch (e) { return null; }
        }
        if (!error && !data) {
          // 云端无配置但本地有（首次上云）：搬一份上去，避免自定义背景丢失
          try {
            const s = JSON.parse(localStorage.getItem('fin_bg') || 'null');
            if (s && typeof s === 'object') {
              await this.saveBanner(s);
              return { img: typeof s.img === 'string' ? s.img : '', x: Number(s.x) || 50, y: Number(s.y) || 50 };
            }
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
      return null; // 云端模式以云端为准：无配置 = 默认背景
    }
    try { return JSON.parse(localStorage.getItem('fin_bg') || 'null'); } catch (e) { return null; }
  },
  async saveBanner(cfg) {
    const c = { img: (cfg && cfg.img) || '', x: cfg && cfg.x != null ? Number(cfg.x) : 50, y: cfg && cfg.y != null ? Number(cfg.y) : 50 };
    if (this.mode === 'supabase' && this.user) {
      try {
        const { error } = await this.sb.from('banners').upsert({
          user_id: this.user.id, img: c.img, pos_x: c.x, pos_y: c.y, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) throw error;
        return true;
      } catch (e) {
        if (this._isTableErr(e)) {
          // 表尚未创建：过渡期写本地，保证功能可用
          try { localStorage.setItem('fin_bg', JSON.stringify(c)); } catch (e2) { /* ignore */ }
          return false;
        }
        console.warn('背景配置保存失败', e);
        return false;
      }
    }
    try { localStorage.setItem('fin_bg', JSON.stringify(c)); } catch (e) { /* ignore */ }
    return false;
  },

  /* ---------- 每页独立背景头图（map：page -> {img,x,y}） ----------
     本地 localStorage(fin_hero_v1) 为权威存储，并尽力把 JSON map 镜像到云端 banners 表的 img 列（不改动表结构）。
     兼容旧版单图：云端 banners.img 为 data URL 字符串、或本地 fin_bg 有值时，迁移到全部页面。 */
  async getHeroMap() {
    const readLocalMap = () => {
      try { const m = JSON.parse(localStorage.getItem('fin_hero_v1') || 'null'); return (m && typeof m === 'object') ? m : null; } catch (e) { return null; }
    };
    const localMap = readLocalMap();
    if (localMap) return localMap;
    // 旧版单图迁移
    let legacy = null;
    try {
      const s = JSON.parse(localStorage.getItem('fin_bg') || 'null');
      if (s && typeof s === 'object' && s.img) legacy = { img: s.img, x: Number(s.x) || 50, y: Number(s.y) || 50 };
    } catch (e) { /* ignore */ }
    if (!legacy && this.mode === 'supabase' && this.user) {
      try {
        const { data, error } = await this.sb.from('banners').select('img, pos_x, pos_y').single();
        if (!error && data && typeof data.img === 'string' && data.img) {
          if (data.img[0] === '{') {
            try { const m = JSON.parse(data.img); if (m && typeof m === 'object') return m; } catch (e2) { /* ignore */ }
          } else {
            legacy = { img: data.img, x: Number(data.pos_x) || 50, y: Number(data.pos_y) || 50 };
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (legacy) {
      const map = {};
      HERO_PAGES.forEach(p => { map[p] = { img: legacy.img, x: legacy.x, y: legacy.y }; });
      return map;
    }
    return null;
  },
  async saveHeroMap(map) {
    const safe = {};
    HERO_PAGES.forEach(p => {
      const h = (map && map[p]) || {};
      safe[p] = { img: typeof h.img === 'string' ? h.img : '', x: Number(h.x) || 50, y: Number(h.y) || 50 };
    });
    try { localStorage.setItem('fin_hero_v1', JSON.stringify(safe)); } catch (e) { /* ignore */ }
    if (this.mode === 'supabase' && this.user) {
      try {
        await this.sb.from('banners').upsert({
          user_id: this.user.id,
          img: JSON.stringify(safe),
          pos_x: 50, pos_y: 50,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (e) { /* 尽力而为，失败不影响本地 */ }
    }
  },

  _dbErr(e) {
    const m = (e && e.message) || '保存失败';
    if (/row-level security/i.test(m)) return '权限不足（RLS），请检查 Supabase 安全策略';
    if (/Could not find the '.*' column/i.test(m)) return '云端数据表缺少字段，请到「设置」页重新执行建表 SQL 升级表结构';
    if (/Could not find the table/i.test(m) || (/relation/i.test(m) && /not exist/i.test(m))) return '数据表不存在，请先在「设置」中执行建表 SQL';
    if (/Failed to fetch|NetworkError/i.test(m)) return '网络不可用，保存失败';
    return m;
  },

  /* ---------- 实时同步 ---------- */
  _subscribeRealtime() {
    if (this.mode !== 'supabase' || this._realtimeOn) return;
    this._realtimeOn = true;
    const ch = this.sb.channel('fin-db-changes');
    ['ledgers', 'categories', 'records', 'budgets', 'templates', 'bills'].forEach(t => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => this._emitData());
    });
    ch.subscribe();
  },

  /* ---------- 测试连接 ---------- */
  async testConnection() {
    if (this.mode !== 'supabase') return { ok: false, msg: '当前为本地模式，未连接 Supabase' };
    try {
      const { error } = await this.sb.from('ledgers').select('id').limit(1);
      if (error) {
        if (this._isTableErr(error)) {
          return { ok: true, msg: '连接成功（数据表尚未创建，请在 Supabase SQL Editor 执行建表 SQL）' };
        }
        return { ok: false, msg: this._dbErr(error) };
      }
      return { ok: true, msg: '连接成功，数据表可访问' };
    } catch (e) {
      return { ok: false, msg: '无法连接到 Supabase：' + (e.message || e) };
    }
  },

  /* ---------- 导出 / 导入 ---------- */
  async exportAll() {
    const [ledgers, categories, records, budgets, templates] = await Promise.all([
      this.list('ledgers'), this.list('categories'), this.list('records'), this.list('budgets'), this.list('templates')
    ]);
    return { exported_at: new Date().toISOString(), mode: this.mode, ledgers, categories, records, budgets, templates };
  },

  async importAll(data, replace = false) {
    for (const table of ['ledgers', 'categories', 'records', 'budgets', 'templates']) {
      const rows = data[table] || [];
      if (replace) {
        const old = await this.list(table);
        for (const r of old) await this.remove(table, r.id);
      }
      for (const r of rows) {
        const row = { ...r };
        delete row.user_id; delete row.created_at;
        await this.insert(table, row);
      }
    }
  }
};
