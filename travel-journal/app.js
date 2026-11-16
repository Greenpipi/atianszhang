/* ============================================================
   旅账 · Travel Ledger — local-first travel journal & shared bill
   Pure vanilla JS + localStorage. No build step, no backend.
   ============================================================ */

const STORAGE_KEY = 'travel-ledger-demo-v1';

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

const CATEGORIES = [
  { id: 'stay', label: '住宿', mark: '宿', color: '#2E5C4E' },
  { id: 'food', label: '吃喝', mark: '食', color: '#BF4F2A' },
  { id: 'ticket', label: '门票', mark: '景', color: '#5C7F8C' },
  { id: 'transport', label: '交通', mark: '行', color: '#87689E' },
  { id: 'fun', label: '玩乐', mark: '娱', color: '#D9A02A' },
  { id: 'shop', label: '购物', mark: '购', color: '#8A5A6C' },
  { id: 'other', label: '其他', mark: '杂', color: '#7A7266' }
];

const MOOD = Object.fromEntries(MOODS.map(m => [m.id, m]));
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const NAV = [
  { id: 'overview', label: '总览', short: '总览' },
  { id: 'plan', label: '行程计划', short: '行程' },
  { id: 'journal', label: '旅行日志', short: '日志' },
  { id: 'expenses', label: '共同账单', short: '账本' },
  { id: 'hotels', label: '住宿酒店', short: '住宿' },
  { id: 'settle', label: '分摊对账', short: '对账' }
];

const ICONS = {
  overview: '<circle cx="12" cy="12" r="8.5"/><path d="M15.4 8.6l-2.2 5-5 2.2 2.2-5z"/>',
  plan: '<path d="M9 4L3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V4L15 6.2 9 4z"/><path d="M9 4v13.3M15 6.2v13.3"/>',
  journal: '<path d="M5.5 4.5h11.5A1.5 1.5 0 0 1 18.5 6v14H6.5A2 2 0 0 1 4.5 18V6a1.5 1.5 0 0 1 1-1.5z"/><path d="M8 9h7M8 12.5h7M8 16h4"/>',
  expenses: '<rect x="3.5" y="6.5" width="17" height="12" rx="2.5"/><path d="M3.5 10.5h17M16 14.5h1.5"/>',
  hotels: '<path d="M3 19V7M3 19h18M21 19v-5.5a2.5 2.5 0 0 0-2.5-2.5H11V19"/><path d="M6.5 12.5h1.5"/>',
  settle: '<path d="M4 7.5h12.5l-2.5-2.5M20 16.5H7.5L10 19"/>'
};

