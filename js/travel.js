/* ============================================================
   旅行账本 · 集成在财务管家内的旅行账单 / 行程 / 日志模块
   - 旅行明细保存在本机（按账号隔离），不新增云端表
   - 产生的旅行账单会按「我的 AA 份额」同步到记账本 records
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'fin_travel_v1_';
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const THEMES = [
    { id: 'paper', name: '暖纸', desc: '奶油纸感 · 陶土红' },
    { id: 'ocean', name: '海盐', desc: '海雾青蓝 · 珊瑚橙' },
    { id: 'ink', name: '墨夜', desc: '夜墨底色 · 鎏金线条' },
    { id: 'bloom', name: '山茶', desc: '山茶粉调 · 苔绿点缀' }
  ];

  const THEME_COLORS = {
    paper: { bg: '#f2ebdd', surface: '#fbf6e9', ink: '#23251c', soft: '#5c5b4b', faint: '#8d8876', line: 'rgba(35,37,28,.16)', accent: '#bf4f2a', accent2: '#2e5c4e', sun: '#d9a02a' },
    ocean: { bg: '#eaf2f2', surface: '#fbfefe', ink: '#17323b', soft: '#4e6b73', faint: '#7d969d', line: 'rgba(23,50,59,.16)', accent: '#2f6d78', accent2: '#c07a4a', sun: '#7fa8a3' },
    ink: { bg: '#15181a', surface: '#1f2427', ink: '#f0e9da', soft: '#b8b2a4', faint: '#8b867b', line: 'rgba(240,233,218,.18)', accent: '#d9b46a', accent2: '#8fa89b', sun: '#d9b46a' },
    bloom: { bg: '#f8ece9', surface: '#fff8f5', ink: '#3a2628', soft: '#7c5c5e', faint: '#a98a8c', line: 'rgba(58,38,40,.16)', accent: '#a34a5a', accent2: '#6d7f6a', sun: '#d9a05a' }
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
    const s = v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return '¥' + s;
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

  /* ---------------- 示例数据 ---------------- */
  function seedState() {
    return {
      version: 1,
      theme: 'paper',
      tab: 'overview',
      filterCat: 'all',
      trip: {
        id: 'trip-1',
        title: '大理，四天三夜',
        destination: '大理',
        startDate: '2026-11-15',
        endDate: '2026-11-18',
        budget: 6000
      },
      members: [
        { id: 'me', name: '我', initial: '我', cls: 'me' },
        { id: 'xiaoyu', name: '小雨', initial: '小', cls: 'xiaoyu' },
        { id: 'azhe', name: '阿哲', initial: '哲', cls: 'azhe' }
      ],
      days: [
        {
          day: 1, date: '2026-11-15', city: '大理古城', theme: '抵达 · 古城慢逛', weather: '晴 19°',
          activities: [
            { id: 'a1', time: '09:10', title: '昆明南 → 大理', place: '动车 D8656 · 2 小时 10 分', note: '', cost: 435 },
            { id: 'a2', time: '13:40', title: '入住古城民宿', place: '人民路下段 · 15:00 后可入住', note: '', cost: 0 },
            { id: 'a3', time: '16:00', title: '古城闲逛 · 五华楼', place: '复兴路 · 人民路', note: '', cost: 0 },
            { id: 'a4', time: '19:00', title: '再回首凉鸡米线', place: '古城南门', note: '', cost: 86 }
          ]
        },
        {
          day: 2, date: '2026-11-16', city: '洱海西岸', theme: '环海 · 稻田与咖啡', weather: '晴 21°',
          activities: [
            { id: 'a5', time: '08:00', title: '洱海门早点', place: '才村码头 · 稀豆粉配饵块', note: '', cost: 42 },
            { id: 'a6', time: '09:30', title: '环洱海包车', place: '才村 → 喜洲 → 双廊', note: '', cost: 480 },
            { id: 'a7', time: '12:30', title: '喜洲稻田咖啡', place: '喜林苑旁的稻田边', note: '', cost: 108 },
            { id: 'a8', time: '18:30', title: '双廊渔家晚饭', place: '双廊古镇 · 酸辣鱼', note: '', cost: 268 },
            { id: 'a9', time: '21:00', title: '入住双廊海景民宿', place: '环海东路', note: '', cost: 780 }
          ]
        },
        {
          day: 3, date: '2026-11-17', city: '双廊 · 洱海东岸', theme: '坐船 · 等一场日落', weather: '多云 18°',
          activities: [
            { id: 'a10', time: '09:00', title: '南诏风情岛', place: '双廊码头 · 船票 + 门票', note: '', cost: 150 },
            { id: 'a11', time: '13:00', title: '海地生活 · 玻璃球拍照', place: '双廊环海路', note: '', cost: 0 },
            { id: 'a12', time: '17:30', title: '鹿卧山看日落', place: '环海东路', note: '', cost: 0 },
            { id: 'a13', time: '20:00', title: '深夜烧烤 + 风花雪月', place: '双廊镇口', note: '', cost: 156 }
          ]
        },
        {
          day: 4, date: '2026-11-18', city: '大理 → 昆明', theme: '返程 · 下次再见', weather: '晴 20°',
          activities: [
            { id: 'a14', time: '09:30', title: '最后一碗饵丝', place: '古城北门', note: '', cost: 54 },
            { id: 'a15', time: '11:00', title: '大理 → 昆明', place: '动车 D8672', note: '', cost: 0 },
            { id: 'a16', time: '14:00', title: '解散，各自返程', place: '昆明南站', note: '已经开始想下次去哪儿了', cost: 0 }
          ]
        }
      ],
      hotels: [
        {
          id: 'h1', name: '既下山 · 大理古城', address: '大理市古城区人民路下段 108 号',
          checkIn: '2026-11-15', checkOut: '2026-11-17', amount: 1160,
          payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '两层小院，天台能看见苍山', expenseId: 'e1'
        },
        {
          id: 'h2', name: '云七 · 双廊海景民宿', address: '大理市双廊镇环海东路',
          checkIn: '2026-11-17', checkOut: '2026-11-18', amount: 780,
          payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '阳台正对洱海，早上有海鸥', expenseId: 'e9'
        }
      ],
      expenses: [
        { id: 'e1', hotelId: 'h1', activityId: 'a2', day: 1, date: '2026-11-15', category: 'stay', title: '既下山 · 大理古城（2 晚）', amount: 1160, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '含早餐', sync: true },
        { id: 'e2', activityId: 'a1', day: 1, date: '2026-11-15', category: 'transport', title: '昆明 → 大理 动车票 ×3', amount: 435, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e3', activityId: 'a4', day: 1, date: '2026-11-15', category: 'food', title: '再回首凉鸡米线', amount: 86, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e4', day: 1, date: '2026-11-15', category: 'ticket', title: '崇圣寺三塔门票 ×3', amount: 225, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e5', activityId: 'a5', day: 2, date: '2026-11-16', category: 'food', title: '洱海门早点', amount: 42, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e6', activityId: 'a6', day: 2, date: '2026-11-16', category: 'transport', title: '环洱海包车一天', amount: 480, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '师傅人很好，一路讲解', sync: true },
        { id: 'e7', activityId: 'a7', day: 2, date: '2026-11-16', category: 'food', title: '喜洲稻田咖啡 ×3', amount: 108, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e8', activityId: 'a8', day: 2, date: '2026-11-16', category: 'food', title: '双廊渔家晚饭', amount: 268, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '酸辣鱼 + 银鱼煎蛋', sync: true },
        { id: 'e9', hotelId: 'h2', activityId: 'a9', day: 3, date: '2026-11-17', category: 'stay', title: '云七 · 双廊海景民宿（1 晚）', amount: 780, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e10', activityId: 'a10', day: 3, date: '2026-11-17', category: 'ticket', title: '南诏风情岛船票 ×3', amount: 150, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e11', day: 3, date: '2026-11-17', category: 'shop', title: '扎染围巾（小雨自己买）', amount: 68, payerId: 'xiaoyu', participants: ['xiaoyu'], note: '个人消费，不分摊', sync: true },
        { id: 'e12', activityId: 'a13', day: 3, date: '2026-11-17', category: 'food', title: '深夜烧烤 + 风花雪月', amount: 156, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'e13', day: 4, date: '2026-11-18', category: 'food', title: '返程前最后一碗饵丝', amount: 54, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true }
      ],
      journals: [
        {
          id: 'j1', day: 1, date: '2026-11-15', mood: 'excited', weather: '晴 · 风里有洱海味', created: 1,
          text: '动车穿过一个接一个的隧道，出站那一刻，风里已经有洱海的味道。放下行李就去古城乱走，苍山的雪顶在巷子尽头忽隐忽现，像给这趟旅行盖了个章。'
        },
        {
          id: 'j2', day: 2, date: '2026-11-16', mood: 'content', weather: '晴 · 喜洲稻田', created: 2,
          text: '包车师傅一路都在讲哪片稻田拍照最好看。下午在喜洲喝咖啡，风把稻子吹成一片金色的海。晚上双廊的酸辣鱼太好吃，三个人吃到不说话。'
        },
        {
          id: 'j3', day: 3, date: '2026-11-17', mood: 'broke', weather: '多云 · 双廊', created: 3,
          text: '南诏风情岛的船票比想象中贵，但海风值回票价。晚上烧烤配风花雪月，账单又悄悄变长了一点。钱包疼，但下次还敢。'
        },
        {
          id: 'j4', day: 3, date: '2026-11-17', mood: 'moved', weather: '日落 · 鹿卧山', created: 4,
          text: '双廊的日落把整片海染成橘色。阿哲说以后每年都要来一次，我说好。有些瞬间不用拍照，也一直记得。'
        }
      ]
    };
  }

  /* ---------------- 状态读写 ---------------- */
  let state = null;
  let stateKey = '';

  function userKey() {
    try { return (typeof Store !== 'undefined' && Store.user && Store.user.email) || 'guest'; } catch (e) { return 'guest'; }
  }
  function loadFor(key) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 1) return s;
      }
    } catch (e) { console.warn('读取旅行数据失败', e); }
    return seedState();
  }
  function ensureState() {
    const k = userKey();
    if (!state || stateKey !== k) {
      stateKey = k;
      state = loadFor(k);
      if (!state.trip) state = seedState();
    }
    return state;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_PREFIX + stateKey, JSON.stringify(state)); } catch (e) { console.warn('保存旅行数据失败', e); }
  }

  /* ---------------- 查询 ---------------- */
  function member(id) { return state.members.find(m => m.id === id) || { id: id, name: '成员', initial: '?', cls: '' }; }
  function allActivities() {
    const out = [];
    state.days.forEach(d => (d.activities || []).forEach(a => out.push({ ...a, day: d.day, date: d.date, city: d.city })));
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  function activityById(id) {
    const loc = locateActivity(id);
    if (!loc) return null;
    return { ...loc.act, day: loc.day.day, date: loc.day.date, city: loc.day.city };
  }
  function locateActivity(id) {
    for (const d of state.days) {
      const a = (d.activities || []).find(x => x.id === id);
      if (a) return { act: a, day: d };
    }
    return null;
  }
  function expensesOfActivity(id) { return state.expenses.filter(e => e.activityId === id); }
  function dayOfDate(date) {
    const exact = state.days.find(d => d.date === date);
    if (exact) return exact.day;
    return state.days[0] ? state.days[0].day : 1;
  }
  function shareCents(exp, mid) {
    const ps = exp.participants || [];
    const i = ps.indexOf(mid);
    if (i < 0) return 0;
    const arr = splitCents(cents(exp.amount), ps.length);
    return arr[i] || 0;
  }
  function myShare(exp) { return yuan(shareCents(exp, 'me')); }
  function totalMyCents() { return state.expenses.reduce((s, e) => s + shareCents(e, 'me'), 0); }
  function totalAllCents() { return state.expenses.reduce((s, e) => s + cents(e.amount), 0); }
  function budgetCents() { return cents(state.trip.budget || 0); }

  function settlement() {
    const rows = state.members.map(m => ({ ...m, paid: 0, share: 0, net: 0 }));
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    state.expenses.forEach(e => {
      const amt = cents(e.amount);
      if (byId[e.payerId]) byId[e.payerId].paid += amt;
      const ps = e.participants || [];
      const parts = splitCents(amt, ps.length);
      ps.forEach((pid, i) => { if (byId[pid]) byId[pid].share += parts[i] || 0; });
    });
    rows.forEach(r => { r.net = r.paid - r.share; });
    const debtors = rows.filter(r => r.net < -0.5).map(r => ({ id: r.id, name: r.name, cents: -r.net })).sort((a, b) => b.cents - a.cents);
    const creditors = rows.filter(r => r.net > 0.5).map(r => ({ id: r.id, name: r.name, cents: r.net })).sort((a, b) => b.cents - a.cents);
    const transfers = [];
    let i = 0, j = 0;
    let guard = 0;
    while (i < debtors.length && j < creditors.length && guard++ < 200) {
      const pay = Math.min(debtors[i].cents, creditors[j].cents);
      if (pay > 0) transfers.push({ from: debtors[i].name, fromId: debtors[i].id, to: creditors[j].name, toId: creditors[j].id, cents: pay });
      debtors[i].cents -= pay; creditors[j].cents -= pay;
      if (debtors[i].cents <= 0.5) i++;
      if (creditors[j].cents <= 0.5) j++;
    }
    return { rows, transfers, totalCents: totalAllCents() };
  }

  /* ---------------- 与记账本同步 ---------------- */
  function resolveTarget(catId) {
    const app = typeof App !== 'undefined' ? App : null;
    if (!app || !app.state) return null;
    const ledgers = app.state.ledgers || [];
    const ledger = ledgers.find(l => l.type === 'personal') || (app.curLedger && app.curLedger());
    if (!ledger) return null;
    const cats = (app.state.categories || []).filter(c => c.ledger_id === ledger.id && c.kind !== 'income');
    if (!cats.length) return null;
    const pair = RECORD_MAP[catId] || RECORD_MAP.other;
    const cat = cats.find(c => c.name === pair[0]) || cats[0];
    const subs = Array.isArray(cat.subs) ? cat.subs : [];
    const sub = subs.indexOf(pair[1]) >= 0 ? pair[1] : (subs[0] || '');
    return { ledger_id: ledger.id, category: cat.name, sub: sub, kind: 'expense' };
  }

  function recordPayload(exp) {
    const target = resolveTarget(exp.category);
    const mine = myShare(exp);
    if (!target || mine <= 0) return null;
    const n = (exp.participants || []).length;
    const aa = n > 1 ? '（' + n + ' 人 AA，已记我的份额）' : '';
    return {
      ledger_id: target.ledger_id, category: target.category, sub: target.sub, kind: 'expense',
      amount: mine, date: exp.date,
      note: '旅行 · ' + state.trip.title + '｜' + exp.title + aa,
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

  /* ---------------- 主题 ---------------- */
  function applyTheme(next) {
    if (!THEMES.some(t => t.id === next)) next = 'paper';
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
    root.innerHTML =
      '<div class="tv-app" data-theme="' + esc(state.theme || 'paper') + '">' +
        renderHead() +
        '<main class="tv-body">' + renderTab() + '</main>' +
      '</div>';
    bind(root);
  }

  function renderHead() {
    const used = totalMyCents();
    const budget = budgetCents();
    const pct = budget > 0 ? Math.min(100, Math.round(used / budget * 100)) : 0;
    const remain = budget - used;
    return '' +
      '<header class="tv-head">' +
        '<div class="tv-brandline">' +
          '<div class="tv-brand">' +
            '<span class="tv-stamp">旅</span>' +
            '<div><h2>旅行账本</h2><p>' + esc(state.trip.title) + '</p></div>' +
          '</div>' +
          '<div class="tv-theme-wrap">' +
            '<span class="tv-theme-label">风格</span>' +
            '<div class="tv-themes">' +
              THEMES.map(t => '<button type="button" class="tv-theme' + (state.theme === t.id ? ' on' : '') + '" data-theme-set="' + t.id + '" title="' + esc(t.name + ' · ' + t.desc) + '"><i class="sw sw-' + t.id + '"></i><span>' + esc(t.name) + '</span></button>').join('') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tv-tripbar">' +
          '<div class="tv-tripmeta">' +
            '<div class="tv-dates"><span>' + esc(state.trip.startDate) + '</span><i>→</i><span>' + esc(state.trip.endDate) + '</span></div>' +
            '<div class="tv-people">' +
              state.members.map(m => '<span class="tv-avatar ' + esc(m.cls) + '" title="' + esc(m.name) + '">' + esc(m.initial) + '</span>').join('') +
              '<span class="tv-people-note">' + state.members.length + ' 人同行</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="tv-budget" data-act="edit-budget" title="点击修改预算">' +
            '<span class="tv-budget-label">我的预算</span>' +
            '<b>' + (budget > 0 ? money(yuan(budget)) : '未设置') + '</b>' +
            '<span class="tv-budget-sub">' + (budget > 0
              ? '已花 ' + money(yuan(used)) + ' · ' + (remain >= 0 ? '还剩 ' + money(yuan(remain)) : '超支 ' + money(yuan(-remain)))
              : '已经花了 ' + money(yuan(used)) + '，点这里设个预算') + '</span>' +
            '<span class="tv-budget-bar"><i style="width:' + pct + '%"></i></span>' +
            '<span class="tv-budget-edit">' + (budget > 0 ? '修改' : '设置') + '</span>' +
          '</button>' +
        '</div>' +
        '<nav class="tv-tabs">' +
          [
            ['overview', '总览', ''],
            ['plan', '行程', allActivities().length],
            ['journal', '日志', state.journals.length],
            ['expenses', '账本', state.expenses.length],
            ['hotels', '住宿', state.hotels.length],
            ['settle', '对账', '']
          ].map(t => '<button type="button" class="tv-tab' + (state.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + (t[2] !== '' ? '<em>' + t[2] + '</em>' : '') + '</button>').join('') +
        '</nav>' +
      '</header>';
  }

  function renderTab() {
    if (state.tab === 'plan') return renderPlan();
    if (state.tab === 'journal') return renderJournal();
    if (state.tab === 'expenses') return renderExpenses();
    if (state.tab === 'hotels') return renderHotels();
    if (state.tab === 'settle') return renderSettle();
    return renderOverview();
  }

  /* ---------- 总览 ---------- */
  function renderOverview() {
    const s = settlement();
    const total = totalAllCents();
    const mine = totalMyCents();
    const budget = budgetCents();
    const remain = budget - mine;
    const per = state.members.length ? Math.round(total / state.members.length) : 0;
    const today = todayStr();
    const day = state.days.find(d => d.date === today) || state.days[0];
    const cats = CATS.map(c => ({
      ...c,
      amount: state.expenses.filter(e => e.category === c.id).reduce((a, e) => a + cents(e.amount), 0)
    })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
    const catMax = Math.max.apply(null, cats.map(c => c.amount).concat([1]));
    const recent = state.journals.slice().sort((a, b) => (b.date + (b.created || 0)).localeCompare(a.date + (a.created || 0))).slice(0, 2);

    return '' +
      '<div class="tv-hero">' +
        '<div class="tv-hero-copy">' +
          '<span class="tv-eyebrow">' + esc(state.trip.destination) + ' · ' + (state.days.length) + ' 天</span>' +
          '<h3>' + esc(state.trip.title) + '</h3>' +
          '<p>把每天的行程、心情和共同账单放在一起。需要 AA 的消费，记账本只记我分摊后的金额。</p>' +
          '<div class="tv-hero-acts">' +
            '<button type="button" class="tv-btn solid" data-act="new-expense">＋ 记一笔</button>' +
            '<button type="button" class="tv-btn" data-act="new-journal">写日志</button>' +
            '<button type="button" class="tv-btn" data-act="new-activity">加行程</button>' +
          '</div>' +
        '</div>' +
        '<div class="tv-hero-stamp">' + esc(state.trip.destination.slice(0, 2)) + '<span>' + esc(state.trip.startDate.slice(0, 4)) + '</span></div>' +
      '</div>' +
      '<div class="tv-stats">' +
        statCard('总花费', money(yuan(total)), state.expenses.length + ' 笔共同账单') +
        statCard('我的花费', money(yuan(mine)), '已按 AA 份额计算', 'accent') +
        statCard('人均', money(yuan(per)), state.members.length + ' 人均摊') +
        statCard(budget ? (remain >= 0 ? '预算剩余' : '预算超支') : '旅行预算', budget ? money(yuan(Math.abs(remain))) : '未设置', budget ? '预算 ' + money(yuan(budget)) : '点这里输入旅行预算', remain >= 0 ? '' : 'over', 'edit-budget') +
      '</div>' +
      '<div class="tv-grid2">' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>预算进度</h4><button type="button" class="tv-link" data-act="edit-budget">修改预算</button></div>' +
          budgetBar(budget, mine) +
          '<div class="tv-budget-note">预算按「我的花费」计算，不含朋友那份。' + (budget ? '' : ' 还没填预算，点右上角设一个吧。') + '</div>' +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>成员分摊</h4><button type="button" class="tv-link" data-act="go-settle">查看对账</button></div>' +
          '<div class="tv-members">' +
            s.rows.map(r => '<div class="tv-member-row">' +
              '<span class="tv-avatar lg ' + esc(r.cls) + '">' + esc(r.initial) + '</span>' +
              '<div class="tv-member-main"><b>' + esc(r.name) + '</b><span>已付 ' + money(yuan(r.paid)) + ' · 应摊 ' + money(yuan(r.share)) + '</span></div>' +
              '<span class="tv-net ' + (r.net >= 0 ? 'pos' : 'neg') + '">' + (r.net >= 0 ? '+' : '−') + money(yuan(Math.abs(r.net))).slice(1) + '</span>' +
            '</div>').join('') +
          '</div>' +
        '</section>' +
      '</div>' +
      '<div class="tv-grid2">' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>' + (day && day.date === today ? '今天 · DAY ' + day.day : '行程速览 · DAY ' + (day ? day.day : 1)) + '</h4><button type="button" class="tv-link" data-act="go-plan">全部行程</button></div>' +
          (day ? '<div class="tv-mini-day"><div class="tv-mini-day-head"><b>' + esc(day.city) + '</b><span>' + esc(cnDate(day.date)) + ' · ' + esc(day.weather || '') + '</span></div>' +
            day.activities.slice(0, 4).map(a => '<button type="button" class="tv-mini-act" data-act="edit-activity" data-id="' + a.id + '"><em>' + esc(a.time) + '</em><span>' + esc(a.title) + '</span></button>').join('') +
          '</div>' : '<p class="tv-empty">还没有行程，点上面「加行程」安排第一天。</p>') +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>最近日志</h4><button type="button" class="tv-link" data-act="go-journal">全部日志</button></div>' +
          (recent.length ? recent.map(j => '<button type="button" class="tv-mini-journal" data-act="edit-journal" data-id="' + j.id + '">' +
            '<span class="tv-mood-dot" style="background:' + MOOD[j.mood].color + '">' + MOOD[j.mood].emoji + '</span>' +
            '<span class="tv-mini-journal-main"><b>' + esc(MOOD[j.mood].label) + ' · ' + esc(shortDate(j.date)) + '</b>' + esc(j.text.slice(0, 36)) + (j.text.length > 36 ? '…' : '') + '</span>' +
          '</button>').join('') : '<p class="tv-empty">还没有日志，记录一下今天的心情。</p>') +
        '</section>' +
      '</div>' +
      '<section class="tv-panel">' +
        '<div class="tv-panel-head"><h4>分类花费</h4><span class="tv-hint">按共同账单总额</span></div>' +
        (cats.length ? '<div class="tv-catbars">' + cats.map(c => '<div class="tv-catbar">' +
          '<span class="tv-catmark" style="--c:' + c.color + '">' + c.mark + '</span>' +
          '<span class="tv-catbar-name">' + c.label + '</span>' +
          '<span class="tv-catbar-track"><i style="width:' + Math.max(3, Math.round(c.amount / catMax * 100)) + '%;background:' + c.color + '"></i></span>' +
          '<b>' + money(yuan(c.amount)) + '</b>' +
        '</div>').join('') + '</div>' : '<p class="tv-empty">还没有账单，先记第一笔吧。</p>') +
      '</section>' +
      '<div class="tv-foot">' +
        '<span>旅行明细保存在本机 · 账单按我的 AA 份额同步到记账本</span>' +
        '<button type="button" class="tv-link" data-act="reset-demo">恢复示例数据</button>' +
      '</div>';
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

  /* ---------- 行程 ---------- */
  function renderPlan() {
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Itinerary</span><h3>每天要去哪</h3><p>点任意行程可编辑；也可以直接从行程记一笔，自动建立关联。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-activity">＋ 加行程</button>' +
      '</div>' +
      state.days.map(day => {
        const planned = day.activities.reduce((s, a) => s + cents(a.cost), 0);
        return '<section class="tv-day">' +
          '<div class="tv-day-head">' +
            '<span class="tv-day-num">DAY ' + day.day + '</span>' +
            '<div class="tv-day-title"><h4>' + esc(day.city) + '</h4><p>' + esc(cnDate(day.date)) + ' · ' + esc(day.theme || '') + (day.weather ? ' · ' + esc(day.weather) : '') + '</p></div>' +
            '<span class="tv-day-total">计划 ' + money(yuan(planned)) + '</span>' +
            '<button type="button" class="tv-mini-btn" data-act="new-activity" data-day="' + day.day + '">＋</button>' +
          '</div>' +
          '<div class="tv-timeline">' +
            (day.activities.length ? day.activities.map(a => {
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
                      linked.map(e => '<button type="button" class="tv-bill-chip" data-act="edit-expense" data-id="' + e.id + '" title="编辑这笔账单"><span class="tv-catmark xs" style="--c:' + CAT[e.category].color + '">' + CAT[e.category].mark + '</span>' + esc(e.title) + ' · ' + money(e.amount) + '</button>').join('')
                      : '<span class="tv-link-empty">还没有关联账单</span>') +
                    '<button type="button" class="tv-mini-btn solid" data-act="new-expense" data-activity="' + a.id + '">＋ 记一笔</button>' +
                  '</div>' +
                '</div>' +
              '</article>';
            }).join('') : '<p class="tv-empty">这一天还没有安排。</p>') +
          '</div>' +
        '</section>';
      }).join('');
  }

  /* ---------- 日志 ---------- */
  function renderJournal() {
    const list = state.journals.slice().sort((a, b) => (b.date + String(b.created || 0).padStart(6, '0')).localeCompare(a.date + String(a.created || 0).padStart(6, '0')));
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Journal</span><h3>旅行日志</h3><p>' + MOODS.length + ' 种情绪可选。点卡片可以继续编辑，也可以补上当时的天气。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-journal">＋ 写日志</button>' +
      '</div>' +
      (list.length ? '<div class="tv-journal-grid">' + list.map(j => {
        const mood = MOOD[j.mood] || MOOD.calm;
        return '<article class="tv-journal" data-act="edit-journal" data-id="' + j.id + '" style="--mood:' + mood.color + '">' +
          '<div class="tv-journal-top">' +
            '<span class="tv-mood-stamp" style="--mood:' + mood.color + '"><i>' + mood.emoji + '</i>' + esc(mood.label) + '</span>' +
            '<span class="tv-journal-date">DAY ' + j.day + ' · ' + esc(cnDate(j.date)) + '</span>' +
          '</div>' +
          '<p class="tv-journal-weather">' + esc(j.weather || '') + '</p>' +
          '<p class="tv-journal-text">' + esc(j.text) + '</p>' +
          '<span class="tv-journal-edit">点击编辑</span>' +
        '</article>';
      }).join('') + '</div>' : '<p class="tv-empty big">还没有日志。旅行里那些说不清的小情绪，值得写下来。</p>');
  }

  /* ---------- 账本 ---------- */
  function renderExpenses() {
    const list = state.expenses.slice()
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
        (list.length ? list.map(e => {
          const c = CAT[e.category] || CAT.other;
          const payer = member(e.payerId);
          const act = e.activityId ? activityById(e.activityId) : null;
          const n = (e.participants || []).length;
          const mineY = myShare(e);
          return '<article class="tv-exp" data-act="edit-expense" data-id="' + e.id + '">' +
            '<span class="tv-catmark" style="--c:' + c.color + '">' + c.mark + '</span>' +
            '<div class="tv-exp-main">' +
              '<div class="tv-exp-title"><b>' + esc(e.title) + '</b>' +
                (e.hotelId ? '<span class="tv-tag">住宿</span>' : '') +
                (n > 1 ? '<span class="tv-tag aa">AA ' + n + ' 人</span>' : '<span class="tv-tag solo">不分摊</span>') +
                (e.recordId ? '<span class="tv-tag synced">已记记账本</span>' : '') +
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
  function renderHotels() {
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Stays</span><h3>住宿酒店</h3><p>民宿 / 酒店可以有很多个。新增时会自动生成一笔住宿账单。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-hotel">＋ 加住宿</button>' +
      '</div>' +
      (state.hotels.length ? '<div class="tv-hotel-grid">' + state.hotels.map(h => {
        const nights = Math.max(1, Math.round((parseDate(h.checkOut) - parseDate(h.checkIn)) / 86400000));
        const payer = member(h.payerId);
        return '<article class="tv-hotel" data-act="edit-hotel" data-id="' + h.id + '">' +
          '<div class="tv-hotel-top"><span class="tv-hotel-night">' + nights + ' 晚</span><h4>' + esc(h.name) + '</h4><p>' + esc(h.address || '') + '</p></div>' +
          '<div class="tv-hotel-mid">' +
            '<div><span>入住</span><b>' + esc(shortDate(h.checkIn)) + '</b></div>' +
            '<i>→</i>' +
            '<div><span>退房</span><b>' + esc(shortDate(h.checkOut)) + '</b></div>' +
            '<div class="tv-hotel-amt"><span>房费</span><b>' + money(h.amount) + '</b></div>' +
          '</div>' +
          '<div class="tv-hotel-foot">' +
            '<span class="tv-avatar sm ' + esc(payer.cls) + '">' + esc(payer.initial) + '</span>' +
            '<span>' + esc(payer.name) + '付 · ' + (h.participants || []).length + ' 人分</span>' +
            (h.expenseId ? '<span class="tv-tag synced">已生成账单</span>' : '<span class="tv-tag">未生成账单</span>') +
          '</div>' +
          (h.note ? '<p class="tv-hotel-note">' + esc(h.note) + '</p>' : '') +
        '</article>';
      }).join('') + '</div>' : '<p class="tv-empty big">还没有住宿记录。</p>');
  }

  /* ---------- 对账 ---------- */
  function renderSettle() {
    const s = settlement();
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Settlement</span><h3>分摊对账</h3><p>整趟旅行结束后，按最少转账次数结清。复制出来是一张图片，直接发群里就行。</p></div>' +
        '<div class="tv-settle-acts">' +
          '<button type="button" class="tv-btn solid" data-act="copy-settle">复制对账单图片</button>' +
          '<button type="button" class="tv-btn" data-act="download-settle">下载图片</button>' +
        '</div>' +
      '</div>' +
      '<div class="tv-settle-hero">' +
        '<div class="tv-settle-stamp">对<br>账<br>单</div>' +
        '<div class="tv-settle-title"><span>' + esc(state.trip.title) + '</span><h3>' + money(yuan(s.totalCents)) + '</h3><p>' + esc(state.trip.startDate) + ' — ' + esc(state.trip.endDate) + ' · ' + state.members.length + ' 人</p></div>' +
        '<div class="tv-settle-mine"><span>我的花费</span><b>' + money2(yuan(totalMyCents())) + '</b><em>已按 AA 份额入账</em></div>' +
      '</div>' +
      '<div class="tv-grid2">' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>每个人</h4><span class="tv-hint">已付 / 应摊 / 净额</span></div>' +
          '<div class="tv-settle-rows">' + s.rows.map(r => '<div class="tv-settle-row">' +
            '<span class="tv-avatar lg ' + esc(r.cls) + '">' + esc(r.initial) + '</span>' +
            '<div><b>' + esc(r.name) + '</b><span>已付 ' + money(yuan(r.paid)) + ' · 应摊 ' + money(yuan(r.share)) + '</span></div>' +
            '<strong class="' + (r.net >= 0 ? 'pos' : 'neg') + '">' + (r.net >= 0 ? '应收 ' : '应付 ') + money(yuan(Math.abs(r.net))) + '</strong>' +
          '</div>').join('') + '</div>' +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>转账方案</h4><span class="tv-hint">' + (s.transfers.length || '无需') + ' 笔结清</span></div>' +
          (s.transfers.length ? '<div class="tv-transfer-list">' + s.transfers.map(t => '<div class="tv-transfer">' +
            '<span class="tv-avatar sm ' + esc(member(t.fromId).cls) + '">' + esc(member(t.fromId).initial) + '</span>' +
            '<b>' + esc(t.from) + '</b><i>→</i><span class="tv-avatar sm ' + esc(member(t.toId).cls) + '">' + esc(member(t.toId).initial) + '</span><b>' + esc(t.to) + '</b>' +
            '<strong>' + money(yuan(t.cents)) + '</strong>' +
          '</div>').join('') + '</div>' : '<p class="tv-empty">刚好平账，不用转钱。</p>') +
          '<p class="tv-settle-note">对账单只统计本旅行账本。记账本里的金额是我的分摊份额，不是账单总额。</p>' +
        '</section>' +
      '</div>';
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
    if (act === 'edit-budget') openBudgetModal();
    else if (act === 'new-expense') openExpenseModal(null, { activityId: ds.activity || '' });
    else if (act === 'edit-expense') openExpenseModal(ds.id);
    else if (act === 'new-activity') openActivityModal(null, Number(ds.day) || 1);
    else if (act === 'edit-activity') openActivityModal(ds.id);
    else if (act === 'new-journal') openJournalModal(null);
    else if (act === 'edit-journal') openJournalModal(ds.id);
    else if (act === 'new-hotel') openHotelModal(null);
    else if (act === 'edit-hotel') openHotelModal(ds.id);
    else if (act === 'go-plan') { state.tab = 'plan'; persist(); render(); }
    else if (act === 'go-journal') { state.tab = 'journal'; persist(); render(); }
    else if (act === 'go-settle') { state.tab = 'settle'; persist(); render(); }
    else if (act === 'copy-settle') copySettlement();
    else if (act === 'download-settle') downloadSettlement();
    else if (act === 'reset-demo') resetDemo();
  }

  /* ---------------- 弹窗通用 ---------------- */
  function modalShell(title, sub, body, acts) {
    return '<div class="tv-modal-head"><div><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div><button type="button" class="tv-modal-x" data-close>✕</button></div>' +
      '<div class="tv-modal-body">' + body + '</div>' +
      '<div class="tv-modal-acts">' + acts + '</div>';
  }
  function openModal(html) {
    if (typeof App === 'undefined' || !App.openModal) return null;
    return App.openModal(html, true, 'tv-modal', 'tv-modal-mask');
  }
  function field(label, control, cls) {
    return '<label class="tv-field ' + (cls || '') + '"><span>' + esc(label) + '</span>' + control + '</label>';
  }
  function memberOptions(selected) {
    return state.members.map(m => '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('');
  }
  function memberChecks(selected) {
    return '<div class="tv-checks">' + state.members.map(m =>
      '<label class="tv-check" data-mid="' + m.id + '"><input type="checkbox" value="' + m.id + '"' + ((selected || []).indexOf(m.id) >= 0 ? ' checked' : '') + '><span class="tv-avatar sm ' + m.cls + '">' + esc(m.initial) + '</span>' + esc(m.name) + '</label>'
    ).join('') + '</div>';
  }

  /* ---------- 预算 ---------- */
  function openBudgetModal() {
    const m = openModal(modalShell('设置旅行预算', '预算按我的花费计算，不含朋友那份', 
      '<div class="tv-budget-form">' +
        field('预算金额（元）', '<input id="tv-budget-input" type="number" min="0" step="100" value="' + (state.trip.budget || '') + '" placeholder="例如 6000">') +
        '<div class="tv-quick-amounts">' + [3000, 5000, 8000, 12000].map(v => '<button type="button" data-amount="' + v + '">' + v + '</button>').join('') + '</div>' +
        '<p class="tv-form-tip">当前示例：我的花费已累计 <b>' + money2(yuan(totalMyCents())) + '</b></p>' +
      '</div>',
      '<button type="button" class="tv-btn" data-close>取消</button><button type="button" class="tv-btn solid" id="tv-budget-save">保存预算</button>'
    ));
    if (!m) return;
    const input = m.querySelector('#tv-budget-input');
    m.querySelectorAll('[data-amount]').forEach(b => { b.onclick = () => { input.value = b.dataset.amount; input.focus(); }; });
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => App.closeModal(); });
    m.querySelector('#tv-budget-save').onclick = () => {
      const v = Number(input.value);
      if (!isFinite(v) || v < 0) return toast('请输入正确的预算金额', 'err');
      state.trip.budget = Math.round(v);
      persist(); App.closeModal(); render();
      toast('预算已更新为 ' + money(state.trip.budget), 'ok');
    };
    setTimeout(() => input.focus(), 80);
  }

  /* ---------- 行程 ---------- */
  function openActivityModal(id, presetDay) {
    const editing = !!id;
    const loc = editing ? locateActivity(id) : null;
    const act = loc ? loc.act : null;
    const dayNum = act ? loc.day.day : (presetDay || 1);
    const data = act || { time: '09:00', title: '', place: '', note: '', cost: 0 };
    const dayOpts = state.days.map(d => '<option value="' + d.day + '"' + (d.day === dayNum ? ' selected' : '') + '>DAY ' + d.day + ' · ' + esc(shortDate(d.date)) + ' ' + esc(d.city) + '</option>').join('');
    const m = openModal(modalShell(editing ? '编辑行程' : '新增行程', '行程和账单可以互相关联', 
      '<div class="tv-form-grid">' +
        field('所属日期', '<select id="tv-act-day">' + dayOpts + '</select>') +
        field('时间', '<input id="tv-act-time" type="time" value="' + esc(data.time || '09:00') + '">') +
        field('行程标题', '<input id="tv-act-title" type="text" value="' + esc(data.title) + '" placeholder="例如 环洱海包车">', 'span2') +
        field('地点 / 备注', '<input id="tv-act-place" type="text" value="' + esc(data.place) + '" placeholder="例如 才村 → 喜洲 → 双廊">', 'span2') +
        field('计划花费（元）', '<input id="tv-act-cost" type="number" min="0" step="0.01" value="' + (data.cost || '') + '" placeholder="0">') +
        field('补充说明', '<input id="tv-act-note" type="text" value="' + esc(data.note) + '" placeholder="可选">') +
      '</div>' +
      (editing && expensesOfActivity(id).length ? '<p class="tv-form-tip">已关联 ' + expensesOfActivity(id).length + ' 笔账单，编辑行程不会影响账单金额。</p>' : ''),
      (editing ? '<button type="button" class="tv-btn danger" id="tv-act-del">删除行程</button>' : '<button type="button" class="tv-btn" data-close>取消</button>') +
      '<button type="button" class="tv-btn solid" id="tv-act-save">保存行程</button>'
    ));
    if (!m) return;
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => App.closeModal(); });
    m.querySelector('#tv-act-save').onclick = () => {
      const title = m.querySelector('#tv-act-title').value.trim();
      if (!title) return toast('请填写行程标题', 'err');
      const payload = {
        time: m.querySelector('#tv-act-time').value || '09:00',
        title: title,
        place: m.querySelector('#tv-act-place').value.trim(),
        note: m.querySelector('#tv-act-note').value.trim(),
        cost: Number(m.querySelector('#tv-act-cost').value) || 0
      };
      const targetDay = Number(m.querySelector('#tv-act-day').value);
      if (editing) {
        Object.assign(act, payload);
        if (targetDay !== loc.day.day) {
          const to = state.days.find(d => d.day === targetDay);
          if (to) {
            loc.day.activities = loc.day.activities.filter(a => a.id !== act.id);
            to.activities.push(act);
          }
        }
      } else {
        const to = state.days.find(d => d.day === targetDay);
        if (!to) return;
        to.activities.push(Object.assign({ id: uid('a') }, payload));
      }
      state.days.forEach(d => d.activities.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
      persist(); App.closeModal(); render();
      toast(editing ? '行程已更新' : '已添加行程', 'ok');
    };
    const del = m.querySelector('#tv-act-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除行程', '删除后，已关联的账单会保留，但会取消关联。确定删除吗？').then(ok => {
        if (!ok) return;
        const found = locateActivity(act.id);
        if (found) found.day.activities = found.day.activities.filter(a => a.id !== act.id);
        state.expenses.forEach(e => { if (e.activityId === act.id) e.activityId = null; });
        persist(); App.closeModal(); render();
        toast('行程已删除', 'ok');
      });
    };
  }

  /* ---------- 日志 ---------- */
  function openJournalModal(id) {
    const editing = !!id;
    const j = editing ? state.journals.find(x => x.id === id) : null;
    const data = j || { day: state.days[0] ? state.days[0].day : 1, mood: 'happy', weather: '', text: '' };
    const day = state.days.find(d => d.day === data.day) || state.days[0];
    const dayOpts = state.days.map(d => '<option value="' + d.day + '"' + (d.day === data.day ? ' selected' : '') + '>DAY ' + d.day + ' · ' + esc(shortDate(d.date)) + ' ' + esc(d.city) + '</option>').join('');
    const m = openModal(modalShell(editing ? '编辑日志' : '写一篇旅行日志', '选一个当下的情绪，之后再回来看会很有意思', 
      '<div class="tv-form-grid">' +
        field('所属日期', '<select id="tv-j-day">' + dayOpts + '</select>') +
        field('天气 / 场景', '<input id="tv-j-weather" type="text" value="' + esc(data.weather) + '" placeholder="晴 · 洱海边">') +
      '</div>' +
      '<div class="tv-mood-picker" id="tv-mood-picker">' + MOODS.map(md => '<button type="button" class="tv-mood-opt' + (md.id === data.mood ? ' on' : '') + '" data-mood="' + md.id + '" style="--mood:' + md.color + '"><i>' + md.emoji + '</i><span>' + md.label + '</span></button>').join('') + '</div>' +
      '<label class="tv-field"><span>日志正文</span><textarea id="tv-j-text" rows="6" placeholder="今天发生了什么？">' + esc(data.text) + '</textarea></label>',
      (editing ? '<button type="button" class="tv-btn danger" id="tv-j-del">删除日志</button>' : '<button type="button" class="tv-btn" data-close>取消</button>') +
      '<button type="button" class="tv-btn solid" id="tv-j-save">保存日志</button>'
    ));
    if (!m) return;
    let mood = data.mood;
    m.querySelectorAll('[data-mood]').forEach(b => {
      b.onclick = () => {
        mood = b.dataset.mood;
        m.querySelectorAll('[data-mood]').forEach(x => x.classList.toggle('on', x.dataset.mood === mood));
      };
    });
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => App.closeModal(); });
    m.querySelector('#tv-j-save').onclick = () => {
      const text = m.querySelector('#tv-j-text').value.trim();
      if (!text) return toast('写点什么再保存吧', 'err');
      const dayNum = Number(m.querySelector('#tv-j-day').value);
      const d = state.days.find(x => x.day === dayNum) || day;
      const payload = { day: dayNum, date: d ? d.date : (day ? day.date : todayStr()), mood: mood, weather: m.querySelector('#tv-j-weather').value.trim(), text: text };
      if (editing) Object.assign(j, payload);
      else state.journals.push(Object.assign({ id: uid('j'), created: Date.now() }, payload));
      persist(); App.closeModal(); render();
      toast(editing ? '日志已更新' : '日志已保存', 'ok');
    };
    const del = m.querySelector('#tv-j-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除日志', '确定要删除这篇日志吗？').then(ok => {
        if (!ok) return;
        state.journals = state.journals.filter(x => x.id !== id);
        persist(); App.closeModal(); render();
        toast('日志已删除', 'ok');
      });
    };
  }

  /* ---------- 账单 ---------- */
  function openExpenseModal(id, preset) {
    const editing = !!id;
    const exp = editing ? state.expenses.find(x => x.id === id) : null;
    const p = preset || {};
    const presetAct = p.activityId ? activityById(p.activityId) : null;
    const data = exp || {
      title: presetAct ? presetAct.title : '', amount: presetAct && presetAct.cost ? presetAct.cost : '',
      category: 'food', date: presetAct ? presetAct.date : todayStr(), payerId: 'me',
      participants: state.members.map(m => m.id), note: '', activityId: p.activityId || '', sync: true
    };
    const catOpts = CATS.map(c => '<option value="' + c.id + '"' + (data.category === c.id ? ' selected' : '') + '>' + c.label + '</option>').join('');
    const actOpts = '<option value="">不关联行程</option>' + state.days.map(d => '<optgroup label="DAY ' + d.day + ' · ' + esc(d.city) + '">' +
      d.activities.map(a => '<option value="' + a.id + '"' + (data.activityId === a.id ? ' selected' : '') + '>' + esc(a.time) + ' ' + esc(a.title) + '</option>').join('') +
    '</optgroup>').join('');
    const body = '' +
      '<div class="tv-form-grid">' +
        field('账单名称', '<input id="tv-e-title" type="text" value="' + esc(data.title) + '" placeholder="例如 双廊渔家晚饭">', 'span2') +
        field('总金额（元）', '<input id="tv-e-amount" type="number" min="0" step="0.01" value="' + (data.amount || '') + '" placeholder="0.00">') +
        field('分类', '<select id="tv-e-cat">' + catOpts + '</select>') +
        field('日期', '<input id="tv-e-date" type="date" value="' + esc(data.date) + '">') +
        field('谁付的钱', '<select id="tv-e-payer">' + memberOptions(data.payerId) + '</select>') +
        field('关联行程', '<select id="tv-e-act">' + actOpts + '</select>', 'span2') +
      '</div>' +
      '<div class="tv-field"><span>谁参与 AA</span>' + memberChecks(data.participants) + '</div>' +
      '<label class="tv-field"><span>备注</span><input id="tv-e-note" type="text" value="' + esc(data.note) + '" placeholder="可选"></label>' +
      '<label class="tv-sync-check"><input type="checkbox" id="tv-e-sync"' + (data.sync === false ? '' : ' checked') + '><span>同步到记账本（只记我的 AA 份额）</span></label>' +
      '<p class="tv-share-preview" id="tv-e-preview"></p>';
    const m = openModal(modalShell(editing ? '编辑账单' : '记一笔旅行账单', '总额只用于对账；记账本里记的是我的份额', body,
      (editing ? '<button type="button" class="tv-btn danger" id="tv-e-del">删除账单</button>' : '<button type="button" class="tv-btn" data-close>取消</button>') +
      '<button type="button" class="tv-btn solid" id="tv-e-save">保存账单</button>'
    ));
    if (!m) return;
    const amountEl = m.querySelector('#tv-e-amount');
    const preview = m.querySelector('#tv-e-preview');
    const syncEl = m.querySelector('#tv-e-sync');
    const calc = () => {
      const parts = [];
      m.querySelectorAll('.tv-checks input:checked').forEach(x => parts.push(x.value));
      const amt = Number(amountEl.value) || 0;
      const my = parts.indexOf('me') >= 0 ? yuan(splitCents(cents(amt), parts.length)[parts.indexOf('me')] || 0) : 0;
      preview.innerHTML = parts.length
        ? '记账本将记入 <b>' + money2(my) + '</b> · 总金额 ' + money(amt) + ' / ' + parts.length + ' 人' + (syncEl.checked ? '' : '（已关闭同步）')
        : '<b>请至少勾选一位参与人</b>';
    };
    amountEl.addEventListener('input', calc);
    m.querySelectorAll('.tv-checks input').forEach(x => x.addEventListener('change', calc));
    syncEl.addEventListener('change', calc);
    calc();
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => App.closeModal(); });
    m.querySelector('#tv-e-save').onclick = () => {
      const title = m.querySelector('#tv-e-title').value.trim();
      const amount = Number(amountEl.value);
      if (!title) return toast('请填写账单名称', 'err');
      if (!(amount > 0)) return toast('请输入正确的金额', 'err');
      const parts = [];
      m.querySelectorAll('.tv-checks input:checked').forEach(x => parts.push(x.value));
      if (!parts.length) return toast('请至少选择一位参与人', 'err');
      const date = m.querySelector('#tv-e-date').value || todayStr();
      const payload = {
        title: title, amount: amount, category: m.querySelector('#tv-e-cat').value,
        date: date, day: dayOfDate(date), payerId: m.querySelector('#tv-e-payer').value,
        participants: parts, note: m.querySelector('#tv-e-note').value.trim(),
        activityId: m.querySelector('#tv-e-act').value || '', sync: syncEl.checked
      };
      let target;
      if (editing) target = exp;
      else { target = Object.assign({ id: uid('e') }, payload); state.expenses.push(target); }
      if (editing) Object.assign(target, payload);
      if (target.hotelId) {
        const h = state.hotels.find(x => x.id === target.hotelId);
        if (h) { h.amount = target.amount; h.payerId = target.payerId; h.participants = target.participants.slice(); h.checkIn = target.date; }
      }
      persist();
      syncRecord(target);
      App.closeModal(); render();
      const mine = myShare(target);
      toast(mine > 0 ? '已保存 · 记账本记入 ' + money2(mine) : '已保存（我没有参与分摊，不记入记账本）', 'ok');
    };
    const del = m.querySelector('#tv-e-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除账单', '记账本里对应的那笔也会一起删除。确定删除吗？').then(ok => {
        if (!ok) return;
        removeExpense(exp);
        App.closeModal(); render();
        toast('账单已删除', 'ok');
      });
    };
  }

  function removeExpense(exp) {
    if (exp.recordId) dropRecord(exp.recordId);
    const h = exp.hotelId ? state.hotels.find(x => x.id === exp.hotelId) : null;
    if (h && h.expenseId === exp.id) h.expenseId = null;
    state.expenses = state.expenses.filter(x => x.id !== exp.id);
    persist();
  }

  /* ---------- 住宿 ---------- */
  function openHotelModal(id) {
    const editing = !!id;
    const h = editing ? state.hotels.find(x => x.id === id) : null;
    const data = h || {
      name: '', address: '', checkIn: state.days[0] ? state.days[0].date : todayStr(),
      checkOut: state.days[1] ? state.days[1].date : todayStr(), amount: '', payerId: 'me',
      participants: state.members.map(m => m.id), note: ''
    };
    const m = openModal(modalShell(editing ? '编辑住宿' : '新增住宿', editing ? '修改后，已生成的住宿账单会同步更新' : '新增后会自动生成一笔住宿账单', 
      '<div class="tv-form-grid">' +
        field('酒店 / 民宿名称', '<input id="tv-h-name" type="text" value="' + esc(data.name) + '" placeholder="例如 既下山 · 大理古城">', 'span2') +
        field('地址', '<input id="tv-h-addr" type="text" value="' + esc(data.address) + '" placeholder="可选">', 'span2') +
        field('入住', '<input id="tv-h-in" type="date" value="' + esc(data.checkIn) + '">') +
        field('退房', '<input id="tv-h-out" type="date" value="' + esc(data.checkOut) + '">') +
        field('房费总额（元）', '<input id="tv-h-amount" type="number" min="0" step="0.01" value="' + (data.amount || '') + '" placeholder="0.00">') +
        field('谁付的钱', '<select id="tv-h-payer">' + memberOptions(data.payerId) + '</select>') +
      '</div>' +
      '<div class="tv-field"><span>谁参与分摊</span>' + memberChecks(data.participants) + '</div>' +
      '<label class="tv-field"><span>备注</span><input id="tv-h-note" type="text" value="' + esc(data.note) + '" placeholder="可选"></label>' +
      (editing
        ? (h.expenseId ? '' : '<label class="tv-sync-check"><input type="checkbox" id="tv-h-create" checked><span>同时生成住宿账单（并同步到记账本）</span></label>')
        : '<label class="tv-sync-check"><input type="checkbox" id="tv-h-create" checked><span>同时生成住宿账单（并同步到记账本）</span></label>'),
      (editing ? '<button type="button" class="tv-btn danger" id="tv-h-del">删除住宿</button>' : '<button type="button" class="tv-btn" data-close>取消</button>') +
      '<button type="button" class="tv-btn solid" id="tv-h-save">保存住宿</button>'
    ));
    if (!m) return;
    m.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => App.closeModal(); });
    const collect = () => {
      const parts = [];
      m.querySelectorAll('.tv-checks input:checked').forEach(x => parts.push(x.value));
      return {
        name: m.querySelector('#tv-h-name').value.trim(),
        address: m.querySelector('#tv-h-addr').value.trim(),
        checkIn: m.querySelector('#tv-h-in').value || todayStr(),
        checkOut: m.querySelector('#tv-h-out').value || m.querySelector('#tv-h-in').value || todayStr(),
        amount: Number(m.querySelector('#tv-h-amount').value) || 0,
        payerId: m.querySelector('#tv-h-payer').value,
        note: m.querySelector('#tv-h-note').value.trim(),
        participants: parts
      };
    };
    m.querySelector('#tv-h-save').onclick = () => {
      const payload = collect();
      if (!payload.name) return toast('请填写住宿名称', 'err');
      if (!(payload.amount > 0)) return toast('请输入房费金额', 'err');
      if (!payload.participants.length) return toast('请至少选择一位参与人', 'err');
      let hotel;
      if (editing) { hotel = h; Object.assign(hotel, payload); }
      else { hotel = Object.assign({ id: uid('h') }, payload); state.hotels.push(hotel); }
      const nights = Math.max(1, Math.round((parseDate(hotel.checkOut) - parseDate(hotel.checkIn)) / 86400000));
      const createExp = editing ? !!m.querySelector('#tv-h-create') : true;
      if (hotel.expenseId) {
        const exp = state.expenses.find(x => x.id === hotel.expenseId);
        if (exp) {
          Object.assign(exp, {
            title: hotel.name + '（' + nights + ' 晚）', amount: hotel.amount, date: hotel.checkIn,
            day: dayOfDate(hotel.checkIn), payerId: hotel.payerId, participants: hotel.participants.slice(), sync: true
          });
          persist(); syncRecord(exp);
        }
      } else if (createExp) {
        const exp = {
          id: uid('e'), hotelId: hotel.id, day: dayOfDate(hotel.checkIn), date: hotel.checkIn, category: 'stay',
          title: hotel.name + '（' + nights + ' 晚）', amount: hotel.amount, payerId: hotel.payerId,
          participants: hotel.participants.slice(), note: '', sync: true
        };
        state.expenses.push(exp);
        hotel.expenseId = exp.id;
        persist(); syncRecord(exp);
      } else {
        persist();
      }
      App.closeModal(); render();
      toast(editing ? '住宿已更新' : '住宿已添加，并生成住宿账单', 'ok');
    };
    const del = m.querySelector('#tv-h-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除住宿', '对应的住宿账单也会一起删除。确定删除吗？').then(ok => {
        if (!ok) return;
        const exp = hotel.expenseId ? state.expenses.find(x => x.id === hotel.expenseId) : null;
        if (exp) removeExpense(exp);
        state.hotels = state.hotels.filter(x => x.id !== hotel.id);
        persist(); App.closeModal(); render();
        toast('住宿已删除', 'ok');
      });
    };
  }

  /* ---------------- 对账单图片 ---------------- */
  function settleCanvas() {
    const s = settlement();
    const colors = THEME_COLORS[state.theme] || THEME_COLORS.paper;
    const W = 1080;
    const pad = 78;
    const headerH = 300;
    const rowsH = s.rows.length * 84 + 120;
    const transferH = Math.max(1, s.transfers.length) * 92 + 140;
    const H = headerH + rowsH + transferH + 190;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const sans = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    const serif = '"Songti SC","Noto Serif CJK SC","STSong",serif';

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);
    /* 背景装饰 */
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(W - 70, 90, 230, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.accent2;
    ctx.beginPath(); ctx.arc(50, H - 120, 190, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* 顶部色条 */
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, 0, W, 10);

    let y = 92;
    ctx.fillStyle = colors.faint;
    ctx.font = '500 22px ' + sans;
    ctx.fillText('旅行账本 · 对账单', pad, y);
    y += 62;
    ctx.fillStyle = colors.ink;
    ctx.font = '700 52px ' + serif;
    ctx.fillText(state.trip.title, pad, y);
    y += 48;
    ctx.fillStyle = colors.soft;
    ctx.font = '400 24px ' + sans;
    ctx.fillText(state.trip.startDate + ' — ' + state.trip.endDate + ' · ' + state.members.length + ' 人 · ' + state.trip.destination, pad, y);

    /* 总额 */
    y += 54;
    ctx.fillStyle = colors.accent;
    ctx.font = '700 42px ' + serif;
    ctx.fillText(money(yuan(s.totalCents)), pad, y);
    ctx.fillStyle = colors.faint;
    ctx.font = '400 20px ' + sans;
    ctx.fillText('共同账单总额', pad + 260, y - 4);

    /* 我的花费 */
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.ink;
    ctx.font = '700 34px ' + serif;
    ctx.fillText(money2(yuan(totalMyCents())), W - pad, y);
    ctx.fillStyle = colors.faint;
    ctx.font = '400 20px ' + sans;
    ctx.fillText('我的花费（记账本口径）', W - pad, y + 30);
    ctx.textAlign = 'left';

    y += 52;
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();

    /* 成员 */
    y += 58;
    ctx.fillStyle = colors.soft;
    ctx.font = '600 22px ' + sans;
    ctx.fillText('每人已付 / 应摊 / 净额', pad, y);
    y += 42;
    s.rows.forEach(r => {
      ctx.fillStyle = colors.ink;
      ctx.beginPath(); ctx.arc(pad + 22, y - 11, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.bg;
      ctx.font = '600 20px ' + sans;
      ctx.textAlign = 'center';
      ctx.fillText(r.initial, pad + 22, y - 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.ink;
      ctx.font = '600 26px ' + sans;
      ctx.fillText(r.name, pad + 62, y);
      ctx.fillStyle = colors.soft;
      ctx.font = '400 21px ' + sans;
      ctx.fillText('已付 ' + money(yuan(r.paid)) + '  ·  应摊 ' + money(yuan(r.share)), pad + 160, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = r.net >= 0 ? colors.accent2 : colors.accent;
      ctx.font = '600 24px ' + sans;
      ctx.fillText((r.net >= 0 ? '应收 ' : '应付 ') + money(yuan(Math.abs(r.net))), W - pad, y);
      ctx.textAlign = 'left';
      y += 84;
    });

    /* 转账 */
    y += 8;
    ctx.strokeStyle = colors.line;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    y += 56;
    ctx.fillStyle = colors.soft;
    ctx.font = '600 22px ' + sans;
    ctx.fillText('转账方案', pad, y);
    y += 46;
    if (!s.transfers.length) {
      ctx.fillStyle = colors.faint;
      ctx.font = '400 24px ' + sans;
      ctx.fillText('刚好平账，不用转钱。', pad, y + 10);
    } else {
      s.transfers.forEach(t => {
        ctx.fillStyle = colors.ink;
        ctx.font = '600 26px ' + sans;
        ctx.fillText(t.from, pad, y);
        ctx.fillStyle = colors.faint;
        ctx.fillText('→', pad + 130, y);
        ctx.fillStyle = colors.ink;
        ctx.fillText(t.to, pad + 190, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = colors.accent;
        ctx.font = '700 28px ' + sans;
        ctx.fillText(money(yuan(t.cents)), W - pad, y);
        ctx.textAlign = 'left';
        y += 92;
      });
    }

    /* 页脚 */
    ctx.strokeStyle = colors.line;
    ctx.beginPath(); ctx.moveTo(pad, H - 108); ctx.lineTo(W - pad, H - 108); ctx.stroke();
    ctx.fillStyle = colors.faint;
    ctx.font = '400 20px ' + sans;
    ctx.fillText('财务管家 · 旅行账本', pad, H - 66);
    ctx.textAlign = 'right';
    ctx.fillText('生成于 ' + todayStr() + ' · 已按我的 AA 份额同步记账本', W - pad, H - 66);
    ctx.textAlign = 'left';
    return cv;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function fileBase() {
    return '对账单-' + (state.trip.destination || '旅行') + '-' + (state.trip.endDate || todayStr());
  }

  function downloadSettlement() {
    const cv = settleCanvas();
    cv.toBlob(blob => {
      if (!blob) return toast('生成图片失败', 'err');
      downloadBlob(blob, fileBase() + '.png');
      toast('对账单图片已下载', 'ok');
    }, 'image/png');
  }

  function copySettlement() {
    const cv = settleCanvas();
    cv.toBlob(async blob => {
      if (!blob) return toast('生成图片失败', 'err');
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('对账单图片已复制，可直接粘贴发送', 'ok');
          return;
        }
        throw new Error('no clipboard');
      } catch (e) {
        downloadBlob(blob, fileBase() + '.png');
        toast('当前环境不支持复制图片，已改为下载', '');
      }
    }, 'image/png');
  }

  /* ---------------- 其它 ---------------- */
  function resetDemo() {
    if (typeof App === 'undefined' || !App.confirmDialog) return;
    App.confirmDialog('恢复示例数据', '会重置本机这趟旅行的行程、日志和账单（记账本里已生成的记录不会自动删除）。确定吗？').then(ok => {
      if (!ok) return;
      state = seedState();
      persist(); render();
      toast('已恢复示例数据', 'ok');
    });
  }

  window.Travel = {
    render: render,
    state: function () { return ensureState(); }
  };
})();
