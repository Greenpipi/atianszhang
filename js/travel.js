/* ============================================================
   旅行账册 · 集成在财务管家内的旅行账单 / 行程 / 日志模块
   - 多本旅行册（library）+ 每本翻开是手帐风格的内页
   - 控件沿用记账本的自定义下拉 / 日历
   - 旅行明细保存在本机（按账号隔离），不新增云端表
   - 产生的旅行账单会按「我的 AA 份额」同步到记账本 records
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'fin_travel_v1_';
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const THEMES = [
    { id: 'bloom', name: '山茶', desc: '山茶粉调 · 苔绿点缀' },
    { id: 'paper', name: '金灰', desc: '米金纸感 · 苔绿点缀' },
    { id: 'ocean', name: '海盐', desc: '海雾青蓝 · 珊瑚橙' },
    { id: 'ink', name: '墨夜', desc: '夜墨底色 · 鎏金线条' }
  ];

  const THEME_COLORS = {
    bloom: { bg: '#f8ece9', surface: '#fff8f5', ink: '#3a2628', soft: '#7c5c5e', faint: '#a98a8c', line: 'rgba(58,38,40,.16)', accent: '#a34a5a', accent2: '#6d7f6a', sun: '#d9a05a' },
    paper: { bg: '#f3efe7', surface: '#fbf8f2', ink: '#37342d', soft: '#6f685c', faint: '#9c9486', line: 'rgba(55,52,45,.16)', accent: '#a5824c', accent2: '#7c8c72', sun: '#c09a5e' },
    ocean: { bg: '#eaf2f2', surface: '#fbfefe', ink: '#17323b', soft: '#4e6b73', faint: '#7d969d', line: 'rgba(23,50,59,.16)', accent: '#2f6d78', accent2: '#c07a4a', sun: '#7fa8a3' },
    ink: { bg: '#1a1e20', surface: '#262b2e', ink: '#f7f1e3', soft: '#c6bfb0', faint: '#a79f8f', line: 'rgba(247,241,227,.20)', accent: '#e5c481', accent2: '#9fbfaf', sun: '#e5c481' }
  };

  const MOODS = [
    { id: 'excited', label: '兴奋', emoji: '🤩', color: '#BF4F2A' },
    { id: 'happy', label: '开心', emoji: '😄', color: '#D9A02A' },
    { id: 'calm', label: '平静', emoji: '🌿', color: '#2E5C4E' },
    { id: 'content', label: '满足', emoji: '😌', color: '#5C7F8C' },
    { id: 'moved', label: '感动', emoji: '🥹', color: '#8A5A6C' },
    { id: 'surprised', label: '惊喜', emoji: '✨', color: '#87689E' },
    { id: 'look', label: '期待', emoji: '🧭', color: '#7C7141' },
    { id: 'tired', label: '疲惫', emoji: '🥱', color: '#8C7B6B' },
    { id: 'emo', label: '有点 emo', emoji: '🌧️', color: '#4F6680' },
    { id: 'homesick', label: '想家', emoji: '🏠', color: '#9A6B45' },
    { id: 'hungry', label: '馋', emoji: '🍜', color: '#C97B25' },
    { id: 'broke', label: '钱包疼', emoji: '💸', color: '#A63A47' },
    { id: 'free', label: '自由', emoji: '🕊️', color: '#4E8C82' }
  ];

  const CATS = [
    { id: 'stay', label: '住宿', mark: '宿', color: '#2E5C4E' },
    { id: 'food', label: '吃喝', mark: '食', color: '#BF4F2A' },
    { id: 'ticket', label: '门票', mark: '景', color: '#5C7F8C' },
    { id: 'transport', label: '交通', mark: '行', color: '#87689E' },
    { id: 'fun', label: '玩乐', mark: '娱', color: '#D9A02A' },
    { id: 'shop', label: '购物', mark: '购', color: '#8A5A6C' },
    { id: 'other', label: '其他', mark: '杂', color: '#7A7266' }
  ];

  /* 旅行分类 → 记账本分类映射（找不到时回退到记账本第一个支出大类） */
  const RECORD_MAP = {
    stay: ['娱乐支出', '酒店度假'],
    food: ['饮食支出', '外出就餐'],
    ticket: ['娱乐支出', '景区景点'],
    transport: ['养车支出', '交通费'],
    fun: ['娱乐支出', '内容消费'],
    shop: ['日常支出', '日用品'],
    other: ['日常支出', '杂货']
  };

  const MOOD = Object.fromEntries(MOODS.map(m => [m.id, m]));
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

  /* 照片：统一走文生图接口，px 尺寸选接口支持的值 */
  const IMG_API = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=';
  function photo(prompt, size) {
    return IMG_API + encodeURIComponent(prompt) + '&image_size=' + (size || 'landscape_4_3');
  }

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(p) { return (p || 'tv') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDate(s) {
    const a = String(s || '').split('-').map(Number);
    return new Date(a[0] || 1970, (a[1] || 1) - 1, a[2] || 1);
  }
  function cnDate(s) {
    const d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEK[d.getDay()];
  }
  function shortDate(s) {
    const d = parseDate(s);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function money(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function money2(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function cents(n) { return Math.round((Number(n) || 0) * 100); }
  function yuan(c) { return Math.round(c) / 100; }
  function splitCents(totalCents, n) {
    if (!n || n <= 0) return [];
    const base = Math.floor(totalCents / n);
    let rest = totalCents - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
  }
  function nights(inD, outD) {
    const v = Math.round((parseDate(outD) - parseDate(inD)) / 86400000);
    return Math.max(1, v);
  }
  function dateRange(start, end) {
    const out = [];
    const s = parseDate(start), e = parseDate(end || start);
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const stop = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    while (cur <= stop && out.length < 90) {
      out.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function defaultMembers() {
    return [
      { id: 'me', name: '我', initial: '我', cls: 'me' }
    ];
  }

  /* ---------------- 旅行状态 ---------------- */
  const TRIP_STATUSES = [
    { id: 'plan', label: '计划中' },
    { id: 'going', label: '旅途中' },
    { id: 'done', label: '已完成' }
  ];
  function statusOf(t) {
    if (!t) return 'plan';
    // 手动标成已完成就一直是已完成；其余按日期自动流转（计划中 → 旅途中 → 已完成）
    if (t.status === 'done') return 'done';
    const today = todayStr();
    if (today < t.startDate) return 'plan';
    if (today > t.endDate) return 'done';
    return 'going';
  }
  function statusLabel(t) {
    const id = statusOf(t);
    const s = TRIP_STATUSES.find(x => x.id === id);
    return s ? s.label : '计划中';
  }

  /* ---------------- 空状态（不再内置示例册子） ---------------- */
  function emptyState() {
    return {
      version: 2,
      theme: 'bloom',
      view: 'library',
      activeTripId: '',
      tab: 'overview',
      filterCat: 'all',
      trips: []
    };
  }


  function buildDays(start, end, destination, prevDays) {
    return dateRange(start, end).map((date, i) => {
      const old = (prevDays || []).find(d => d.date === date);
      if (old) {
        return Object.assign({}, old, {
          day: i + 1,
          city: old.city || destination,
          photo: old.photo || photo(destination + ' day ' + (i + 1) + ' travel scenery, warm film photography', 'landscape_4_3')
        });
      }
      return {
        day: i + 1, date: date, city: destination, theme: '', weather: '', activities: [],
        photo: photo(destination + ' day ' + (i + 1) + ' travel scenery, local street and landscape, warm film photography', 'landscape_4_3')
      };
    });
  }

  /* ---------------- 状态读写 ---------------- */
  let state = null;
  let stateKey = '';

  function userKey() {
    try { return (typeof Store !== 'undefined' && Store.user && Store.user.email) || 'guest'; } catch (e) { return 'guest'; }
  }

  /* 旧版本内置的示例册子：加载时一并清掉，老用户也不会再看到演示数据 */
  const DEMO_TRIP_IDS = ['trip-dali', 'trip-kyoto', 'trip-quanzhou'];
  function isDemoTrip(t) {
    return !!t && (DEMO_TRIP_IDS.indexOf(t.id) >= 0 || (t.createdAt != null && Number(t.createdAt) < 1e12));
  }

  function normalizeState(s) {
    if (!s || !Array.isArray(s.trips)) return emptyState();
    s.trips = s.trips.filter(t => !isDemoTrip(t));
    if (!s.theme || !THEMES.some(t => t.id === s.theme)) s.theme = 'bloom';
    if (s.view !== 'trip') s.view = 'library';
    if (!s.trips.length) s.view = 'library';
    if (s.view === 'trip' && !s.trips.some(t => t.id === s.activeTripId)) s.view = 'library';
    if (!s.trips.some(t => t.id === s.activeTripId)) s.activeTripId = '';
    if (!s.activeTripId && s.trips[0]) s.activeTripId = s.trips[0].id;
    if (s.tab == null) s.tab = 'overview';
    if (s.filterCat == null) s.filterCat = 'all';
    s.trips.forEach(t => {
      if (!Array.isArray(t.members) || !t.members.length) t.members = defaultMembers();
      if (!Array.isArray(t.days)) t.days = [];
      if (!Array.isArray(t.hotels)) t.hotels = [];
      if (!Array.isArray(t.expenses)) t.expenses = [];
      if (!Array.isArray(t.journals)) t.journals = [];
      if (!t.cover) t.cover = photo(t.destination + ' travel scenery, film photography, travel journal cover', 'portrait_4_3');
      if (!t.budgets) t.budgets = budgetsOf(t);
    });
    return s;
  }

  function migrateV1(s) {
    const trip = {
      id: 'trip-1',
      title: (s.trip && s.trip.title) || '我的旅行',
      destination: (s.trip && s.trip.destination) || '旅行',
      startDate: (s.trip && s.trip.startDate) || todayStr(),
      endDate: (s.trip && s.trip.endDate) || todayStr(),
      budget: (s.trip && s.trip.budget) || 0,
      createdAt: Date.now(),
      members: s.members && s.members.length ? s.members : defaultMembers(),
      days: Array.isArray(s.days) ? s.days : [],
      hotels: Array.isArray(s.hotels) ? s.hotels : [],
      expenses: Array.isArray(s.expenses) ? s.expenses : [],
      journals: Array.isArray(s.journals) ? s.journals : []
    };
    trip.days.forEach((d, i) => {
      d.day = i + 1;
      if (!d.photo) d.photo = photo((d.city || trip.destination) + ' travel scenery, warm film photography', 'landscape_4_3');
    });
    trip.cover = photo(trip.destination + ' travel scenery, film photography, travel journal cover', 'portrait_4_3');
    return normalizeState({
      version: 2,
      theme: s.theme || 'bloom',
      view: 'library',
      activeTripId: trip.id,
      tab: 'overview',
      filterCat: 'all',
      trips: [trip]
    });
  }

  function loadFor(key) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 2) return normalizeState(s);
        if (s && s.version === 1) return migrateV1(s);
      }
    } catch (e) { console.warn('读取旅行数据失败', e); }
    return emptyState();
  }

  function ensureState() {
    const k = userKey();
    if (!state || stateKey !== k) {
      stateKey = k;
      state = loadFor(k);
      pullCloudOnce();
    }
    return state;
  }

  function persist() {
    state.updatedAt = Date.now();
    try { localStorage.setItem(STORAGE_PREFIX + stateKey, JSON.stringify(state)); } catch (e) { console.warn('保存旅行数据失败', e); return false; }
    pushCloudSoon();
    return true;
  }

  /* ---------------- 云端同步（Supabase travel_state 表） ----------------
     本机仍是权威缓存：先读本地立即出画面，再异步拉云端比对 updatedAt。
     示例册子（seed）不参与同步，避免新设备把演示数据反向覆盖真实账本。 */
  let cloudSync = 'idle';   // idle | syncing | done | missing | off
  let cloudTimer = null;

  function hasOwnTrips(s) {
    const list = (s && Array.isArray(s.trips)) ? s.trips : [];
    return list.some(t => !isDemoTrip(t));
  }

  function cloudReady() {
    try {
      return typeof Store !== 'undefined' && Store.mode === 'supabase' && !!Store.user
        && typeof Store.getTravelState === 'function' && typeof Store.saveTravelState === 'function';
    } catch (e) { return false; }
  }

  function pushCloudSoon() {
    if (!cloudReady() || !hasOwnTrips(state)) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      Store.saveTravelState(state).then(ok => {
        if (!ok && Store.travelMissing) {
          cloudSync = 'missing';
          warnMissingCloud();
        }
      }).catch(() => {});
    }, 800);
  }

  function warnMissingCloud() {
    if (warnMissingCloud.shown) return;
    warnMissingCloud.shown = true;
    toast('旅行账本云同步未开启：到「设置 → 建表 SQL」重新执行一次，即可跨设备同步', 'err');
  }

  function pullCloudOnce() {
    if (cloudSync !== 'idle' || !cloudReady()) { if (!cloudReady()) cloudSync = 'off'; return; }
    cloudSync = 'syncing';
    Store.getTravelState().then(row => {
      if (Store.travelMissing) { cloudSync = 'missing'; warnMissingCloud(); return; }
      const cloudOk = row && row.data && hasOwnTrips(row.data);
      if (cloudOk) {
        const ts = Date.parse(row.updated_at) || 0;
        if (ts > (Number(state.updatedAt) || 0) + 2000) {
          const next = normalizeState(row.data);
          next.updatedAt = ts;
          state = next;
          try { localStorage.setItem(STORAGE_PREFIX + stateKey, JSON.stringify(state)); } catch (e) { /* 配额不足时仅内存生效 */ }
          cloudSync = 'done';
          render();
          toast('已同步云端的旅行账本', 'ok');
          return;
        }
      }
      cloudSync = 'done';
      // 云端没有 / 比本机旧：把本机真实账本推上去（示例册子不推）
      if (hasOwnTrips(state)) pushCloudSoon();
    }).catch(() => { cloudSync = 'off'; });
  }

  /* 当前翻开的旅行册 */
  function T() {
    if (!state) return null;
    return state.trips.find(t => t.id === state.activeTripId) || null;
  }

  /* ---------------- 查询（均基于当前旅行册） ---------------- */
  function member(id) {
    const t = T();
    const m = t && t.members.find(x => x.id === id);
    return m || { id: id, name: '成员', initial: '?', cls: '' };
  }
  function allActivities() {
    const t = T();
    const out = [];
    if (!t) return out;
    t.days.forEach(d => (d.activities || []).forEach(a => out.push(Object.assign({}, a, { day: d.day, date: d.date, city: d.city }))));
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  function activityById(id) {
    const loc = locateActivity(id);
    if (!loc) return null;
    return Object.assign({}, loc.act, { day: loc.day.day, date: loc.day.date, city: loc.day.city });
  }
  function locateActivity(id) {
    const t = T();
    if (!t) return null;
    for (const d of t.days) {
      const a = (d.activities || []).find(x => x.id === id);
      if (a) return { act: a, day: d };
    }
    return null;
  }
  function expensesOfActivity(id) {
    const t = T();
    return t ? t.expenses.filter(e => e.activityId === id) : [];
  }
  function dayOfDate(date) {
    const t = T();
    if (!t) return 1;
    const exact = t.days.find(d => d.date === date);
    if (exact) return exact.day;
    return t.days[0] ? t.days[0].day : 1;
  }
  function shareCents(exp, mid) {
    const ps = exp.participants || [];
    const i = ps.indexOf(mid);
    if (i < 0) return 0;
    const arr = splitCents(cents(exp.amount), ps.length);
    return arr[i] || 0;
  }
  function myShare(exp) { return yuan(shareCents(exp, 'me')); }
  /* 住宿已付 = 所有关联到该住宿的账单（含记账本转来的定金 / 尾款）之和 */
  function hotelPaidCents(t, h) {
    return ((t && t.expenses) || []).filter(e => e.hotelId === h.id)
      .reduce((s, e) => s + cents(e.amount), 0);
  }
  function totalMyCents(t) {
    t = t || T();
    return t ? t.expenses.reduce((s, e) => s + shareCents(e, 'me'), 0) : 0;
  }
  function totalAllCents(t) {
    t = t || T();
    return t ? t.expenses.reduce((s, e) => s + cents(e.amount), 0) : 0;
  }
  /* ---------------- 分类预算 / 分类花费 ---------------- */
  const BUDGET_IDS = CATS.map(c => c.id);

  /* 兼容旧的单笔总预算：按各类「我的花费」占比自动拆分到各分类 */
  function budgetsOf(t) {
    const out = {};
    BUDGET_IDS.forEach(id => { out[id] = 0; });
    if (!t) return out;
    if (t.budgets && typeof t.budgets === 'object') {
      BUDGET_IDS.forEach(id => { out[id] = Math.max(0, Math.round(Number(t.budgets[id]) || 0)); });
      return out;
    }
    const legacy = Math.max(0, Math.round(Number(t.budget) || 0));
    if (!legacy) return out;
    const mine = {};
    let sum = 0;
    BUDGET_IDS.forEach(id => { mine[id] = 0; });
    (t.expenses || []).forEach(e => {
      const v = shareCents(e, 'me');
      if (mine[e.category] != null) mine[e.category] += v;
      sum += v;
    });
    if (!sum) {
      const base = Math.floor(legacy / BUDGET_IDS.length);
      let rest = legacy - base * BUDGET_IDS.length;
      BUDGET_IDS.forEach((id, i) => { out[id] = base + (i < rest ? 1 : 0); });
      return out;
    }
    let left = legacy;
    BUDGET_IDS.forEach((id, i) => {
      if (i === BUDGET_IDS.length - 1) { out[id] = left; return; }
      const v = Math.min(left, Math.round(legacy * mine[id] / sum));
      out[id] = v; left -= v;
    });
    return out;
  }
  function totalBudgetCents(t) {
    const b = budgetsOf(t);
    return BUDGET_IDS.reduce((s, id) => s + cents(b[id]), 0);
  }
  function catSpend(t) {
    return CATS.map(c => {
      const items = (t ? t.expenses : []).filter(e => e.category === c.id);
      return {
        id: c.id, label: c.label, mark: c.mark, color: c.color,
        all: items.reduce((s, e) => s + cents(e.amount), 0),
        mine: items.reduce((s, e) => s + shareCents(e, 'me'), 0),
        items
      };
    });
  }
  function memberName(t, id) {
    const m = (t.members || []).find(x => x.id === id);
    return m ? m.name : (id === 'me' ? '我' : '朋友');
  }

  /* 我 与某位成员之间的账：对方欠我 / 我欠对方，以及每一笔明细 */
  function pairStats(t, mid) {
    let theyOwe = 0, iOwe = 0;
    const items = [];
    (t.expenses || []).forEach(e => {
      const ps = e.participants || [];
      if (ps.indexOf(mid) < 0) return;
      if (e.payerId === 'me') {
        const c = shareCents(e, mid);
        if (c > 0) { theyOwe += c; items.push({ exp: e, cents: c, dir: 1 }); }
      } else if (e.payerId === mid) {
        const c = shareCents(e, 'me');
        if (c > 0) { iOwe += c; items.push({ exp: e, cents: c, dir: -1 }); }
      }
    });
    items.sort((a, b) => String(a.exp.date).localeCompare(String(b.exp.date)));
    return { theyOwe, iOwe, net: theyOwe - iOwe, items };
  }

  function settlement() {
    const t = T();
    if (!t) return { rows: [], pairs: [], transfers: [], totalCents: 0, meName: '我' };
    const rows = t.members.map(m => Object.assign({}, m, { paid: 0, share: 0, net: 0 }));
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    t.expenses.forEach(e => {
      const amt = cents(e.amount);
      if (byId[e.payerId]) byId[e.payerId].paid += amt;
      const ps = e.participants || [];
      const parts = splitCents(amt, ps.length);
      ps.forEach((pid, i) => { if (byId[pid]) byId[pid].share += parts[i] || 0; });
    });
    rows.forEach(r => { r.net = r.paid - r.share; });

    /* 两人之间的往来：谁欠谁、每笔消费各分担多少 */
    const debts = {};
    const addDebt = (a, b, c, e) => {
      if (!c) return;
      if (!debts[a]) debts[a] = {};
      if (!debts[a][b]) debts[a][b] = { cents: 0, items: [] };
      debts[a][b].cents += c;
      debts[a][b].items.push({ exp: e, cents: c });
    };
    t.expenses.forEach(e => {
      const payer = e.payerId;
      const ps = e.participants || [];
      const parts = splitCents(cents(e.amount), ps.length);
      ps.forEach((pid, i) => { if (pid !== payer) addDebt(pid, payer, parts[i] || 0, e); });
    });

    const seen = {};
    const transfers = [];
    Object.keys(debts).forEach(a => {
      Object.keys(debts[a]).forEach(b => {
        const key = [a, b].sort().join('|');
        if (seen[key]) return;
        seen[key] = 1;
        const ab = (debts[a] && debts[a][b] && debts[a][b].cents) || 0;
        const ba = (debts[b] && debts[b][a] && debts[b][a].cents) || 0;
        const net = ab - ba;
        if (Math.abs(net) > 0.5) {
          const fromId = net > 0 ? a : b;
          const toId = net > 0 ? b : a;
          transfers.push({ fromId, toId, from: memberName(t, fromId), to: memberName(t, toId), cents: Math.abs(net) });
        }
      });
    });
    transfers.sort((x, y) => y.cents - x.cents);

    const me = t.members.find(m => m.id === 'me') || { name: '我' };
    const pairs = t.members.filter(m => m.id !== 'me').map(m => Object.assign(
      { id: m.id, name: m.name, initial: m.initial, cls: m.cls },
      pairStats(t, m.id)
    ));
    return { rows, pairs, transfers, totalCents: totalAllCents(t), meName: me.name };
  }

  /* ---------------- 与记账本同步 ---------------- */
  /* 记账本里当前个人账本的大类 / 小类 */
  function ledgerCategories() {
    const app = typeof App !== 'undefined' ? App : null;
    if (!app || !app.state) return [];
    const ledgers = app.state.ledgers || [];
    const ledger = ledgers.find(l => l.type === 'personal') || (app.curLedger && app.curLedger());
    if (!ledger) return [];
    const cats = (app.state.categories || []).filter(c => c.ledger_id === ledger.id && c.kind !== 'income');
    if (cats.length) return cats;
    return CATS.map(c => ({ name: c.label, subs: [] }));
  }

  /* 记账本大类 / 小类 → 旅行分类 id（用于图标 / 分类统计）
     先看小类关键词再看大类：同一个「娱乐支出」下，酒店度假→住宿、景区景点→门票、内容消费→玩乐 */
  function travelCatId(catName, subName) {
    const s = String(catName || '') + ' ' + String(subName || '');
    if (/酒店|民宿|住宿|客栈|旅馆|青旅|房租/.test(s)) return 'stay';
    if (/交通|打车|机票|高铁|火车|地铁|公交|油|停车|过路|租车|充电|车费/.test(s)) return 'transport';
    if (/门票|景点|景区|演出|展览|游船/.test(s)) return 'ticket';
    if (/食|餐|饮|咖啡|奶茶|外卖|零食|甜品/.test(s)) return 'food';
    if (/娱乐|玩乐|电影|游戏|酒吧|ktv/i.test(s)) return 'fun';
    if (/购物|日用|服饰|美妆|数码|文创/.test(s)) return 'shop';
    for (const id in RECORD_MAP) {
      if (RECORD_MAP[id][0] === catName) return id;
    }
    return 'other';
  }

  function resolveTarget(exp) {
    const app = typeof App !== 'undefined' ? App : null;
    if (!app || !app.state) return null;
    const ledgers = app.state.ledgers || [];
    const ledger = ledgers.find(l => l.type === 'personal') || (app.curLedger && app.curLedger());
    if (!ledger) return null;
    const cats = (app.state.categories || []).filter(c => c.ledger_id === ledger.id && c.kind !== 'income');
    if (!cats.length) return null;
    if (exp && exp.ledgerCat) {
      const own = cats.find(c => c.name === exp.ledgerCat);
      if (own) {
        const subs = Array.isArray(own.subs) ? own.subs : [];
        const sub = subs.indexOf(exp.ledgerSub) >= 0 ? exp.ledgerSub : (subs[0] || '');
        return { ledger_id: ledger.id, category: own.name, sub: sub, kind: 'expense' };
      }
    }
    const pair = RECORD_MAP[(exp && exp.category) || 'other'] || RECORD_MAP.other;
    const cat = cats.find(c => c.name === pair[0]) || cats[0];
    const subs = Array.isArray(cat.subs) ? cat.subs : [];
    const sub = subs.indexOf(pair[1]) >= 0 ? pair[1] : (subs[0] || '');
    return { ledger_id: ledger.id, category: cat.name, sub: sub, kind: 'expense' };
  }

  function recordPayload(exp) {
    const t = T();
    const target = resolveTarget(exp);
    const mine = myShare(exp);
    if (!target || mine <= 0) return null;
    const n = (exp.participants || []).length;
    const aa = n > 1 ? '（' + n + ' 人 AA，已记我的份额）' : '';
    return {
      ledger_id: target.ledger_id, category: target.category, sub: target.sub, kind: 'expense',
      amount: mine, date: exp.date,
      note: '旅行 · ' + (t ? t.title : '') + '｜' + exp.title + aa,
      favorite: false, tags: [], rating: 0, image: null
    };
  }

  function toast(msg, type) {
    if (typeof App !== 'undefined' && App.toast) App.toast(msg, type || 'ok');
  }

  function dropRecord(rid) {
    if (!rid || typeof App === 'undefined' || !App.state) return;
    const i = App.state.records.findIndex(r => r.id === rid);
    if (i >= 0) App.state.records.splice(i, 1);
    try { Store.remove('records', rid); } catch (e) { /* ignore */ }
    if (App._cacheSnapshot) App._cacheSnapshot();
  }

  function syncRecord(exp) {
    if (typeof App === 'undefined' || !App.state) return;
    /* 记账本转来的镜像账单：金额 / 日期以旅行侧修改为准回写，但绝不重建或删除原记录 */
    if (exp && exp.mirror) {
      if (!exp.recordId) return;
      const rec = App.state.records.find(r => r.id === exp.recordId);
      if (!rec) return;
      rec.amount = myShare(exp);
      rec.date = exp.date;
      try { Store.update('records', exp.recordId, { amount: rec.amount, date: rec.date }); } catch (e) { /* ignore */ }
      if (App._cacheSnapshot) App._cacheSnapshot();
      return;
    }
    const payload = exp.sync === false ? null : recordPayload(exp);
    if (!payload) {
      if (exp.recordId) { dropRecord(exp.recordId); exp.recordId = null; persist(); }
      return;
    }
    if (exp.recordId) {
      const rec = App.state.records.find(r => r.id === exp.recordId);
      if (rec) {
        Object.assign(rec, payload);
        try { Store.update('records', exp.recordId, payload); } catch (e) { /* ignore */ }
        if (App._cacheSnapshot) App._cacheSnapshot();
        return;
      }
    }
    /* 本地先插入临时行，云端返回后替换为真实 id */
    const temp = Object.assign({}, payload, { id: uid('rec'), created_at: new Date().toISOString(), _pending: true });
    App.state.records.push(temp);
    exp.recordId = temp.id;
    persist();
    if (App._cacheSnapshot) App._cacheSnapshot();
    try {
      Store.insert('records', payload).then(row => {
        const i = App.state.records.findIndex(r => r.id === temp.id);
        if (row && row.id) {
          if (i >= 0) App.state.records[i] = row;
          exp.recordId = row.id;
        } else if (i >= 0) {
          delete App.state.records[i]._pending;
        }
        persist();
        if (App._cacheSnapshot) App._cacheSnapshot();
      }).catch(err => {
        const i = App.state.records.findIndex(r => r.id === temp.id);
        if (i >= 0) App.state.records.splice(i, 1);
        exp.recordId = null;
        persist();
        toast('同步到记账本失败：' + ((err && err.message) || err), 'err');
      });
    } catch (e) {
      toast('同步到记账本失败：' + (e.message || e), 'err');
    }
  }

  /* ---------------- 记账本 ⇄ 旅行账册 关联 ----------------
     关联信息只存在旅行侧（expenses[].recordId / hotelId），不改记账本表结构。
     记账本保存后调用 attachRecord，删除时调用 unlinkRecord。 */
  /* 找到某笔记账记录对应的旅行账单：既包括记账本转来的镜像，也包括旅行册自己生成后写入记账本的账单 */
  function linkExpenseOf(recordId) {
    if (!state || !recordId) return null;
    for (const t of (state.trips || [])) {
      const exp = (t.expenses || []).find(e => e.recordId === recordId);
      if (exp) return { trip: t, exp: exp };
    }
    return null;
  }
  function tripById(tripId) {
    ensureState();
    return (state.trips || []).find(t => t.id === tripId) || null;
  }
  /* 记账弹窗用：所有未完成的旅行（计划中 / 旅途中） */
  function activeTrips() {
    ensureState();
    return (state.trips || []).filter(t => statusOf(t) !== 'done').map(t => ({
      id: t.id,
      title: t.title || t.destination || '旅行',
      destination: t.destination || '',
      status: statusOf(t),
      statusLabel: statusLabel(t),
      startDate: t.startDate,
      endDate: t.endDate
    }));
  }
  function hotelsOf(tripId) {
    const t = tripById(tripId);
    return t ? (t.hotels || []).map(h => ({ id: h.id, name: h.name || '未命名住宿' })) : [];
  }
  /* 单本旅行的摘要：编辑已完成旅行的账单时，勾选项仍要能显示出来 */
  function tripBrief(tripId) {
    const t = tripById(tripId);
    if (!t) return null;
    return {
      id: t.id, title: t.title || t.destination || '旅行', destination: t.destination || '',
      status: statusOf(t), statusLabel: statusLabel(t), startDate: t.startDate, endDate: t.endDate
    };
  }
  function linkOfRecord(recordId) {
    ensureState();
    const m = linkExpenseOf(recordId);
    return m ? { tripId: m.trip.id, hotelId: m.exp.hotelId || '', origin: m.exp.mirror ? 'ledger' : 'travel' } : null;
  }
  /* 记账本保存 → 写入 / 更新旅行账册里的镜像账单；tripId 为空表示取消关联 */
  function attachRecord(rec, opts) {
    ensureState();
    if (!rec || !rec.id) return;
    const tripId = opts && opts.tripId;
    const existed = linkExpenseOf(rec.id);
    if (!tripId) {
      if (existed) {
        if (existed.exp.mirror) existed.trip.expenses = existed.trip.expenses.filter(e => e !== existed.exp);
        else { existed.exp.recordId = ''; existed.exp.sync = false; } // 旅行册自己的账单：只取消关联，保留账单
        persist();
      }
      return;
    }
    const trip = tripById(tripId);
    if (!trip) return;
    let old = null;
    if (existed && existed.trip.id !== tripId) {
      existed.trip.expenses = existed.trip.expenses.filter(e => e !== existed.exp);
      if (existed.exp.mirror) {
        old = null;
      } else {
        // 旅行册生成的账单换到另一本旅行：连同 AA / 付款人一起搬过去
        existed.exp.hotelId = '';
        if (!Array.isArray(trip.expenses)) trip.expenses = [];
        trip.expenses.push(existed.exp);
        old = existed.exp;
      }
    } else if (existed) {
      old = existed.exp;
    } else {
      old = (trip.expenses || []).find(e => e.recordId === rec.id) || null;
    }
    let hotelId = (opts && opts.hotelId) || '';
    if (hotelId === '__new') {
      // 只有住宿类消费才会走到这里：新建一间「先付定金」的住宿，房费总额按已付账单汇总
      const name = String((opts && opts.hotelName) || rec.note || rec.sub || '住宿').trim();
      const h = {
        id: uid('h'), name: name, address: '', checkIn: rec.date, checkOut: rec.date,
        amount: 0, payerId: 'me', participants: ['me'], note: '', fromRecord: true
      };
      if (!Array.isArray(trip.hotels)) trip.hotels = [];
      trip.hotels.push(h);
      hotelId = h.id;
    }
    const date = rec.date || todayStr();
    const patch = {
      title: rec.note || rec.sub || rec.category || '记账',
      amount: Number(rec.amount) || 0,
      ledgerCat: rec.category || '',
      ledgerSub: rec.sub || '',
      category: travelCatId(rec.category, rec.sub),
      date: date,
      day: dayOfDate(date),
      payerId: 'me',
      participants: ['me'],
      note: rec.remark || '',
      sync: true,
      mirror: true,
      recordId: rec.id,
      hotelId: hotelId
    };
    if (old) {
      // 旅行册自己生成的账单以旅行侧为准（金额是全额、含 AA），这里只同步住宿关联，不覆盖 AA / 付款人
      if (old.mirror) Object.assign(old, patch);
      else old.hotelId = hotelId;
    } else {
      trip.expenses.push(Object.assign({ id: uid('e') }, patch));
    }
    persist();
    if (typeof App !== 'undefined' && App.state && App.state.route === 'travel') render();
  }
  function unlinkRecord(recordId) {
    ensureState();
    const m = linkExpenseOf(recordId);
    if (!m) return;
    if (m.exp.mirror) m.trip.expenses = m.trip.expenses.filter(e => e !== m.exp);
    else { m.exp.recordId = ''; m.exp.sync = false; } // 旅行册自己的账单只解除关联
    persist();
    if (typeof App !== 'undefined' && App.state && App.state.route === 'travel') render();
  }
  /* 新增记账先在本地用临时 id 插入，云端返回真实 id 后把关联改过去 */
  function rebindRecordId(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    let hit = false;
    (state && state.trips || []).forEach(t => (t.expenses || []).forEach(e => {
      if (e.recordId === oldId) { e.recordId = newId; hit = true; }
    }));
    if (hit) persist();
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(next) {
    if (!THEMES.some(t => t.id === next)) next = 'bloom';
    state.theme = next;
    persist();
    const root = document.querySelector('#view-travel .tv-app');
    if (root) root.dataset.theme = next;
    document.querySelectorAll('#view-travel [data-theme-set]').forEach(b => {
      b.classList.toggle('on', b.dataset.themeSet === next);
    });
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    ensureState();
    const root = document.getElementById('view-travel');
    if (!root) return;
    const t = T();
    root.innerHTML = '<div class="tv-app" data-theme="' + esc(state.theme || 'bloom') + '">' +
      (state.view === 'trip' && t ? renderTripShell(t) : renderLibraryShell()) +
      '</div>';
    bind(root);
  }

  function renderBrandline() {
    return '<div class="tv-brandline">' +
      '<div class="tv-brand">' +
        '<span class="tv-stamp">旅</span>' +
        '<div><h2>旅行账册</h2><p>' + (state.view === 'trip'
          ? 'TRAVEL JOURNAL · ' + dateRange(T().startDate, T().endDate).length + ' DAYS'
          : 'TRAVEL BOOKS · ' + state.trips.length + ' 本') + '</p></div>' +
      '</div>' +
      '<div class="tv-theme-wrap">' +
        '<span class="tv-theme-label">风格</span>' +
        '<div class="tv-themes">' +
          THEMES.map(t => '<button type="button" class="tv-theme' + (state.theme === t.id ? ' on' : '') + '" data-theme-set="' + t.id + '" title="' + esc(t.name + ' · ' + t.desc) + '"><i class="sw sw-' + t.id + '"></i><span>' + esc(t.name) + '</span></button>').join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 旅行册书架 ---------- */
  function renderLibraryShell() {
    return '<header class="tv-head">' + renderBrandline() + '</header>' +
      '<main class="tv-body">' + renderLibrary() + '</main>';
  }

  function latestJournals(t, n) {
    return (t.journals || []).slice().sort((a, b) =>
      (String(b.date) + String(b.created || 0)).localeCompare(String(a.date) + String(a.created || 0))
    ).slice(0, n);
  }

  /* 封面上随机大小贴 2-3 个心情 emoji（可用封面编辑器手动挑选） */
  function coverMoods(t) {
    let list;
    if (Array.isArray(t.coverMoods) && t.coverMoods.length) {
      list = t.coverMoods.map(id => MOOD[id]).filter(Boolean);
    } else {
      const seen = {};
      list = [];
      latestJournals(t, 8).forEach(j => {
        const md = MOOD[j.mood];
        if (md && !seen[md.id]) { seen[md.id] = 1; list.push(md); }
      });
    }
    if (!list.length) return '';
    let h = 0;
    for (let i = 0; i < String(t.id).length; i++) h = (h * 31 + String(t.id).charCodeAt(i)) % 997;
    return list.slice(0, 3).map((md, i) => {
      const size = [34, 21, 27][i] + (h + i * 11) % 7;
      const rot = [-11, 9, -6][i] + (h + i * 5) % 8;
      return '<span class="tv-book-mood mm' + i + '" style="font-size:' + size + 'px;--rot:' + rot + 'deg">' + md.emoji + '</span>';
    }).join('');
  }

  function renderLibrary() {
    const trips = state.trips.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    const rots = [-2.4, 1.7, -1.3, 2.2, -1.8, 1.4];
    return '<section class="tv-library">' +
        '<div class="tv-lib-intro">' +
          '<div>' +
            '<span class="tv-eyebrow">My travel books</span>' +
            '<h3>我的旅行册</h3>' +
            '<p>' + (trips.length ? '每出发一次，就多一本贴满照片、票根和心情的手帐。点开一本翻看。' : '还没有旅行册。新建一本，把下一段旅程记下来。') + '</p>' +
          '</div>' +
          '<button type="button" class="tv-btn solid" data-act="new-trip">＋ 新建旅行册</button>' +
        '</div>' +
        '<div class="tv-books">' +
          trips.map((t, i) => {
            const days = t.days.length || dateRange(t.startDate, t.endDate).length;
            const my = yuan(totalMyCents(t));
            return '<article class="tv-book" data-act="open-trip" data-id="' + esc(t.id) + '" style="--rot:' + rots[i % rots.length] + 'deg">' +
              '<div class="tv-book-stack s1"></div><div class="tv-book-stack s2"></div>' +
              '<div class="tv-book-cover">' +
                '<img src="' + esc(t.cover) + '" referrerpolicy="no-referrer" alt="' + esc(t.destination) + '" loading="lazy" data-act="edit-cover" data-id="' + esc(t.id) + '" title="点击更换封面">' +
                '<span class="tv-book-tape"></span>' +
                '<span class="tv-book-stamp st-' + statusOf(t) + '">' + statusLabel(t) + '</span>' +
                '<span class="tv-book-moods">' + coverMoods(t) + '</span>' +
                '<div class="tv-book-tools">' +
                  '<button type="button" data-act="edit-trip" data-id="' + esc(t.id) + '" title="编辑这本">✎</button>' +
                  '<button type="button" data-act="delete-trip" data-id="' + esc(t.id) + '" title="删除这本">×</button>' +
                '</div>' +
                '<div class="tv-book-title">' +
                  '<span>' + esc(String(t.startDate || '').slice(0, 4)) + ' · ' + esc(t.destination) + '</span>' +
                  '<h3>' + esc(t.title) + '</h3>' +
                  '<p>' + esc(shortDate(t.startDate)) + ' — ' + esc(shortDate(t.endDate)) + '</p>' +
                '</div>' +
              '</div>' +
              '<div class="tv-book-foot">' +
                '<span>' + days + ' 天 · ' + t.members.length + ' 人</span>' +
                '<em>我的花费</em><b>' + money(my) + '</b>' +
              '</div>' +
            '</article>';
          }).join('') +
          '<button type="button" class="tv-book tv-book-new" data-act="new-trip">' +
            '<span class="tv-book-plus">＋</span>' +
            '<b>新建旅行册</b>' +
            '<em>把下一段旅程贴进来</em>' +
          '</button>' +
        '</div>' +
        '<div class="tv-foot">' +
          '<span>旅行册同步云端 · 账单按我的 AA 份额同步到记账本</span>' +
        '</div>' +
      '</section>';
  }

  /* ---------- 翻开一本 ---------- */
  function renderTripShell(t) {
    return '<header class="tv-head">' +
        renderBrandline() +
        renderTripBar(t) +
        renderTabs(t) +
      '</header>' +
      '<main class="tv-body">' + renderTab(t) + '</main>';
  }

  function renderTripBar(t) {
    const days = dateRange(t.startDate, t.endDate).length;
    const today = todayStr();
    const curDay = t.days.find(d => d.date === today);
    const dayNo = curDay ? curDay.day : (today < t.startDate ? 1 : (t.days.length ? t.days[t.days.length - 1].day : 1));
    const dayCap = curDay ? '今天' : (today < t.startDate ? '未出发' : '已结束');
    const mine = totalMyCents(t);
    const budget = totalBudgetCents(t);
    return '<div class="tv-tripbar">' +
        '<button type="button" class="tv-back" data-act="back-library"><span>←</span> 全部旅行册</button>' +
        '<div class="tv-tripinfo">' +
          '<span class="tv-eyebrow">' + esc(t.destination) + ' · ' + days + ' 天</span>' +
          '<div class="tv-trip-title">' +
            '<h3>' + esc(t.title) + '</h3>' +
            '<button type="button" class="tv-edit-icon" data-act="edit-trip" title="编辑册子" aria-label="编辑册子">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="tv-tripmeta">' +
            '<span>' + esc(shortDate(t.startDate)) + ' — ' + esc(shortDate(t.endDate)) + '</span>' +
            '<i></i>' +
            '<span class="tv-member-count">' + t.members.length + ' 人同行</span>' +
            '<div class="tv-people">' + t.members.map(m => '<span class="tv-avatar sm ' + esc(m.cls) + '" title="' + esc(m.name) + '">' + esc(m.initial) + '</span>').join('') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tv-trip-sum">' +
          '<span class="tv-ts-line"><em>' + dayCap + '</em><b class="c-day">DAY ' + dayNo + '</b></span>' +
          '<span class="tv-ts-line"><em>已花</em><b class="c-spent">' + money(yuan(mine)) + '</b></span>' +
          '<span class="tv-ts-line"><em>总预算</em><b class="c-budget">' + (budget > 0 ? money(yuan(budget)) : '未设置') + '</b></span>' +
        '</div>' +
      '</div>';
  }

  function renderTabs(t) {
    const groups = [
      ['记录', [
        ['overview', '总览', ''],
        ['plan', '行程', allActivities().length],
        ['journal', '日志', t.journals.length]
      ]],
      ['消费', [
        ['expenses', '账本', t.expenses.length],
        ['hotels', '住宿', t.hotels.length]
      ]],
      ['结算', [
        ['settle', '对账', '']
      ]]
    ];
    return '<nav class="tv-tabs">' + groups.map(g =>
      '<div class="tv-tab-group">' +
        '<span class="tv-tabgroup-label">' + g[0] + '</span>' +
        g[1].map(it =>
          '<button type="button" class="tv-tab' + (state.tab === it[0] ? ' on' : '') + '" data-tab="' + it[0] + '">' +
            it[1] + (it[2] !== '' ? '<em>' + it[2] + '</em>' : '') +
          '</button>').join('') +
      '</div>').join('') + '</nav>';
  }

  function renderTab(t) {
    if (state.tab === 'plan') return renderPlan(t);
    if (state.tab === 'journal') return renderJournal(t);
    if (state.tab === 'expenses') return renderExpenses(t);
    if (state.tab === 'hotels') return renderHotels(t);
    if (state.tab === 'settle') return renderSettle(t);
    return renderOverview(t);
  }

  function polaroid(src, caption, cls, rot, attrs) {
    return '<figure class="tv-polaroid ' + (cls || '') + '" style="--rot:' + (rot || -2) + 'deg">' +
      '<img src="' + esc(src) + '" referrerpolicy="no-referrer" alt="' + esc(caption) + '" loading="lazy"' + (attrs ? ' ' + attrs : '') + '>' +
      '<figcaption>' + esc(caption) + '</figcaption>' +
      '<span class="tv-tape"></span>' +
    '</figure>';
  }

  /* 总览右侧：状态戳 + 最近 2-3 条心情贴 */
  function moodNotes(t) {
    const js = latestJournals(t, 3);
    if (!js.length) {
      return '<div class="tv-mood-notes">' +
        '<span class="tv-mn-head">心情贴 · MOOD</span>' +
        '<button type="button" class="tv-mood-note empty" data-act="new-journal">' +
          '<b>还没有心情贴</b><p>写第一篇日志，把当时的心情贴在这里。</p>' +
        '</button>' +
      '</div>';
    }
    return '<div class="tv-mood-notes">' +
      '<span class="tv-mn-head">心情贴 · MOOD</span>' +
      js.map((j, i) => {
        const md = MOOD[j.mood] || MOOD.calm;
        let text = String(j.text || '').replace(/\s+/g, ' ').trim();
        if (text.length > 34) text = text.slice(0, 34) + '…';
        return '<button type="button" class="tv-mood-note mn' + i + '" data-act="edit-journal" data-id="' + esc(j.id) + '" style="--mood:' + md.color + ';--rot:' + [-2.4, 2.1, -1.4][i] + 'deg" title="点击修改这篇日志">' +
          '<span class="tv-mn-top"><i>' + md.emoji + '</i><em>' + esc(md.label) + ' · DAY ' + (j.day || dayOfDate(j.date)) + '</em></span>' +
          '<p>' + esc(text) + '</p>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  /* ---------- 总览 ---------- */
  function renderOverview(t) {
    const s = settlement();
    const total = totalAllCents(t);
    const mine = totalMyCents(t);
    const per = t.members.length ? Math.round(total / t.members.length) : 0;
    const today = todayStr();
    const day = t.days.find(d => d.date === today) || t.days[0];
    const recent = t.journals.slice().sort((a, b) => (b.date + (b.created || 0)).localeCompare(a.date + (a.created || 0))).slice(0, 3);
    const dayPhotos = t.days.filter(d => d.photo).slice(0, 2);

    return '<div class="tv-scrap-cover">' +
        '<div class="tv-scrap-photos">' +
          polaroid(t.cover, t.destination + ' · ' + String(t.startDate).slice(0, 4), 'tv-polaroid-lg', -3, 'data-act="edit-cover"') +
          dayPhotos.map((d, i) => polaroid(d.photo, d.city, 'tv-polaroid-sm', i === 0 ? 4 : -6, 'data-act="edit-day-photo" data-day="' + d.day + '"')).join('') +
          '<span class="tv-washi"></span>' +
        '</div>' +
        '<div class="tv-scrap-copy">' +
          '<span class="tv-eyebrow">Travel scrapbook</span>' +
          '<h2>' + esc(t.title) + '</h2>' +
          '<p>把每天的行程、照片、心情和共同账单贴在一起。需要 AA 的消费，记账本只记我分摊后的金额。</p>' +
          '<div class="tv-hero-acts">' +
            '<button type="button" class="tv-btn solid" data-act="new-expense">＋ 记一笔</button>' +
            '<button type="button" class="tv-btn" data-act="new-journal">写日志</button>' +
            '<button type="button" class="tv-btn" data-act="new-activity">加行程</button>' +
          '</div>' +
          '<div class="tv-stamps">' +
            '<span class="tv-stamp-mark stamp-date">' + esc(shortDate(t.startDate)) + '</span>' +
            '<span class="tv-stamp-mark stamp-route">' + esc(t.destination) + '</span>' +
            '<span class="tv-stamp-mark stamp-year">' + esc(String(t.startDate).slice(0, 4)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="tv-side">' +
          '<button type="button" class="tv-status-stamp st-' + statusOf(t) + '" data-act="edit-trip" title="修改旅行状态">' + statusLabel(t) + '</button>' +
          moodNotes(t) +
        '</div>' +
      '</div>' +
      '<div class="tv-stats">' +
        statCard('总花费', money(yuan(total)), t.expenses.length + ' 笔共同账单') +
        statCard('我的花费', money(yuan(mine)), '已按 AA 份额计算', 'accent') +
        statCard('人均', money(yuan(per)), t.members.length + ' 人均摊') +
      '</div>' +
      '<div class="tv-grid3">' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>总花费明细</h4><button type="button" class="tv-link" data-act="go-expenses">全部账单</button></div>' +
          spendDetail(t) +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>我的预算</h4><button type="button" class="tv-link" data-act="edit-budget">修改预算</button></div>' +
          budgetOverview(t) +
          '<div class="tv-budget-note">按「我的花费」计算，不含朋友那份。每类可单独设预算，下方为合计。</div>' +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>谁该给谁钱</h4><button type="button" class="tv-link" data-act="go-settle">看每笔明细</button></div>' +
          '<div class="tv-members">' +
            s.rows.map(r => {
              const p = s.pairs.find(x => x.id === r.id);
              let netTxt = '我';
              let cls = '';
              if (r.id === 'me') {
                const recv = s.pairs.reduce((a, p) => a + Math.max(0, p.net), 0);
                netTxt = recv > 0.5 ? '待收 ' + money(yuan(recv)) : '已结清';
                cls = recv > 0.5 ? 'pos' : '';
              } else if (p) {
                if (p.net > 0.5) { netTxt = '需付我 ' + money(yuan(p.net)); cls = 'pos'; }
                else if (p.net < -0.5) { netTxt = '我需付 ' + money(yuan(-p.net)); cls = 'neg'; }
                else netTxt = '已结清';
              }
              return '<div class="tv-member-row">' +
                '<span class="tv-avatar lg ' + esc(r.cls) + '">' + esc(r.initial) + '</span>' +
                '<div class="tv-member-main"><b>' + esc(r.name) + '</b><span>已垫付 ' + money(yuan(r.paid)) + ' · 应承担 ' + money(yuan(r.share)) + '</span></div>' +
                '<span class="tv-net ' + cls + '">' + netTxt + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</section>' +
      '</div>' +
      '<div class="tv-grid2 tv-grid-even">' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>住宿</h4><button type="button" class="tv-link" data-act="go-hotels">全部住宿</button></div>' +
          hotelsMini(t) +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>最近日志</h4><button type="button" class="tv-link" data-act="go-journal">全部日志</button></div>' +
          (recent.length ? '<div class="tv-mini-journals">' + recent.map(j => {
            const mood = MOOD[j.mood] || MOOD.calm;
            return '<button type="button" class="tv-mini-journal" data-act="edit-journal" data-id="' + j.id + '">' +
              '<span class="tv-mood-dot" style="background:' + mood.color + '">' + mood.emoji + '</span>' +
              '<span class="tv-mini-journal-main"><b>' + esc(mood.label) + ' · ' + esc(shortDate(j.date)) + '</b>' + esc(j.text.slice(0, 36)) + (j.text.length > 36 ? '…' : '') + '</span>' +
            '</button>';
          }).join('') + '</div>' : '<p class="tv-empty">还没有日志，记录一下今天的心情。</p>') +
        '</section>' +
      '</div>' +
      dayLane(t);
  }

  /* 昨日 / 今日 / 明日：每天的全部行程，三列并排不限高 */
  function dayLane(t) {
    if (!t.days.length) return '';
    const today = todayStr();
    let idx = t.days.findIndex(d => d.date === today);
    if (idx < 0) idx = today < t.startDate ? 0 : t.days.length - 1;
    const heads = ['昨日行程', '今日行程', '明日行程'];
    return '<div class="tv-daylane">' + [-1, 0, 1].map((off, i) => {
      const d = t.days[idx + off];
      if (!d) return '<section class="tv-panel tv-daylane-card"><div class="tv-panel-head"><h4>' + heads[i] + '</h4></div><p class="tv-empty">这天不在本次旅行范围内。</p></section>';
      const isToday = d.date === today;
      const acts = d.activities || [];
      return '<section class="tv-panel tv-daylane-card' + (isToday ? ' is-today' : '') + '">' +
        '<div class="tv-panel-head"><h4>' + (isToday ? '今日行程' : heads[i]) + '</h4><span class="tv-hint">DAY ' + d.day + ' · ' + esc(cnDate(d.date)) + '</span></div>' +
        '<div class="tv-lane-meta"><b>' + esc(d.city) + '</b><span>' + esc(d.theme || '') + (d.weather ? ' · ' + esc(d.weather) : '') + '</span></div>' +
        (acts.length ? '<div class="tv-lane-list">' + acts.map(a =>
          '<button type="button" class="tv-lane-act" data-act="edit-activity" data-id="' + esc(a.id) + '">' +
            '<em>' + esc(a.time || '--:--') + '</em>' +
            '<span class="tv-lane-act-body"><b>' + esc(a.title) + '</b>' + (a.place ? '<i>' + esc(a.place) + '</i>' : '') + '</span>' +
            (a.cost ? '<span class="tv-lane-act-cost">' + money(a.cost) + '</span>' : '') +
          '</button>').join('') + '</div>' : '<p class="tv-empty">这天还没有安排。</p>') +
      '</section>';
    }).join('') + '</div>';
  }

  /* 总花费明细：按分类列出共同账单总额，点击去账本查看 */
  function spendDetail(t) {
    const rows = catSpend(t).filter(c => c.all > 0).sort((a, b) => b.all - a.all);
    if (!rows.length) return '<p class="tv-empty">还没有账单，先记第一笔吧。</p>';
    const max = Math.max.apply(null, rows.map(c => c.all).concat([1]));
    const total = totalAllCents(t);
    return '<div class="tv-catbars">' + rows.map(c => '<div class="tv-catbar">' +
        '<span class="tv-catmark" style="--c:' + c.color + '">' + c.mark + '</span>' +
        '<span class="tv-catbar-name">' + c.label + '<em>' + c.items.length + ' 笔</em></span>' +
        '<span class="tv-catbar-track"><i style="width:' + Math.max(3, Math.round(c.all / max * 100)) + '%;background:' + c.color + '"></i></span>' +
        '<b>' + money(yuan(c.all)) + '</b>' +
      '</div>').join('') + '</div>' +
      '<div class="tv-bud-total"><span>合计总花费</span><b>' + money(yuan(total)) + '</b></div>';
  }

  /* 住宿缩略：最多两条，保持在日志同高 */
  function hotelsMini(t) {
    const list = (t.hotels || []).slice(0, 2);
    if (!list.length) return '<p class="tv-empty">还没有住宿记录，去「住宿」加一间。</p>';
    return '<div class="tv-hotel-mini-list">' + list.map(h => {
      const n = nights(h.checkIn, h.checkOut);
      const pays = (t.expenses || []).filter(e => e.hotelId === h.id);
      const amt = pays.length ? yuan(hotelPaidCents(t, h)) : (Number(h.amount) || 0);
      return '<button type="button" class="tv-hotel-mini" data-act="edit-hotel" data-id="' + esc(h.id) + '">' +
        (h.photo ? '<img src="' + esc(h.photo) + '" referrerpolicy="no-referrer" alt="" loading="lazy">' : '<span class="tv-hotel-mini-none">宿</span>') +
        '<span class="tv-hotel-mini-main">' +
          '<b>' + esc(h.name) + '</b>' +
          '<em>' + esc(shortDate(h.checkIn)) + ' — ' + esc(shortDate(h.checkOut)) + ' · ' + n + ' 晚</em>' +
        '</span>' +
        '<span class="tv-hotel-mini-amt">' + money(amt) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function statCard(label, value, foot, cls, act) {
    return '<div class="tv-stat ' + (cls || '') + '"' + (act ? ' data-act="' + act + '"' : '') + '><span>' + esc(label) + '</span><b>' + esc(value) + '</b><em>' + esc(foot) + '</em></div>';
  }
  function budgetBar(budget, used) {
    const pct = budget > 0 ? Math.min(100, Math.round(used / budget * 100)) : 0;
    const over = budget > 0 && used > budget;
    return '<div class="tv-bigbar"><span class="tv-bigbar-track"><i class="' + (over ? 'over' : '') + '" style="width:' + (budget > 0 ? Math.max(2, pct) : 0) + '%"></i></span>' +
      '<div class="tv-bigbar-foot"><span>' + money(yuan(used)) + ' / ' + (budget > 0 ? money(yuan(budget)) : '未设置') + '</span><b>' + (budget > 0 ? pct + '%' : '—') + '</b></div></div>';
  }

  /* 分类预算总览：每类一行「已花 / 预算」 */
  function budgetOverview(t) {
    const b = budgetsOf(t);
    const rows = catSpend(t).filter(c => b[c.id] > 0 || c.mine > 0);
    const totalBudget = totalBudgetCents(t);
    if (!rows.length) return '<p class="tv-empty">还没设置预算。点右上角「修改预算」，给每个分类填上计划金额。</p>';
    return '<div class="tv-bud-list">' + rows.map(c => {
      const bc = cents(b[c.id]);
      const pct = bc > 0 ? Math.min(100, Math.round(c.mine / bc * 100)) : 0;
      const over = bc > 0 && c.mine > bc;
      return '<div class="tv-bud-row">' +
        '<span class="tv-bud-mark" style="--c:' + c.color + '">' + c.mark + '</span>' +
        '<span class="tv-bud-label">' + c.label + '</span>' +
        '<span class="tv-bud-num' + (over ? ' over' : '') + '">' + money(yuan(c.mine)) + '<em> / ' + (bc > 0 ? money(yuan(bc)) : '未设') + '</em></span>' +
        '<span class="tv-bud-track"><i class="' + (over ? 'over' : '') + '" style="width:' + (bc > 0 ? Math.max(2, pct) : 0) + '%;background:' + c.color + '"></i></span>' +
      '</div>';
    }).join('') + '</div>' +
      '<div class="tv-bud-total"><span>合计预算</span><b>' + money(yuan(totalBudget)) + '</b></div>';
  }

  /* ---------- 行程 ---------- */
  function renderPlan(t) {
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Itinerary</span><h3>每天要去哪</h3><p>点任意行程可编辑；也可以直接从行程记一笔，自动建立关联。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-activity">＋ 加行程</button>' +
      '</div>' +
      t.days.map((day, idx) => {
        const planned = (day.activities || []).reduce((s, a) => s + cents(a.cost), 0);
        return '<section class="tv-day-page" style="--rot:' + (idx % 2 ? -0.5 : 0.45) + 'deg">' +
          '<span class="tv-page-holes"></span>' +
          '<header class="tv-day-head">' +
            '<span class="tv-day-num">DAY ' + day.day + '</span>' +
            '<button type="button" class="tv-day-title" data-act="edit-day" data-day="' + day.day + '" title="修改这一天的地点 / 主题">' +
              '<h4>' + esc(day.city) + '<span class="tv-day-edit">✎</span></h4>' +
              '<p>' + esc(cnDate(day.date)) + ' · ' + esc(day.theme || '') + (day.weather ? ' · ' + esc(day.weather) : '') + '</p>' +
            '</button>' +
            '<span class="tv-day-total">计划 ' + money(yuan(planned)) + '</span>' +
            '<button type="button" class="tv-mini-btn" data-act="new-activity" data-day="' + day.day + '" title="给这一天加行程">＋</button>' +
          '</header>' +
          '<div class="tv-day-scrap">' +
            (day.photo ? polaroid(day.photo, day.city, 'tv-day-photo', idx % 2 ? 2.2 : -2.2, 'data-act="edit-day-photo" data-day="' + day.day + '"') : '') +
            '<div class="tv-timeline">' +
              ((day.activities || []).length ? day.activities.map(a => {
                const linked = expensesOfActivity(a.id);
                const linkedTotal = linked.reduce((s, e) => s + cents(e.amount), 0);
                return '<article class="tv-act" data-act="edit-activity" data-id="' + a.id + '">' +
                  '<div class="tv-act-time">' + esc(a.time || '--:--') + '<i></i></div>' +
                  '<div class="tv-act-card">' +
                    '<div class="tv-act-top"><h5>' + esc(a.title) + '</h5>' +
                      (a.cost ? '<span class="tv-act-cost">预算 ' + money(a.cost) + '</span>' : '<span class="tv-act-cost muted">未设花费</span>') +
                    '</div>' +
                    (a.place ? '<p class="tv-act-place">' + esc(a.place) + '</p>' : '') +
                    (a.note ? '<p class="tv-act-note">' + esc(a.note) + '</p>' : '') +
                    '<div class="tv-act-links">' +
                      (linked.length ? '<span class="tv-link-tag">已关联 ' + linked.length + ' 笔 · ' + money(yuan(linkedTotal)) + '</span>' +
                        linked.map(e => '<button type="button" class="tv-bill-chip" data-act="edit-expense" data-id="' + e.id + '" title="编辑这笔账单"><span class="tv-catmark xs" style="--c:' + (CAT[e.category] || CAT.other).color + '">' + (CAT[e.category] || CAT.other).mark + '</span>' + esc(e.title) + ' · ' + money(e.amount) + '</button>').join('')
                        : '<span class="tv-link-empty">还没有关联账单</span>') +
                      '<button type="button" class="tv-mini-btn solid" data-act="new-expense" data-activity="' + a.id + '">＋ 记一笔</button>' +
                    '</div>' +
                  '</div>' +
                '</article>';
              }).join('') : '<p class="tv-empty">这一天还没有安排。</p>') +
            '</div>' +
          '</div>' +
        '</section>';
      }).join('');
  }

  /* ---------- 日志 ---------- */
  function renderJournal(t) {
    const list = t.journals.slice().sort((a, b) => (b.date + String(b.created || 0).padStart(6, '0')).localeCompare(a.date + String(a.created || 0).padStart(6, '0')));
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Journal</span><h3>旅行日志</h3><p>' + MOODS.length + ' 种情绪可选。点卡片可以继续编辑，也可以补上当时的天气。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-journal">＋ 写日志</button>' +
      '</div>' +
      (list.length ? '<div class="tv-journal-grid">' + list.map((j, i) => {
        const mood = MOOD[j.mood] || MOOD.calm;
        const d = t.days.find(x => x.day === j.day);
        return '<article class="tv-postcard" data-act="edit-journal" data-id="' + j.id + '" style="--mood:' + mood.color + ';--rot:' + (i % 2 ? 0.6 : -0.5) + 'deg">' +
          '<span class="tv-tape tv-tape-corner"></span>' +
          '<div class="tv-postcard-top">' +
            '<span class="tv-mood-stamp" style="--mood:' + mood.color + '"><i>' + mood.emoji + '</i>' + esc(mood.label) + '</span>' +
            '<span class="tv-postcard-date">DAY ' + j.day + ' · ' + esc(cnDate(j.date)) + '</span>' +
          '</div>' +
          '<p class="tv-postcard-weather">' + esc(j.weather || '') + '</p>' +
          '<div class="tv-postcard-body">' +
            ((j.photo || (d && d.photo)) ? '<img class="tv-postcard-photo" src="' + esc(j.photo || d.photo) + '" referrerpolicy="no-referrer" alt="" loading="lazy" data-act="edit-journal-photo" data-id="' + esc(j.id) + '" title="点击更换照片">' : '') +
            '<p class="tv-postcard-text">' + esc(j.text) + '</p>' +
          '</div>' +
          '<span class="tv-postcard-edit">点击编辑</span>' +
        '</article>';
      }).join('') + '</div>' : '<p class="tv-empty big">还没有日志。旅行里那些说不清的小情绪，值得写下来。</p>');
  }

  /* ---------- 账本 ---------- */
  function renderExpenses(t) {
    const list = t.expenses.slice()
      .filter(e => state.filterCat === 'all' || e.category === state.filterCat)
      .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
    const total = list.reduce((s, e) => s + cents(e.amount), 0);
    const mine = list.reduce((s, e) => s + shareCents(e, 'me'), 0);
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Shared bills</span><h3>共同账单</h3><p>这里记总额，记账本里只记「我的 AA 份额」。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-expense">＋ 记一笔</button>' +
      '</div>' +
      '<div class="tv-exp-sum">' +
        '<div><span>筛选合计</span><b>' + money(yuan(total)) + '</b></div>' +
        '<div><span>我的份额</span><b class="accent">' + money2(yuan(mine)) + '</b></div>' +
        '<div><span>账单数</span><b>' + list.length + '</b></div>' +
      '</div>' +
      '<div class="tv-filters">' +
        '<button type="button" class="tv-filter' + (state.filterCat === 'all' ? ' on' : '') + '" data-filter="all">全部</button>' +
        CATS.map(c => '<button type="button" class="tv-filter' + (state.filterCat === c.id ? ' on' : '') + '" data-filter="' + c.id + '"><span class="tv-catmark xs" style="--c:' + c.color + '">' + c.mark + '</span>' + c.label + '</button>').join('') +
      '</div>' +
      '<div class="tv-exp-list">' +
        (list.length ? list.map((e, i) => {
          const c = CAT[e.category] || CAT.other;
          const payer = member(e.payerId);
          const act = e.activityId ? activityById(e.activityId) : null;
          const n = (e.participants || []).length;
          const mineY = myShare(e);
          return '<article class="tv-exp" data-act="edit-expense" data-id="' + e.id + '" style="--rot:' + (i % 2 ? 0.35 : -0.3) + 'deg">' +
            '<span class="tv-catmark" style="--c:' + c.color + '">' + c.mark + '</span>' +
            '<div class="tv-exp-main">' +
              '<div class="tv-exp-title"><b>' + esc(e.title) + '</b>' +
                (e.hotelId ? '<span class="tv-tag">住宿</span>' : '') +
                (n > 1 ? '<span class="tv-tag aa">AA ' + n + ' 人</span>' : '<span class="tv-tag solo">不分摊</span>') +
                (e.mirror ? '<span class="tv-tag synced">来自记账本</span>'
                  : e.recordId ? '<span class="tv-tag synced">已记记账本</span>' : '') +
              '</div>' +
              '<p class="tv-exp-meta">' + esc(shortDate(e.date)) + ' · ' + esc(payer.name) + '付款' +
                (act ? ' · 关联：' + esc(act.title) : '') + (e.note ? ' · ' + esc(e.note) : '') +
              '</p>' +
            '</div>' +
            '<div class="tv-exp-money"><b>' + money(e.amount) + '</b><span' + (n > 1 ? '' : ' class="muted"') + '>我的 ' + money2(mineY) + '</span></div>' +
          '</article>';
        }).join('') : '<p class="tv-empty big">这个分类下还没有账单。</p>') +
      '</div>';
  }

  /* ---------- 住宿 ---------- */
  function renderHotels(t) {
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Stays</span><h3>住宿酒店</h3><p>一次旅行可以住很多家；同一家能分定金 / 尾款多次付款，朋友付的只在对账里出现。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-hotel">＋ 加住宿</button>' +
      '</div>' +
      (t.hotels.length ? '<div class="tv-hotel-grid">' + t.hotels.map(h => {
        const nt = nights(h.checkIn, h.checkOut);
        const pays = (t.expenses || []).filter(e => e.hotelId === h.id);
        const paid = yuan(hotelPaidCents(t, h));
        const amt = pays.length ? paid : (Number(h.amount) || 0);
        const who = [];
        pays.forEach(e => { if (e.amount > 0 && who.indexOf(e.payerId) < 0) who.push(e.payerId); });
        const whoTxt = who.length ? who.map(id => member(id).name).join('、') + '付' : '还没记录付款';
        return '<article class="tv-hotel" data-act="edit-hotel" data-id="' + h.id + '">' +
          (h.photo
            ? '<div class="tv-hotel-photo" data-act="edit-hotel-photo" data-id="' + h.id + '" title="点击更换照片"><img src="' + esc(h.photo) + '" referrerpolicy="no-referrer" alt="' + esc(h.name) + '" loading="lazy"><span class="tv-tape"></span></div>'
            : '<div class="tv-hotel-photo tv-hotel-photo-none" data-act="edit-hotel-photo" data-id="' + h.id + '" title="点击添加照片"><span class="tv-hotel-key">KEY</span></div>') +
          '<div class="tv-hotel-body">' +
            '<div class="tv-hotel-top"><span class="tv-hotel-night">' + nt + ' 晚</span><h4>' + esc(h.name) + '</h4><p>' + esc(h.address || '') + '</p></div>' +
            '<div class="tv-hotel-mid">' +
              '<div><span>入住</span><b>' + esc(shortDate(h.checkIn)) + '</b></div>' +
              '<i>→</i>' +
              '<div><span>退房</span><b>' + esc(shortDate(h.checkOut)) + '</b></div>' +
              '<div class="tv-hotel-amt"><span>' + (pays.length ? '已付' : '房费') + '</span><b>' + money(amt) + '</b></div>' +
            '</div>' +
            '<div class="tv-hotel-foot">' +
              '<span class="tv-hotel-payers">' + esc(whoTxt) + '</span>' +
              (pays.length ? '<span class="tv-tag synced">' + pays.length + ' 笔付款</span>'
                : '<span class="tv-tag">未记录付款</span>') +
            '</div>' +
            (h.note ? '<p class="tv-hotel-note">' + esc(h.note) + '</p>' : '') +
          '</div>' +
        '</article>';
      }).join('') + '</div>' : '<p class="tv-empty big">还没有住宿记录。</p>');
  }

  /* ---------- 对账 ---------- */
  function renderSettle(t) {
    const s = settlement();
    const cats = catSpend(t).filter(c => c.mine > 0);
    const budgets = budgetsOf(t);
    const totalMine = totalMyCents(t);
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Settlement</span><h3>对账单</h3><p>每一笔钱都拆到消费项目，谁该给谁、为什么给，点开就能核对。</p></div>' +
        '<div class="tv-settle-acts">' +
          '<button type="button" class="tv-btn solid" data-act="copy-settle">复制对账单图片</button>' +
          '<button type="button" class="tv-btn" data-act="download-settle">下载图片</button>' +
        '</div>' +
      '</div>' +
      '<div class="tv-settle-hero">' +
        '<div class="tv-settle-stamp">对<br>账<br>单</div>' +
        '<div class="tv-settle-title"><span>' + esc(t.title) + '</span><h3>' + money(yuan(s.totalCents)) + '</h3><p>' + esc(t.startDate) + ' — ' + esc(t.endDate) + ' · ' + t.members.length + ' 人</p></div>' +
        '<div class="tv-settle-mine"><span>我的花费</span><b>' + money2(yuan(totalMine)) + '</b><em>已按 AA 份额入账</em></div>' +
      '</div>' +
      '<section class="tv-panel">' +
        '<div class="tv-panel-head"><h4>我的分类花费</h4><span class="tv-hint">金额为我的 AA 份额 · 点击展开明细</span></div>' +
        (cats.length ? '<div class="tv-cat-folds">' + cats.map(c => {
          const budgetCents = cents(budgets[c.id]);
          const over = budgetCents > 0 && c.mine > budgetCents;
          return '<details class="tv-cat-fold">' +
            '<summary>' +
              '<span class="tv-bud-mark" style="--c:' + c.color + '">' + c.mark + '</span>' +
              '<span class="tv-cat-fold-name">' + c.label + '</span>' +
              '<span class="tv-cat-fold-count">' + c.items.length + ' 笔</span>' +
              '<span class="tv-cat-fold-amt' + (over ? ' over' : '') + '">' + money(yuan(c.mine)) + '<em>' + (budgetCents > 0 ? ' / 预算 ' + money(yuan(budgetCents)) : '') + '</em></span>' +
              '<span class="tv-cat-fold-caret">›</span>' +
            '</summary>' +
            '<div class="tv-cat-fold-body">' +
              c.items.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(e => {
                const md = CAT[e.category] || CAT.other;
                return '<div class="tv-cat-item">' +
                  '<span class="tv-cat-item-date">' + esc(shortDate(e.date)) + '</span>' +
                  '<span class="tv-cat-item-main"><b>' + esc(e.title) + '</b><em>' + esc(md.label) + ' · 总额 ' + money(yuan(cents(e.amount))) + '</em></span>' +
                  '<span class="tv-cat-item-share">' + money2(yuan(shareCents(e, 'me'))) + '<em>我的份额</em></span>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</details>';
        }).join('') + '</div>' : '<p class="tv-empty">还没有账单，先记一笔吧。</p>') +
        '<div class="tv-bud-total"><span>我的花费合计</span><b>' + money2(yuan(totalMine)) + '</b></div>' +
      '</section>' +
      '<section class="tv-panel">' +
        '<div class="tv-panel-head"><h4>每个人的对账单</h4><span class="tv-hint">谁欠谁、欠在哪几笔，一目了然</span></div>' +
        (s.pairs.length ? '<div class="tv-pairs">' + s.pairs.map(p => {
          const meName = s.meName;
          const settled = Math.abs(p.net) < 0.5;
          const toMe = p.net > 0;
          const line = settled
            ? '你和 ' + esc(p.name) + ' 已经结清'
            : toMe
              ? esc(p.name) + ' 需付给 ' + esc(meName) + ' <b>' + money2(yuan(p.net)) + '</b>'
              : esc(meName) + ' 需付给 ' + esc(p.name) + ' <b>' + money2(yuan(-p.net)) + '</b>';
          return '<article class="tv-pair">' +
            '<div class="tv-pair-head">' +
              '<span class="tv-avatar lg ' + esc(p.cls) + '">' + esc(p.initial) + '</span>' +
              '<div class="tv-pair-who"><b>' + esc(p.name) + '</b><span>' + p.items.length + ' 笔共同消费</span></div>' +
              '<div class="tv-pair-sum ' + (settled ? '' : toMe ? 'pos' : 'neg') + '">' + line + '</div>' +
            '</div>' +
            (p.items.length ? '<details class="tv-pair-detail">' +
              '<summary>查看这 ' + p.items.length + ' 笔明细</summary>' +
              '<div class="tv-pair-items">' + p.items.map(it => {
                const mineShare = it.dir === 1;
                return '<div class="tv-pair-item">' +
                  '<span class="tv-pair-date">' + esc(shortDate(it.exp.date)) + '</span>' +
                  '<span class="tv-pair-main"><b>' + esc(it.exp.title) + '</b><em>' + (mineShare ? esc(p.name) + ' 应分摊' : meName + ' 应分摊') + ' · 消费总额 ' + money(yuan(cents(it.exp.amount))) + '</em></span>' +
                  '<span class="tv-pair-amt ' + (mineShare ? 'pos' : 'neg') + '">' + (mineShare ? '+' : '−') + money2(yuan(it.cents)).slice(1) + '</span>' +
                '</div>';
              }).join('') + '</div>' +
              '<div class="tv-pair-foot">' +
                '<span>对方应承担 <b>' + money2(yuan(p.theyOwe)) + '</b></span>' +
                '<span>我应承担 <b>' + money2(yuan(p.iOwe)) + '</b></span>' +
              '</div>' +
            '</details>' : '') +
            '<div class="tv-pair-acts">' +
              '<span>只统计你和 ' + esc(p.name) + ' 之间的消费，不掺其他人的账</span>' +
              '<button type="button" class="tv-btn" data-act="person-settle" data-id="' + esc(p.id) + '">生成 ' + esc(p.name) + ' 的对账单</button>' +
            '</div>' +
          '</article>';
        }).join('') + '</div>' : '<p class="tv-empty">还没有其他同行人，先在上方「编辑册子」里添加吧。</p>') +
      '</section>' +
      '<section class="tv-panel">' +
        '<div class="tv-panel-head"><h4>结清转账</h4><span class="tv-hint">' + (s.transfers.length || '无需') + ' 笔</span></div>' +
        (s.transfers.length ? '<div class="tv-transfer-list">' + s.transfers.map(tr => '<div class="tv-transfer">' +
          '<span class="tv-avatar sm ' + esc(member(tr.fromId).cls) + '">' + esc(member(tr.fromId).initial) + '</span>' +
          '<b>' + esc(tr.from) + '</b><i>→</i><span class="tv-avatar sm ' + esc(member(tr.toId).cls) + '">' + esc(member(tr.toId).initial) + '</span><b>' + esc(tr.to) + '</b>' +
          '<strong>' + money(yuan(tr.cents)) + '</strong>' +
        '</div>').join('') + '</div>' : '<p class="tv-empty">刚好平账，不用转钱。</p>') +
        '<p class="tv-settle-note">对账单只统计本旅行账本；记账本里记录的是我的 AA 分摊金额，不是消费总额。</p>' +
      '</section>';
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind(root) {
    if (root._tvBound) return;
    root._tvBound = true;
    root.addEventListener('click', e => {
      const actEl = e.target.closest('[data-act]');
      if (actEl && root.contains(actEl)) {
        e.stopPropagation();
        handleAction(actEl.dataset.act, actEl.dataset);
        return;
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) { state.tab = tab.dataset.tab; persist(); render(); return; }
      const theme = e.target.closest('[data-theme-set]');
      if (theme) { applyTheme(theme.dataset.themeSet); return; }
      const filter = e.target.closest('[data-filter]');
      if (filter) { state.filterCat = filter.dataset.filter; persist(); render(); }
    });
  }

  function handleAction(act, ds) {
    if (act === 'open-trip') openTrip(ds.id);
    else if (act === 'back-library') { state.view = 'library'; persist(); render(); }
    else if (act === 'new-trip') openTripModal(null);
    else if (act === 'edit-trip') openTripModal(ds.id || (T() && T().id));
    else if (act === 'delete-trip') deleteTrip(ds.id);
    else if (act === 'edit-budget') openBudgetModal();
    else if (act === 'edit-cover') openImageModal('cover', ds.id);
    else if (act === 'edit-day-photo') openImageModal('day', ds.day);
    else if (act === 'edit-hotel-photo') openImageModal('hotel', ds.id);
    else if (act === 'edit-journal-photo') openImageModal('journal', ds.id);
    else if (act === 'new-expense') openExpenseModal(null, { activityId: ds.activity || '' });
    else if (act === 'edit-expense') openExpenseModal(ds.id);
    else if (act === 'new-activity') openActivityModal(null, Number(ds.day) || 1);
    else if (act === 'edit-activity') openActivityModal(ds.id);
    else if (act === 'edit-day') openDayModal(Number(ds.day));
    else if (act === 'new-journal') openJournalModal(null);
    else if (act === 'edit-journal') openJournalModal(ds.id);
    else if (act === 'new-hotel') openHotelModal(null);
    else if (act === 'edit-hotel') openHotelModal(ds.id);
    else if (act === 'go-plan') { state.tab = 'plan'; persist(); render(); }
    else if (act === 'go-journal') { state.tab = 'journal'; persist(); render(); }
    else if (act === 'go-settle') { state.tab = 'settle'; persist(); render(); }
    else if (act === 'go-expenses') { state.tab = 'expenses'; persist(); render(); }
    else if (act === 'go-hotels') { state.tab = 'hotels'; persist(); render(); }
    else if (act === 'copy-settle') copySettlement();
    else if (act === 'download-settle') downloadSettlement();
    else if (act === 'person-settle') downloadPersonSettle(ds.id);
  }

  function openTrip(id) {
    if (!state.trips.some(t => t.id === id)) return;
    state.activeTripId = id;
    state.view = 'trip';
    state.tab = 'overview';
    state.filterCat = 'all';
    persist();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteTrip(id) {
    const t = state.trips.find(x => x.id === id);
    if (!t) return;
    App.confirmDialog('删除旅行册', '「' + t.title + '」里的行程、日志和账单都会从本机删除（记账本里已生成的记录不会自动删除）。确定吗？').then(ok => {
      if (!ok) return;
      state.trips = state.trips.filter(x => x.id !== id);
      if (state.activeTripId === id) {
        state.activeTripId = state.trips[0] ? state.trips[0].id : null;
        state.view = 'library';
      }
      persist(); render();
      toast('旅行册已删除', 'ok');
    });
  }

  /* ---------------- 弹窗通用（沿用记账本控件） ---------------- */
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 12.9c2.2 1.7 3.8 3.3 4.9 5.1 2.6-5.1 5.5-8.9 9.1-12.2"/></svg>';

  function openModal(html) {
    if (typeof App === 'undefined' || !App.openModal) return null;
    return App.openModal(html, true, 'travel-modal');
  }
  function modalTitle(title, sub) {
    return '<div class="modal-title">' + esc(title) + '<button class="icon-btn" style="display:flex" data-close>✕</button></div>' +
      (sub ? '<p class="tv-modal-sub">' + esc(sub) + '</p>' : '');
  }
  function field(label, control) {
    return '<div class="field"><label>' + esc(label) + '</label>' + control + '</div>';
  }
  function dateInput(id, val) {
    const v = val || todayStr();
    return '<input id="' + id + '" class="cal-input" type="text" readonly value="' + esc(v) + '" data-date="' + esc(v) + '">';
  }
  function bindControls(m) {
    m.querySelectorAll('.cal-input').forEach(inp => {
      inp.onclick = () => App.openCalendar(inp, 'day');
    });
    try { App.enhanceSelects(m); } catch (e) { console.warn(e); }
  }
  function memberOptions(selected) {
    const t = T();
    return (t ? t.members : []).map(m => '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('');
  }
  function memberChecks(selected) {
    const t = T();
    const list = t ? t.members : [];
    return '<div class="tv-checks">' + list.map(m =>
      '<label class="tv-check"><input type="checkbox" value="' + m.id + '"' + ((selected || []).indexOf(m.id) >= 0 ? ' checked' : '') + '>' +
        '<span class="tv-check-box">' + CHECK_SVG + '</span>' +
        '<span class="tv-avatar sm ' + m.cls + '">' + esc(m.initial) + '</span>' +
        '<span class="tv-check-text">' + esc(m.name) + '</span>' +
      '</label>'
    ).join('') + '</div>';
  }
  function checkLine(id, label, checked) {
    return '<label class="tv-check tv-check-line"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="tv-check-box">' + CHECK_SVG + '</span>' +
      '<span class="tv-check-text">' + esc(label) + '</span>' +
    '</label>';
  }
  function checkedIds(m) {
    const out = [];
    m.querySelectorAll('.tv-checks input:checked').forEach(x => out.push(x.value));
    return out;
  }

  /* ---------- 新建 / 编辑旅行册 ---------- */
  function openTripModal(id) {
    if (!App.openModal) return;
    const editing = !!id;
    const trip = editing ? state.trips.find(x => x.id === id) : null;
    const defaultDest = editing ? trip.destination : '';
    const curStatus = editing ? statusOf(trip) : 'plan';
    const members = editing ? trip.members : defaultMembers();
    const data = trip || {
      title: '', destination: '', startDate: todayStr(), endDate: todayStr(),
      budget: '', cover: ''
    };
    const m = openModal(
      modalTitle(editing ? '编辑旅行册' : '新建旅行册', '每次旅行都是一本新的手帐，日期会自动拆成 DAY 页') +
      '<div class="field-row">' +
        field('旅行册标题', '<input id="tv-t-title" type="text" value="' + esc(data.title) + '" placeholder="例如 大理，四天三夜">') +
        field('目的地', '<input id="tv-t-dest" type="text" value="' + esc(data.destination) + '" placeholder="例如 大理">') +
      '</div>' +
      '<div class="field-row">' +
        field('出发日期', dateInput('tv-t-start', data.startDate)) +
        field('结束日期', dateInput('tv-t-end', data.endDate)) +
      '</div>' +
      field('旅行状态', '<select id="tv-t-status">' + TRIP_STATUSES.map(s => '<option value="' + s.id + '"' + (s.id === curStatus ? ' selected' : '') + '>' + s.label + '</option>').join('') + '</select>') +
      field('封面图片链接（可选）', '<input id="tv-t-cover" type="text" value="' + esc(data.cover || '') + '" placeholder="留空按目的地自动生成，也可以直接点封面图更换">') +
      '<div class="field"><label>同行成员</label>' +
        '<div class="tv-memlist" id="tv-t-memlist">' + members.map(memRow).join('') + '</div>' +
        '<button type="button" class="tv-addmem" id="tv-t-mem-add">＋ 添加同行人</button>' +
        '<p class="tv-form-tip">增减成员会同步更新 AA 分摊，已产生的账单会重新计算。</p>' +
      '</div>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-t-del" style="margin-right:auto">删除这本</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-t-save">' + (editing ? '保存修改' : '创建旅行册') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);
    const memList = m.querySelector('#tv-t-memlist');
    const bindMemRows = () => {
      memList.querySelectorAll('.tv-memrow').forEach(row => {
        const del = row.querySelector('.tv-mem-del');
        if (del) del.onclick = () => row.remove();
      });
    };
    bindMemRows();
    m.querySelector('#tv-t-mem-add').onclick = () => {
      if (memList.children.length >= 12) return toast('最多 12 位同行人', 'err');
      const cls = 'c' + ((memList.children.length - 1) % 5 + 1);
      memList.insertAdjacentHTML('beforeend', memRow({ id: uid('m'), name: '', initial: '新', cls: cls }));
      bindMemRows();
      const last = memList.lastElementChild;
      if (last) last.querySelector('.tv-mem-name').focus();
    };
    const readMembers = () => {
      const next = [];
      memList.querySelectorAll('.tv-memrow').forEach(row => {
        const name = row.querySelector('.tv-mem-name').value.trim();
        if (!name) return;
        const mid = row.dataset.id;
        next.push({
          id: mid,
          name: name,
          initial: name.slice(0, 1),
          cls: mid === 'me' ? 'me' : (row.dataset.cls || 'c1')
        });
      });
      if (!next.some(x => x.id === 'me')) {
        next.unshift({ id: 'me', name: '我', initial: '我', cls: 'me' });
      }
      return next;
    };
    const del = m.querySelector('#tv-t-del');
    if (del) del.onclick = () => { App.closeModal(); deleteTrip(trip.id); };
    m.querySelector('#tv-t-save').onclick = () => {
      const title = m.querySelector('#tv-t-title').value.trim();
      const dest = m.querySelector('#tv-t-dest').value.trim() || defaultDest;
      const start = m.querySelector('#tv-t-start').dataset.date || todayStr();
      const end = m.querySelector('#tv-t-end').dataset.date || start;
      const status = m.querySelector('#tv-t-status').value || curStatus;
      const coverIn = m.querySelector('#tv-t-cover').value.trim();
      if (!title) return toast('请填写旅行册标题', 'err');
      if (!dest) return toast('请填写目的地', 'err');
      if (parseDate(end) < parseDate(start)) return toast('结束日期不能早于出发日期', 'err');
      const cover = coverIn || (trip && trip.cover) || photo(dest + ' travel scenery, film photography, travel journal cover', 'portrait_4_3');
      const nextMembers = readMembers();
      if (editing) {
        applyMembers(trip, nextMembers);
        Object.assign(trip, { title: title, destination: dest, cover: cover, status: status });
        if (trip.startDate !== start || trip.endDate !== end) {
          trip.startDate = start; trip.endDate = end;
          trip.days = buildDays(start, end, dest, trip.days);
          trip.expenses.forEach(e => {
            const d = trip.days.find(x => x.date === e.date);
            e.day = d ? d.day : (trip.days[0] ? trip.days[0].day : 1);
          });
        } else {
          trip.startDate = start; trip.endDate = end;
          trip.days.forEach(d => { if (!d.city || d.city === trip.destination) d.city = dest; });
        }
      } else {
        const nt = {
          id: uid('trip'),
          title: title,
          destination: dest,
          startDate: start,
          endDate: end,
          budgets: budgetsOf(null),
          status: status,
          cover: cover,
          createdAt: Date.now(),
          members: nextMembers,
          days: buildDays(start, end, dest, []),
          hotels: [],
          expenses: [],
          journals: []
        };
        state.trips.unshift(nt);
        state.activeTripId = nt.id;
        state.view = 'trip';
        state.tab = 'overview';
      }
      persist(); App.closeModal(); render();
      toast(editing ? '旅行册已更新' : '旅行册已创建，开始贴照片吧', 'ok');
    };
  }

  /* ---------- 同行成员 ---------- */
  function memRow(mem) {
    const isMe = mem.id === 'me';
    return '<div class="tv-memrow' + (isMe ? ' is-me' : '') + '" data-id="' + esc(mem.id) + '" data-cls="' + esc(mem.cls || '') + '">' +
      '<span class="tv-mem-tag">' + (isMe ? '本人' : '朋友') + '</span>' +
      '<div class="tv-mem-line">' +
        '<input class="tv-mem-name" type="text" maxlength="12" value="' + esc(mem.name) + '" placeholder="' + (isMe ? '我的名字' : '朋友名字') + '">' +
        (isMe ? '' : '<button type="button" class="tv-mem-del" title="移除">×</button>') +
      '</div>' +
    '</div>';
  }

  /* 成员变化后同步清理账单 / 住宿里的付款人与分摊人 */
  function applyMembers(t, next) {
    if (!next || !next.length) return;
    const ids = next.map(x => x.id);
    t.members = next;
    const fix = list => {
      if (ids.indexOf(list.payerId) < 0) list.payerId = 'me';
      list.participants = (list.participants || []).filter(p => ids.indexOf(p) >= 0);
      if (!list.participants.length) list.participants = ['me'];
    };
    t.expenses.forEach(fix);
    t.hotels.forEach(fix);
  }

  /* ---------- 预算 ---------- */
  function openBudgetModal() {
    const t = T();
    if (!t) return;
    const b = budgetsOf(t);
    const m = openModal(
      modalTitle('分类预算', '每种消费单独设预算，合计就是这趟旅行的总预算') +
      '<div class="tv-bud-edit">' + CATS.map(c =>
        '<label class="tv-bud-edit-row">' +
          '<span class="tv-bud-mark" style="--c:' + c.color + '">' + c.mark + '</span>' +
          '<span class="tv-bud-edit-name">' + c.label + '</span>' +
          '<input class="tv-bud-input" type="number" min="0" step="10" data-cat="' + c.id + '" value="' + (b[c.id] || '') + '" placeholder="0">' +
        '</label>'
      ).join('') + '</div>' +
      '<div class="tv-bud-total"><span>合计预算</span><b id="tv-bud-sum">' + money(yuan(totalBudgetCents(t))) + '</b></div>' +
      '<p class="tv-form-tip">预算按「我的花费」计算；当前已累计 <b>' + money2(yuan(totalMyCents(t))) + '</b>。</p>' +
      '<div class="modal-acts">' +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-budget-save">保存预算</button>' +
      '</div>'
    );
    if (!m) return;
    const inputs = Array.from(m.querySelectorAll('.tv-bud-input'));
    const readBudgets = () => {
      const out = {};
      CATS.forEach(c => { out[c.id] = 0; });
      inputs.forEach(inp => {
        const v = Number(inp.value);
        out[inp.dataset.cat] = isFinite(v) && v > 0 ? Math.round(v) : 0;
      });
      return out;
    };
    const sumEl = m.querySelector('#tv-bud-sum');
    const paintSum = () => {
      const nb = readBudgets();
      const total = BUDGET_IDS.reduce((s, id) => s + cents(nb[id]), 0);
      sumEl.textContent = money(yuan(total));
    };
    inputs.forEach(inp => inp.addEventListener('input', paintSum));
    m.querySelector('#tv-budget-save').onclick = () => {
      t.budgets = readBudgets();
      persist(); App.closeModal(); render();
      toast('分类预算已更新', 'ok');
    };
    setTimeout(() => { if (inputs[0]) inputs[0].focus(); }, 80);
  }

  /* ---------- 照片：点击图片上传本地文件 / 粘贴链接 ---------- */
  function photoDefault(kind, trip, item) {
    if (kind === 'cover') {
      return photo((trip.destination || '旅行') + ' travel scenery, film photography, travel journal cover', 'portrait_4_3');
    }
    if (kind === 'day') {
      return photo((item.city || trip.destination || '旅行') + ' day ' + (item.day || 1) + ' travel scenery, local street and landscape, warm film photography', 'landscape_4_3');
    }
    if (kind === 'hotel') {
      return photo((item.name || 'hotel') + ' in ' + (trip.destination || '') + ', hotel exterior or cozy interior, travel photography', 'landscape_4_3');
    }
    const d = trip.days.find(x => x.day === item.day);
    return (d && d.photo) || '';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type || '')) return reject(new Error('请选择图片文件'));
      if (file.size > 12 * 1024 * 1024) return reject(new Error('图片超过 12MB，换一张试试'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('这张图片格式暂不支持'));
        img.onload = () => {
          try {
            const MAX = 1280;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            const ratio = Math.min(1, MAX / Math.max(w, h));
            w = Math.max(1, Math.round(w * ratio));
            h = Math.max(1, Math.round(h * ratio));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', .82));
          } catch (e) { reject(new Error('图片处理失败')); }
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function openImageModal(kind, refId) {
    const t = T();
    if (!t) return;
    let trip = t, item = null, current = '', def = '';
    let heading = '更换照片';
    if (kind === 'cover') {
      trip = refId ? (state.trips.find(x => x.id === refId) || t) : t;
      current = trip.cover || '';
      def = photoDefault('cover', trip);
      heading = '更换旅行册封面';
    } else if (kind === 'day') {
      item = t.days.find(d => String(d.day) === String(refId)) || t.days[0];
      if (!item) return toast('这本旅行册还没有日期', 'err');
      current = item.photo || '';
      def = photoDefault('day', t, item);
      heading = '换一张 DAY ' + item.day + ' 照片';
    } else if (kind === 'hotel') {
      item = t.hotels.find(h => h.id === refId);
      if (!item) return;
      current = item.photo || '';
      def = photoDefault('hotel', t, item);
      heading = '更换住宿照片';
    } else {
      item = t.journals.find(j => j.id === refId);
      if (!item) return;
      current = item.photo || '';
      def = photoDefault('journal', t, item);
      heading = '更换日志照片';
    }

    let pending = current || '';
    const m = openModal(
      modalTitle(heading, '点击上传本地图片，或粘贴一张图片链接') +
      '<div class="tv-imgpick">' +
        '<div class="tv-imgpick-prev' + ((pending || def) ? '' : ' empty') + '" id="tv-img-prev">' +
          ((pending || def) ? '<img src="' + esc(pending || def) + '" referrerpolicy="no-referrer" alt="">' : '<span>还没有照片</span>') +
        '</div>' +
        '<div class="tv-imgpick-row">' +
          '<button type="button" class="btn btn-primary" id="tv-img-upload">上传本地图片</button>' +
          '<button type="button" class="btn btn-ghost" id="tv-img-default">恢复默认图</button>' +
          '<input type="file" id="tv-img-file" accept="image/*" hidden>' +
        '</div>' +
        '<div class="field"><label>或粘贴图片链接</label>' +
          '<div class="tv-imgpick-link">' +
            '<input id="tv-img-url" type="text" value="' + esc(pending.indexOf('data:') === 0 ? '' : pending) + '" placeholder="https://...">' +
            '<button type="button" class="btn" id="tv-img-use">预览</button>' +
          '</div>' +
        '</div>' +
        (kind === 'cover' ? (() => {
          const sel = Array.isArray(trip.coverMoods) ? trip.coverMoods.slice(0, 3) : [];
          return '<div class="field"><label>封面心情 emoji（最多 3 个，大小会自动错落）</label>' +
            '<div class="tv-emoji-pick" id="tv-emoji-pick">' +
              MOODS.map(md => '<button type="button" class="tv-emoji-opt' + (sel.indexOf(md.id) >= 0 ? ' on' : '') + '" data-mood="' + md.id + '" title="' + esc(md.label) + '">' + md.emoji + '</button>').join('') +
            '</div>' +
            '<p class="tv-form-tip">不选则自动从最近的日志里挑心情。已选 <b id="tv-emoji-count">' + sel.length + '</b> / 3</p>' +
          '</div>';
        })() : '') +
        '<p class="tv-form-tip" id="tv-img-status">上传的图片会自动压缩，只保存在本机。</p>' +
      '</div>' +
      '<div class="modal-acts">' +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-img-save">保存图片</button>' +
      '</div>'
    );
    if (!m) return;

    const box = m.querySelector('#tv-img-prev');
    const status = m.querySelector('#tv-img-status');
    // 图床（微博/小红书等）带 Referer 会 403，统一用 no-referrer 请求
    const setPreview = (src, onLoaded) => {
      if (!src) {
        box.classList.add('empty');
        box.innerHTML = '<span>还没有照片</span>';
        return null;
      }
      box.classList.remove('empty');
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.alt = '';
      img.onload = () => {
        if (typeof onLoaded === 'function') onLoaded(true);
      };
      img.onerror = () => {
        box.classList.add('empty');
        box.innerHTML = '<span>这张图加载不出来</span>';
        if (typeof onLoaded === 'function') onLoaded(false);
      };
      img.src = src;
      box.innerHTML = '';
      box.appendChild(img);
      return img;
    };

    const fileIn = m.querySelector('#tv-img-file');
    m.querySelector('#tv-img-upload').onclick = () => fileIn.click();
    fileIn.onchange = async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      status.textContent = '正在处理图片…';
      try {
        const url = await fileToDataUrl(f);
        pending = url;
        urlBad = false;
        setPreview(url);
        m.querySelector('#tv-img-url').value = '';
        status.textContent = '本地图片已就绪，点「保存图片」生效。';
      } catch (e) {
        status.textContent = '上传失败：' + (e.message || '未知错误');
        toast(e.message || '图片上传失败', 'err');
      }
      fileIn.value = '';
    };

    m.querySelector('#tv-img-default').onclick = () => {
      pending = '';
      urlBad = false;
      setPreview(def);
      m.querySelector('#tv-img-url').value = '';
      status.textContent = def ? '已恢复默认生成的图片。' : '保存后使用默认图片。';
    };

    const urlIn = m.querySelector('#tv-img-url');
    let urlBad = false;
    const useUrl = () => {
      const v = urlIn.value.trim();
      if (!v) return toast('先粘贴一个图片链接', 'err');
      if (!/^(https?:\/\/|data:image\/)/i.test(v)) return toast('链接要以 http(s):// 开头', 'err');
      status.textContent = '正在加载预览…';
      setPreview(v, ok => {
        urlBad = !ok;
        if (ok) {
          pending = v;
          status.textContent = '链接已预览，点「保存图片」生效。';
        } else {
          const hotlink = /sinaimg\.cn|xiaohongshu|xhscdn\.com|douyinpic\.com|hdslb\.com|weibo\.com/i.test(v);
          status.textContent = '';
          const tip = document.createElement('span');
          tip.textContent = hotlink
            ? '这个图床（微博 / 小红书等）禁止外站直接引用，链接本身没坏，但浏览器拿不到图。右键图片「另存为」后点上面的「上传本地图片」即可；'
            : '链接加载失败，可能已失效或图床限制外链。可以换成「上传本地图片」；';
          const a = document.createElement('a');
          a.href = v; a.target = '_blank'; a.rel = 'noreferrer';
          a.className = 'tv-link';
          a.textContent = '打开原图';
          status.appendChild(tip);
          status.appendChild(a);
          toast('这张图被图床拦了，建议上传本地图片', 'err');
        }
      });
    };
    m.querySelector('#tv-img-use').onclick = useUrl;
    urlIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); useUrl(); } });

    let picked = Array.isArray(trip.coverMoods) ? trip.coverMoods.slice(0, 3) : [];
    const pickBox = m.querySelector('#tv-emoji-pick');
    if (pickBox) {
      pickBox.querySelectorAll('.tv-emoji-opt').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.mood;
          const at = picked.indexOf(id);
          if (at >= 0) picked.splice(at, 1);
          else {
            if (picked.length >= 3) return toast('最多选 3 个心情', 'err');
            picked.push(id);
          }
          btn.classList.toggle('on', picked.indexOf(id) >= 0);
          m.querySelector('#tv-emoji-count').textContent = String(picked.length);
        };
      });
    }

    m.querySelector('#tv-img-save').onclick = () => {
      if (urlBad) return toast('这张图还没加载成功，换一个链接或上传本地图片', 'err');
      const next = pending || def;
      if (!next) return toast('还没有选择图片', 'err');
      let old = '';
      if (kind === 'cover') { old = trip.cover || ''; trip.cover = next; trip.coverMoods = picked.slice(); }
      else { old = item.photo || ''; item.photo = next; }
      if (!persist()) {
        if (kind === 'cover') trip.cover = old; else item.photo = old;
        return toast('图片太大，本机存储放不下，换一张小一点的试试', 'err');
      }
      App.closeModal();
      render();
      toast('照片已更新', 'ok');
    };
  }

  /* ---------- 行程 ---------- */
  function dayOptions(selected) {
    const t = T();
    if (!t) return '';
    return t.days.map(d => '<option value="' + d.day + '"' + (d.day === selected ? ' selected' : '') + '>DAY ' + d.day + ' · ' + shortDate(d.date) + ' ' + esc(d.city) + '</option>').join('');
  }
  function timeOptions(selected) {
    const list = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) list.push(pad2(h) + ':' + pad2(m));
    }
    if (selected && list.indexOf(selected) < 0) list.push(selected);
    list.sort();
    return list.map(v => '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>').join('');
  }
  /* 修改某一天的城市 / 主题 / 天气（多目的地行程，每天地址可以不同） */
  function openDayModal(dayNo) {
    const t = T();
    if (!t) return;
    const d = t.days.find(x => x.day === dayNo);
    if (!d) return;
    const m = openModal(
      modalTitle('DAY ' + d.day + ' · ' + shortDate(d.date), '目的地不止一个时，可以给每一天填不同的城市 / 地点') +
      field('城市 / 地点', '<input id="tv-d-city" type="text" value="' + esc(d.city || '') + '" placeholder="例如 昆明 / 大理 / 丽江">') +
      '<div class="field-row">' +
        field('当天主题', '<input id="tv-d-theme" type="text" value="' + esc(d.theme || '') + '" placeholder="例如 抵达 · 古城慢逛">') +
        field('天气', '<input id="tv-d-weather" type="text" value="' + esc(d.weather || '') + '" placeholder="例如 晴 19°">') +
      '</div>' +
      '<div class="modal-acts">' +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-d-save">保存</button>' +
      '</div>'
    );
    if (!m) return;
    m.querySelector('#tv-d-save').onclick = () => {
      const city = m.querySelector('#tv-d-city').value.trim();
      if (!city) return toast('请填写这一天的城市 / 地点', 'err');
      d.city = city;
      d.theme = m.querySelector('#tv-d-theme').value.trim();
      d.weather = m.querySelector('#tv-d-weather').value.trim();
      persist(); App.closeModal(); render();
      toast('DAY ' + d.day + ' 已更新', 'ok');
    };
  }

  function openActivityModal(id, presetDay) {
    const t = T();
    if (!t) return;
    const loc = id ? locateActivity(id) : null;
    const editing = !!loc;
    const a = loc ? loc.act : { time: '09:00', title: '', place: '', note: '', cost: '' };
    const day = loc ? loc.day.day : (presetDay || (t.days[0] ? t.days[0].day : 1));
    const m = openModal(
      modalTitle(editing ? '编辑行程' : '加一段行程', '选好第几天，费用可以稍后在账本里记') +
      '<div class="field-row">' +
        field('第几天', '<select id="tv-a-day">' + dayOptions(day) + '</select>') +
        field('时间', '<select id="tv-a-time">' + timeOptions(a.time) + '</select>') +
      '</div>' +
      field('行程标题', '<input id="tv-a-title" type="text" value="' + esc(a.title) + '" placeholder="例如 环洱海包车">') +
      field('地点 / 说明', '<input id="tv-a-place" type="text" value="' + esc(a.place) + '" placeholder="才村 → 喜洲 → 双廊">') +
      '<div class="field-row">' +
        field('预计花费（元）', '<input id="tv-a-cost" type="number" min="0" step="1" value="' + (a.cost || '') + '" placeholder="0">') +
        field('备注', '<input id="tv-a-note" type="text" value="' + esc(a.note) + '" placeholder="可选">') +
      '</div>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-a-del" style="margin-right:auto">删除行程</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-a-save">' + (editing ? '保存' : '添加') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);
    const del = m.querySelector('#tv-a-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除行程', '「' + a.title + '」将从行程里移除，关联的账单会保留但解除关联。').then(ok => {
        if (!ok) return;
        t.days.forEach(d => { d.activities = (d.activities || []).filter(x => x.id !== a.id); });
        t.expenses.forEach(e => { if (e.activityId === a.id) e.activityId = ''; });
        persist(); App.closeModal(); render();
        toast('行程已删除', 'ok');
      });
    };
    m.querySelector('#tv-a-save').onclick = () => {
      const title = m.querySelector('#tv-a-title').value.trim();
      if (!title) return toast('请填写行程标题', 'err');
      const targetDay = Number(m.querySelector('#tv-a-day').value) || 1;
      const dayObj = t.days.find(d => d.day === targetDay) || t.days[0];
      const next = {
        id: loc ? a.id : uid('a'),
        time: m.querySelector('#tv-a-time').value || '09:00',
        title: title,
        place: m.querySelector('#tv-a-place').value.trim(),
        note: m.querySelector('#tv-a-note').value.trim(),
        cost: Number(m.querySelector('#tv-a-cost').value) || 0
      };
      if (loc) {
        if (loc.day.day !== targetDay) {
          loc.day.activities = (loc.day.activities || []).filter(x => x.id !== a.id);
          (dayObj.activities = dayObj.activities || []).push(next);
        } else {
          Object.assign(loc.act, next);
        }
      } else {
        (dayObj.activities = dayObj.activities || []).push(next);
      }
      t.days.forEach(d => { if (d.activities) d.activities.sort((x, y) => (x.time || '').localeCompare(y.time || '')); });
      t.expenses.forEach(e => { if (e.activityId === next.id) e.day = targetDay; });
      persist(); App.closeModal(); render();
      toast(editing ? '行程已更新' : '行程已添加', 'ok');
    };
  }

  /* ---------- 日志 ---------- */
  function openJournalModal(id) {
    const t = T();
    if (!t) return;
    const j = id ? t.journals.find(x => x.id === id) : null;
    const editing = !!j;
    const data = j || { day: t.days[0] ? t.days[0].day : 1, mood: 'happy', weather: '', text: '' };
    const day = t.days.find(d => d.day === data.day) || t.days[0];
    const m = openModal(
      modalTitle(editing ? '编辑日志' : '写一篇旅行日志', day ? cnDate(day.date) + ' · ' + day.city : '') +
      '<div class="field-row">' +
        field('第几天', '<select id="tv-j-day">' + dayOptions(data.day) + '</select>') +
        field('天气 / 一句话', '<input id="tv-j-weather" type="text" value="' + esc(data.weather) + '" placeholder="晴 · 风里有洱海味">') +
      '</div>' +
      '<div class="field"><label>此刻的心情</label><div class="tv-mood-picker">' +
        MOODS.map(md => '<button type="button" class="tv-mood-opt' + (md.id === data.mood ? ' on' : '') + '" data-mood="' + md.id + '" style="--mood:' + md.color + '"><i>' + md.emoji + '</i>' + esc(md.label) + '</button>').join('') +
      '</div></div>' +
      '<div class="field"><label>日志 / 心情</label><textarea id="tv-j-text" rows="6" placeholder="今天发生了什么？有什么想记住的？">' + esc(data.text) + '</textarea></div>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-j-del" style="margin-right:auto">删除日志</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-j-save">' + (editing ? '保存' : '写下') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);
    let mood = data.mood;
    m.querySelectorAll('[data-mood]').forEach(b => {
      b.onclick = () => {
        mood = b.dataset.mood;
        m.querySelectorAll('[data-mood]').forEach(x => x.classList.toggle('on', x === b));
      };
    });
    const del = m.querySelector('#tv-j-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除日志', '确定删除这篇日志吗？').then(ok => {
        if (!ok) return;
        t.journals = t.journals.filter(x => x.id !== j.id);
        persist(); App.closeModal(); render();
        toast('日志已删除', 'ok');
      });
    };
    m.querySelector('#tv-j-save').onclick = () => {
      const text = m.querySelector('#tv-j-text').value.trim();
      if (!text) return toast('写点什么再保存吧', 'err');
      const targetDay = Number(m.querySelector('#tv-j-day').value) || 1;
      const dayObj = t.days.find(d => d.day === targetDay) || t.days[0];
      const patch = {
        day: targetDay,
        date: dayObj ? dayObj.date : todayStr(),
        mood: mood,
        weather: m.querySelector('#tv-j-weather').value.trim(),
        text: text
      };
      if (j) Object.assign(j, patch);
      else t.journals.push(Object.assign({ id: uid('j'), created: Date.now() }, patch));
      persist(); App.closeModal(); render();
      toast(editing ? '日志已更新' : '日志已保存', 'ok');
    };
  }

  /* ---------- 账单 ---------- */
  function activityOptions(selected) {
    const acts = allActivities();
    return '<option value="">不关联行程</option>' + acts.map(a =>
      '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>D' + a.day + ' ' + esc(a.time || '') + ' ' + esc(a.title) + '</option>'
    ).join('');
  }
  function openExpenseModal(id, preset) {
    const t = T();
    if (!t) return;
    const e = id ? t.expenses.find(x => x.id === id) : null;
    const editing = !!e;
    const presetAct = preset && preset.activityId ? activityById(preset.activityId) : null;
    const data = e || {
      title: presetAct ? presetAct.title : '',
      amount: presetAct && presetAct.cost ? presetAct.cost : '',
      category: presetAct ? 'fun' : 'food',
      date: presetAct ? presetAct.date : (t.days.some(d => d.date === todayStr()) ? todayStr() : t.startDate),
      payerId: 'me',
      activityId: presetAct ? presetAct.id : '',
      participants: t.members.map(m => m.id),
      note: '',
      sync: true
    };
    const lcats = ledgerCategories();
    const subsOf = name => {
      const c = lcats.find(x => x.name === name);
      return (c && Array.isArray(c.subs)) ? c.subs : [];
    };
    let initCat = lcats.length ? lcats[0].name : '';
    let initSub = '';
    if (lcats.length) {
      if (data.ledgerCat && lcats.some(c => c.name === data.ledgerCat)) {
        initCat = data.ledgerCat;
      } else {
        const pair = RECORD_MAP[data.category] || RECORD_MAP.other;
        const hit = lcats.find(c => c.name === pair[0]);
        if (hit) initCat = hit.name;
      }
      const subs = subsOf(initCat);
      initSub = subs.indexOf(data.ledgerSub) >= 0 ? data.ledgerSub : (subs[0] || '');
    }
    const subHTML = name => {
      const subs = subsOf(name);
      if (!subs.length) return '<option value="">无小类</option>';
      return subs.map(v => '<option value="' + esc(v) + '"' + (v === initSub ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    };
    const m = openModal(
      modalTitle(editing ? '编辑账单' : '记一笔旅行账单', '这里填总额；记账本只记「我的 AA 份额」') +
      '<div class="field-row">' +
        field('账单名称', '<input id="tv-e-title" type="text" value="' + esc(data.title) + '" placeholder="例如 双廊渔家晚饭">') +
        field('总金额（元）', '<input id="tv-e-amount" type="number" min="0" step="0.01" value="' + (data.amount || '') + '" placeholder="0.00">') +
      '</div>' +
      '<div class="field-row">' +
        field('大类', '<select id="tv-e-cat">' + lcats.map(c => '<option value="' + esc(c.name) + '"' + (c.name === initCat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>') +
        field('小类', '<select id="tv-e-sub">' + subHTML(initCat) + '</select>') +
      '</div>' +
      '<div class="field-row">' +
        field('日期', dateInput('tv-e-date', data.date)) +
        field('谁付的钱', '<select id="tv-e-payer">' + memberOptions(data.payerId) + '</select>') +
      '</div>' +
      field('关联行程（可选）', '<select id="tv-e-act">' + activityOptions(data.activityId) + '</select>') +
      '<div class="field"><label>谁参与分摊（AA）</label>' + memberChecks(data.participants) + '</div>' +
      field('备注', '<input id="tv-e-note" type="text" value="' + esc(data.note) + '" placeholder="可选，例如 含早餐">') +
      '<div class="tv-sync-box">' +
        checkLine('tv-e-sync', '同步到记账本（只记我的分摊份额）', data.sync !== false) +
        '<p class="tv-form-tip" id="tv-e-preview"></p>' +
      '</div>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-e-del" style="margin-right:auto">删除账单</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-e-save">' + (editing ? '保存' : '记入账本') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);
    const catSel = m.querySelector('#tv-e-cat');
    const subSel = m.querySelector('#tv-e-sub');
    catSel.addEventListener('change', () => {
      const subs = subsOf(catSel.value);
      subSel.innerHTML = subs.length
        ? subs.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('')
        : '<option value="">无小类</option>';
      App.enhanceSelects(m);
    });
    const updPreview = () => {
      const amt = Number(m.querySelector('#tv-e-amount').value) || 0;
      const ids = checkedIds(m);
      const n = ids.length;
      const mine = n > 0 ? (function () {
        const arr = splitCents(cents(amt), n);
        const i = ids.indexOf('me');
        return i >= 0 ? arr[i] : 0;
      })() : 0;
      m.querySelector('#tv-e-preview').textContent = n ? (n + ' 人分摊，我的份额 ' + money2(yuan(mine)) + (m.querySelector('#tv-e-sync').checked ? ' 会写入记账本' : ' 不同步记账本')) : '还没选参与分摊的人';
    };
    m.querySelector('#tv-e-amount').addEventListener('input', updPreview);
    m.querySelectorAll('.tv-checks input').forEach(x => x.addEventListener('change', updPreview));
    m.querySelector('#tv-e-sync').addEventListener('change', updPreview);
    updPreview();
    const del = m.querySelector('#tv-e-del');
    if (del) del.onclick = () => {
      const tip = e.mirror
        ? '「' + data.title + '」来自记账本，删除只会取消这里的关联，不会删掉记账本里的那笔账单。'
        : '「' + data.title + '」会从旅行账本和记账本一起删除。';
      App.confirmDialog('删除账单', tip).then(ok => {
        if (!ok) return;
        if (e.recordId && !e.mirror) dropRecord(e.recordId);
        t.expenses = t.expenses.filter(x => x.id !== e.id);
        t.hotels.forEach(h => { if (h.expenseId === e.id) h.expenseId = ''; });
        persist(); App.closeModal(); render();
        toast('账单已删除', 'ok');
      });
    };
    m.querySelector('#tv-e-save').onclick = () => {
      const title = m.querySelector('#tv-e-title').value.trim();
      const amount = Number(m.querySelector('#tv-e-amount').value);
      const participants = checkedIds(m);
      if (!title) return toast('请填写账单名称', 'err');
      if (!isFinite(amount) || amount <= 0) return toast('请输入正确的金额', 'err');
      if (!participants.length) return toast('至少选一个分摊的人', 'err');
      const date = m.querySelector('#tv-e-date').dataset.date || todayStr();
      const patch = {
        title: title, amount: Math.round(amount * 100) / 100,
        ledgerCat: catSel.value,
        ledgerSub: subSel.value,
        category: travelCatId(catSel.value, subSel.value),
        date: date, day: dayOfDate(date),
        payerId: m.querySelector('#tv-e-payer').value || 'me',
        activityId: m.querySelector('#tv-e-act').value || '',
        participants: participants,
        note: m.querySelector('#tv-e-note').value.trim(),
        sync: m.querySelector('#tv-e-sync').checked
      };
      let target = e;
      if (target) Object.assign(target, patch);
      else {
        target = Object.assign({ id: uid('e') }, patch);
        t.expenses.push(target);
      }
      persist();
      syncRecord(target);
      App.closeModal(); render();
      toast(editing ? '账单已更新' : '已记入旅行账本', 'ok');
    };
  }

  /* ---------- 住宿 ---------- */
  function openHotelModal(id) {
    const t = T();
    if (!t) return;
    const h = id ? t.hotels.find(x => x.id === id) : null;
    const editing = !!h;
    const data = h || { name: '', address: '', checkIn: t.startDate, checkOut: t.endDate, note: '' };
    const members = t.members;
    const linked = h ? (t.expenses || []).filter(e => e.hotelId === h.id) : [];
    let ownPays = linked.filter(e => !e.mirror);
    const mirrorPays = linked.filter(e => e.mirror);
    // 旧数据：只有一笔总额、还没拆成付款记录，打开时先按原样铺一行
    if (!linked.length && h && cents(h.amount) > 0) {
      const parts = (h.participants && h.participants.length) ? h.participants : members.map(m => m.id);
      ownPays = [{
        id: '', date: h.checkIn, amount: Number(h.amount) || 0, payerId: h.payerId || 'me',
        split: parts.length > 1 ? 'aa' : 'self', participants: parts,
        title: '房费', payLabel: '房费'
      }];
    }
    const LABELS = ['定金', '尾款', '房费', '押金', '加床', '其他'];

    const labelOf = p => {
      if (p.payLabel) return p.payLabel;
      const parts = String(p.title || '').split('·');
      const last = (parts[parts.length - 1] || '').trim();
      return LABELS.indexOf(last) >= 0 ? last : '房费';
    };
    const payRow = p => {
      const split = p.split === 'self' ? 'self' : 'aa';
      const parts = (p.participants && p.participants.length) ? p.participants : members.map(m => m.id);
      const date = p.date || data.checkIn;
      const expId = p.id || '';
      return '<div class="tv-payrow" data-exp="' + esc(expId) + '">' +
        '<div class="tv-payrow-head">' +
          '<select class="tv-pay-title" data-f="label">' +
            LABELS.map(l => '<option' + (l === labelOf(p) ? ' selected' : '') + '>' + l + '</option>').join('') +
          '</select>' +
          '<div class="tv-pay-amt"><input type="number" min="0" step="0.01" data-f="amount" value="' + (p.amount ? p.amount : '') + '" placeholder="0.00"><span>元</span></div>' +
          '<button type="button" class="tv-pay-del" title="删除这笔付款">✕</button>' +
        '</div>' +
        '<div class="tv-payrow-line">' +
          '<label class="tv-pay-lab">付款日</label>' +
          '<input class="cal-input tv-pay-date" type="text" readonly value="' + esc(date) + '" data-date="' + esc(date) + '">' +
          '<label class="tv-pay-lab">谁付的</label>' +
          '<select class="tv-pay-payer" data-f="payer">' + memberOptions(p.payerId || 'me') + '</select>' +
        '</div>' +
        '<div class="tv-payrow-line">' +
          '<span class="tv-pay-lab">怎么摊</span>' +
          '<div class="tv-seg">' +
            '<button type="button" class="tv-seg-opt' + (split === 'aa' ? ' on' : '') + '" data-split="aa">和大家 AA</button>' +
            '<button type="button" class="tv-seg-opt' + (split === 'self' ? ' on' : '') + '" data-split="self">付款人自己承担</button>' +
          '</div>' +
        '</div>' +
        '<div class="tv-payrow-parts"' + (split === 'aa' ? '' : ' hidden') + '>' +
          '<span class="tv-pay-lab">参与人</span>' +
          '<div class="tv-checks tv-checks-sm">' + members.map(mm =>
            '<label class="tv-check"><input type="checkbox" value="' + mm.id + '"' + (parts.indexOf(mm.id) >= 0 ? ' checked' : '') + '>' +
              '<span class="tv-check-box">' + CHECK_SVG + '</span>' +
              '<span class="tv-check-text">' + esc(mm.name) + '</span>' +
            '</label>').join('') +
          '</div>' +
        '</div>' +
      '</div>';
    };

    const m = openModal(
      modalTitle(editing ? '编辑住宿' : '加一个住宿', '一次旅行可以有多家酒店；每家可以分定金、尾款等多笔付款') +
      '<div class="field-row">' +
        field('住宿名称', '<input id="tv-h-name" type="text" value="' + esc(data.name) + '" placeholder="例如 既下山 · 大理古城">') +
        field('地址', '<input id="tv-h-address" type="text" value="' + esc(data.address) + '" placeholder="可选">') +
      '</div>' +
      '<div class="field-row">' +
        field('入住日期', dateInput('tv-h-in', data.checkIn)) +
        field('退房日期', dateInput('tv-h-out', data.checkOut)) +
      '</div>' +
      field('备注', '<input id="tv-h-note" type="text" value="' + esc(data.note) + '" placeholder="可选">') +
      '<div class="tv-payblock">' +
        '<div class="tv-payblock-head"><b>付款记录</b><span>可以只记一次，也可以拆成定金 / 尾款</span></div>' +
        (mirrorPays.length ? '<div class="tv-pay-mirror">记账本里已关联这家住宿的账单：' +
          mirrorPays.map(e => '<span class="tv-tag synced">' + esc(e.title) + ' ' + money(yuan(cents(e.amount))) + '</span>').join('') +
          '</div>' : '') +
        '<div id="tv-pay-list">' + (ownPays.length ? ownPays.map(payRow).join('') : payRow({ date: data.checkIn })) + '</div>' +
        '<button type="button" class="tv-pay-add" id="tv-pay-add">＋ 添加一笔付款</button>' +
        '<div class="tv-pay-sum" id="tv-h-sum"></div>' +
        '<p class="tv-pay-tip">我付的部分按份额写入记账本；朋友付的只记在旅行册和对账单里，不会进你的记账本。</p>' +
      '</div>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-h-del" style="margin-right:auto">删除住宿</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-h-save">' + (editing ? '保存' : '添加') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);

    const list = m.querySelector('#tv-pay-list');
    const sumBox = m.querySelector('#tv-h-sum');

    const refreshSum = () => {
      let total = 0, mine = 0, ledger = 0;
      list.querySelectorAll('.tv-payrow').forEach(r => {
        const amt = Number(r.querySelector('[data-f="amount"]').value) || 0;
        if (amt <= 0) return;
        const payer = r.querySelector('[data-f="payer"]').value;
        const split = r.querySelector('.tv-seg-opt.on').dataset.split;
        const parts = Array.from(r.querySelectorAll('.tv-payrow-parts input:checked')).map(x => x.value);
        total += amt;
        if (split === 'self') {
          if (payer === 'me') { mine += amt; ledger += amt; }
        } else if (parts.indexOf('me') >= 0) {
          const sh = amt / parts.length;
          mine += sh;
          if (payer === 'me') ledger += sh;
        }
      });
      const r2 = n => Math.round(n * 100) / 100;
      sumBox.innerHTML = '房费合计 <b>' + money(r2(total)) + '</b>' +
        '<i></i>我承担 <b>' + money(r2(mine)) + '</b>' +
        '<i></i>写入记账本 <b>' + money(r2(ledger)) + '</b>' +
        (mine - ledger > 0.005 ? '<em>朋友垫付 ' + money(r2(mine - ledger)) + ' 只在对账里</em>' : '');
    };

    const bindRow = row => {
      row.querySelectorAll('.cal-input').forEach(inp => { inp.onclick = () => App.openCalendar(inp, 'day'); });
      row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', refreshSum);
        el.addEventListener('change', refreshSum);
      });
      row.querySelectorAll('.tv-seg-opt').forEach(btn => {
        btn.onclick = () => {
          row.querySelectorAll('.tv-seg-opt').forEach(b => b.classList.toggle('on', b === btn));
          row.querySelector('.tv-payrow-parts').hidden = btn.dataset.split !== 'aa';
          refreshSum();
        };
      });
      row.querySelector('.tv-pay-del').onclick = () => { row.remove(); refreshSum(); };
    };
    list.querySelectorAll('.tv-payrow').forEach(bindRow);
    try { App.enhanceSelects(list); } catch (e) { /* ignore */ }
    refreshSum();

    m.querySelector('#tv-pay-add').onclick = () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = payRow({ date: m.querySelector('#tv-h-in').dataset.date || data.checkIn });
      const row = wrap.firstElementChild;
      list.appendChild(row);
      // 新加的行同样走应用内胶囊下拉，不用系统原生 select
      try { App.enhanceSelects(row); } catch (e) { /* ignore */ }
      bindRow(row);
      refreshSum();
    };

    const del = m.querySelector('#tv-h-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除住宿', '「' + data.name + '」和这里记录的付款会一起删除；记账本转来的账单只解除关联。').then(ok => {
        if (!ok) return;
        ownPays.forEach(e => { if (e.recordId) dropRecord(e.recordId); });
        t.expenses = (t.expenses || []).filter(e => e.hotelId !== h.id || e.mirror);
        t.expenses.forEach(e => { if (e.hotelId === h.id) e.hotelId = ''; });
        t.hotels = t.hotels.filter(x => x.id !== h.id);
        persist(); App.closeModal(); render();
        toast('住宿已删除', 'ok');
      });
    };

    m.querySelector('#tv-h-save').onclick = () => {
      const name = m.querySelector('#tv-h-name').value.trim();
      const checkIn = m.querySelector('#tv-h-in').dataset.date || t.startDate;
      const checkOut = m.querySelector('#tv-h-out').dataset.date || checkIn;
      if (!name) return toast('请填写住宿名称', 'err');
      if (parseDate(checkOut) < parseDate(checkIn)) return toast('退房日期不能早于入住日期', 'err');

      const rows = Array.from(list.querySelectorAll('.tv-payrow'));
      const pays = [];
      for (const r of rows) {
        const amount = Math.round((Number(r.querySelector('[data-f="amount"]').value) || 0) * 100) / 100;
        if (amount <= 0) continue;
        const split = r.querySelector('.tv-seg-opt.on').dataset.split;
        const parts = Array.from(r.querySelectorAll('.tv-payrow-parts input:checked')).map(x => x.value);
        if (split === 'aa' && !parts.length) return toast('选一下这笔付款由谁分摊', 'err');
        pays.push({
          expId: r.dataset.exp || '',
          label: r.querySelector('[data-f="label"]').value,
          amount: amount,
          date: r.querySelector('.tv-pay-date').dataset.date || checkIn,
          payerId: r.querySelector('[data-f="payer"]').value || 'me',
          split: split,
          participants: split === 'aa' ? parts : [r.querySelector('[data-f="payer"]').value || 'me']
        });
      }

      let target = h;
      if (target) {
        target.name = name;
        target.address = m.querySelector('#tv-h-address').value.trim();
        target.checkIn = checkIn; target.checkOut = checkOut;
        target.note = m.querySelector('#tv-h-note').value.trim();
      } else {
        target = { id: uid('h'), name: name, address: m.querySelector('#tv-h-address').value.trim(), checkIn: checkIn, checkOut: checkOut, note: m.querySelector('#tv-h-note').value.trim() };
        t.hotels.push(target);
      }
      target.amount = 0;

      const keep = [];
      pays.forEach(p => {
        const patch = {
          hotelId: target.id,
          day: dayOfDate(p.date),
          date: p.date,
          category: 'stay',
          title: target.name + ' · ' + p.label,
          payLabel: p.label,
          amount: p.amount,
          payerId: p.payerId,
          participants: p.participants,
          note: target.note,
          sync: p.payerId === 'me'
        };
        let exp = p.expId ? (t.expenses || []).find(e => e.id === p.expId) : null;
        if (exp) Object.assign(exp, patch);
        else {
          exp = Object.assign({ id: uid('e') }, patch);
          t.expenses.push(exp);
        }
        keep.push(exp);
      });
      // 删掉本次编辑里被移除的付款（记账本转来的 mirror 账单不动）
      ownPays.forEach(e => {
        if (keep.indexOf(e) >= 0) return;
        if (e.recordId) dropRecord(e.recordId);
        t.expenses = t.expenses.filter(x => x.id !== e.id);
      });
      target.amount = yuan(hotelPaidCents(t, target));

      persist();
      keep.forEach(e => syncRecord(e));
      App.closeModal(); render();
      toast(editing ? '住宿已更新' : '住宿已添加', 'ok');
    };
  }

  /* ---------------- 对账单图片 ---------------- */
  function drawSettlement() {
    const t = T();
    const s = settlement();
    const c = THEME_COLORS[state.theme] || THEME_COLORS.bloom;
    const W = 900, H = 640;
    const canvas = document.createElement('canvas');
    const dpr = 2;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);

    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = c.surface; rr(36, 36, W - 72, H - 72, 22); g.fill();
    g.strokeStyle = c.line; g.lineWidth = 1; g.stroke();

    /* 顶部标题 */
    g.fillStyle = c.accent;
    g.font = '600 22px "Songti SC", "Noto Serif SC", Georgia, serif';
    g.fillText('旅行对账单', 78, 106);
    g.fillStyle = c.ink;
    g.font = '600 34px "Songti SC", "Noto Serif SC", Georgia, serif';
    g.fillText(t ? t.title : '旅行', 78, 152);
    g.fillStyle = c.faint;
    g.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText((t ? t.startDate + ' — ' + t.endDate + ' · ' + t.members.length + ' 人' : ''), 78, 182);

    /* 金额块 */
    g.fillStyle = c.ink;
    g.font = '600 44px "Songti SC", Georgia, serif';
    g.fillText(money(yuan(s.totalCents)), 78, 258);
    g.fillStyle = c.faint;
    g.font = '13px "PingFang SC", sans-serif';
    g.fillText('共同账单总额', 78, 282);

    g.fillStyle = c.accent;
    g.font = '600 22px "Songti SC", Georgia, serif';
    g.fillText(money2(yuan(totalMyCents(t))), 520, 230);
    g.fillStyle = c.faint;
    g.font = '12px "PingFang SC", sans-serif';
    g.fillText('我的花费（已按 AA 份额同步记账本）', 520, 252);

    /* 分隔线 */
    g.strokeStyle = c.line;
    g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(78, 316); g.lineTo(W - 78, 316); g.stroke();
    g.setLineDash([]);

    /* 成员分摊 */
    g.fillStyle = c.ink;
    g.font = '600 16px "PingFang SC", sans-serif';
    g.fillText('谁该给谁钱', 78, 350);
    const lines = [{ name: '我的花费（AA 后）', note: '已同步记账本', right: money2(yuan(totalMyCents(t))), tone: 'pos' }].concat(
      s.pairs.map(p => {
        const settled = Math.abs(p.net) < 0.5;
        const toMe = p.net > 0;
        return {
          name: p.name,
          note: p.items.length + ' 笔共同消费',
          right: settled ? '已结清' : (toMe ? '需付我 ' : '我需付 ') + money2(yuan(Math.abs(p.net))),
          tone: settled ? '' : (toMe ? 'pos' : 'neg')
        };
      })
    );
    lines.forEach((r, i) => {
      const y = 388 + i * 44;
      g.fillStyle = c.ink;
      g.font = '600 15px "PingFang SC", sans-serif';
      g.fillText(r.name, 78, y);
      g.fillStyle = c.faint;
      g.font = '12px "PingFang SC", sans-serif';
      g.fillText(r.note, 168, y);
      g.fillStyle = r.tone === 'neg' ? c.accent : c.accent2;
      g.font = '600 15px "PingFang SC", sans-serif';
      g.fillText(r.right, W - 78 - g.measureText(r.right).width, y);
    });

    /* 转账方案 */
    g.fillStyle = c.ink;
    g.font = '600 16px "PingFang SC", sans-serif';
    g.fillText('转账方案', 520, 350);
    if (!s.transfers.length) {
      g.fillStyle = c.faint;
      g.font = '13px "PingFang SC", sans-serif';
      g.fillText('刚好平账，不用转钱。', 520, 388);
    } else {
      s.transfers.slice(0, 5).forEach((tr, i) => {
        const y = 388 + i * 44;
        g.fillStyle = c.ink;
        g.font = '14px "PingFang SC", sans-serif';
        g.fillText(tr.from + ' → ' + tr.to, 520, y);
        g.fillStyle = c.accent;
        g.font = '600 15px "PingFang SC", sans-serif';
        g.fillText(money(yuan(tr.cents)), 520, y + 20);
      });
    }

    /* 页脚 */
    g.fillStyle = c.faint;
    g.font = '11px "PingFang SC", sans-serif';
    g.fillText('旅行账册 · 记账本只记录我的 AA 份额', 78, H - 66);
    g.strokeStyle = c.accent;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(W - 110, H - 96, 42, 0, Math.PI * 2); g.stroke();
    g.save();
    g.translate(W - 110, H - 96);
    g.rotate(-0.12);
    g.fillStyle = c.accent;
    g.font = '600 15px "Songti SC", Georgia, serif';
    g.textAlign = 'center';
    g.fillText('旅行', 0, -4);
    g.fillText('账册', 0, 16);
    g.restore();
    g.textAlign = 'left';
    return canvas;
  }

  /* 单个成员的对账单：只包含「我」与这位成员之间的往来 */
  function drawPersonStatement(mid) {
    const t = T();
    if (!t) return null;
    const s = settlement();
    const p = s.pairs.find(x => x.id === mid);
    if (!p) return null;
    const c = THEME_COLORS[state.theme] || THEME_COLORS.bloom;
    const items = p.items.slice(0, 18);
    const W = 760, H = 380 + Math.max(1, items.length) * 54 + 100;
    const canvas = document.createElement('canvas');
    const dpr = 2;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);

    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = c.surface; rr(32, 32, W - 64, H - 64, 20); g.fill();
    g.strokeStyle = c.line; g.lineWidth = 1; g.stroke();

    g.fillStyle = c.accent;
    g.font = '600 20px "Songti SC", "Noto Serif SC", Georgia, serif';
    g.fillText('个人对账单', 68, 94);
    g.fillStyle = c.ink;
    g.font = '600 30px "Songti SC", "Noto Serif SC", Georgia, serif';
    g.fillText(p.name, 68, 136);
    g.fillStyle = c.faint;
    g.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText(t.title + ' · ' + t.startDate + ' — ' + t.endDate, 68, 162);

    const settled = Math.abs(p.net) < 0.5;
    const toMe = p.net > 0;
    const headLine = settled ? '已和 ' + s.meName + ' 结清'
      : toMe ? p.name + ' 需付给 ' + s.meName + ' ' + money2(yuan(p.net))
      : s.meName + ' 需付给 ' + p.name + ' ' + money2(yuan(-p.net));
    g.fillStyle = settled ? c.accent2 : c.accent;
    g.font = '600 26px "Songti SC", Georgia, serif';
    g.fillText(headLine, 68, 218);
    g.fillStyle = c.faint;
    g.font = '12px "PingFang SC", sans-serif';
    g.fillText('共 ' + p.items.length + ' 笔共同消费 · 金额为 AA 后各自应承担的部分', 68, 244);

    g.strokeStyle = c.line;
    g.beginPath(); g.moveTo(68, 266); g.lineTo(W - 68, 266); g.stroke();

    if (!items.length) {
      g.fillStyle = c.faint;
      g.font = '14px "PingFang SC", sans-serif';
      g.fillText('这趟旅行没有和 ' + p.name + ' 之间的共同消费。', 68, 316);
    }
    items.forEach((it, i) => {
      const y = 306 + i * 54;
      g.fillStyle = c.faint;
      g.font = '12px "PingFang SC", sans-serif';
      g.fillText(shortDate(it.exp.date), 68, y);
      g.fillStyle = c.ink;
      g.font = '600 14px "PingFang SC", sans-serif';
      g.fillText(String(it.exp.title || '').slice(0, 14), 118, y);
      g.fillStyle = c.faint;
      g.font = '12px "PingFang SC", sans-serif';
      g.fillText((it.dir === 1 ? p.name : s.meName) + ' 应分摊 · 总额 ' + money(yuan(cents(it.exp.amount))), 118, y + 20);
      g.fillStyle = it.dir === 1 ? c.accent2 : c.accent;
      g.font = '600 15px "PingFang SC", sans-serif';
      const txt = (it.dir === 1 ? '+' : '−') + money2(yuan(it.cents)).slice(1);
      g.fillText(txt, W - 68 - g.measureText(txt).width, y);
    });

    g.fillStyle = c.ink;
    g.font = '600 13px "PingFang SC", sans-serif';
    g.fillText('对方应承担 ' + money2(yuan(p.theyOwe)), 68, H - 118);
    g.fillText('我应承担 ' + money2(yuan(p.iOwe)), 300, H - 118);
    g.fillStyle = c.faint;
    g.font = '11px "PingFang SC", sans-serif';
    g.fillText('旅行账册 · 记账本只记录我的 AA 份额', 68, H - 68);

    g.strokeStyle = c.accent; g.lineWidth = 1.5;
    g.beginPath(); g.arc(W - 110, H - 96, 38, 0, Math.PI * 2); g.stroke();
    g.save();
    g.translate(W - 110, H - 96);
    g.rotate(-0.12);
    g.fillStyle = c.accent;
    g.font = '600 14px "Songti SC", Georgia, serif';
    g.textAlign = 'center';
    g.fillText('个人', 0, -4);
    g.fillText('对账', 0, 16);
    g.restore();
    g.textAlign = 'left';
    return canvas;
  }

  function downloadPersonSettle(mid) {
    const t = T();
    if (!t) return;
    const p = settlement().pairs.find(x => x.id === mid);
    if (!p) return toast('没有找到这个人的账单', 'err');
    const canvas = drawPersonStatement(mid);
    if (!canvas) return toast('生成图片失败', 'err');
    saveCanvas(canvas, '对账单-' + t.title + '-' + p.name + '.png').then(ok => {
      toast(ok ? p.name + ' 的对账单已下载' : '生成图片失败', ok ? 'ok' : 'err');
    });
  }

  function saveCanvas(canvas, name) {
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        if (!blob) return resolve(false);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        resolve(true);
      }, 'image/png');
    });
  }

  function copySettlement() {
    const t = T();
    if (!t) return;
    const canvas = drawSettlement();
    canvas.toBlob(async blob => {
      if (!blob) return toast('生成图片失败', 'err');
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('对账单图片已复制，可以直接粘贴到群里', 'ok');
        } else {
          await saveCanvas(canvas, '对账单-' + t.destination + '.png');
          toast('当前浏览器不支持复制图片，已改为下载', 'ok');
        }
      } catch (e) {
        await saveCanvas(canvas, '对账单-' + t.destination + '.png');
        toast('复制失败，已改为下载图片', 'err');
      }
    }, 'image/png');
  }

  function downloadSettlement() {
    const t = T();
    if (!t) return;
    const canvas = drawSettlement();
    saveCanvas(canvas, '对账单-' + t.destination + '.png').then(ok => {
      toast(ok ? '对账单图片已下载' : '生成图片失败', ok ? 'ok' : 'err');
    });
  }

  /* ---------------- 对外 ---------------- */
  window.Travel = {
    render: render,
    state: function () { return state; },
    activeTrips: activeTrips,
    tripBrief: tripBrief,
    hotelsOf: hotelsOf,
    linkOfRecord: linkOfRecord,
    attachRecord: attachRecord,
    unlinkRecord: unlinkRecord,
    rebindRecordId: rebindRecordId
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (state && state.view) render();
    });
  }
})();
