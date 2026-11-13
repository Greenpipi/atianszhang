/* ============ 默认数据与工具函数 ============ */

const DEFAULT_CFG = {
  url: 'https://qcfmknjoldqirsgjhryx.supabase.co',
  key: 'sb_publishable_5892YBRrQR_lE0raFn5eAQ_u5EWOy3J'
};

/* 背景头图默认插画：奶油底 + 满铺柳枝浆果纹样（Morris 风格，参考 Notion 植物封面） */
const HERO_DEFAULT_BG = 'assets/hero-default.jpg';

/* 各页面路由：每页拥有各自独立的背景头图（图 + 位置分别独立保存）
   注意：新增页面时这里必须同步加上，否则该页取不到 heroes 槽位，
   「更换背景 / 恢复默认」会因 ph 为 undefined 而静默失败 */
const HERO_PAGES = ['ledger', 'bills', 'wishlist', 'stats', 'rental', 'budget', 'settings'];

const LEDGER_PERSONAL = '个人记账本';

const DEFAULT_LEDGERS = [
  { name: LEDGER_PERSONAL, type: 'personal' }
];

const RENTAL_CAT = '出租屋';
const RENTAL_SUBS = ['房租', '水费', '电费', '燃气费', '物业费', '装修硬装费', '装修材料费', '租房软装', '搬家搬物'];
/* 出租屋子类图标与主题色 */
const RENTAL_META = {
  '房租': { emoji: '🏠', color: '#A5824C' },
  '水费': { emoji: '💧', color: '#8A9A8C' },
  '电费': { emoji: '💡', color: '#C2A473' },
  '燃气费': { emoji: '🔥', color: '#B0763C' },
  '物业费': { emoji: '🧹', color: '#708268' },
  '装修硬装费': { emoji: '🛠️', color: '#8B6B3F' },
  '装修材料费': { emoji: '🧱', color: '#9AA98F' },
  '租房软装': { emoji: '🛋️', color: '#7C8C72' },
  '搬家搬物': { emoji: '📦', color: '#64748B' }
};

const DEFAULT_CATEGORIES = {
  personal: [
    { name: '固定支出', kind: 'expense', subs: ['房贷', '保险', '电话网络费', '燃气费', '物业费', '租房房租', '租房支出'] },
    { name: RENTAL_CAT, kind: 'expense', subs: RENTAL_SUBS },
    { name: '日常支出', kind: 'expense', subs: ['日用品', '山姆购物', '衣服鞋袜', '食物', '餐厨具', '电器', '家具', '杂货', '收纳用品'] },
    { name: '饮食支出', kind: 'expense', subs: ['早餐', '外出就餐', '外卖', '奶茶饮料', '咖啡', '甜食', '零食'] },
    { name: '健康支出', kind: 'expense', subs: ['养生按摩', '医疗健康', '美容美发', '运动健康'] },
    { name: '兴趣支出', kind: 'expense', subs: ['数码产品', '文创文具', '谷子氪金', '游戏消费'] },
    { name: '养车支出', kind: 'expense', subs: ['车充电', '车加油', '车保养', '停车费', '交通费'] },
    { name: '娱乐支出', kind: 'expense', subs: ['酒店度假', '演唱会', '电影', '内容消费', '景区景点'] },
    { name: '光酱专区', kind: 'expense', subs: ['猫清洁', '猫粮'] },
    { name: '综合收入', kind: 'income', subs: ['工资', '理财', '进出差额', '人情'] }
  ]
};

const RENTAL_FIXED = ['房租', '水费', '电费', '燃气费', '物业费'];

/* ---------- 好物仓库：多标签体系 ----------
 * 每个好物可同时拥有多个标签；标签 = 「大类-小类」，无小类的大类本身即标签 */
const GOODS_TAG_GROUPS = [
  { name: '兴趣分类', subs: ['数码电子', '电子耗材', '数码配件'] },
  { name: '衣裤鞋袜', subs: ['外套', '上衣', '家居服', '裙子', '裤子', '休闲鞋', '凉鞋', '帽子', '袜子', '围巾', '配饰', '内衣'] },
  { name: '通用', subs: ['夏季', '冬季', '春秋季'] },
  { name: '日用品', subs: ['美容美发', '杂货', '家电', '收纳', '文创'] },
  { name: '餐厨用品', subs: [] },
  { name: '家具', subs: ['家具'] }
];
/* 全部合法标签（按体系顺序） */
function allGoodsTags() {
  const out = [];
  for (const g of GOODS_TAG_GROUPS) {
    if (g.subs.length) g.subs.forEach(s => out.push(g.name + '-' + s));
    else out.push(g.name);
  }
  return out;
}
/* 标签短名：衣裤鞋袜-外套 → 外套；餐厨用品 → 餐厨用品（徽章/导航显示用） */
function goodsTagShort(tag) {
  const t = String(tag || '');
  const i = t.indexOf('-');
  return i > 0 ? t.slice(i + 1) : t;
}
/* 仓库分类图标：与参考 App 一模一样的 emoji 套装（按标签短名取，无配置返回空串） */
const GOODS_TAG_EMOJI = {
  '数码电子': '💻', '电子耗材': '🔌', '数码配件': '⌨️',
  '外套': '🧥', '上衣': '👚', '家居服': '🩱', '裙子': '👗', '裤子': '👖',
  '休闲鞋': '👟', '凉鞋': '🩴', '帽子': '👒', '袜子': '🧦', '围巾': '🧣',
  '配饰': '🕶', '内衣': '🩲',
  '夏季': '☀️', '冬季': '❄️', '春秋季': '🌸',
  '美容美发': '💦', '杂货': '📔', '家电': '⚡', '收纳': '🧺', '文创': '🖊️',
  '餐厨用品': '🍴', '家具': '🛋'
};
function goodsTagEmoji(tag) {
  return GOODS_TAG_EMOJI[goodsTagShort(tag)] || '';
}
/* 规范化：转数组、去空白、去重、过滤非体系内标签 */
function normGoodsTags(tags) {
  const valid = new Set(allGoodsTags());
  const out = [];
  (Array.isArray(tags) ? tags : []).forEach(t => {
    const v = String(t == null ? '' : t).trim();
    if (v && valid.has(v) && !out.includes(v)) out.push(v);
  });
  return out;
}
/* 老数据迁移：无 tags 的心仪记录，按 category/sub 名称匹配体系标签 */
function legacyGoodsTags(r) {
  const all = allGoodsTags();
  const out = [];
  [r && r.category, r && r.sub].forEach(n => {
    const v = String(n == null ? '' : n).trim();
    if (!v) return;
    const hit = all.find(t => t === v || t.endsWith('-' + v));
    if (hit && !out.includes(hit)) out.push(hit);
  });
  return out;
}
/* 记录的有效标签（兼容 tags 为 null/字符串的老数据） */
function recTags(r) {
  if (!r) return [];
  if (Array.isArray(r.tags)) return normGoodsTags(r.tags);
  if (typeof r.tags === 'string' && r.tags.trim()) {
    try { return normGoodsTags(JSON.parse(r.tags)); } catch (e) { return normGoodsTags(r.tags.split(',')); }
  }
  return [];
}

