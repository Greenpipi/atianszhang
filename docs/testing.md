# 测试规范

> 2026-10-30 目录重组后，测试脚本移到了 `tests/`。默认不读本文。

## 目录

脚本全部在 `E:/Workbuddy/账册/` 下（**仓库外**，不进版本控制）。

| 路径 | 内容 |
|---|---|
| `tests/` | 回归测试套件（改动后要跑） |
| `tools/` | DDL 工具（建表 / 补列） |
| `_scratch/` | 一次性调试脚本（历史问题已修，仅备查） |
| `_scratch/shots/` | 截图脚本；`_scratch/shots/output/` 存截图产物 |

## ⚠️ 移层后必改：__dirname

脚本原本平铺在根目录，写的是 `__dirname + '/finance-app/js/data.js'`。移进 `tests/` / `tools/` 后**少一层**：

```js
// 旧（失效）
fs.readFileSync(__dirname + '/finance-app/js/data.js')
// 新
fs.readFileSync(__dirname + '/../finance-app/js/data.js')
```

playwright 的 chromium 用的是绝对路径（`C:/Users/Administrator/.workbuddy/binaries/node/workspace/...`），不受影响。

**第一次跑某个脚本前先搜一遍 `__dirname`，把路径补齐。**

## tests/ 清单

| 脚本 | 用途 |
|---|---|
| `smoke-test.js` | 主冒烟。jsdom + Supabase stub，登录 → 加载 → 全视图 → 标签 → 迁移全断言。**改任何页面都要跑** |
| `e2e-cloud.js` | 真实 Supabase 端到端 |
| `test-import.js` | import.html 导入流程 |
| `verify-budget.js` | 预算页 33 项断言 |
| `verify-calendar.js` | 日历组件（本地静态服务 + stub） |
| `verify-calendar-live.js` | 日历组件（线上，26 项） |
| `verify-wish.js` | 好物新功能 |
| `verify-live-wish.js` | 好物状态与自愈（线上，22 项） |
| `verify-bill-amt.js` | 待办账单金额就地填写 + 出租屋固定费用同源 |
| `verify-rental-scope.js` | 出租屋统计范围切换 |
| `verify-route-persist.js` | 刷新后停在当前页 |

## 跑法

```bash
cd E:/Workbuddy/账册

# 冒烟（纯 node + jsdom，不需要浏览器）
node tests/smoke-test.js

# 真实云端 E2E
BASE_URL=https://greenpipi.github.io/atianszhang/ node tests/e2e-cloud.js --auth <email> <password>

# 需要浏览器/静态服务的
node tests/verify-calendar.js
```

本地静态服务（需要 http 环境时）：
```bash
cd finance-app && python -m http.server 8080
```

## 关键技术手法

### 1. stub Supabase（jsdom 场景）

`chain()` 需要覆盖 `banners` 的 upsert / single 分支，否则 banner 相关断言过不去。

### 2. 线上验证要屏蔽真实 SDK（最容易踩）

`verify-live-wish.js` 一类线上脚本：真实 SDK 会覆盖注入的 stub，导致登录卡住。必须先 abort 掉：

```js
await page.route('**/js/vendor/supabase.js', r => r.abort());
await page.addInitScript(stubCode);
```

### 3. 截图脚本的持久化

`shot.js` 把 stub 的 banners 持久化到 `fin_stub_banner`，保证 reload 后配置仍在，才能测「刷新后头图保持」。

### 4. 几何/布局验证

`_scratch/dbg-layout.js`（playwright + Edge）验证导航栏、标题栏、头图的贴合关系。**改布局后必跑。**

## tools/ 清单

| 脚本 | 用途 |
|---|---|
| `apply-schema.js` | 直连 Postgres 跑 `supabase-schema.sql` |
| `apply-schema-api.js` | 走 Management API 跑同一份 SQL |
| `add-cols.js` | 给 records 补 3 个幂等列 |

密码由用户口头给，**不要写进任何文件**，见 `database.md`。