/* ---------------- seed ---------------- */
function seedState() {
  return {
    version: 3,
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
        payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '两层小院，天台能看见苍山'
      },
      {
        id: 'h2', name: '云七 · 双廊海景民宿', address: '大理市双廊镇环海东路',
        checkIn: '2026-11-17', checkOut: '2026-11-18', amount: 780,
        payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '阳台正对洱海，早上有海鸥'
      }
    ],
    expenses: [
      { id: 'e1', hotelId: 'h1', day: 1, date: '2026-11-15', category: 'stay', title: '既下山 · 大理古城（2 晚）', amount: 1160, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '含早餐' },
      { id: 'e2', day: 1, date: '2026-11-15', category: 'transport', title: '昆明 → 大理 动车票 ×3', amount: 435, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e3', day: 1, date: '2026-11-15', category: 'food', title: '再回首凉鸡米线', amount: 86, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e4', day: 1, date: '2026-11-15', category: 'ticket', title: '崇圣寺三塔门票 ×3', amount: 225, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e5', day: 2, date: '2026-11-16', category: 'food', title: '洱海门早点', amount: 42, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e6', day: 2, date: '2026-11-16', category: 'transport', title: '环洱海包车一天', amount: 480, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '师傅人很好，一路讲解' },
      { id: 'e7', day: 2, date: '2026-11-16', category: 'food', title: '喜洲稻田咖啡 ×3', amount: 108, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e8', day: 2, date: '2026-11-16', category: 'food', title: '双廊渔家晚饭', amount: 268, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '酸辣鱼 + 银鱼煎蛋' },
      { id: 'e9', hotelId: 'h2', day: 3, date: '2026-11-17', category: 'stay', title: '云七 · 双廊海景民宿（1 晚）', amount: 780, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e10', day: 3, date: '2026-11-17', category: 'ticket', title: '南诏风情岛船票 ×3', amount: 150, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e11', day: 3, date: '2026-11-17', category: 'shop', title: '扎染围巾（小雨自己买）', amount: 68, payerId: 'xiaoyu', participants: ['xiaoyu'], note: '个人消费，不分摊' },
      { id: 'e12', day: 3, date: '2026-11-17', category: 'food', title: '深夜烧烤 + 风花雪月', amount: 156, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '' },
      { id: 'e13', day: 4, date: '2026-11-18', category: 'food', title: '返程前最后一碗饵丝', amount: 54, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '' }
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

/* ---------------- state & helpers ---------------- */
let state = loadState();
let filterCat = 'all';
let toastTimer = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 3) return parsed;
    }
  } catch (err) {
    console.warn('读取本地数据失败，使用示例数据', err);
  }
  return seedState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('保存失败', err);
  }
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function md(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function mdShort(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekday(str) { return WEEK[parseDate(str).getDay()]; }

function dayLabel(n) { return 'DAY ' + (n < 10 ? '0' + n : n); }

function fmtMoney(n) {
  const num = Number(n) || 0;
  return '¥' + num.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function money(cents) {
  return fmtMoney(Math.round(cents) / 100);
}

function member(id) {
  return state.members.find(m => m.id === id) || { id, name: '未知', initial: '?', cls: 'me' };
}

function avatar(id, extra = '') {
  const m = member(id);
  return `<span class="avatar ${m.cls} ${extra}" title="${esc(m.name)}">${esc(m.initial)}</span>`;
}

function daysOptions(selected) {
  return state.days.map(d =>
    `<option value="${d.day}" ${Number(selected) === d.day ? 'selected' : ''}>第 ${d.day} 天 · ${md(d.date)}</option>`
  ).join('');
}

function currentDayNumber() {
  const iso = isoDate(new Date());
  const found = state.days.find(d => d.date === iso);
  return found ? found.day : state.days[state.days.length - 1].day;
}

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------------- calculations ---------------- */
function splitCents(totalCents, count) {
  const base = Math.floor(totalCents / count);
  const rem = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

function calcSettlement() {
  const paid = {};
  const owed = {};
  state.members.forEach(m => { paid[m.id] = 0; owed[m.id] = 0; });

  let total = 0;
  state.expenses.forEach(e => {
    const cents = Math.round(Number(e.amount) * 100);
    const participants = (e.participants && e.participants.length) ? e.participants : [e.payerId];
    total += cents;
    if (paid[e.payerId] == null) paid[e.payerId] = 0;
    if (owed[e.payerId] == null) owed[e.payerId] = 0;
    paid[e.payerId] += cents;
    const shares = splitCents(cents, participants.length);
    participants.forEach((p, i) => {
      if (owed[p] == null) owed[p] = 0;
      owed[p] += shares[i];
    });
  });

  const net = {};
  state.members.forEach(m => { net[m.id] = paid[m.id] - owed[m.id]; });

  return { total, paid, owed, net, transfers: minimalTransfers(net) };
}

function minimalTransfers(net) {
  const debtors = [];
  const creditors = [];
  Object.entries(net).forEach(([id, cents]) => {
    if (cents < -0.5) debtors.push({ id, cents: -cents });
    else if (cents > 0.5) creditors.push({ id, cents });
  });
  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents);
    if (amount > 0.5) {
      transfers.push({ from: debtors[i].id, to: creditors[j].id, cents: Math.round(amount) });
    }
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents <= 0.5) i += 1;
    if (creditors[j].cents <= 0.5) j += 1;
  }
  return transfers;
}

function categoryTotals() {
  const map = {};
  state.expenses.forEach(e => {
    map[e.category] = (map[e.category] || 0) + Math.round(e.amount * 100);
  });
  return Object.entries(map)
    .map(([id, cents]) => ({ cat: CAT[id] || CAT.other, cents }))
    .sort((a, b) => b.cents - a.cents);
}

function hotelNights(h) {
  const diff = Math.round((parseDate(h.checkOut) - parseDate(h.checkIn)) / 86400000);
  return Math.max(1, diff);
}

/* ---------------- shell ---------------- */
function activeRoute() {
  const hash = location.hash.replace('#', '');
  return NAV.some(n => n.id === hash) ? hash : 'overview';
}

function navCount(id) {
  if (id === 'plan') return state.days.length + '天';
  if (id === 'journal') return state.journals.length + '篇';
  if (id === 'expenses') return state.expenses.length + '笔';
  if (id === 'hotels') return state.hotels.length + '家';
  return '';
}

function renderSidebar(route) {
  const s = calcSettlement();
  const spent = s.total / 100;
  const pct = Math.min(100, Math.round((spent / state.trip.budget) * 1000) / 10);

  const navHtml = NAV.map((n, idx) => `
    <a href="#${n.id}" class="nav-item ${n.id === route ? 'active' : ''}">
      <span class="nav-num">${String(idx + 1).padStart(2, '0')}</span>
      <span class="nav-label">${n.label}</span>
      ${navCount(n.id) ? `<span class="nav-count">${navCount(n.id)}</span>` : ''}
    </a>`).join('');

  document.getElementById('sidebar').innerHTML = `
    <div class="brand">
      <div class="brand-mark">旅</div>
      <div>
        <div class="brand-name">旅账</div>
        <div class="brand-sub">TRAVEL LEDGER</div>
      </div>
      <div class="mobile-trip-meta">
        <b>${esc(state.trip.title)}</b>
        <span>${mdShort(state.trip.startDate)} — ${mdShort(state.trip.endDate)} · ${state.members.length} 人</span>
      </div>
    </div>

    <div class="trip-card">
      <div class="trip-eyebrow"><span class="dot"></span>TRIP 01 · 进行中</div>
      <h2>${esc(state.trip.title)}</h2>
      <p class="trip-dates">${mdShort(state.trip.startDate)} — ${mdShort(state.trip.endDate)} · ${state.days.length} 天 ${state.days.length - 1} 晚</p>
      <div class="trip-people">
        ${state.members.map(m => avatar(m.id)).join('')}
        <span class="people-label">${state.members.map(m => m.name).join('、')}</span>
      </div>
      <div class="budget-line">
        <div class="budget-top"><span>预算已用</span><span><b>${fmtMoney(spent)}</b> / ${fmtMoney(state.trip.budget)}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
    </div>

    <nav class="nav">${navHtml}</nav>

    <div class="side-foot">
      <b>本机演示 · 未上线</b>
      所有数据只保存在这个浏览器<br>
      换设备 / 清缓存会重新开始<br>
      <button class="side-reset" data-action="reset-demo">重置演示数据</button>
    </div>`;
}

function renderTabbar(route) {
  document.getElementById('tabbar').innerHTML = NAV.map(n => `
    <a href="#${n.id}" class="tab-item ${n.id === route ? 'active' : ''}">
      ${icon(n.id)}
      <span>${n.short}</span>
    </a>`).join('');
}

/* ---------------- shared partials ---------------- */
function pageHead({ eyebrow, title, lede, actions }) {
  return `<header class="page-head">
    <div>
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      ${lede ? `<p class="lede">${lede}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

function tripLede() {
  return `${md(state.trip.startDate)} — ${md(state.trip.endDate)} · ${state.members.length} 人同行 · ${state.trip.destination}`;
}

function emptyState(title, desc) {
  return `<div class="empty"><b>${title}</b>${desc}</div>`;
}

/* ---------------- views ---------------- */
function viewOverview() {
  const s = calcSettlement();
  const spent = s.total / 100;
  const pct = Math.min(100, Math.round((spent / state.trip.budget) * 1000) / 10);
  const perHead = state.members.length ? spent / state.members.length : 0;
  const cats = categoryTotals();
  const latest = [...state.journals].sort((a, b) => (b.day - a.day) || (b.created - a.created)).slice(0, 3);

  const todayIso = isoDate(new Date());
  const today = state.days.find(d => d.date === todayIso) || state.days[0];
  const todayTag = today.date === todayIso ? '今天 · ' + dayLabel(today.day) : '第一站 · ' + dayLabel(today.day);

  const nettRows = state.members.map(m => {
    const n = s.net[m.id] || 0;
    const cls = n > 0.5 ? 'pos' : n < -0.5 ? 'neg' : 'zero';
    const txt = n > 0.5 ? `应收回 ${money(n)}` : n < -0.5 ? `应补 ${money(-n)}` : '已两清';
    return `<div class="mini-person">
      ${avatar(m.id)}
      <span class="name">${esc(m.name)}<small>已付 ${money(s.paid[m.id] || 0)}</small></span>
      <span class="amt ${cls}">${txt}</span>
    </div>`;
  }).join('');

  const todayItems = today.activities.slice(0, 3).map(a => `
    <div class="today-item">
      <span class="t">${esc(a.time)}</span>
      <h4>${esc(a.title)}</h4>
      <p>${esc(a.place || a.note || '')}</p>
    </div>`).join('');

  return `
  ${pageHead({
    eyebrow: 'TRIP 01 · ON GOING',
    title: esc(state.trip.title),
    lede: tripLede(),
    actions: `<button class="btn clay" data-action="open-expense">＋ 记一笔</button>
              <button class="btn" data-action="open-journal">写日志</button>`
  })}

  <div class="overview-top">
    <article class="hero-card">
      <div class="hero-top">
        <div>
          <p class="eyebrow">总花费 · 含住宿与 AA 分摊</p>
          <div class="hero-amount"><span class="cur">¥</span>${spent.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</div>
          <p class="hero-sub">预算 ${fmtMoney(state.trip.budget)} · 已用 ${pct}% · 余 ${fmtMoney(Math.max(0, state.trip.budget - spent))}</p>
        </div>
        <div class="stamp">旅途中<br>ON GOING</div>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="hero-stats">
        <div><b>${fmtMoney(perHead)}</b><span>人均</span></div>
        <div><b>${state.expenses.length}</b><span>笔消费</span></div>
        <div><b>${state.hotels.length}</b><span>家酒店</span></div>
        <div><b>${state.journals.length}</b><span>篇日志</span></div>
      </div>
    </article>

    <article class="card settle-mini">
      <div class="mini-head">
        <h3>对账速览</h3>
        <a href="#settle">看对账单</a>
      </div>
      <div class="mini-people">${nettRows}</div>
      <p class="mini-note">AA 实时计算 · 个人消费不计入分摊</p>
    </article>
  </div>

  <section>
    <div class="section-head">
      <h2>${esc(today.theme)}</h2>
      <button class="link" data-action="go-plan">完整行程 →</button>
    </div>
    <div class="today-strip">
      <div class="today-stamp">
        <span class="d">${dayLabel(today.day).replace('DAY ', '')}</span>
        <span class="m">${todayTag} · ${md(today.date)} ${weekday(today.date)}</span>
      </div>
      <div class="today-list">${todayItems || '<p class="today-item">这天还没有安排，去行程页加一条吧。</p>'}</div>
    </div>
  </section>

  <div class="two-col">
    <article class="card">
      <div class="section-head">
        <h2>钱花在哪</h2>
        <span class="meta">${state.expenses.length} 笔 · ${fmtMoney(spent)}</span>
      </div>
      ${cats.length ? `<div class="donut-wrap">
        <div class="donut">
          ${donutSVG(cats, s.total)}
          <div class="donut-center"><b>${spent.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</b><span>TOTAL</span></div>
        </div>
        <div class="legend">
          ${cats.map(c => `<div class="legend-row">
            <i style="background:${c.cat.color}"></i>
            <span class="lg-name">${c.cat.label}</span>
            <span class="lg-amt">${money(c.cents)}</span>
            <span class="lg-pct">${s.total ? Math.round(c.cents / s.total * 100) : 0}%</span>
          </div>`).join('')}
        </div>
      </div>` : emptyState('还没有消费', '记下第一笔，饼图就会出现在这里。')}
    </article>

    <article class="card mood-card">
      <div class="section-head">
        <h2>最近的心情</h2>
        <button class="link" data-action="open-journal">写一篇 →</button>
      </div>
      ${latest.length ? `<div class="mood-list">
        ${latest.map(j => {
          const m = MOOD[j.mood] || MOOD.calm;
          return `<div class="mood-line" style="--mood:${m.color}">
            <span class="mood-badge">${m.emoji} ${m.label}</span>
            <p>${esc(j.text)}</p>
          </div>`;
        }).join('')}
      </div>` : emptyState('还没有日志', '今天发生了什么？写一句话也好。')}
    </article>
  </div>`;
}

function donutSVG(items, total) {
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  const segments = items.map(item => {
    const len = total ? (item.cents / total) * CIRC : 0;
    const gap = len > 6 ? 3 : 0;
    const seg = `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${item.cat.color}"
      stroke-width="16" stroke-dasharray="${Math.max(0, len - gap)} ${CIRC - Math.max(0, len - gap)}"
      stroke-dashoffset="${-offset}"></circle>`;
    offset += len;
    return seg;
  }).join('');
  return `<svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="消费分类占比">
    <circle cx="75" cy="75" r="${R}" fill="none" stroke="rgba(35,37,28,.07)" stroke-width="16"></circle>
    ${segments}
  </svg>`;
}

function viewPlan() {
  const blocks = state.days.map(d => {
    const acts = [...d.activities].sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const rows = acts.map(a => `
      <div class="activity-row">
        <span class="time">${esc(a.time)}</span>
        <span class="tl-dot"></span>
        <div class="tl-body">
          <h4>${esc(a.title)}</h4>
          ${a.place ? `<p>${esc(a.place)}</p>` : ''}
          ${a.note ? `<p>${esc(a.note)}</p>` : ''}
        </div>
        <span class="cost">${a.cost ? fmtMoney(a.cost) : ''}</span>
        <button class="ghost-x" data-action="del-activity" data-day="${d.day}" data-id="${a.id}" title="删除这条行程">×</button>
      </div>`).join('');

    return `<section class="day-block">
      <div class="day-banner">
        <div class="day-big"><small>DAY</small><b>${String(d.day).padStart(2, '0')}</b></div>
        <div class="day-title">
          <h3>${esc(d.theme)}</h3>
          <p>${md(d.date)} ${weekday(d.date)} · ${esc(d.city)} · ${esc(d.weather)}</p>
        </div>
        <button class="btn sm" data-action="add-activity" data-day="${d.day}">＋ 加行程</button>
      </div>
      ${acts.length ? `<div class="timeline">${rows}</div>` : `<div class="empty" style="margin-top:12px"><b>这天还是空白</b>加一个想去的地方吧。</div>`}
    </section>`;
  }).join('');

  return `
  ${pageHead({
    eyebrow: 'ITINERARY · 行程计划',
    title: '每天要去哪',
    lede: `${state.days.length} 天 · ${state.days.length - 1} 晚 · 点右侧「加行程」随时补充`,
    actions: `<button class="btn primary" data-action="add-activity">＋ 加一条行程</button>`
  })}
  ${blocks}`;
}

function viewJournal() {
  const entries = [...state.journals].sort((a, b) => (a.day - b.day) || (a.created - b.created));

  const cards = entries.map(j => {
    const m = MOOD[j.mood] || MOOD.calm;
    const d = state.days.find(x => x.day === j.day);
    return `<article class="journal-card" style="--mood:${m.color}">
      <div class="j-head">
        <span class="j-day">${dayLabel(j.day)}</span>
        <span class="mood-badge" style="--mood:${m.color}">${m.emoji} ${m.label}</span>
        <time>${md(j.date)} ${weekday(j.date)}${d ? ' · ' + esc(d.city) : ''}</time>
        <button class="ghost-x" data-action="del-journal" data-id="${j.id}" title="删除这篇日志">×</button>
      </div>
      <p class="j-text">${esc(j.text)}</p>
      ${j.weather ? `<div class="j-weather">${esc(j.weather)}</div>` : ''}
    </article>`;
  }).join('');

  return `
  ${pageHead({
    eyebrow: 'TRAVEL NOTES · 旅行日志',
    title: '当时的心情',
    lede: `共 ${state.journals.length} 篇 · ${MOODS.length} 种情绪可选，慢慢写就好`,
    actions: `<button class="btn clay" data-action="open-journal">＋ 写日志</button>`
  })}
  ${state.journals.length
    ? `<div class="journal-grid">${cards}</div>`
    : emptyState('还没有日志', '旅途里的某个瞬间，值得被记下来。')}`;
}

function viewExpenses() {
  const s = calcSettlement();
  const spent = s.total / 100;
  const myPaid = (s.paid.me || 0) / 100;
  const othersPaid = spent - myPaid;

  const filtered = filterCat === 'all'
    ? state.expenses
    : state.expenses.filter(e => e.category === filterCat);

  const groups = state.days.map(d => ({
    day: d,
    items: filtered.filter(e => e.day === d.day)
  })).filter(g => g.items.length);

  const groupsHtml = groups.map(g => {
    const total = g.items.reduce((sum, e) => sum + Math.round(e.amount * 100), 0);
    const rows = g.items.map(e => {
      const c = CAT[e.category] || CAT.other;
      const payer = member(e.payerId);
      const n = (e.participants || []).length;
      const personal = n === 1;
      const per = n ? (e.amount / n) : e.amount;
      const pill = e.hotelId
        ? '<span class="pill">住宿单</span>'
        : personal
          ? '<span class="pill personal">个人消费</span>'
          : `<span class="pill">${n} 人 AA</span>`;
      return `<div class="exp-row">
        <span class="cat-mark" style="--c:${c.color}">${c.mark}</span>
        <div class="exp-main">
          <div class="exp-title">${esc(e.title)}${pill}</div>
          <div class="exp-meta">
            ${avatar(e.payerId)}
            <span>${esc(payer.name)} 付款</span>
            <span>·</span>
            <span>${personal ? '不分摊' : `每人 ${fmtMoney(per)}`}</span>
            ${e.note ? `<span>·</span><span>${esc(e.note)}</span>` : ''}
          </div>
        </div>
        <span class="exp-amount">${fmtMoney(e.amount)}</span>
        ${e.hotelId ? '<span style="width:26px"></span>' : `<button class="ghost-x" data-action="del-expense" data-id="${e.id}" title="删除这笔">×</button>`}
      </div>`;
    }).join('');

    return `<div class="exp-group">
      <div class="exp-day-head">
        <span class="dh-day">${dayLabel(g.day.day)}</span>
        <span>${md(g.day.date)} ${weekday(g.day.date)} · ${esc(g.day.city)}</span>
        <span class="dh-total">${money(total)}</span>
      </div>
      ${rows}
    </div>`;
  }).join('');

  const filters = [{ id: 'all', label: '全部' }].concat(CATEGORIES).map(c => `
    <button class="chip ${filterCat === c.id ? 'active' : ''}" data-action="filter" data-cat="${c.id}" style="--c:${c.color || '#23251c'}">
      ${c.mark ? `<span class="c-dot"></span>` : ''}${c.label}
    </button>`).join('');

  return `
  ${pageHead({
    eyebrow: 'SHARED BILLS · 共同账单',
    title: '这趟花了多少',
    lede: '谁付的都记下来，最后自动算 AA',
    actions: `<button class="btn primary" data-action="open-expense">＋ 记一笔</button>`
  })}
  <div class="summary-strip">
    <div class="cell"><span>总支出</span><b>${fmtMoney(spent)}</b></div>
    <div class="cell"><span>我付的</span><b>${fmtMoney(myPaid)}</b></div>
    <div class="cell"><span>朋友付的</span><b>${fmtMoney(othersPaid)}</b></div>
  </div>
  <div class="filter-row">${filters}</div>
  ${groups.length ? `<div class="exp-group">${groupsHtml}</div>` : emptyState('这个分类还没有记录', '换个筛选，或者记一笔新的消费。')}`;
}

function viewHotels() {
  const nights = state.hotels.reduce((sum, h) => sum + hotelNights(h), 0);
  const total = state.hotels.reduce((sum, h) => sum + Number(h.amount || 0), 0);

  const cards = state.hotels.map((h, i) => {
    const n = (h.participants || []).length || 1;
    return `<article class="hotel-card">
      <div class="hotel-art">
        <button class="ghost-x" data-action="del-hotel" data-id="${h.id}" title="删除酒店">×</button>
        <span class="hotel-no">STAY · ${String(i + 1).padStart(2, '0')} / ${String(state.hotels.length).padStart(2, '0')}</span>
        <div class="hotel-city">${esc(state.trip.destination)}<small>${hotelNights(h)} NIGHTS</small></div>
        <span class="hotel-no" style="color:rgba(251,246,233,.5)">CHECK IN ${mdShort(h.checkIn)}</span>
      </div>
      <div class="hotel-body">
        <h3>${esc(h.name)}</h3>
        <p class="hotel-addr">${esc(h.address || '地址待补充')}</p>
        <div class="hotel-dates">
          <span>${md(h.checkIn)}</span><span class="arrow">→</span><span>${md(h.checkOut)}</span>
          <span class="nights">${hotelNights(h)} 晚</span>
        </div>
        <div class="hotel-foot">
          <div class="hotel-price">${fmtMoney(h.amount)}<small>每人 ${fmtMoney(h.amount / n)}</small></div>
          <div class="hotel-payer">${avatar(h.payerId)}<span>${esc(member(h.payerId).name)} 付款</span></div>
        </div>
      </div>
    </article>`;
  }).join('');

  return `
  ${pageHead({
    eyebrow: 'STAYS · 住宿',
    title: '睡在哪里',
    lede: `${state.hotels.length} 家 · 共 ${nights} 晚 · 住宿花费 ${fmtMoney(total)}`,
    actions: `<button class="btn primary" data-action="open-hotel">＋ 加酒店</button>`
  })}
  ${state.hotels.length
    ? `<div class="hotel-grid">${cards}</div>
       <p class="hint">新增酒店会自动生成一笔「住宿」账单，并计入对账单。删除酒店时，对应账单会一起删除。</p>`
    : emptyState('还没有酒店', '把这次住的几家记下来，会同步生成住宿账单。')}`;
}

function viewSettle() {
  const s = calcSettlement();
  const personal = state.expenses.filter(e => (e.participants || []).length === 1);

  const rows = state.members.map(m => {
    const n = s.net[m.id] || 0;
    const cls = n > 0.5 ? 'pos' : n < -0.5 ? 'neg' : 'zero';
    const txt = n > 0.5 ? '应收 ' + money(n) : n < -0.5 ? '应补 ' + money(-n) : '已两清';
    const hint = n > 0.5 ? '等大家转回' : n < -0.5 ? '还差一点' : '刚好平了';
    return `<tr>
      <td><div class="who">${avatar(m.id, 'lg')}<span>${esc(m.name)}<small>${hint}</small></span></div></td>
      <td>${money(s.paid[m.id] || 0)}</td>
      <td>${money(s.owed[m.id] || 0)}</td>
      <td class="${cls}">${txt}</td>
    </tr>`;
  }).join('');

  const transfers = s.transfers.map(t => `
    <div class="transfer">
      ${avatar(t.from, 'sm')}<span>${esc(member(t.from).name)}</span>
      <span class="arrow">→</span>
      ${avatar(t.to, 'sm')}<span>${esc(member(t.to).name)}</span>
      <b>${money(t.cents)}</b>
    </div>`).join('');

  const personalNote = personal.length
    ? `个人消费（不参与分摊）：${personal.map(e => esc(e.title)).join('、')}。`
    : '目前所有消费都按所选分摊人计算。';

  return `
  ${pageHead({
    eyebrow: 'SETTLEMENT · 分摊对账',
    title: '把这笔账算清',
    lede: `${state.members.length} 人 · ${state.expenses.length} 笔消费 · 合计 ${fmtMoney(s.total / 100)}`,
    actions: `<button class="btn primary" data-action="copy-settle">复制对账单</button>`
  })}

  <article class="settle-sheet">
    <div class="sheet-head">
      <div>
        <h2>旅行对账单</h2>
        <p>${esc(state.trip.title)} · ${md(state.trip.startDate)} — ${md(state.trip.endDate)} · ${state.expenses.length} 笔</p>
      </div>
      <div class="stamp">AA<br>SETTLE</div>
    </div>

    <table class="settle-table">
      <thead>
        <tr><th>成员</th><th>已付</th><th>应摊</th><th>结余</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>合计</td>
          <td>${money(s.total)}</td>
          <td>${money(s.total)}</td>
          <td>${s.transfers.length ? s.transfers.length + ' 笔待转' : '全部两清'}</td>
        </tr>
      </tfoot>
    </table>

    <div class="transfer-block">
      <h4>转账建议 · 最少笔数</h4>
      ${s.transfers.length
        ? `<div class="transfer-list">${transfers}</div>`
        : `<div class="transfer-done">✓ 大家已经两清了，不用转账。</div>`}
    </div>

    <p class="sheet-note">
      ${personalNote}<br>
      分摊规则：每笔消费按下单时勾选的分摊人平均承担，住宿按整单均摊，不做按晚拆分。
    </p>
  </article>`;
}

/* ---------------- modals ---------------- */
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    const target = root.querySelector('[autofocus], input:not([type="hidden"]), textarea, select');
    if (target) target.focus({ preventScroll: true });
  }, 60);
}