/* ---------- 好物仓库：使用状态四态 ----------
 * 存 records.status（text）；老数据无 status 时按 favorite 推导显示 */
const WISH_STATUS_LIST = [
  { key: '使用中', cls: 'using' },
  { key: '闲置中', cls: 'idle' },
  { key: '未使用', cls: 'unused' },
  { key: '已弃用', cls: 'dropped' },
  { key: '已磬用', cls: 'depleted' }
];

/* ---------- 好物状态：定格快照编码 ----------
 * records.status_since 一个字段承载两种含义（线上表无 discarded_* 列，快照随本字段一起存）：
 *   普通状态（使用中 / 闲置中 / 未使用）：'YYYY-MM-DD'  —— 状态起始日
 *   定格状态（已弃用 / 已磬用）：'YYYY-MM-DD|天数|每日成本' —— 弃用日 + 当天冻结的天数与每日成本
 * 未使用时为空字符串（清零已陪伴天数，每日成本占位「-」）。
 * 定格值一旦写入便不再随日期 / 金额变化；已弃用与已磬用规则完全一致。 */
function parseWishSince(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { date: '', days: 0, cost: null, snap: false };
  const p = s.split('|');
  if (p.length >= 3) {
    const d = Number(p[1]);
    const c = (p[2] === '' ? null : Number(p[2]));
    return { date: p[0], days: (isFinite(d) && d > 0) ? d : 0, cost: (c != null && isFinite(c)) ? c : null, snap: true };
  }
  return { date: s, days: 0, cost: null, snap: false };
}
/* 组装定格快照：'弃用日|天数|每日成本' */
function fmtWishSince(dateStr, days, cost) {
  const d = Math.max(1, Math.round(Number(days) || 0));
  const c = (cost == null || !isFinite(Number(cost))) ? '' : Number(cost).toFixed(2);
  return (dateStr || todayStr()) + '|' + d + '|' + c;
}

/* ---------- 好物仓库：季节自动切换 ----------
 * 依据：好物的「通用」季节标签（夏季/冬季/春秋季）+ 当前月份所属季节，
 * 自动把「衣裤鞋袜」类好物在「使用中 ↔ 闲置中」之间切换。 */
const SEASON_TAGS = ['夏季', '冬季', '春秋季'];
const CLOTHES_TAG_PREFIX = '衣裤鞋袜-';
/* 好物是否打了「通用」组季节标签，返回该标签或 null */
function recSeasonTag(r) {
  const tags = recTags(r);
  for (const t of tags) { const s = goodsTagShort(t); if (SEASON_TAGS.includes(s)) return t; }
  return null;
}
/* 好物是否属于衣裤鞋袜大类 */
function isClothesGood(r) { return recTags(r).some(t => t.indexOf(CLOTHES_TAG_PREFIX) === 0); }
/* 每月 → 季节 默认配置（南宁模式：4-11 夏、3&12 春秋、1-2 冬） */
function defaultSeasonMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = '夏季';
  [3, 12].forEach(i => m[i] = '春秋季');
  [1, 2].forEach(i => m[i] = '冬季');
  return m;
}
/* 给定月 → 季节（缺配置回退默认） */
function seasonOfMonth(cfg, month) {
  const c = cfg && typeof cfg === 'object' ? cfg : defaultSeasonMonths();
  return c[month] || '夏季';
}
/* 给定好物与当前季节 → 应切到的状态（仅 使用中/闲置中 二选一）；不属季节切换范围返回 null */
function seasonTargetStatus(rec, season) {
  if (!isClothesGood(rec)) return null;
  const st = recSeasonTag(rec);
  if (!st) return null; // 无季节标签不参与
  return (goodsTagShort(st) === season) ? '使用中' : '闲置中';
}

const DEFAULT_TEMPLATES = [
  // 日常支出板块
  { ledger: 'personal', section: '日常支出板块', label: '早餐', emoji: '🥪', category: '饮食支出', sub: '早餐' },
  { ledger: 'personal', section: '日常支出板块', label: '吃吃喝喝', emoji: '🍱', category: '饮食支出', sub: '外出就餐' },
  { ledger: 'personal', section: '日常支出板块', label: '奶茶零食', emoji: '🧋', category: '饮食支出', sub: '奶茶饮料' },
  { ledger: 'personal', section: '日常支出板块', label: '休闲娱乐', emoji: '🎬', category: '娱乐支出', sub: '内容消费' },
  { ledger: 'personal', section: '日常支出板块', label: '日常购物', emoji: '🛒', category: '日常支出', sub: '日用品' },
  { ledger: 'personal', section: '日常支出板块', label: '养生医疗', emoji: '💊', category: '健康支出', sub: '医疗健康' },
  { ledger: 'personal', section: '日常支出板块', label: '租房支出', emoji: '🏠', category: '固定支出', sub: '租房支出' },
  { ledger: 'personal', section: '日常支出板块', label: '车仙人', emoji: '🚗', category: '养车支出', sub: '车充电' },
  { ledger: 'personal', section: '日常支出板块', label: '猫仙人', emoji: '🐱', category: '光酱专区', sub: '猫粮' },
  // 爱好就是一切板块
  { ledger: 'personal', section: '爱好就是一切板块', label: '游戏氪金', emoji: '🎮', category: '兴趣支出', sub: '游戏消费' },
  { ledger: 'personal', section: '爱好就是一切板块', label: '谷子氪金', emoji: '🪶', category: '兴趣支出', sub: '谷子氪金' },
  { ledger: 'personal', section: '爱好就是一切板块', label: '文创氪金', emoji: '🖋️', category: '兴趣支出', sub: '文创文具' },
  { ledger: 'personal', section: '爱好就是一切板块', label: '数码氪金', emoji: '💻', category: '兴趣支出', sub: '数码产品' },
  // 旅游外出板块
  { ledger: 'personal', section: '旅游外出板块', label: '景点门票', emoji: '🎫', category: '娱乐支出', sub: '景区景点' },
  { ledger: 'personal', section: '旅游外出板块', label: '交通费用', emoji: '🚌', category: '养车支出', sub: '交通费' },
  { ledger: 'personal', section: '旅游外出板块', label: '旅游酒店', emoji: '🏨', category: '娱乐支出', sub: '酒店度假' }
];

