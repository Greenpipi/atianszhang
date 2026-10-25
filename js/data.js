/* ============ 默认数据与工具函数 ============ */

const DEFAULT_CFG = {
  url: 'https://qcfmknjoldqirsgjhryx.supabase.co',
  key: 'sb_publishable_5892YBRrQR_lE0raFn5eAQ_u5EWOy3J'
};

/* 背景头图默认插画：奶油底 + 满铺柳枝浆果纹样（Morris 风格，参考 Notion 植物封面） */
const HERO_DEFAULT_BG = 'assets/hero-default.jpg';

const LEDGER_PERSONAL = '个人记账本';

const DEFAULT_LEDGERS = [
  { name: LEDGER_PERSONAL, type: 'personal' }
];

const RENTAL_CAT = '出租屋';
const RENTAL_SUBS = ['房租', '水费', '电费', '燃气费', '物业费', '装修硬装费', '装修材料费', '租房软装', '搬家搬物'];
/* 出租屋子类图标与主题色 */
const RENTAL_META = {
  '房租': { emoji: '🏠', color: '#3B82F6' },
  '水费': { emoji: '💧', color: '#0EA5E9' },
  '电费': { emoji: '💡', color: '#F59E0B' },
  '燃气费': { emoji: '🔥', color: '#F97316' },
  '物业费': { emoji: '🧹', color: '#10B981' },
  '装修硬装费': { emoji: '🛠️', color: '#6366F1' },
  '装修材料费': { emoji: '🧱', color: '#84CC16' },
  '租房软装': { emoji: '🛋️', color: '#14B8A6' },
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
  { name: '日用品', subs: ['美容美发', '杂货', '家电', '收纳'] },
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
  '美容美发': '💦', '杂货': '📔', '家电': '⚡', '收纳': '🧺',
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
  { key: '已弃用', cls: 'dropped' }
];

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

const PALETTE = ['#3B82F6', '#34D399', '#F97316', '#0EA5E9', '#10B981', '#F59E0B', '#6366F1', '#84CC16', '#14B8A6', '#94A3B8'];

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
  [/奶茶|咖啡|饮料|饮品/, '🧋'],
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
function daysBetween(dateStr) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(todayStr() + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000));
}
function starsStr(n) {
  n = Math.round(Number(n) || 0);
  return n > 0 ? '★'.repeat(n) + '<span style="color:#E5E7EB">' + '★'.repeat(5 - n) + '</span>' : '';
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