function closeModal() {
  const root = document.getElementById('modal-root');
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
}

function modalHead(eyebrow, title) {
  return `<div class="modal-head">
    <div>
      <p class="eyebrow">${eyebrow}</p>
      <h2>${title}</h2>
    </div>
    <button type="button" class="icon-btn" data-close aria-label="关闭">×</button>
  </div>`;
}

function openExpenseModal() {
  const day = currentDayNumber();
  const payerOpts = state.members.map(m => `
    <label class="payer-opt">
      <input type="radio" name="payer" value="${m.id}" ${m.id === 'me' ? 'checked' : ''}>
      ${avatar(m.id, 'sm')}<span>${esc(m.name)}</span>
    </label>`).join('');

  const peopleOpts = state.members.map(m => `
    <label class="people-opt">
      <input type="checkbox" name="participants" value="${m.id}" checked>
      ${avatar(m.id, 'sm')}<span>${esc(m.name)}</span>
    </label>`).join('');

  const catOpts = CATEGORIES.map(c => `
    <label class="cat-opt" style="--c:${c.color}">
      <input type="radio" name="category" value="${c.id}" ${c.id === 'food' ? 'checked' : ''}>
      <span class="cat-mark">${c.mark}</span><span>${c.label}</span>
    </label>`).join('');

  openModal(`<form data-form="expense" class="form">
    ${modalHead('NEW EXPENSE · 新消费', '记一笔')}
    <label class="amount-field">
      <span>金额</span>
      <div class="amount-input"><i>¥</i><input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0" required autofocus></div>
    </label>
    <div class="field">
      <span class="label">分类</span>
      <div class="cat-picker">${catOpts}</div>
    </div>
    <div class="row2">
      <label class="field"><span class="label">项目</span><input type="text" name="title" placeholder="例如：喜洲稻田咖啡" required maxlength="40"></label>
      <label class="field"><span class="label">哪一天</span><select name="day">${daysOptions(day)}</select></label>
    </div>
    <div class="field">
      <span class="label">谁付的钱</span>
      <div class="payer-picker">${payerOpts}</div>
    </div>
    <div class="field">
      <span class="label">算在谁头上 · AA 分摊</span>
      <div class="people-picker">${peopleOpts}</div>
      <p class="hint">默认 3 人平均分。只为某个人买的东西，就只勾选 ta。</p>
    </div>
    <label class="field"><span class="label">备注</span><input type="text" name="note" placeholder="可选，比如：含早餐 / 3 人分摊" maxlength="50"></label>
    <div class="modal-foot">
      <button type="button" class="btn" data-close>取消</button>
      <button type="submit" class="btn primary">保存这笔</button>
    </div>
  </form>`);
}