const QUICK_SECTIONS = ['日常支出板块', '爱好就是一切板块', '旅游外出板块'];
/* 快捷按钮短标签（≤2 字，宽度固定不被文字撑开；老数据无 short 字段时按 label 回退） */
const QUICK_SHORT = {
  '早餐': '早餐', '吃吃喝喝': '吃喝', '奶茶零食': '奶茶', '休闲娱乐': '休闲',
  '日常购物': '购物', '养生医疗': '医疗', '租房支出': '租房', '车仙人': '车',
  '猫仙人': '猫', '游戏氪金': '游戏', '谷子氪金': '谷子', '文创氪金': '文创',
  '数码氪金': '数码', '景点门票': '门票', '交通费用': '交通', '旅游酒店': '酒店'
};
function quickShort(label) {
  return QUICK_SHORT[label] || String(label || '').slice(0, 2);
}

/* 小类名 → 2 字简称（自定义模板没有自定义 label 时用它） */
const QUICK_SHORT_SUB = {
  '早餐': '早餐', '外出就餐': '吃喝', '奶茶饮料': '奶茶', '咖啡': '咖啡',
  '内容消费': '休闲', '日用品': '购物', '医疗健康': '医疗', '租房支出': '租房',
  '车充电': '车', '猫粮': '猫', '游戏消费': '游戏', '谷子氪金': '谷子',
  '文创文具': '文创', '数码产品': '数码', '景区景点': '门票', '交通费': '交通',
  '酒店度假': '酒店'
};

/* 模板 → 首页快捷按钮短标签：自定义 label 优先，其次小类名映射，最后直接截 2 字 */
function tplShort(t) {
  const lab = t.label || '';
  if (lab) return QUICK_SHORT[lab] || lab.slice(0, 2);
  const sub = t.sub || '';
  return QUICK_SHORT_SUB[sub] || QUICK_SHORT[sub] || String(sub || t.category || '').slice(0, 2);
}

/* 模板 → emoji：模板自带优先，其次按小类/大类关键词推断 */
function tplEmoji(t) {
  return t.emoji || subEmoji(t.sub) || catEmoji(t.category) || '💸';
}

/* ============================================================
   小类图标库（灰金线性风格，24×24 / 1.7 stroke / currentColor）
   模板的 emoji 字段支持 "i:<key>" 存储所选图标，兼容旧 emoji
   ============================================================ */
