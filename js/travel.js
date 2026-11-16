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
    { id: 'paper', name: '暖纸', desc: '奶油纸感 · 陶土红' },
    { id: 'ocean', name: '海盐', desc: '海雾青蓝 · 珊瑚橙' },
    { id: 'ink', name: '墨夜', desc: '夜墨底色 · 鎏金线条' }
  ];

  const THEME_COLORS = {
    bloom: { bg: '#f8ece9', surface: '#fff8f5', ink: '#3a2628', soft: '#7c5c5e', faint: '#a98a8c', line: 'rgba(58,38,40,.16)', accent: '#a34a5a', accent2: '#6d7f6a', sun: '#d9a05a' },
    paper: { bg: '#f2ebdd', surface: '#fbf6e9', ink: '#23251c', soft: '#5c5b4b', faint: '#8d8876', line: 'rgba(35,37,28,.16)', accent: '#bf4f2a', accent2: '#2e5c4e', sun: '#d9a02a' },
    ocean: { bg: '#eaf2f2', surface: '#fbfefe', ink: '#17323b', soft: '#4e6b73', faint: '#7d969d', line: 'rgba(23,50,59,.16)', accent: '#2f6d78', accent2: '#c07a4a', sun: '#7fa8a3' },
    ink: { bg: '#15181a', surface: '#1f2427', ink: '#f0e9da', soft: '#b8b2a4', faint: '#8b867b', line: 'rgba(240,233,218,.18)', accent: '#d9b46a', accent2: '#8fa89b', sun: '#d9b46a' }
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
      { id: 'me', name: '我', initial: '我', cls: 'me' },
      { id: 'xiaoyu', name: '小雨', initial: '小', cls: 'xiaoyu' },
      { id: 'azhe', name: '阿哲', initial: '哲', cls: 'azhe' }
    ];
  }

  /* ---------------- 示例数据 ---------------- */
  function seedState() {
    const dali = {
      id: 'trip-dali',
      title: '大理，四天三夜',
      destination: '大理',
      startDate: '2026-11-15',
      endDate: '2026-11-18',
      budget: 6000,
      createdAt: 1,
      cover: photo('dali ancient town travel photography, cangshan mountain and erhai lake in distance, warm autumn afternoon, film grain, dreamy travel journal cover', 'portrait_4_3'),
      members: [
        { id: 'me', name: '我', initial: '我', cls: 'me' },
        { id: 'xiaoyu', name: '小雨', initial: '小', cls: 'xiaoyu' },
        { id: 'azhe', name: '阿哲', initial: '哲', cls: 'azhe' }
      ],
      days: [
        {
          day: 1, date: '2026-11-15', city: '大理古城', theme: '抵达 · 古城慢逛', weather: '晴 19°',
          photo: photo('dali ancient town stone street with wooden houses and red lanterns, warm sunlight, travel snapshot', 'landscape_4_3'),
          activities: [
            { id: 'a1', time: '09:10', title: '昆明南 → 大理', place: '动车 D8656 · 2 小时 10 分', note: '', cost: 435 },
            { id: 'a2', time: '13:40', title: '入住古城民宿', place: '人民路下段 · 15:00 后可入住', note: '', cost: 0 },
            { id: 'a3', time: '16:00', title: '古城闲逛 · 五华楼', place: '复兴路 · 人民路', note: '', cost: 0 },
            { id: 'a4', time: '19:00', title: '再回首凉鸡米线', place: '古城南门', note: '', cost: 86 }
          ]
        },
        {
          day: 2, date: '2026-11-16', city: '洱海西岸', theme: '环海 · 稻田与咖啡', weather: '晴 21°',
          photo: photo('erhai lake west shore golden rice fields, bicycle road, yunnan countryside, warm afternoon light, travel photo', 'landscape_4_3'),
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
          photo: photo('shuanglang lakeside sunset over erhai lake, orange sky, silhouettes of boats, travel journal', 'landscape_4_3'),
          activities: [
            { id: 'a10', time: '09:00', title: '南诏风情岛', place: '双廊码头 · 船票 + 门票', note: '', cost: 150 },
            { id: 'a11', time: '13:00', title: '海地生活 · 玻璃球拍照', place: '双廊环海路', note: '', cost: 0 },
            { id: 'a12', time: '17:30', title: '鹿卧山看日落', place: '环海东路', note: '', cost: 0 },
            { id: 'a13', time: '20:00', title: '深夜烧烤 + 风花雪月', place: '双廊镇口', note: '', cost: 156 }
          ]
        },
        {
          day: 4, date: '2026-11-18', city: '大理 → 昆明', theme: '返程 · 下次再见', weather: '晴 20°',
          photo: photo('yunnan rice noodle breakfast on rustic wooden table, steam, morning light, travel memory', 'landscape_4_3'),
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
          payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '两层小院，天台能看见苍山', expenseId: 'e1',
          photo: photo('boutique guesthouse courtyard in dali with wooden beams, plants and warm lantern light', 'landscape_4_3')
        },
        {
          id: 'h2', name: '云七 · 双廊海景民宿', address: '大理市双廊镇环海东路',
          checkIn: '2026-11-17', checkOut: '2026-11-18', amount: 780,
          payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '阳台正对洱海，早上有海鸥', expenseId: 'e9',
          photo: photo('seaside guesthouse balcony facing erhai lake, white curtains, morning light', 'landscape_4_3')
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

    const kyoto = {
      id: 'trip-kyoto',
      title: '京都，追一场红叶',
      destination: '京都',
      startDate: '2026-11-05',
      endDate: '2026-11-08',
      budget: 12000,
      createdAt: 2,
      cover: photo('kyoto autumn temple with red maple leaves, traditional wooden street, soft film photography, travel journal cover', 'portrait_4_3'),
      members: defaultMembers(),
      days: [
        {
          day: 1, date: '2026-11-05', city: '清水寺 · 二年坂', theme: '初见 · 红叶与石阶', weather: '晴 17°',
          photo: photo('kiyomizu dera temple wooden stage above red and orange autumn leaves, kyoto, clear day', 'landscape_4_3'),
          activities: [
            { id: 'k1', time: '10:20', title: '关西机场 → 京都', place: 'HARUKA 特急', note: '', cost: 0 },
            { id: 'k2', time: '14:00', title: '清水寺参拜', place: '音羽山 · 清水舞台', note: '', cost: 400 },
            { id: 'k3', time: '17:00', title: '二年坂散步', place: '石塀小路 · 八坂塔', note: '', cost: 0 }
          ]
        },
        {
          day: 2, date: '2026-11-06', city: '伏见稻荷 · 宇治', theme: '千本鸟居 · 抹茶', weather: '多云 16°',
          photo: photo('fushimi inari shrine thousands of red torii gates path, kyoto, soft morning light', 'landscape_4_3'),
          activities: [
            { id: 'k4', time: '08:30', title: '伏见稻荷大社', place: '千本鸟居 · 稻荷山', note: '', cost: 0 },
            { id: 'k5', time: '13:00', title: '宇治平等院', place: '宇治川 · 抹茶一条街', note: '', cost: 700 }
          ]
        },
        {
          day: 3, date: '2026-11-07', city: '岚山 · 竹林', theme: '竹林 · 小火车', weather: '晴 18°',
          photo: photo('arashiyama bamboo grove path with sunlight rays, kyoto, green and gold tones', 'landscape_4_3'),
          activities: [
            { id: 'k6', time: '09:00', title: '岚山竹林', place: '嵯峨野', note: '', cost: 0 },
            { id: 'k7', time: '11:00', title: '嵯峨野小火车', place: 'トロッコ嵯峨站', note: '', cost: 880 }
          ]
        },
        {
          day: 4, date: '2026-11-08', city: '京都 → 上海', theme: '返程 · 带回一片红叶', weather: '阴 15°',
          photo: photo('kyoto station modern architecture at dusk, travelers with luggage, autumn evening', 'landscape_4_3'),
          activities: [
            { id: 'k8', time: '10:00', title: '锦市场买手信', place: '锦小路通', note: '', cost: 0 },
            { id: 'k9', time: '15:30', title: '京都 → 关西机场', place: 'HARUKA 特急', note: '', cost: 0 }
          ]
        }
      ],
      hotels: [
        {
          id: 'kh1', name: '町家旅馆 · 五条', address: '京都市下京区五条通',
          checkIn: '2026-11-05', checkOut: '2026-11-08', amount: 3600,
          payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '木造町家，晚上能听见风铃', expenseId: 'ke1',
          photo: photo('traditional kyoto machiya wooden townhouse interior, tatami and small garden', 'landscape_4_3')
        }
      ],
      expenses: [
        { id: 'ke1', hotelId: 'kh1', day: 1, date: '2026-11-05', category: 'stay', title: '町家旅馆 · 五条（3 晚）', amount: 3600, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'ke2', day: 1, date: '2026-11-05', category: 'transport', title: '关西机场 → 京都 HARUKA ×3', amount: 480, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'ke3', activityId: 'k2', day: 1, date: '2026-11-05', category: 'ticket', title: '清水寺门票 ×3', amount: 60, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'ke4', day: 2, date: '2026-11-06', category: 'food', title: '宇治抹茶甜品', amount: 168, payerId: 'me', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'ke5', activityId: 'k7', day: 3, date: '2026-11-07', category: 'fun', title: '嵯峨野小火车 ×3', amount: 132, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true }
      ],
      journals: [
        { id: 'kj1', day: 1, date: '2026-11-05', mood: 'look', weather: '晴 · 清水寺', created: 1, text: '第一次看到这么红的枫叶，像有人把整座山点燃了。站在清水舞台往下看，人群像缓慢流动的河。' },
        { id: 'kj2', day: 3, date: '2026-11-07', mood: 'free', weather: '晴 · 岚山', created: 2, text: '竹林里风一吹，沙沙声从头顶盖下来。什么都没做，只是慢慢走，也觉得这一天很完整。' }
      ]
    };

    const quanzhou = {
      id: 'trip-quanzhou',
      title: '泉州，刺桐旧巷',
      destination: '泉州',
      startDate: '2026-06-13',
      endDate: '2026-06-15',
      budget: 3000,
      createdAt: 3,
      cover: photo('quanzhou old town red brick lanes, kaiyuan temple twin pagodas, southern fujian architecture, warm evening light, travel journal cover', 'portrait_4_3'),
      members: defaultMembers(),
      days: [
        {
          day: 1, date: '2026-06-13', city: '西街 · 开元寺', theme: '红砖厝 · 半城烟火', weather: '晴 30°',
          photo: photo('quanzhou west street old town with red brick buildings and kaiyuan temple pagodas, evening lights', 'landscape_4_3'),
          activities: [
            { id: 'q1', time: '11:00', title: '西街闲逛', place: '钟楼 · 开元寺', note: '', cost: 0 },
            { id: 'q2', time: '15:00', title: '开元寺', place: '东西塔 · 古桑树', note: '', cost: 0 },
            { id: 'q3', time: '19:00', title: '面线糊 + 土笋冻', place: '水门巷', note: '', cost: 58 }
          ]
        },
        {
          day: 2, date: '2026-06-14', city: '蟳埔村 · 海边', theme: '簪花围 · 海风', weather: '多云 29°',
          photo: photo('xunpu village women with flower hair ornaments, oyster shell houses, quanzhou coast', 'landscape_4_3'),
          activities: [
            { id: 'q4', time: '09:30', title: '蟳埔村簪花', place: '蟳埔妈祖庙附近', note: '', cost: 120 },
            { id: 'q5', time: '15:00', title: '洛阳桥', place: '洛阳江入海口', note: '', cost: 0 }
          ]
        },
        {
          day: 3, date: '2026-06-15', city: '泉州 → 回家', theme: '最后一碗四果汤', weather: '晴 31°',
          photo: photo('quanzhou street food four fruits soup dessert on table, summer afternoon', 'landscape_4_3'),
          activities: [
            { id: 'q6', time: '10:00', title: '承天寺', place: '南俊路', note: '', cost: 0 },
            { id: 'q7', time: '14:00', title: '返程', place: '泉州站', note: '', cost: 0 }
          ]
        }
      ],
      hotels: [
        {
          id: 'qh1', name: '西街民宿 · 红砖小院', address: '泉州市鲤城区西街',
          checkIn: '2026-06-13', checkOut: '2026-06-15', amount: 640,
          payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '天井里有棵石榴树', expenseId: 'qe1',
          photo: photo('traditional southern fujian red brick courtyard guesthouse with pomegranate tree', 'landscape_4_3')
        }
      ],
      expenses: [
        { id: 'qe1', hotelId: 'qh1', day: 1, date: '2026-06-13', category: 'stay', title: '西街民宿（2 晚）', amount: 640, payerId: 'xiaoyu', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'qe2', activityId: 'q3', day: 1, date: '2026-06-13', category: 'food', title: '面线糊 + 土笋冻', amount: 58, payerId: 'azhe', participants: ['me', 'xiaoyu', 'azhe'], note: '', sync: true },
        { id: 'qe3', activityId: 'q4', day: 2, date: '2026-06-14', category: 'fun', title: '蟳埔簪花 + 拍照', amount: 120, payerId: 'me', participants: ['xiaoyu'], note: '只有小雨拍了', sync: true }
      ],
      journals: [
        { id: 'qj1', day: 1, date: '2026-06-13', mood: 'happy', weather: '晴 · 西街', created: 1, text: '红砖厝在夕阳里像刚出炉的面包。西街的钟楼下人来人往，面线糊热得刚好。' }
      ]
    };

    return {
      version: 2,
      theme: 'bloom',
      view: 'library',
      activeTripId: 'trip-dali',
      tab: 'overview',
      filterCat: 'all',
      trips: [dali, kyoto, quanzhou]
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

  function normalizeState(s) {
    if (!s || !Array.isArray(s.trips)) return seedState();
    if (!s.theme || !THEMES.some(t => t.id === s.theme)) s.theme = 'bloom';
    if (s.view !== 'trip') s.view = 'library';
    if (!s.trips.length) s.view = 'library';
    if (s.view === 'trip' && !s.trips.some(t => t.id === s.activeTripId)) s.view = 'library';
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
      if (t.budget == null) t.budget = 0;
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
    return seedState();
  }

  function ensureState() {
    const k = userKey();
    if (!state || stateKey !== k) {
      stateKey = k;
      state = loadFor(k);
    }
    return state;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_PREFIX + stateKey, JSON.stringify(state)); return true; }
    catch (e) { console.warn('保存旅行数据失败', e); return false; }
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
  function totalMyCents(t) {
    t = t || T();
    return t ? t.expenses.reduce((s, e) => s + shareCents(e, 'me'), 0) : 0;
  }
  function totalAllCents(t) {
    t = t || T();
    return t ? t.expenses.reduce((s, e) => s + cents(e.amount), 0) : 0;
  }
  function budgetCents(t) {
    t = t || T();
    return t ? cents(t.budget || 0) : 0;
  }

  function settlement() {
    const t = T();
    if (!t) return { rows: [], transfers: [], totalCents: 0 };
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
    const debtors = rows.filter(r => r.net < -0.5).map(r => ({ id: r.id, name: r.name, cents: -r.net })).sort((a, b) => b.cents - a.cents);
    const creditors = rows.filter(r => r.net > 0.5).map(r => ({ id: r.id, name: r.name, cents: r.net })).sort((a, b) => b.cents - a.cents);
    const transfers = [];
    let i = 0, j = 0, guard = 0;
    while (i < debtors.length && j < creditors.length && guard++ < 200) {
      const pay = Math.min(debtors[i].cents, creditors[j].cents);
      if (pay > 0) transfers.push({ from: debtors[i].name, fromId: debtors[i].id, to: creditors[j].name, toId: creditors[j].id, cents: pay });
      debtors[i].cents -= pay; creditors[j].cents -= pay;
      if (debtors[i].cents <= 0.5) i++;
      if (creditors[j].cents <= 0.5) j++;
    }
    return { rows, transfers, totalCents: totalAllCents(t) };
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
    const t = T();
    const target = resolveTarget(exp.category);
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

  function renderLibrary() {
    const trips = state.trips.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    const rots = [-2.4, 1.7, -1.3, 2.2, -1.8, 1.4];
    return '<section class="tv-library">' +
        '<div class="tv-lib-intro">' +
          '<div>' +
            '<span class="tv-eyebrow">My travel books</span>' +
            '<h3>我的旅行册</h3>' +
            '<p>每出发一次，就多一本贴满照片、票根和心情的手帐。点开一本翻看。</p>' +
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
                '<img src="' + esc(t.cover) + '" alt="' + esc(t.destination) + '" loading="lazy" data-act="edit-cover" data-id="' + esc(t.id) + '" title="点击更换封面">' +
                '<span class="tv-book-tape"></span>' +
                '<span class="tv-book-stamp">' + esc(String(t.destination || '旅').slice(0, 2)) + '</span>' +
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
          '<span>旅行明细保存在本机 · 账单按我的 AA 份额同步到记账本</span>' +
          '<button type="button" class="tv-link" data-act="reset-demo">恢复示例数据</button>' +
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
    const used = totalMyCents(t);
    const budget = budgetCents(t);
    const remain = budget - used;
    const pct = budget > 0 ? Math.min(100, Math.round(used / budget * 100)) : 0;
    const days = dateRange(t.startDate, t.endDate).length;
    return '<div class="tv-tripbar">' +
        '<button type="button" class="tv-back" data-act="back-library"><span>←</span> 全部旅行册</button>' +
        '<div class="tv-tripinfo">' +
          '<span class="tv-eyebrow">' + esc(t.destination) + ' · ' + days + ' 天</span>' +
          '<h3>' + esc(t.title) + '</h3>' +
          '<div class="tv-tripmeta">' +
            '<span>' + esc(shortDate(t.startDate)) + ' — ' + esc(shortDate(t.endDate)) + '</span>' +
            '<i></i>' +
            '<span>' + t.members.length + ' 人同行</span>' +
            '<div class="tv-people">' + t.members.map(m => '<span class="tv-avatar sm ' + esc(m.cls) + '" title="' + esc(m.name) + '">' + esc(m.initial) + '</span>').join('') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tv-trip-acts">' +
          '<button type="button" class="tv-chipbtn" data-act="edit-trip">编辑册子</button>' +
          '<button type="button" class="tv-budget-chip" data-act="edit-budget" title="修改预算">' +
            '<span>我的预算</span>' +
            '<b>' + (budget > 0 ? money(yuan(budget)) : '未设置') + '</b>' +
            '<em>' + (budget > 0 ? (remain >= 0 ? '剩 ' + money(yuan(remain)) : '超支 ' + money(yuan(-remain))) : '点这里设置') + '</em>' +
            '<i class="tv-budget-mini"><u style="width:' + pct + '%"></u></i>' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  function renderTabs(t) {
    const items = [
      ['overview', '总览', ''],
      ['plan', '行程', allActivities().length],
      ['journal', '日志', t.journals.length],
      ['expenses', '账本', t.expenses.length],
      ['hotels', '住宿', t.hotels.length],
      ['settle', '对账', '']
    ];
    return '<nav class="tv-tabs">' + items.map(it =>
      '<button type="button" class="tv-tab' + (state.tab === it[0] ? ' on' : '') + '" data-tab="' + it[0] + '">' +
        it[1] + (it[2] !== '' ? '<em>' + it[2] + '</em>' : '') +
      '</button>').join('') + '</nav>';
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
      '<img src="' + esc(src) + '" alt="' + esc(caption) + '" loading="lazy"' + (attrs ? ' ' + attrs : '') + '>' +
      '<figcaption>' + esc(caption) + '</figcaption>' +
      '<span class="tv-tape"></span>' +
    '</figure>';
  }

  /* ---------- 总览 ---------- */
  function renderOverview(t) {
    const s = settlement();
    const total = totalAllCents(t);
    const mine = totalMyCents(t);
    const budget = budgetCents(t);
    const remain = budget - mine;
    const per = t.members.length ? Math.round(total / t.members.length) : 0;
    const today = todayStr();
    const day = t.days.find(d => d.date === today) || t.days[0];
    const cats = CATS.map(c => Object.assign({}, c, {
      amount: t.expenses.filter(e => e.category === c.id).reduce((a, e) => a + cents(e.amount), 0)
    })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
    const catMax = Math.max.apply(null, cats.map(c => c.amount).concat([1]));
    const recent = t.journals.slice().sort((a, b) => (b.date + (b.created || 0)).localeCompare(a.date + (a.created || 0))).slice(0, 2);
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
        '<div class="tv-ticket">' +
          '<span class="tv-ticket-label">MY BUDGET</span>' +
          '<b>' + (budget > 0 ? money(yuan(budget)) : '未设置') + '</b>' +
          '<em>' + (budget > 0 ? (remain >= 0 ? '还剩 ' + money(yuan(remain)) : '超支 ' + money(yuan(-remain))) : '点这里设预算') + '</em>' +
          '<i><u style="width:' + (budget > 0 ? Math.min(100, Math.round(mine / budget * 100)) : 0) + '%"></u></i>' +
          '<span class="tv-ticket-edit" data-act="edit-budget">修改预算</span>' +
        '</div>' +
      '</div>' +
      '<div class="tv-stats">' +
        statCard('总花费', money(yuan(total)), t.expenses.length + ' 笔共同账单') +
        statCard('我的花费', money(yuan(mine)), '已按 AA 份额计算', 'accent') +
        statCard('人均', money(yuan(per)), t.members.length + ' 人均摊') +
        statCard(budget ? (remain >= 0 ? '预算剩余' : '预算超支') : '旅行预算', budget ? money(yuan(Math.abs(remain))) : '未设置', budget ? '预算 ' + money(yuan(budget)) : '点这里输入旅行预算', remain >= 0 ? '' : 'over', 'edit-budget') +
      '</div>' +
      '<div class="tv-grid2">' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>预算进度</h4><button type="button" class="tv-link" data-act="edit-budget">修改预算</button></div>' +
          budgetBar(budget, mine) +
          '<div class="tv-budget-note">预算按「我的花费」计算，不含朋友那份。' + (budget ? '' : ' 还没填预算，点上面的小票设置一个吧。') + '</div>' +
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
        '<section class="tv-panel tv-panel-day">' +
          '<div class="tv-panel-head"><h4>' + (day && day.date === today ? '今天 · DAY ' + day.day : '行程速览 · DAY ' + (day ? day.day : 1)) + '</h4><button type="button" class="tv-link" data-act="go-plan">全部行程</button></div>' +
          (day ? '<div class="tv-mini-day">' +
            (day.photo ? '<img class="tv-mini-photo" src="' + esc(day.photo) + '" alt="" loading="lazy">' : '') +
            '<div class="tv-mini-day-body">' +
              '<div class="tv-mini-day-head"><b>' + esc(day.city) + '</b><span>' + esc(cnDate(day.date)) + ' · ' + esc(day.weather || '') + '</span></div>' +
              day.activities.slice(0, 3).map(a => '<button type="button" class="tv-mini-act" data-act="edit-activity" data-id="' + a.id + '"><em>' + esc(a.time) + '</em><span>' + esc(a.title) + '</span></button>').join('') +
            '</div>' +
          '</div>' : '<p class="tv-empty">还没有行程，点上面「加行程」安排第一天。</p>') +
        '</section>' +
        '<section class="tv-panel">' +
          '<div class="tv-panel-head"><h4>最近日志</h4><button type="button" class="tv-link" data-act="go-journal">全部日志</button></div>' +
          (recent.length ? recent.map(j => {
            const mood = MOOD[j.mood] || MOOD.calm;
            return '<button type="button" class="tv-mini-journal" data-act="edit-journal" data-id="' + j.id + '">' +
              '<span class="tv-mood-dot" style="background:' + mood.color + '">' + mood.emoji + '</span>' +
              '<span class="tv-mini-journal-main"><b>' + esc(mood.label) + ' · ' + esc(shortDate(j.date)) + '</b>' + esc(j.text.slice(0, 36)) + (j.text.length > 36 ? '…' : '') + '</span>' +
            '</button>';
          }).join('') : '<p class="tv-empty">还没有日志，记录一下今天的心情。</p>') +
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
      '</section>';
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
            '<div class="tv-day-title"><h4>' + esc(day.city) + '</h4><p>' + esc(cnDate(day.date)) + ' · ' + esc(day.theme || '') + (day.weather ? ' · ' + esc(day.weather) : '') + '</p></div>' +
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
            ((j.photo || (d && d.photo)) ? '<img class="tv-postcard-photo" src="' + esc(j.photo || d.photo) + '" alt="" loading="lazy" data-act="edit-journal-photo" data-id="' + esc(j.id) + '" title="点击更换照片">' : '') +
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
  function renderHotels(t) {
    return '<div class="tv-section-head">' +
        '<div><span class="tv-eyebrow">Stays</span><h3>住宿酒店</h3><p>民宿 / 酒店可以有很多个。新增时会自动生成一笔住宿账单。</p></div>' +
        '<button type="button" class="tv-btn solid" data-act="new-hotel">＋ 加住宿</button>' +
      '</div>' +
      (t.hotels.length ? '<div class="tv-hotel-grid">' + t.hotels.map(h => {
        const nt = nights(h.checkIn, h.checkOut);
        const payer = member(h.payerId);
        return '<article class="tv-hotel" data-act="edit-hotel" data-id="' + h.id + '">' +
          (h.photo
            ? '<div class="tv-hotel-photo" data-act="edit-hotel-photo" data-id="' + h.id + '" title="点击更换照片"><img src="' + esc(h.photo) + '" alt="' + esc(h.name) + '" loading="lazy"><span class="tv-tape"></span></div>'
            : '<div class="tv-hotel-photo tv-hotel-photo-none" data-act="edit-hotel-photo" data-id="' + h.id + '" title="点击添加照片"><span class="tv-hotel-key">KEY</span></div>') +
          '<div class="tv-hotel-body">' +
            '<div class="tv-hotel-top"><span class="tv-hotel-night">' + nt + ' 晚</span><h4>' + esc(h.name) + '</h4><p>' + esc(h.address || '') + '</p></div>' +
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
          '</div>' +
        '</article>';
      }).join('') + '</div>' : '<p class="tv-empty big">还没有住宿记录。</p>');
  }

  /* ---------- 对账 ---------- */
  function renderSettle(t) {
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
        '<div class="tv-settle-title"><span>' + esc(t.title) + '</span><h3>' + money(yuan(s.totalCents)) + '</h3><p>' + esc(t.startDate) + ' — ' + esc(t.endDate) + ' · ' + t.members.length + ' 人</p></div>' +
        '<div class="tv-settle-mine"><span>我的花费</span><b>' + money2(yuan(totalMyCents(t))) + '</b><em>已按 AA 份额入账</em></div>' +
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
          (s.transfers.length ? '<div class="tv-transfer-list">' + s.transfers.map(tr => '<div class="tv-transfer">' +
            '<span class="tv-avatar sm ' + esc(member(tr.fromId).cls) + '">' + esc(member(tr.fromId).initial) + '</span>' +
            '<b>' + esc(tr.from) + '</b><i>→</i><span class="tv-avatar sm ' + esc(member(tr.toId).cls) + '">' + esc(member(tr.toId).initial) + '</span><b>' + esc(tr.to) + '</b>' +
            '<strong>' + money(yuan(tr.cents)) + '</strong>' +
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
      '<div class="field-row">' +
        field('我的预算（元）', '<input id="tv-t-budget" type="number" min="0" step="100" value="' + (data.budget || '') + '" placeholder="例如 6000">') +
        field('封面图片链接（可选）', '<input id="tv-t-cover" type="text" value="' + esc(data.cover || '') + '" placeholder="留空按目的地自动生成">') +
      '</div>' +
      '<p class="tv-form-tip">同行成员默认「我 / 小雨 / 阿哲」，可在账单里调整分摊。</p>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-t-del" style="margin-right:auto">删除这本</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-t-save">' + (editing ? '保存修改' : '创建旅行册') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);
    const del = m.querySelector('#tv-t-del');
    if (del) del.onclick = () => { App.closeModal(); deleteTrip(trip.id); };
    m.querySelector('#tv-t-save').onclick = () => {
      const title = m.querySelector('#tv-t-title').value.trim();
      const dest = m.querySelector('#tv-t-dest').value.trim() || defaultDest;
      const start = m.querySelector('#tv-t-start').dataset.date || todayStr();
      const end = m.querySelector('#tv-t-end').dataset.date || start;
      const budget = Number(m.querySelector('#tv-t-budget').value) || 0;
      const coverIn = m.querySelector('#tv-t-cover').value.trim();
      if (!title) return toast('请填写旅行册标题', 'err');
      if (!dest) return toast('请填写目的地', 'err');
      if (parseDate(end) < parseDate(start)) return toast('结束日期不能早于出发日期', 'err');
      const cover = coverIn || (trip && trip.cover) || photo(dest + ' travel scenery, film photography, travel journal cover', 'portrait_4_3');
      if (editing) {
        Object.assign(trip, { title: title, destination: dest, budget: budget, cover: cover });
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
          budget: budget,
          cover: cover,
          createdAt: Date.now(),
          members: defaultMembers(),
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

  /* ---------- 预算 ---------- */
  function openBudgetModal() {
    const t = T();
    if (!t) return;
    const m = openModal(
      modalTitle('设置旅行预算', '预算按我的花费计算，不含朋友那份') +
      field('预算金额（元）', '<input id="tv-budget-input" type="number" min="0" step="100" value="' + (t.budget || '') + '" placeholder="例如 6000">') +
      '<div class="tv-quick-amounts">' + [3000, 5000, 8000, 12000].map(v => '<button type="button" data-amount="' + v + '">' + v + '</button>').join('') + '</div>' +
      '<p class="tv-form-tip">当前我的花费已累计 <b>' + money2(yuan(totalMyCents())) + '</b></p>' +
      '<div class="modal-acts">' +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-budget-save">保存预算</button>' +
      '</div>'
    );
    if (!m) return;
    const input = m.querySelector('#tv-budget-input');
    m.querySelectorAll('[data-amount]').forEach(b => { b.onclick = () => { input.value = b.dataset.amount; input.focus(); }; });
    m.querySelector('#tv-budget-save').onclick = () => {
      const v = Number(input.value);
      if (!isFinite(v) || v < 0) return toast('请输入正确的预算金额', 'err');
      t.budget = Math.round(v);
      persist(); App.closeModal(); render();
      toast('预算已更新为 ' + money(t.budget), 'ok');
    };
    setTimeout(() => input.focus(), 80);
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
          ((pending || def) ? '<img src="' + esc(pending || def) + '" alt="">' : '<span>还没有照片</span>') +
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
    const setPreview = src => {
      if (src) {
        box.classList.remove('empty');
        box.innerHTML = '<img src="' + esc(src) + '" alt="">';
      } else {
        box.classList.add('empty');
        box.innerHTML = '<span>还没有照片</span>';
      }
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
      setPreview(def);
      m.querySelector('#tv-img-url').value = '';
      status.textContent = def ? '已恢复默认生成的图片。' : '保存后使用默认图片。';
    };

    const urlIn = m.querySelector('#tv-img-url');
    const useUrl = () => {
      const v = urlIn.value.trim();
      if (!v) return toast('先粘贴一个图片链接', 'err');
      pending = v;
      setPreview(v);
      status.textContent = '链接已预览，点「保存图片」生效。';
    };
    m.querySelector('#tv-img-use').onclick = useUrl;
    urlIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); useUrl(); } });

    m.querySelector('#tv-img-save').onclick = () => {
      const next = pending || def;
      if (!next) return toast('还没有选择图片', 'err');
      let old = '';
      if (kind === 'cover') { old = trip.cover || ''; trip.cover = next; }
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
    const m = openModal(
      modalTitle(editing ? '编辑账单' : '记一笔旅行账单', '这里填总额；记账本只记「我的 AA 份额」') +
      '<div class="field-row">' +
        field('账单名称', '<input id="tv-e-title" type="text" value="' + esc(data.title) + '" placeholder="例如 双廊渔家晚饭">') +
        field('总金额（元）', '<input id="tv-e-amount" type="number" min="0" step="0.01" value="' + (data.amount || '') + '" placeholder="0.00">') +
      '</div>' +
      '<div class="field-row">' +
        field('分类', '<select id="tv-e-cat">' + CATS.map(c => '<option value="' + c.id + '"' + (c.id === data.category ? ' selected' : '') + '>' + c.label + '</option>').join('') + '</select>') +
        field('日期', dateInput('tv-e-date', data.date)) +
      '</div>' +
      '<div class="field-row">' +
        field('谁付的钱', '<select id="tv-e-payer">' + memberOptions(data.payerId) + '</select>') +
        field('关联行程（可选）', '<select id="tv-e-act">' + activityOptions(data.activityId) + '</select>') +
      '</div>' +
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
      App.confirmDialog('删除账单', '「' + data.title + '」会从旅行账本和记账本一起删除。').then(ok => {
        if (!ok) return;
        if (e.recordId) dropRecord(e.recordId);
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
        category: m.querySelector('#tv-e-cat').value,
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
    const data = h || {
      name: '', address: '', checkIn: t.startDate, checkOut: t.endDate,
      amount: '', payerId: 'me', participants: t.members.map(m => m.id), note: ''
    };
    const hasExpense = !!(h && h.expenseId && t.expenses.some(e => e.id === h.expenseId));
    const m = openModal(
      modalTitle(editing ? '编辑住宿' : '加一个住宿', '一次旅行可以有很多个酒店 / 民宿') +
      '<div class="field-row">' +
        field('住宿名称', '<input id="tv-h-name" type="text" value="' + esc(data.name) + '" placeholder="例如 既下山 · 大理古城">') +
        field('房费总额（元）', '<input id="tv-h-amount" type="number" min="0" step="0.01" value="' + (data.amount || '') + '" placeholder="0.00">') +
      '</div>' +
      field('地址', '<input id="tv-h-address" type="text" value="' + esc(data.address) + '" placeholder="可选">') +
      '<div class="field-row">' +
        field('入住日期', dateInput('tv-h-in', data.checkIn)) +
        field('退房日期', dateInput('tv-h-out', data.checkOut)) +
      '</div>' +
      '<div class="field-row">' +
        field('谁付的钱', '<select id="tv-h-payer">' + memberOptions(data.payerId) + '</select>') +
        field('备注', '<input id="tv-h-note" type="text" value="' + esc(data.note) + '" placeholder="可选">') +
      '</div>' +
      '<div class="field"><label>谁参与分摊（AA）</label>' + memberChecks(data.participants) + '</div>' +
      '<div class="tv-sync-box">' + checkLine('tv-h-gen', '同时生成一笔住宿账单（并同步记账本我的份额）', editing ? hasExpense : true) + '</div>' +
      '<div class="modal-acts">' +
        (editing ? '<button type="button" class="btn btn-danger" id="tv-h-del" style="margin-right:auto">删除住宿</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" id="tv-h-save">' + (editing ? '保存' : '添加') + '</button>' +
      '</div>'
    );
    if (!m) return;
    bindControls(m);
    const del = m.querySelector('#tv-h-del');
    if (del) del.onclick = () => {
      App.confirmDialog('删除住宿', '「' + data.name + '」的住宿记录和关联账单会一起删除。').then(ok => {
        if (!ok) return;
        if (h.expenseId) {
          const exp = t.expenses.find(e => e.id === h.expenseId);
          if (exp && exp.recordId) dropRecord(exp.recordId);
          t.expenses = t.expenses.filter(e => e.id !== h.expenseId);
        }
        t.hotels = t.hotels.filter(x => x.id !== h.id);
        persist(); App.closeModal(); render();
        toast('住宿已删除', 'ok');
      });
    };
    m.querySelector('#tv-h-save').onclick = () => {
      const name = m.querySelector('#tv-h-name').value.trim();
      const amount = Number(m.querySelector('#tv-h-amount').value) || 0;
      const checkIn = m.querySelector('#tv-h-in').dataset.date || t.startDate;
      const checkOut = m.querySelector('#tv-h-out').dataset.date || checkIn;
      const participants = checkedIds(m);
      if (!name) return toast('请填写住宿名称', 'err');
      if (!participants.length) return toast('至少选一个分摊的人', 'err');
      if (parseDate(checkOut) < parseDate(checkIn)) return toast('退房日期不能早于入住日期', 'err');
      const patch = {
        name: name, address: m.querySelector('#tv-h-address').value.trim(),
        checkIn: checkIn, checkOut: checkOut,
        amount: Math.round(amount * 100) / 100,
        payerId: m.querySelector('#tv-h-payer').value || 'me',
        participants: participants,
        note: m.querySelector('#tv-h-note').value.trim()
      };
      let target = h;
      if (target) Object.assign(target, patch);
      else {
        target = Object.assign({ id: uid('h') }, patch);
        t.hotels.push(target);
      }
      const gen = m.querySelector('#tv-h-gen').checked && amount > 0;
      const linked = target.expenseId ? t.expenses.find(e => e.id === target.expenseId) : null;
      if (gen) {
        const expPatch = {
          hotelId: target.id,
          day: dayOfDate(checkIn),
          date: checkIn,
          category: 'stay',
          title: name + '（' + nights(checkIn, checkOut) + ' 晚）',
          amount: target.amount,
          payerId: target.payerId,
          participants: participants,
          note: target.note,
          sync: true
        };
        if (linked) Object.assign(linked, expPatch);
        else {
          const exp = Object.assign({ id: uid('e') }, expPatch);
          t.expenses.push(exp);
          target.expenseId = exp.id;
        }
        persist();
        syncRecord(linked || t.expenses.find(e => e.id === target.expenseId));
      } else if (linked) {
        if (linked.recordId) dropRecord(linked.recordId);
        t.expenses = t.expenses.filter(e => e.id !== linked.id);
        target.expenseId = '';
        persist();
      } else {
        persist();
      }
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
    g.fillText('成员分摊', 78, 350);
    s.rows.forEach((r, i) => {
      const y = 388 + i * 44;
      g.fillStyle = c.ink;
      g.font = '600 15px "PingFang SC", sans-serif';
      g.fillText(r.name, 78, y);
      g.fillStyle = c.faint;
      g.font = '12px "PingFang SC", sans-serif';
      g.fillText('已付 ' + money(yuan(r.paid)) + ' · 应摊 ' + money(yuan(r.share)), 148, y);
      g.fillStyle = r.net >= 0 ? c.accent2 : c.accent;
      g.font = '600 15px "PingFang SC", sans-serif';
      const txt = (r.net >= 0 ? '应收 ' : '应付 ') + money(yuan(Math.abs(r.net)));
      g.fillText(txt, W - 78 - g.measureText(txt).width, y);
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

  function resetDemo() {
    App.confirmDialog('恢复示例数据', '会清空当前所有旅行册，恢复为三本示例旅行册。确定吗？').then(ok => {
      if (!ok) return;
      state = seedState();
      stateKey = userKey();
      persist(); render();
      toast('已恢复示例旅行册', 'ok');
    });
  }

  /* ---------------- 对外 ---------------- */
  window.Travel = {
    render: render,
    state: function () { return state; }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (state && state.view) render();
    });
  }
})();