function openJournalModal() {
  const day = currentDayNumber();
  const moodOpts = MOODS.map(m => `
    <label class="mood-opt" style="--mood:${m.color}">
      <input type="radio" name="mood" value="${m.id}">
      <em>${m.emoji}</em><span>${m.label}</span>
    </label>`).join('');

  openModal(`<form data-form="journal" class="form">
    ${modalHead('NEW NOTE · 新日志', '今天感觉怎么样？')}
    <div class="row2">
      <label class="field"><span class="label">哪一天</span><select name="day">${daysOptions(day)}</select></label>
      <label class="field"><span class="label">天气 / 地点</span><input type="text" name="weather" placeholder="晴 · 洱海边" maxlength="30"></label>
    </div>
    <div class="field">
      <span class="label">选一种心情 · 共 ${MOODS.length} 种</span>
      <div class="mood-grid">${moodOpts}</div>
    </div>
    <label class="field">
      <span class="label">写点什么</span>
      <textarea name="text" rows="5" placeholder="今天发生了什么？一句话也好。" required maxlength="600"></textarea>
    </label>
    <div class="modal-foot">
      <button type="button" class="btn" data-close>取消</button>
      <button type="submit" class="btn primary">存进手账</button>
    </div>
  </form>`);
}

function openHotelModal() {
  const checkIn = state.trip.startDate;
  const checkOut = state.days[1] ? state.days[1].date : state.trip.endDate;
  const payerOpts = state.members.map(m => `
    <label class="payer-opt">
      <input type="radio" name="payer" value="${m.id}" ${m.id === 'me' ? 'checked' : ''}>
      ${avatar(m.id, 'sm')}<span>${esc(m.name)}</span>
    </label>`).join('');
  const peopleOpts = state.members.map(m => `
    <label class="people-opt">
      <input type="checkbox" name="participants" value="${m.id}" checked>
      ${avatar(m.id, 'sm')}<span>${esc(m.name)}</span>
    </label>`).join('');

  openModal(`<form data-form="hotel" class="form">
    ${modalHead('NEW STAY · 新酒店', '住哪儿')}
    <label class="field"><span class="label">酒店名称</span><input type="text" name="name" placeholder="例如：既下山 · 大理古城" required maxlength="40" autofocus></label>
    <label class="field"><span class="label">地址 / 位置</span><input type="text" name="address" placeholder="可选，比如：人民路下段" maxlength="60"></label>
    <div class="row2">
      <label class="field"><span class="label">入住</span><input type="date" name="checkIn" value="${checkIn}" required></label>
      <label class="field"><span class="label">退房</span><input type="date" name="checkOut" value="${checkOut}" required></label>
    </div>
    <label class="amount-field">
      <span>住宿总价</span>
      <div class="amount-input"><i>¥</i><input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0" required></div>
    </label>
    <div class="field">
      <span class="label">谁付的钱</span>
      <div class="payer-picker">${payerOpts}</div>
    </div>
    <div class="field">
      <span class="label">算在谁头上</span>
      <div class="people-picker">${peopleOpts}</div>
    </div>
    <label class="field"><span class="label">备注</span><input type="text" name="note" placeholder="可选，比如：含早餐 / 海景房" maxlength="50"></label>
    <p class="hint">保存后会同时生成一笔「住宿」账单，对账单自动更新。</p>
    <div class="modal-foot">
      <button type="button" class="btn" data-close>取消</button>
      <button type="submit" class="btn primary">保存酒店</button>
    </div>
  </form>`);
}