const ICON_LIB = {
  home: { label: '住房', svg: '<path d="M3.6 10.7 12 3.8l8.4 6.9"/><path d="M5.7 9.8V20h12.6V9.8"/><path d="M9.8 20v-5.2h4.4V20"/>' },
  building: { label: '物业', svg: '<path d="M5 20V5.2a1.7 1.7 0 0 1 1.7-1.7h6.6A1.7 1.7 0 0 1 15 5.2V20"/><path d="M15 9h2.8a1.7 1.7 0 0 1 1.7 1.7V20"/><path d="M8 7.5h1.5M11.5 7.5H13M8 11h1.5M11.5 11H13M8 14.5h1.5M11.5 14.5H13"/><path d="M3.5 20h17"/>' },
  shield: { label: '保险', svg: '<path d="M12 3.4 18.8 6v5.4c0 4.3-2.9 7.4-6.8 9.2-3.9-1.8-6.8-4.9-6.8-9.2V6L12 3.4Z"/><path d="m9.2 11.8 1.9 1.9 3.7-3.9"/>' },
  wifi: { label: '网络', svg: '<path d="M4.2 9.4a11.4 11.4 0 0 1 15.6 0"/><path d="M6.8 12.3a7.6 7.6 0 0 1 10.4 0"/><path d="M9.4 15.2a3.8 3.8 0 0 1 5.2 0"/><circle cx="12" cy="18.5" r="1"/>' },
  flame: { label: '燃气', svg: '<path d="M12.2 3.6c2.9 3.2 4.6 5.8 4.6 8.4a4.8 4.8 0 0 1-9.6 0c0-1.5.7-2.9 1.8-4.3.3 1.6 1.1 2.6 2.2 3.1-.1-2.2.3-4.3 1-7.2Z"/>' },
  key: { label: '房租', svg: '<circle cx="8" cy="12" r="3.4"/><path d="M11.4 12H20"/><path d="M17.2 12v2.6M14.4 12v2"/>' },
  basket: { label: '日用', svg: '<path d="M4.2 10.5h15.6l-1.3 8.2a1.6 1.6 0 0 1-1.6 1.3H7.1a1.6 1.6 0 0 1-1.6-1.3L4.2 10.5Z"/><path d="m8 10.5 2.2-6M16 10.5l-2.2-6"/><path d="M9.5 14v3M14.5 14v3"/>' },
  cart: { label: '购物', svg: '<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2l1.2-6.2H6.2"/>' },
  shirt: { label: '服饰', svg: '<path d="M8.8 4.5 12 6.3l3.2-1.8 4.3 2.3-1.7 4-2.3-.9V20H8.5V9.9l-2.3.9-1.7-4 4.3-2.3Z"/>' },
  bowl: { label: '食物', svg: '<path d="M3.8 11.5h16.4a8.2 8.2 0 0 1-16.4 0Z"/><path d="M7.5 8.5c0-1.2 1-1.8 1-3M12 8.5c0-1.2 1-1.8 1-3M16.5 8.5c0-1.2 1-1.8 1-3"/>' },
  utensils: { label: '餐具', svg: '<path d="M7 3.5v6.2a2.2 2.2 0 0 1-4.4 0V3.5"/><path d="M4.8 3.5v17"/><path d="M17.5 20.5V4.2c-1.7 1.3-2.8 3.5-2.8 6 0 1.8 1.1 3 2.8 3h2.2"/>' },
  plug: { label: '电器', svg: '<path d="M8 3.5v5M16 3.5v5"/><path d="M6 8.5h12v3.8a6 6 0 0 1-12 0V8.5Z"/><path d="M12 18.3V21"/>' },
  sofa: { label: '家具', svg: '<path d="M5 11V8.2A2.2 2.2 0 0 1 7.2 6h9.6A2.2 2.2 0 0 1 19 8.2V11"/><path d="M5 11a2 2 0 0 0-2 2v3.5h18V13a2 2 0 0 0-2-2"/><path d="M6 16.5V20M18 16.5V20"/>' },
  box: { label: '收纳', svg: '<path d="M4 8.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-10Z"/><path d="M3.3 5h17.4v3.5H3.3z"/><path d="M10 5v3.5M14 5v3.5"/>' },
  bag: { label: '外卖', svg: '<path d="M6 8.5h12l1 10.2a1.5 1.5 0 0 1-1.5 1.6h-11A1.5 1.5 0 0 1 5 18.7L6 8.5Z"/><path d="M9 9V6.8a3 3 0 0 1 6 0V9"/>' },
  cup: { label: '饮品', svg: '<path d="M6.5 8.5h11l-1 10.2a1.5 1.5 0 0 1-1.5 1.3H9a1.5 1.5 0 0 1-1.5-1.3L6.5 8.5Z"/><path d="M5.5 5.5h13"/><path d="M14.2 5.5 12 2.8"/>' },
  coffee: { label: '咖啡', svg: '<path d="M5 8h11v6.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5V8Z"/><path d="M16 9.5h2.2a2.3 2.3 0 0 1 0 4.6H16"/><path d="M8 4.5c-.6 1 .6 1.6 0 2.6M11.5 4.5c-.6 1 .6 1.6 0 2.6"/>' },
  cake: { label: '甜点', svg: '<path d="M4 20h16"/><path d="M5.5 20v-6.2a1.8 1.8 0 0 1 1.8-1.8h9.4a1.8 1.8 0 0 1 1.8 1.8V20"/><path d="M5.5 16.2c1.3 1 2.3 1 3.5 0s2.2-1 3.5 0 2.3 1 3.5 0 2.2-1 3 0"/><path d="M12 8.5v3.5"/><path d="M12 5.2c.9.8.9 1.8 0 2.6-.9-.8-.9-1.8 0-2.6Z"/>' },
  cookie: { label: '零食', svg: '<path d="M20 12.3A8.2 8.2 0 1 1 11.7 4a3 3 0 0 0 4 4 3 3 0 0 0 4.3 4.3Z"/><circle cx="9" cy="10" r=".9"/><circle cx="12.5" cy="15" r=".9"/><circle cx="8" cy="15.5" r=".9"/>' },
  leaf: { label: '养生', svg: '<path d="M20 4.5c-8.5.4-13.3 4.2-13.3 9.2a5.2 5.2 0 0 0 5.2 5.2c5 0 7.7-4.5 8.1-14.4Z"/><path d="M4 20c2.2-4 5.2-6.6 9.2-8.6"/>' },
  medical: { label: '医疗', svg: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>' },
  scissors: { label: '美容', svg: '<circle cx="7" cy="7" r="2.4"/><circle cx="7" cy="17" r="2.4"/><path d="m9 8.6 11 6.9M9 15.4l11-6.9"/>' },
  dumbbell: { label: '运动', svg: '<path d="M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5M7 12h10"/>' },
  laptop: { label: '数码', svg: '<rect x="5" y="4.5" width="14" height="10" rx="1.8"/><path d="M3.5 18.5h17l-1-4h-15l-1 4Z"/>' },
  pen: { label: '文具', svg: '<path d="m5 19 1-4.2L16.6 4.2a2 2 0 0 1 2.8 2.8L8.8 17.6 5 19Z"/><path d="m14.5 6.3 3.2 3.2"/>' },
  sparkle: { label: '爱好', svg: '<path d="M12 3.5c.6 4.3 2.2 6 6.5 6.5-4.3.6-6 2.2-6.5 6.5-.6-4.3-2.2-6-6.5-6.5 4.3-.6 6-2.2 6.5-6.5Z"/><path d="M18.5 15.5c.3 1.8 1 2.6 2.8 2.9-1.8.3-2.5 1.1-2.8 2.9-.3-1.8-1-2.6-2.8-2.9 1.8-.3 2.5-1.1 2.8-2.9Z"/>' },
  gamepad: { label: '游戏', svg: '<path d="M7.5 8.5h9a4.5 4.5 0 0 1 4.4 3.6l.6 3.2a2.7 2.7 0 0 1-4.8 2.3l-1.2-1.6H8.5l-1.2 1.6a2.7 2.7 0 0 1-4.8-2.3l.6-3.2a4.5 4.5 0 0 1 4.4-3.6Z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r=".9"/><circle cx="18" cy="13.5" r=".9"/>' },
  bolt: { label: '充电', svg: '<path d="M13.2 2.8 5.5 13.3h5.2l-.9 7.9 7.7-10.5h-5.2l.9-7.9Z"/>' },
  fuel: { label: '加油', svg: '<rect x="4.5" y="4" width="8" height="16" rx="1.6"/><path d="M6.8 7.5h4.4v4H6.8z"/><path d="m12.5 8 2.5 2.5V18a2 2 0 0 0 4 0v-7l-2.5-2.5"/><path d="M3.5 20h10"/>' },
  wrench: { label: '保养', svg: '<path d="M20 5.5a4 4 0 0 1-5.2 5.2L6 19.5 4.5 18l8.8-8.8A4 4 0 0 1 18.5 4l-2.7 2.7 1.5 1.5L20 5.5Z"/>' },
  parking: { label: '停车', svg: '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M9.8 17V7.2h3.4a3 3 0 0 1 0 6H9.8"/>' },
  bus: { label: '交通', svg: '<rect x="4.5" y="3.5" width="15" height="13" rx="3"/><path d="M4.5 11h15"/><path d="M7.5 6.8h9"/><circle cx="8.2" cy="18.8" r="1.5"/><circle cx="15.8" cy="18.8" r="1.5"/>' },
  bed: { label: '住宿', svg: '<path d="M3.5 19v-7.5h17V19"/><path d="M3.5 14.5h17"/><path d="M3.5 19v2M20.5 19v2"/><path d="M6.5 11.5V8.3A1.8 1.8 0 0 1 8.3 6.5h3.2v5H6.5Z"/><path d="M14.5 11.5v-3h1.2a1.8 1.8 0 0 1 1.8 1.8v1.2"/>' },
  mic: { label: '演出', svg: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3M8.5 21h7"/>' },
  film: { label: '电影', svg: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M8 4.5v15M16 4.5v15M3.5 9h4.5M3.5 15h4.5M16 9h4.5M16 15h4.5"/>' },
  play: { label: '内容', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.7v6.6l5.2-3.3L10 8.7Z"/>' },
  mountain: { label: '景区', svg: '<path d="m3.5 19 5.2-9 3.2 5.2 2.2-3.5 6.4 7.3H3.5Z"/><circle cx="17" cy="6.5" r="2"/>' },
  cat: { label: '猫咪', svg: '<path d="M5 10.5 4 5l4 2.2h8L20 5l-1 5.5v4a7 7 0 0 1-14 0v-4Z"/><path d="M8.5 13.5h.01M15.5 13.5h.01M10.5 16.5c1 .8 2 .8 3 0"/>' },
  fish: { label: '猫粮', svg: '<path d="M4 12c2-3 5-4.5 8.5-4.5 3 0 5.4 1.4 7.5 4.5-2.1 3.1-4.5 4.5-7.5 4.5C9 16.5 6 15 4 12Z"/><path d="M4 12c1.5-1 3-1.5 4.5-1.5M17 7.5l2.5-2v13l-2.5-2"/><circle cx="9" cy="11.5" r=".8"/>' },
  wallet: { label: '工资', svg: '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 9.5h17"/><path d="M15.5 13.5h5"/><circle cx="17.5" cy="14" r="1"/>' },
  chart: { label: '理财', svg: '<path d="M4 20V4M4 20h16"/><path d="M7.5 16v-4M11.5 16V9M15.5 16v-6M19 16V6"/>' },
  arrows: { label: '转账', svg: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>' },
  gift: { label: '人情', svg: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8"/><path d="M12 8v12"/><path d="M12 8c-2.8 0-4.5-1-4.5-2.7C7.5 3.8 9 3 10.3 3.8 11.5 4.6 12 6.5 12 8Zm0 0c2.8 0 4.5-1 4.5-2.7C16.5 3.8 15 3 13.7 3.8 12.5 4.6 12 6.5 12 8Z"/>' },
  tag: { label: '其他', svg: '<path d="M12.6 3.5H20v7.4l-8.4 8.4a1.8 1.8 0 0 1-2.5 0l-5-5a1.8 1.8 0 0 1 0-2.5l8.5-8.3Z"/><circle cx="16.4" cy="7.2" r="1.2"/>' }
};

const SUB_ICON = {
  '房贷': 'home', '保险': 'shield', '电话网络费': 'wifi', '燃气费': 'flame', '物业费': 'building',
  '租房房租': 'key', '租房支出': 'home',
  '日用品': 'basket', '山姆购物': 'cart', '衣服鞋袜': 'shirt', '食物': 'bowl', '餐厨具': 'utensils',
  '电器': 'plug', '家具': 'sofa', '杂货': 'box', '收纳用品': 'box',
  '早餐': 'bowl', '外出就餐': 'utensils', '外卖': 'bag', '奶茶饮料': 'cup', '咖啡': 'coffee',
  '甜食': 'cake', '零食': 'cookie',
  '养生按摩': 'leaf', '医疗健康': 'medical', '美容美发': 'scissors', '运动健康': 'dumbbell',
  '数码产品': 'laptop', '文创文具': 'pen', '谷子氪金': 'sparkle', '游戏消费': 'gamepad',
  '车充电': 'bolt', '车加油': 'fuel', '车保养': 'wrench', '停车费': 'parking', '交通费': 'bus',
  '酒店度假': 'bed', '演唱会': 'mic', '电影': 'film', '内容消费': 'play', '景区景点': 'mountain',
  '猫清洁': 'cat', '猫粮': 'fish',
  '工资': 'wallet', '理财': 'chart', '进出差额': 'arrows', '人情': 'gift'
};

const CAT_ICON = {
  '固定支出': 'home', '日常支出': 'basket', '饮食支出': 'utensils', '健康支出': 'leaf',
  '兴趣支出': 'sparkle', '养车支出': 'bus', '娱乐支出': 'film', '光酱专区': 'cat', '综合收入': 'wallet'
};

const ICON_RULES = [
  [/咖啡/, 'coffee'], [/奶茶|饮料|茶|果汁/, 'cup'], [/外卖|配送/, 'bag'],
  [/早餐|食物|饭|菜|餐/, 'bowl'], [/零食|饼干/, 'cookie'], [/甜|蛋糕|面包/, 'cake'],
  [/房租|房贷|租房|住房|房/, 'home'], [/物业/, 'building'], [/保险/, 'shield'],
  [/电话|网络|宽带|流量/, 'wifi'], [/燃气|煤气|气费/, 'flame'],
  [/日用|洗护|清洁/, 'basket'], [/购|买|超市|山姆/, 'cart'], [/衣|鞋|袜|裤/, 'shirt'],
  [/餐厨|锅|餐具/, 'utensils'], [/电器|插座|电费/, 'plug'], [/家具|沙发|床垫/, 'sofa'],
  [/收纳|杂货|箱|盒/, 'box'],
  [/按摩|养生|spa/i, 'leaf'], [/医|药|挂号|体检/, 'medical'], [/美容|美发|理发|剪/, 'scissors'],
  [/运动|健身|游泳|瑜伽/, 'dumbbell'],
  [/数码|电脑|手机|相机|耳机/, 'laptop'], [/文具|笔|本子|书/, 'pen'],
  [/谷|手办|周边|立牌/, 'sparkle'], [/游戏/, 'gamepad'],
  [/充电/, 'bolt'], [/加油|油费|汽油/, 'fuel'], [/保养|维修|洗车/, 'wrench'],
  [/停车/, 'parking'], [/交通|地铁|公交|打车|车费/, 'bus'],
  [/酒店|住宿|民宿|度假/, 'bed'], [/演唱|音乐会|live/i, 'mic'], [/电影|影院/, 'film'],
  [/会员|订阅|内容/, 'play'], [/景区|门票|旅游|旅行|公园/, 'mountain'],
  [/猫砂|猫清洁/, 'cat'], [/猫粮|鱼|宠物/, 'fish'],
  [/工资|薪|奖金/, 'wallet'], [/理财|基金|股票|投资|利息/, 'chart'],
  [/差额|转账|退款/, 'arrows'], [/人情|礼|红包|请客/, 'gift']
];

function iconKeyForSub(sub, category) {
  const s = String(sub || '').trim();
  if (SUB_ICON[s]) return SUB_ICON[s];
  for (const [re, key] of ICON_RULES) if (re.test(s)) return key;
  const c = String(category || '').trim();
  if (CAT_ICON[c]) return CAT_ICON[c];
  for (const [re, key] of ICON_RULES) if (re.test(c)) return key;
  return 'tag';
}

function tplIconKey(t) {
  const e = String((t && t.emoji) || '');
  if (e.indexOf('i:') === 0 && ICON_LIB[e.slice(2)]) return e.slice(2);
  return iconKeyForSub(t && t.sub, t && t.category);
}

function iconSVG(key, cls) {
  const def = ICON_LIB[key] || ICON_LIB.tag;
  return '<svg class="' + (cls || 'ui-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + def.svg + '</svg>';
}

/* 模板图标：优先所选图标；旧 emoji 仅在无法推断图标时保留 */
function tplIconHTML(t, cls) {
  const e = String((t && t.emoji) || '');
  if (e && e.indexOf('i:') !== 0) {
    const key = iconKeyForSub(t.sub, t.category);
    if (key !== 'tag') return iconSVG(key, cls);
    return '<span class="legacy-emoji">' + esc(e) + '</span>';
  }
  return iconSVG(tplIconKey(t), cls);
}

const PALETTE = ['#A5824C','#7C8C72','#C2A473','#8A9A8C','#B0763C','#8B6B3F','#67745F','#CFC7BA','#D8C6AA','#9A948A'];

/* ---------- 工具 ---------- */
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function monthOf(dateStr) { return (dateStr || '').slice(0, 7); }
function yearOf(dateStr) { return (dateStr || '').slice(0, 4); }
function thisMonth() { return monthOf(todayStr()); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* 账单列表每页条数 */
const LIST_PAGE_SIZE = 50;
/* 关键词高亮：先转义 HTML，再大小写不敏感地把命中词包进 <mark>（保留原文大小写） */
function hlKw(text, kw) {
  const s = esc(text);
  const k = (kw == null ? '' : String(kw)).trim();
  if (!k) return s;
  const kEsc = esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try { return s.replace(new RegExp(kEsc, 'gi'), m => '<mark>' + m + '</mark>'); }
  catch (e) { return s; }
}
function fmtMoney(n, opts) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return opts && opts.plain ? s : '¥' + s;
}
/* 金额缩写：3822.4 → 3.8k；12345 → 1.2w；35.5 → 35.5 */
function fmtShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 10000) return sign + +(a / 10000).toFixed(1) + 'w';
  if (a >= 1000) return sign + +(a / 1000).toFixed(1) + 'k';
  return sign + (+a.toFixed(2));
}
/* 分类 emoji：按内置模板匹配，出租屋/收入等无模板的走兜底；
 * 用户自建/改名的分类（如「车消费」）按关键词规则匹配 */
const CAT_EMOJI_FALLBACK = { '出租屋': '🏠', '综合收入': '💰' };
/* 关键词 → emoji（按顺序优先匹配，覆盖用户自定义分类/小类名） */
const EMOJI_RULES = [
  [/咖啡|拿铁|美式|摩卡|瑞幸|星巴克/, '☕'],
  [/奶茶|饮料|饮品/, '🧋'],
  [/早餐|早点|包子|豆浆|油条/, '🥪'],
  [/外卖|午饭|晚饭|午餐|晚餐|吃饭|聚餐|餐饮|美食|小吃|吃/, '🍱'],
  [/零食|甜食|甜品|蛋糕/, '🍰'],
  [/游戏/, '🎮'],
  [/谷子|动漫|二次元|周边|徽章|吧唧|手办/, '🪶'],
  [/文创|文具|书店|图书|书/, '🖋️'],
  [/数码|电子|电脑|手机|耳机|硬件|软件/, '💻'],
  [/景点|门票|旅游|旅行|酒店|度假|民宿|机票|车票/, '🏨'],
  [/演唱会|电影|观影|娱乐|休闲|剧本|桌游/, '🎬'],
  [/医|药|健康|养生|按摩|美容|美发|运动|健身|牙/, '💊'],
  [/工资|薪水|收入|理财|奖金|分红|人情|红包|报销/, '💰'],
  [/购物|日用|百货|衣服|鞋|袜|山姆|超市|商超/, '🛒'],
  [/宠|猫|狗|铲屎/, '🐱'],
  [/租|房|物业|水费|电费|燃气|暖气|装修|搬家|房贷|保险/, '🏠'],
  [/车|加油|停车|充电|驾|交通|地铁|公交|滴滴|打车|过路|停车/, '🚗'],
  [/餐厨|厨具|电器|杂货|收纳/, '📦']
];
function emojiByKeyword(name) {
  for (const [re, e] of EMOJI_RULES) if (re.test(name)) return e;
  return '💸';
}
function catEmoji(cat) {
  if (CAT_EMOJI_FALLBACK[cat]) return CAT_EMOJI_FALLBACK[cat];
  const t = DEFAULT_TEMPLATES.find(t => t.category === cat);
  if (t) return t.emoji || '💸';
  return emojiByKeyword(cat);
}
/* 小类 emoji：优先模板精确匹配，再走关键词 */
function subEmoji(sub) {
  if (!sub) return '';
  const t = DEFAULT_TEMPLATES.find(t => t.sub === sub);
  if (t) return t.emoji || '💸';
  return emojiByKeyword(sub);
}
function daysBetween(dateStr, ref) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date((ref || todayStr()) + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000));
}
function starsStr(n) {
  n = Math.round(Number(n) || 0);
  return n > 0 ? '★'.repeat(n) + '<span style="color:#E2DCD1">' + '★'.repeat(5 - n) + '</span>' : '';
}
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function readJSONFile(input) {
  return new Promise((resolve, reject) => {
    const f = input.files && input.files[0];
    if (!f) return reject(new Error('未选择文件'));
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(new Error('JSON 解析失败')); } };
    r.onerror = () => reject(new Error('文件读取失败'));
    r.readAsText(f);
  });
}
/* 图片压缩为 dataURL */
function compressImage(file, maxSide = 720, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件'));
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = r.result;
    };
    r.onerror = () => reject(new Error('文件读取失败'));
    r.readAsDataURL(file);
  });
}

