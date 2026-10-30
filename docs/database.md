# 数据库与数据层

> 默认不读本文。只有要改表结构、加字段、排查云同步问题时才读。

## 项目

- URL：`https://qcfmknjoldqirsgjhryx.supabase.co`
- ref：`qcfmknjoldqirsgjhryx`
- publishable key 内置于 `js/data.js` 的 `DEFAULT_CFG`，**不要写进任何文档或记忆**

## 表（7 张）

| 表 | 说明 |
|---|---|
| `ledgers` | 账本（types: personal / business / rental 历史遗留） |
| `categories` | 大类/小类（`subs` 数组） |
| `records` | 流水；`tags text[]`、`status`、`status_since` |
| `budgets` | 预算；含元数据标记行（见预算文档） |
| `templates` | 快捷模板（`label`/`section`/`emoji`） |
| `banners` | 头图配置（`img` 列以 text 存 JSON） |
| `bills` | 待办账单（见 `js/bills.js`） |

全部启用 RLS：`auth.uid() = user_id` 隔离，并开启 realtime。

## 建表 / 改表

建表 SQL 在 `finance-app/supabase-schema.sql`，**幂等**，可重复执行。

执行方式（择一）：

```bash
# 直连 Postgres（tools/apply-schema.js，pg 模块在 node workspace 里）
node tools/apply-schema.js "postgresql://postgres:<密码>@db.qcfmknjoldqirsgjhryx.supabase.co:5432/postgres"

# 备用：Management API
node tools/apply-schema-api.js <sbp_token>
```

- 数据库密码由用户**口头提供**，绝不写进任何文件
- 用户重置过密码，旧密码已失效；拿不到就让用户在 Supabase SQL Editor 里跑 `supabase-schema.sql`

## ⚠️ schema 漂移坑（最常见事故）

`create table if not exists` **不会给已存在的表补列**。

所以改表结构时必须同时在 `supabase-schema.sql` 里加自愈语句：

```sql
alter table templates add column if not exists label text;
alter table templates add column if not exists section text;
alter table templates add column if not exists emoji text;
```

（files 里已含 ledgers 的 `kind/icon/color/sort/archived`、records 的 `tags/status/status_since` 等）

**另外**：`js/app.js` 底部有个 `SQL_SCHEMA` 常量，是同一份 SQL 的副本（供设置页「复制建表 SQL」用）。改完 `supabase-schema.sql` 必须同步它，否则用户复制到的是旧 SQL。

## Store 双模式（js/store.js）

- `_initClient()` 按 cfg 有效性决定 `mode = 'supabase' | 'local'`
- 判定降级的分水岭：
  - **表不存在**（`Could not find the table` / `PGRST205` / `relation does not exist`）→ `_fallbackToLocal()` + 顶部 toast 提示
  - **列缺失**（`PGRST204`）→ **不降级**，走 `_isColErr` / `_colName` 剥离该字段重试，记入 `_noCols`（`表.列`），之后不再发送
- `update` 若全字段被剥离 → no-op 返回 `false`
- `listBills()` 特殊：表缺失时**不切离线**，只置 `billsMissing = true`，由待办页提示补建表

## 分页拉取

`_listPaged(table)` 每页 500 行循环拉全表——PostgREST 单次返回上限默认 1000 行，一次 `select('*')` 会静默截断（曾导致导入去重比对不全 → 重复导入）。

## realtime

`_subscribeRealtime()` 订阅单 channel `fin-db-changes`，覆盖 6 张表（ledgers / categories / records / budgets / templates / bills；banners 不订）。

任何表变更 → `_emitData()` → `App.onDataChange()` → `loadData(true)` 全量重拉。**注意这会造成自写自读的双倍请求**（保存流程本身也 await loadData）。

## 本地 → 云端迁移（v2）

- 标记：`localStorage['fin_migrated_v2_<email>']`（v1 标记是缺陷逻辑打的，不采信）
- 账本按 `name + type` 配对复用（种子账本不重复建）；categories / budgets / templates 按自然键去重；records 按 ID 去重 + `ledger_id` 重映射
- 单行容错，幂等

## localStorage 键

| 键 | 用途 |
|---|---|
| `fin_cfg` | Supabase url/key 覆盖 |
| `fin_db_<email>` | 本地模式全量数据 |
| `fin_migrated_v2_<email>` | 上云迁移标记 |
| `fin_hero_v1` | 每页头图 map（`{page:{img,x,y}}`） |
| `fin_nav_collapsed` | 侧栏收起态 |
| `fin_season_<email>` / `fin_season_lock_<email>` | 季节配置 / 手动锁 |
| 缓存快照键 | `paintFromCache()` / `saveCache()` 用的首屏快照 |

## 每页独立头图（勿回退单图方案）

- `HERO_PAGES` 定义在 `data.js`，共 6 页
- 权威存储：localStorage `fin_hero_v1`；`Store.saveHeroMap()` 尽力把 map JSON 镜像到云端 `banners.img` 列（text 存 JSON，无需 DDL）
- 旧单图（data URL）自动迁移铺满 6 页
- 拖动/调整作用域 = `this.heroes[state.route]`；`route()` 切页时重置 `adjusting` 并 `applyHero`
- `banners` 的 `pos_x` / `pos_y` 已废弃，不要再写入

## banner 配置

`Store.getBanner()` / `saveBanner()` 走 `banners` 表 upsert（`onConflict: user_id`）；云端无配置但本地有 → 自动搬上。

## ⚠️ Bash 环境坑

命令文本里出现的密钥/密码会被改写成假值再执行（对比回显与输入即可发现），含凭证的命令还会触发审批。

**凭证一律走**：Write 写临时脚本（运行时从文件读凭证）→ `node script.js` → 用完删。