function openActivityModal(dayNo) {
  const day = state.days.find(d => d.day === Number(dayNo)) || state.days[0];
  openModal(`<form data-form="activity" class="form">
    ${modalHead('NEW PLAN · 新行程', '加一条行程')}
    <div class="row2">
      <label class="field"><span class="label">哪一天</span><select name="day">${daysOptions(day.day)}</select></label>
      <label class="field"><span class="label">时间</span><input type="time" name="time" value="10:00" required></label>
    </div>
    <label class="field"><span class="label">要去哪 / 做什么</span><input type="text" name="title" placeholder="例如：喜洲古镇吃破酥粑粑" required maxlength="40" autofocus></label>
    <label class="field"><span class="label">地点 / 交通</span><input type="text" name="place" placeholder="可选，比如：喜洲古镇 · 步行" maxlength="50"></label>
    <label class="field"><span class="label">备注</span><input type="text" name="note" placeholder="可选，比如：记得带现金" maxlength="50"></label>
    <div class="modal-foot">
      <button type="button" class="btn" data-close>取消</button>
      <button type="submit" class="btn primary">加进行程</button>
    </div>
  </form>`);
}

/* ---------------- actions ---------------- */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function deleteExpense(id) {
  const target = state.expenses.find(e => e.id === id);
  if (!target) return;
  if (!window.confirm(`删除「${target.title}」这笔 ${fmtMoney(target.amount)} 的消费？`)) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveState();
  render();
  toast('已删除这笔消费');
}