/* ============ 周期性待办账单（与账册分开存储） ============
 * 独立于 records 的 bills 表；「已付」时才写入 records 并回填关联。
 * 这里只放纯计算：周期枚举、到期日、状态判定、年度汇总。 */
const BILL_CUSTOM_TYPE = '自定义';
const BILL_TYPES = [
  { name: '房贷', emoji: '🏠', color: '#A5824C' },
  { name: '房租', emoji: '🔑', color: '#8A9A8C' },
  { name: '医保', emoji: '🏥', color: '#708268' },
  { name: '养老金', emoji: '👴', color: '#8B6B3F' },
  { name: '保险', emoji: '🛡️', color: '#A5824C' },
  { name: '水电燃气', emoji: '💡', color: '#C2A473' },
  { name: '话费', emoji: '📱', color: '#7C8C72' },
  { name: '会员订阅', emoji: '⭐', color: '#EC4899' },
  { name: '车险', emoji: '🚗', color: '#B0763C' },
  { name: '物业费', emoji: '🧹', color: '#9AA98F' }
];
const BILL_CYCLES = [
  { key: 'monthly', label: '每月', months: 1 },
  { key: 'quarterly', label: '每季度', months: 3 },
  { key: 'semiannual', label: '每半年', months: 6 },
  { key: 'yearly', label: '每年', months: 12 },
  { key: 'custom', label: '自定义', months: 1 }
];
/* 付款方式：manual 手动付 / auto 自动付（代扣） */
const BILL_PAY_METHODS = [
  { key: 'manual', label: '手动付', hint: '到期后自己点「已付」确认' },
  { key: 'auto', label: '自动付（代扣）', hint: '到期自动入账，无需确认' }
];
function billPayMethod(bill) { return (bill && bill.payment_method === 'auto') ? 'auto' : 'manual'; }
function billIsAuto(bill) { return billPayMethod(bill) === 'auto'; }
/* 自动付必须要有预设金额作为入账来源；缺金额属于异常数据，按手动付降级处理 */
function billAutoReady(bill) { return billIsAuto(bill) && Number(bill && bill.preset_amount) > 0; }
/* 自动付的「生效下限」：创建日（按本地时区取日期，与 SQL 侧 created_at at time zone 'Asia/Shanghai' 对齐）。
   作用：新建账单时如果开始日期在过去，不该把它当作漏付去补扣历史。 */
