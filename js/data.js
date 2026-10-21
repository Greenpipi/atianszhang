/* ============ 默认数据与工具函数 ============ */

const DEFAULT_CFG = {
  url: 'https://qcfmknjoldqirsgjhryx.supabase.co',
  key: 'sb_publishable_5892YBRrQR_lE0raFn5eAQ_u5EWOy3J'
};

const LEDGER_PERSONAL = '个人记账本';

const DEFAULT_LEDGERS = [
  { name: LEDGER_PERSONAL, type: 'personal' }
];

const RENTAL_CAT = '出租屋';
const RENTAL_SUBS = ['房租', '水费', '电费', '燃气费', '物业费', '装修硬装费', '装修材料费', '租房软装', '搬家搬物'];
/* 出租屋子类图标与主题色 */
const RENTAL_META = {
  '房租': { emoji: '🏠', color: '#4E8A5A' },
  '水费': { emoji: '💧', color: '#4C8DB5' },
  '电费': { emoji: '💡', color: '#C9A227' },
  '燃气费': { emoji: '🔥', color: '#C96F4A' },
  '物业费': { emoji: '🧹', color: '#7A8B99' },
  '装修硬装费': { emoji: '🛠️', color: '#8A7A5F' },
  '装修材料费': { emoji: '🧱', color: '#A0765A' },
  '租房软装': { emoji: '🛋️', color: '#9B7BA6' },
  '搬家搬物': { emoji: '📦', color: '#6E8B3D' }
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
const QUICK_SECTION_TITLE = {
  '日常支出板块': '日常支出',
  '爱好就是一切板块': '爱好就是一切',
  '旅游外出板块': '旅游外出'
};
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

const PALETTE = ['#4E8A5A', '#C9A227', '#4C8DB5', '#C96F4A', '#7A8B99', '#9B7BA6', '#6E8B3D', '#A0765A', '#5B8C6E', '#94A3B8'];

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
/* 分类 emoji：按内置模板匹配，出租屋/收入等无模板的走兜底 */
const CAT_EMOJI_FALLBACK = { '出租屋': '🏠', '综合收入': '💰' };
function catEmoji(cat) {
  if (CAT_EMOJI_FALLBACK[cat]) return CAT_EMOJI_FALLBACK[cat];
  const t = DEFAULT_TEMPLATES.find(t => t.category === cat);
  return t ? (t.emoji || '💸') : '💸';
}
function daysBetween(dateStr) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(todayStr() + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000));
}
function starsStr(n) {
  n = Math.round(Number(n) || 0);
  return n > 0 ? '★'.repeat(n) + '<span style="color:#E3E7EE">' + '★'.repeat(5 - n) + '</span>' : '';
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