function deleteJournal(id) {
  if (!window.confirm('删除这篇日志？')) return;
  state.journals = state.journals.filter(j => j.id !== id);
  saveState();
  render();
  toast('日志已删除');
}

function deleteHotel(id) {
  const h = state.hotels.find(x => x.id === id);
  if (!h) return;
  if (!window.confirm(`删除「${h.name}」？对应的住宿账单也会一并删除。`)) return;
  state.hotels = state.hotels.filter(x => x.id !== id);
  state.expenses = state.expenses.filter(e => e.hotelId !== id);
  saveState();
  render();
  toast('酒店与住宿账单已删除');
}

function deleteActivity(dayNo, id) {
  const day = state.days.find(d => d.day === Number(dayNo));
  if (!day) return;
  const act = day.activities.find(a => a.id === id);
  if (!act) return;
  if (!window.confirm(`删除行程「${act.title}」？`)) return;
  day.activities = day.activities.filter(a => a.id !== id);
  saveState();
  render();
  toast('行程已删除');
}

function copySettlement() {
  const s = calcSettlement();
  const lines = [];
  lines.push(`【${state.trip.title}】旅行对账单`);
  lines.push(`${md(state.trip.startDate)} — ${md(state.trip.endDate)} · ${state.members.length} 人 · ${state.expenses.length} 笔`);
  lines.push(`总支出：${fmtMoney(s.total / 100)}`);
  state.members.forEach(m => {
    const n = s.net[m.id] || 0;
    const netText = n > 0.5 ? `应收回 ${money(n)}` : n < -0.5 ? `应补 ${money(-n)}` : '已两清';
    lines.push(`· ${m.name}：已付 ${money(s.paid[m.id] || 0)}，应摊 ${money(s.owed[m.id] || 0)}，${netText}`);
  });
  if (s.transfers.length) {
    lines.push('转账建议：');
    s.transfers.forEach(t => lines.push(`· ${member(t.from).name} → ${member(t.to).name} ${money(t.cents)}`));
  } else {
    lines.push('大家已经两清，不用转账。');
  }
  const text = lines.join('\n');

  const done = () => toast('对账单已复制，去微信发给朋友吧');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动截图'); }
  document.body.removeChild(ta);
}

