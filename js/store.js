/* ============ 数据层：Supabase / 本地双模式 ============ */
const Store = {
  mode: 'local',          // 'local' | 'supabase'
  sb: null,
  user: null,             // { id, email }
  cfg: { url: '', key: '' },
  _realtimeOn: false,
  _noTagsCol: false,      // records.tags 列缺失（云端未执行升级 SQL）时置 true
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
    return /schema cache/i.test(m)
      || /Could not find the table/i.test(m)
      || /PGRST205/i.test(m)
      || (/relation/i.test(m) && /does not exist/i.test(m));
  },
  /* records.tags 列尚未添加（PGRST204）时：剥离 tags 重试，后续不再发送 */
  _isTagsColErr(e) {
    const m = (e && e.message) || String(e || '');
    return /PGRST204/.test(m) || /Could not find the 'tags' column/i.test(m);
  },
  _stripTags(row) { const r = { ...row }; delete r.tags; return r; },
  _fallbackToLocal() {
    if (this.mode !== 'supabase') return;
    this.mode = 'local';
    this._realtimeOn = false;
    if (this.onCloudMissing) this.onCloudMissing();
  },

  /* ---------- 通用 CRUD（按用户隔离） ---------- */
  async list(table) {
    if (this.mode === 'supabase') {
      try {
        const { data, error } = await this.sb.from(table).select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead();
    return db ? (db[table] || []) : [];
  },

  async insert(table, row) {
    if (this.mode === 'supabase') {
      try {
        const payload = { ...row, user_id: this.user.id };
        if (this._noTagsCol) delete payload.tags;
        const { data, error } = await this.sb.from(table).insert(payload).select().single();
        if (error) {
          if (table === 'records' && 'tags' in payload && this._isTagsColErr(error)) {
            this._noTagsCol = true;
            const { data: d2, error: e2 } = await this.sb.from(table).insert(this._stripTags(payload)).select().single();
            if (e2) throw e2;
            return d2;
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
        const payload = this._noTagsCol ? this._stripTags(patch) : { ...patch };
        const { error } = await this.sb.from(table).update(payload).eq('id', id);
        if (error) {
          if (table === 'records' && 'tags' in patch && this._isTagsColErr(error)) {
            this._noTagsCol = true;
            const { error: e2 } = await this.sb.from(table).update(this._stripTags(patch)).eq('id', id);
            if (e2) throw e2;
            return;
          }
          throw error;
        }
        return;
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead() || {};
    db[table] = (db[table] || []).map(r => r.id === id ? { ...r, ...patch } : r);
    this._localWrite(db);
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

  _dbErr(e) {
    const m = (e && e.message) || '保存失败';
    if (/row-level security/i.test(m)) return '权限不足（RLS），请检查 Supabase 安全策略';
    if (/relation/i.test(m) && /not exist/i.test(m)) return '数据表不存在，请先在「设置」中执行建表 SQL';
    if (/Failed to fetch|NetworkError/i.test(m)) return '网络不可用，保存失败';
    return m;
  },

  /* ---------- 实时同步 ---------- */
  _subscribeRealtime() {
    if (this.mode !== 'supabase' || this._realtimeOn) return;
    this._realtimeOn = true;
    const ch = this.sb.channel('fin-db-changes');
    ['ledgers', 'categories', 'records', 'budgets', 'templates'].forEach(t => {
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
        if (/relation .* not exist/i.test(error.message) || /schema cache/i.test(error.message) || /Could not find the table/i.test(error.message)) {
          return { ok: true, msg: '连接成功（数据表尚未创建，请在 Supabase SQL Editor 执行建表 SQL）' };
        }
        return { ok: false, msg: this._dbErr(error) };
      }
      if (this._noTagsCol) {
        return { ok: true, msg: '连接成功（records 表缺 tags 列，好物标签暂不生效，请在 Supabase 执行：alter table records add column if not exists tags text[] not null default \'{}\';）' };
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