function billAutoFloor(bill) {
  if (billPayMethod(bill) !== 'auto') return '';
  const raw = (bill && bill.created_at) || '';
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/* 计算用的账单副本：自动付账单的起点推进到「创建日之后的第一期」。
   手动付账单原样返回 —— 手动付仍可补记历史期次。 */
function billAutoBase(bill) {
  if (!bill) return bill;
  const floor = billAutoFloor(bill);
  if (!floor) return bill;
  const start = bill.start_date || '';
  if (start && start >= floor) return bill;
  for (let k = 0; k < 600; k++) {
    const d = billOccurrence(bill, k);
    if (d >= floor) return Object.assign({}, bill, { start_date: d });
    if (bill.end_mode === 'date' && bill.end_date && d > bill.end_date) break;
  }
  return bill;
}
/* 枚举 <= untilDate 的全部应期（从 start_date 起，最多 600 期，防死循环） */
function billOccurrencesUntil(bill, untilDate) {
  const out = [];
  const until = untilDate || todayStr();
  const start = (bill && bill.start_date) || '';
  const floor = billAutoFloor(bill);
  for (let k = 0; k < 600; k++) {
    const d = billOccurrence(bill, k);
    if (d > until) break;
    if (start && d < start) continue;
    if (floor && d < floor) continue;   // 自动付不回溯创建日之前的期次
    if (bill.end_mode === 'date' && bill.end_date && d > bill.end_date) continue;
    out.push(d);
  }
  return out;
}
function billTypeMeta(name) {
  // 出租屋子类（水费/电费/燃气费…）沿用出租屋那套图标配色，待办账单里也一致
  const rental = RENTAL_META[name];
  return BILL_TYPES.find(x => x.name === name)
    || (rental ? { name, emoji: rental.emoji, color: rental.color } : null)
    || { name: name || '其他', emoji: '🧾', color: '#64748B' };
}
function billEveryMonths(bill) {
  if (!bill) return 1;
  if (bill.cycle === 'yearly') return 12;
  if (bill.cycle === 'custom') return Math.max(1, Number(bill.cycle_months) || 1);
  const c = BILL_CYCLES.find(x => x.key === bill.cycle);
  return (c && c.months) || 1;
}
function billCycleLabel(bill) {
  if (!bill) return '每月';
  if (bill.cycle === 'custom') return '每 ' + Math.max(1, Number(bill.cycle_months) || 1) + ' 个月';
  const c = BILL_CYCLES.find(x => x.key === bill.cycle);
  return c ? c.label : '每月';
}
function pad2(n) { return String(n).padStart(2, '0'); }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/* 两个日期相差天数（b - a） */
function dayDiff(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
/* 第 k 个到期日（k=0 从开始日期的当月算起） */
function billOccurrence(bill, k) {
  const start = (bill && bill.start_date) || todayStr();
  const sy = Number(start.slice(0, 4)), sm = Number(start.slice(5, 7));
  let y, m;
  if (bill.cycle === 'yearly') {
    y = sy + k;
    m = bill.due_month ? Number(bill.due_month) : sm;
  } else {
    const total = (sm - 1) + k * billEveryMonths(bill);
    y = sy + Math.floor(total / 12);
    m = (total % 12) + 1;
  }
  const day = Math.min(Math.max(1, Number(bill.due_day) || 1), daysInMonth(y, m));
  return y + '-' + pad2(m) + '-' + pad2(day);
}
/* 在 ref 附近枚举到期日，得到最近已到期 current 与最近将到期 next */
function billSchedule(bill, ref) {
  ref = ref || todayStr();
  const start = (bill && bill.start_date) || ref;
  const sy = Number(start.slice(0, 4)), sm = Number(start.slice(5, 7));
  const ry = Number(ref.slice(0, 4)), rm = Number(ref.slice(5, 7));
  const interval = billEveryMonths(bill);
  const md = (ry - sy) * 12 + (rm - sm);
  const k0 = Math.max(0, Math.floor(md / interval) - 2);
  const list = [];
  for (let i = -1; i <= 6; i++) {
    const k = k0 + i;
    if (k < 0) continue;
    const d = billOccurrence(bill, k);
    if (d >= start) list.push(d);
  }
  const uniq = [...new Set(list)].sort();
  const past = uniq.filter(d => d <= ref);
  const future = uniq.filter(d => d >= ref);
  return {
    list: uniq,
    current: past.length ? past[past.length - 1] : null,
    next: future.length ? future[0] : null
  };
}
/* 指定月份内的到期日（该周期在此月没有应期则返回 null） */
function billOccurrenceInMonth(bill, ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const start = (bill && bill.start_date) || todayStr();
  const sy = Number(start.slice(0, 4)), sm = Number(start.slice(5, 7));
  const interval = billEveryMonths(bill);
  const md = (y - sy) * 12 + (m - sm);
  const k0 = Math.max(0, Math.floor(md / interval) - 2);
  const first = ym + '-01', last = ym + '-' + pad2(daysInMonth(y, m));
  for (let i = -1; i <= 6; i++) {
    const k = k0 + i;
    if (k < 0) continue;
    const d = billOccurrence(bill, k);
    if (d >= first && d <= last && d >= start) return d;
  }
  return null;
}
/* 账单状态：待支付 / 逾期未处理 / 已支付 / 已暂停 / 已结束 */
function billStatus(bill, today) {
  today = today || todayStr();
  bill = billAutoBase(bill);
  // 展示用类型名：优先「小类」（大类+小类改造后），退回老字段 btype，最后是自定义
  const typeName = bill.sub || (bill.btype === BILL_CUSTOM_TYPE ? (bill.custom_type || '自定义') : bill.btype) || '账单';
  const displayName = typeName;
  const base = { meta: billTypeMeta(displayName), displayName, today, payMethod: billPayMethod(bill), auto: billAutoReady(bill) };
  if (bill.paused) {
    return Object.assign(base, { state: 'paused', label: '已暂停', cls: 'gray', dueDate: null, nextDate: null, paid: false, unpaid: false, paused: true, ended: false, daysSince: null, daysTo: null });
  }
  const sch = billSchedule(bill, today);
  const ym = today.slice(0, 7);
  const monthOcc = billOccurrenceInMonth(bill, ym);
  const paidPeriod = bill.paid_period || '';
  let ended = !!(bill.end_mode === 'date' && bill.end_date && today > bill.end_date);

  /* 期次优先级：历史的未付先算（逾期不能被本月未来应期掩盖）→ 本月应期 → 最近已到期 → 下一期 */
  const pastUnpaid = (sch.current && sch.current < today && !(paidPeriod && paidPeriod >= sch.current)) ? sch.current : null;
  let active = null, statusPaid = false;
  if (pastUnpaid) {
    active = pastUnpaid;
  } else if (monthOcc) {
    active = monthOcc;
    statusPaid = !!(paidPeriod && paidPeriod >= monthOcc);
  } else if (sch.current) {
    active = sch.current;
    statusPaid = !!(paidPeriod && paidPeriod >= sch.current);
  } else {
    /* 只剩下一期（还没到期）：只有「已付到这一期或更后」才算已付。
       注意不能只看 paidPeriod 有没有值 —— 自动付的账单起点会推进到创建日之后的第一期，
       老的下限期次（创建日前的补记）如果只判断「有值」，会把未来这一期误显示成已支付。 */
    active = sch.next;
    statusPaid = !!(paidPeriod && active && paidPeriod >= active);
  }

  const paid = statusPaid;
  let state, label, cls;
  if (ended) { state = 'ended'; label = '已结束'; cls = 'gray'; }
  else if (!active) { state = paidPeriod ? 'paid' : 'upcoming'; label = paidPeriod ? '已支付' : '待支付'; cls = paidPeriod ? 'green' : 'blue'; }
  else if (paid) { state = 'paid'; label = '已支付'; cls = 'green'; }
  else {
    const since = dayDiff(active, today);
    if (billAutoReady(bill)) {
      /* 自动付：不等待人工确认、也不进入逾期；「待自动入账」只是入账前的瞬时态
         （定时任务或前端补算失败时才会停留在这里） */
      state = 'auto';
      label = since >= 0 ? '待自动入账' : '待支付';
      cls = 'blue';
    } else if (since > 3) { state = 'overdue'; label = '逾期未处理'; cls = 'red'; }
    else { state = 'pending'; label = '待支付'; cls = 'amber'; }
  }

  let nextDate = null;
  if (active) nextDate = billSchedule(bill, addDays(active, 1)).next;
  const daysSince = active ? dayDiff(active, today) : null;
  const daysTo = active ? dayDiff(today, active) : null;
  return Object.assign(base, { state, label, cls, dueDate: active, nextDate, paid, unpaid: !paid && !ended, paused: false, ended, daysSince, daysTo });
}
/* 本月待付：该月有应期且尚未支付 */
function billDueThisMonth(bill, today) {
  today = today || todayStr();
  if (!bill || bill.paused) return false;
  bill = billAutoBase(bill);
  if (bill.end_mode === 'date' && bill.end_date && today > bill.end_date) return false;
  const occ = billOccurrenceInMonth(bill, today.slice(0, 7));
  if (!occ) return false;
  const paid = bill.paid_period || '';
  return !(paid && paid >= occ);
}
/* 年度固定支出总览：按类型统计全年预计支出 */
function billYearOverview(bills, year) {
  const y = String(year || new Date().getFullYear());
  const from = y + '-01-01', to = y + '-12-31';
  const map = {};
  (bills || []).forEach(b => {
    if (b.paused) return;
    let count = 0;
    for (let k = 0; k < 600; k++) {
      const d = billOccurrence(b, k);
      if (d > to) break;
      if (d < from) continue;
      if (b.start_date && d < b.start_date) continue;
      if (b.end_mode === 'date' && b.end_date && d > b.end_date) continue;
      count++;
    }
    if (!count) return;
    const name = b.sub || (b.btype === BILL_CUSTOM_TYPE ? (b.custom_type || '自定义') : (b.btype || '其他'));
    const amt = Number(b.preset_amount) || 0;
    const row = map[name] || (map[name] = { name, count: 0, amount: 0, hasAmount: false });
    row.count += count;
    row.amount += amt * count;
    if (amt > 0) row.hasAmount = true;
  });
  return Object.values(map).sort((a, b) => b.amount - a.amount);
}
/* 日期显示：M月D日（跨年补年份） */
function billDateText(d, withYear) {
  if (!d) return '—';
  const p = String(d).split('-');
  if (p.length < 3) return d;
  const sameYear = p[0] === String(new Date().getFullYear());
  return (!sameYear || withYear ? p[0] + '年' : '') + Number(p[1]) + '月' + Number(p[2]) + '日';
}
/* 周期文案：每月 15 日 / 每年 3 月 15 日 */
function billDueText(bill) {
  const day = Number(bill.due_day) || 1;
  if (bill.cycle === 'yearly') return '每年 ' + (Number(bill.due_month) || 1) + ' 月 ' + day + ' 日';
  return billCycleLabel(bill) + ' ' + day + ' 日';
}