/* ---------------- forms ---------------- */
function handleForm(form) {
  const type = form.dataset.form;
  const fd = new FormData(form);

  if (type === 'expense') {
    const amount = Number(fd.get('amount'));
    const title = String(fd.get('title') || '').trim();
    const participants = fd.getAll('participants');
    const dayNo = Number(fd.get('day'));
    const day = state.days.find(d => d.day === dayNo);
    if (!amount || amount <= 0) return toast('先填一个金额');
    if (!title) return toast('给这笔消费起个名字');
    if (!participants.length) return toast('至少选一位分摊人');

    state.expenses.push({
      id: uid('e'),
      day: dayNo,
      date: day.date,
      category: fd.get('category') || 'other',
      title,
      amount: Math.round(amount * 100) / 100,
      payerId: fd.get('payer'),
      participants,
      note: String(fd.get('note') || '').trim()
    });
    saveState(); closeModal(); render();
    toast(`已记下 ${fmtMoney(amount)}`);
    return;
  }

  if (type === 'journal') {
    const text = String(fd.get('text') || '').trim();
    const mood = fd.get('mood');
    const dayNo = Number(fd.get('day'));
    const day = state.days.find(d => d.day === dayNo);
    if (!mood) return toast('选一个此刻的心情');
    if (!text) return toast('写一句话也好');
    state.journals.push({
      id: uid('j'),
      day: dayNo,
      date: day.date,
      mood,
      weather: String(fd.get('weather') || '').trim(),
      text,
      created: Date.now()
    });
    saveState(); closeModal(); render();
    toast('已经写进手账了');
    return;
  }

  if (type === 'hotel') {
    const name = String(fd.get('name') || '').trim();
    const amount = Number(fd.get('amount'));
    const checkIn = fd.get('checkIn');
    const checkOut = fd.get('checkOut');
    const participants = fd.getAll('participants');
    if (!name) return toast('填一下酒店名字');
    if (!amount || amount <= 0) return toast('住宿总价还没填');
    if (!participants.length) return toast('至少选一位分摊人');
    if (parseDate(checkOut) <= parseDate(checkIn)) return toast('退房日期要晚于入住日期');

    const id = uid('h');
    state.hotels.push({
      id,
      name,
      address: String(fd.get('address') || '').trim(),
      checkIn,
      checkOut,
      amount: Math.round(amount * 100) / 100,
      payerId: fd.get('payer'),
      participants,
      note: String(fd.get('note') || '').trim()
    });
    const day = state.days.find(d => d.date === checkIn) || state.days[0];
    state.expenses.push({
      id: uid('e'),
      hotelId: id,
      day: day.day,
      date: checkIn,
      category: 'stay',
      title: `住宿 · ${name}（${hotelNights({ checkIn, checkOut })} 晚）`,
      amount: Math.round(amount * 100) / 100,
      payerId: fd.get('payer'),
      participants,
      note: String(fd.get('note') || '').trim()
    });
    saveState(); closeModal(); render();
    toast('酒店和住宿账单都记好了');
    return;
  }

  if (type === 'activity') {
    const title = String(fd.get('title') || '').trim();
    const dayNo = Number(fd.get('day'));
    const day = state.days.find(d => d.day === dayNo);
    if (!title) return toast('写一下要去哪');
    day.activities.push({
      id: uid('a'),
      time: fd.get('time') || '10:00',
      title,
      place: String(fd.get('place') || '').trim(),
      note: String(fd.get('note') || '').trim(),
      cost: 0
    });
    saveState(); closeModal(); render();
    toast('行程已加上');
  }
}

