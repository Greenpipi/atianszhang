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
  /* 自己刚写过库：记一个时间戳，realtime 回声在窗口内直接丢弃，
     避免「保存 → 自己收到变更 → 又全量重载」的自读回环 */
  _noteWrite() { this._lastWriteAt = Date.now(); },

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
     且导入去重比对也看不到全部，导致重复导入。按 500/页拉全。
     提速：先取首页并带回 count，其余页一次性并发发出（原来串行 6 个来回 → 现在 2 个）。 */
  async _listPaged(table, cols) {
    const PAGE = 500;
    const sel = cols || '*';
    const page = from => this.sb.from(table).select(sel, { count: 'exact' })
      .order('created_at', { ascending: true }).range(from, from + PAGE - 1);

    const first = await page(0);
    if (first.error) throw first.error;
    const rows = (first.data || []).slice();
    const total = typeof first.count === 'number' ? first.count : null;

    // 服务端没回 count（代理/旧版本）：退回顺序翻页，保证一条不漏
    if (total === null) {
      if (rows.length < PAGE) return rows;
      let from = rows.length;
      for (;;) {
        const r = await page(from);
        if (r.error) throw r.error;
        const batch = r.data || [];
        for (const x of batch) rows.push(x);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    }
    if (total <= rows.length) return rows;

    const rest = [];
    for (let from = rows.length; from < total; from += PAGE) rest.push(page(from));
    for (const r of await Promise.all(rest)) {
      if (r.error) throw r.error;
      for (const x of (r.data || [])) rows.push(x);
    }
    return rows;
  },

  /* records 的轻量列集：不含 images / image（base64 dataURL，单张 60–120KB）。
     列表、统计、预算、好物卡片全部用不到原图，图片改为进入页面时按需单条拉取。
     首屏因此不再下载全部图片，本地快照也不会撑爆 localStorage 配额。 */
  RECORD_COLS: 'id,ledger_id,category,sub,amount,note,remark,favorite,tags,rental,'
    + 'purchase_platform,attribute,rating,date,kind,status,status_since,created_at',

  /* 按 id 批量取图片（records.images，缺列时回退老的单图 image） */
  async fetchImages(ids) {
    const out = {};
    const list = (ids || []).filter(Boolean);
    if (!list.length) return out;
    if (this.mode !== 'supabase') {
      const db = this._localRead();
      for (const r of ((db && db.records) || [])) {
        if (list.indexOf(r.id) < 0) continue;
        out[r.id] = Array.isArray(r.images) ? r.images : (r.image ? [r.image] : []);
      }
      return out;
    }
    const take = arr => {
      for (const r of (arr || [])) {
        out[r.id] = Array.isArray(r.images) ? r.images.filter(Boolean) : (r.image ? [r.image] : []);
      }
    };
    for (let i = 0; i < list.length; i += 40) {
      const chunk = list.slice(i, i + 40);
      try {
        const { data, error } = await this.sb.from('records').select('id,images,image').in('id', chunk);
        if (error) {
          // images 列缺失：退回只取老的单图列
          if (this._isColErr(error)) {
            const r2 = await this.sb.from('records').select('id,image').in('id', chunk);
            if (!r2.error) take(r2.data);
          }
          continue;
        }
        take(data);
      } catch (e) { /* 图片取不到不影响主体数据 */ }
    }
    return out;
  },

  async list(table) {
    if (this.mode === 'supabase') {
      try {
        const cols = table === 'records' && this._recordColsOk !== false ? this.RECORD_COLS : null;
        try {
          return await this._listPaged(table, cols);
        } catch (e2) {
          // 轻量列集不被识别（库里缺某列）：退回全列，绝不因为取数优化把页面弄白
          if (!cols || this._isTableErr(e2)) throw e2;
          this._recordColsOk = false;
          console.warn('records 轻量列集不可用，退回 select(*)', e2);
          return await this._listPaged(table, null);
        }
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
      this._noteWrite();
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
        this._noteWrite();
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
          this._noteWrite();
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

  /* 原子认领某一期：只有 paid_period 仍早于 occurrence 时才写入成功。
     手动「已付」、前端自动补算、服务端定时任务都走这里，避免同一期重复入账。 */
  async claimBillPeriod(id, occurrence, patch) {
    if (this.mode === 'supabase' && this.user) {
      try {
        const p = this._stripNoCols('bills', patch);
        if (!Object.keys(p).length) return false;
        const { data, error } = await this.sb.from('bills')
          .update(p).eq('id', id).lt('paid_period', occurrence).select();
        if (error) {
          if (this._isColErr(error)) {
            const col = this._colName(error);
            if (col) { this._noCols.add('bills.' + col); return this.claimBillPeriod(id, occurrence, patch); }
          }
          throw error;
        }
        return !!(data && data.length) && (this._noteWrite(), true);
      } catch (e) {
        if (this._isTableErr(e)) this._fallbackToLocal();
        else throw new Error(this._dbErr(e));
      }
    }
    const db = this._localRead();
    if (!db) return true;   // 本地模式没有并发来源，认领直接通过
    const row = (db.bills || []).find(x => x.id === id);
    if (!row) return true;  // 内存里刚建、还没落本地库的账单，同样放行
    if ((row.paid_period || '') >= occurrence) return false;
    Object.assign(row, patch);
    this._localWrite(db);
    return true;
  },

  async remove(table, id) {
    if (this.mode === 'supabase') {
      try {
        const { error } = await this.sb.from(table).delete().eq('id', id);
        if (error) throw error;
        this._noteWrite();
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
    const norm = h => ({
      img: typeof h.img === 'string' ? h.img : '',
      x: h.x == null ? 50 : Number(h.x),
      y: h.y == null ? 50 : Number(h.y)
    });
    const localMap = readLocalMap();

    // 云端镜像：banners.img 里存的是整张 JSON map（不改表结构）；老数据是单张 data URL
    let cloudMap = null, legacy = null;
    if (this.mode === 'supabase' && this.user) {
      try {
        const { data, error } = await this.sb.from('banners').select('img, pos_x, pos_y').single();
        if (!error && data && typeof data.img === 'string' && data.img) {
          if (data.img[0] === '{') {
            try { const m = JSON.parse(data.img); if (m && typeof m === 'object') cloudMap = m; } catch (e2) { /* ignore */ }
          } else {
            legacy = { img: data.img, x: Number(data.pos_x) || 50, y: Number(data.pos_y) || 50 };
          }
        }
      } catch (e) { /* 网络/RLS 失败时按本机处理 */ }
    }
    if (!cloudMap && !legacy) {
      // 旧版本地单图（fin_bg）迁移
      try {
        const s = JSON.parse(localStorage.getItem('fin_bg') || 'null');
        if (s && typeof s === 'object' && s.img) legacy = { img: s.img, x: Number(s.x) || 50, y: Number(s.y) || 50 };
      } catch (e) { /* ignore */ }
    }
    if (!localMap && !cloudMap && !legacy) return null;

    // 逐页合并：本机有该页配置（含刻意清空）就尊重本机，否则用云端，
    // 这样换设备/换浏览器也能拿到云端图，同时不会把「已恢复默认」的页又顶回旧图
    const map = {};
    let cloudOnly = 0;
    HERO_PAGES.forEach(p => {
      const l = localMap && localMap[p];
      const c = cloudMap && cloudMap[p];
      if (l && typeof l === 'object') map[p] = norm(l);
      else if (c && typeof c === 'object') { map[p] = norm(c); cloudOnly++; }
      else if (legacy) map[p] = { img: legacy.img, x: legacy.x, y: legacy.y };
    });

    // 把只在云端存在的页面落回本机，下次离线/弱网也能直接出图
    if (cloudOnly > 0) {
      try { localStorage.setItem('fin_hero_v1', JSON.stringify(map)); } catch (e) { /* 配额不足就跳过 */ }
    }
    return map;
  },
  async saveHeroMap(map) {
    const safe = {};
    HERO_PAGES.forEach(p => {
      const h = (map && map[p]) || {};
      safe[p] = { img: typeof h.img === 'string' ? h.img : '', x: Number(h.x) || 50, y: Number(h.y) || 50 };
    });
    try { localStorage.setItem('fin_hero_v1', JSON.stringify(safe)); } catch (e) { this.lastHeroLocalErr = e; }
    if (this.mode === 'supabase' && this.user) {
      try {
        const { error } = await this.sb.from('banners').upsert({
          user_id: this.user.id,
          img: JSON.stringify(safe),
          pos_x: 50, pos_y: 50,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) {
          // 不再静默吞掉：云端写失败时把原因带回上层，页面可提示「仅存本机」
          this.lastHeroCloudErr = error;
          console.warn('背景配置云端同步失败（已保留在本机）', error);
          return false;
        }
        this.lastHeroCloudErr = null;
        return true;
      } catch (e) {
        this.lastHeroCloudErr = e;
        console.warn('背景配置云端同步失败（已保留在本机）', e);
        return false;
      }
    }
    return false;
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
    // 只订阅高频变更、且直接决定当前视图的 3 张核心表：流水 / 预算 / 待办。
    // ledgers / categories / templates 变更频率极低（只有本机改设置时才动），
    // 而本机改完自己会 loadData 刷新，无需实时通道；
    // 去掉后每个客户端少 3 个订阅，也避免别的设备改分类时触发本机全表重载。
    ['records', 'budgets', 'bills'].forEach(t => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        // 自己刚写库（2.5s 内）的变更回声直接丢弃：保存流程本身已经本地更新过 UI，
        // 再来一轮全量 loadData 就是纯浪费（原来一次保存要拉两到三轮全表）
        if (Date.now() - (this._lastWriteAt || 0) < 2500) return;
        this._emitData();
      });
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