/* ---------------- render & boot ---------------- */
const VIEWS = {
  overview: viewOverview,
  plan: viewPlan,
  journal: viewJournal,
  expenses: viewExpenses,
  hotels: viewHotels,
  settle: viewSettle
};

function render() {
  const route = activeRoute();
  renderSidebar(route);
  renderTabbar(route);
  document.getElementById('view').innerHTML = VIEWS[route]();
  document.title = `${NAV.find(n => n.id === route).label} · 旅账`;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

document.addEventListener('click', (event) => {
  const modalRoot = document.getElementById('modal-root');

  if (event.target === modalRoot) {
    closeModal();
    return;
  }
  const closer = event.target.closest('[data-close]');
  if (closer) {
    event.preventDefault();
    closeModal();
    return;
  }

  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;

  switch (action) {
    case 'open-expense': openExpenseModal(); break;
    case 'open-journal': openJournalModal(); break;
    case 'open-hotel': openHotelModal(); break;
    case 'add-activity': openActivityModal(trigger.dataset.day); break;
    case 'del-expense': deleteExpense(trigger.dataset.id); break;
    case 'del-journal': deleteJournal(trigger.dataset.id); break;
    case 'del-hotel': deleteHotel(trigger.dataset.id); break;
    case 'del-activity': deleteActivity(trigger.dataset.day, trigger.dataset.id); break;
    case 'filter': filterCat = trigger.dataset.cat; render(); break;
    case 'copy-settle': copySettlement(); break;
    case 'go-plan': location.hash = 'plan'; break;
    case 'reset-demo':
      if (!window.confirm('恢复初始示例数据？当前添加的内容会被清空。')) break;
      localStorage.removeItem(STORAGE_KEY);
      state = seedState();
      filterCat = 'all';
      closeModal();
      render();
      toast('已恢复示例数据');
      break;
    default: break;
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  handleForm(form);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

window.addEventListener('hashchange', render);

render();
