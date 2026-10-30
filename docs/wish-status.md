# 好物状态规则

> 2026-10-27 重做，**勿回退**。默认不读本文，改好物仓库逻辑时才读。

## 5 个状态

使用中 / 闲置中 / 未使用 / 已弃用 / 已磬用

- `records.status` 存**中文 label**（不是英文枚举）
- `records.status_since` 承载状态起始日，同时兼做「定格快照」载体

## ⚠️ 关键约束：线上没有 discarded_* 列

线上 `records` 表**没有** `discarded_days` / `discarded_cost` 列（已探测确认报错 42703）。

不要再设计任何依赖这两列的方案——加列要走 DDL，而现有约束是「不新增表/列」。

## 定格快照编码进 status_since

「已弃用 / 已磬用」的天数与每日成本，编码成一个字符串塞进 `status_since`：

```
'YYYY-MM-DD|天数|每日成本'
  弃用日    冻结天数  冻结每日成本
```

- `status_since` 是 text 列，所以**无需 DDL** 即可云端持久化
- 编解码：`parseWishSince()` / `fmtWishSince()`（`js/data.js` 全局函数）
- 读写一律走这两个函数，别自己 split

## 计算规则

| 状态 | 天数 | 每日成本 |
|---|---|---|
| 使用中 / 闲置中 | 从 `status_since` 持续累计到今天 | 价格 ÷ 天数 |
| 未使用 | 空串 → 0 天，显示「-」 | 「-」 |
| 已弃用 / 已磬用 | **切换当天定格**，之后永不变化 | 切换当天定格，永不变化 |

- 季节自动切换 **不得** 重置 `status_since`（这是历史 bug 的根源）
- 已弃用 ↔ 已磬用 互切时**保留**已有快照，不重新计算

## 自愈机制

`App.autoRepairWishData()`，在 `enterApp()` 里 `loadData()` 之后自动执行，幂等，手动锁定项不动。

- 设置页已**删除**「数据修复」入口，没有手动修复方法
- 缺陷窗口：`WISH_STATUS_BUG_DATES = ['2026-10-26', '2026-10-27']`
  - 成因：旧版季节切换写 `todayStr()`，把 5f89928 之前的 `status_since` 冲掉了
  - 自愈行为：窗口内且未锁定的「使用中/闲置中」→ 恢复为按购入日起算；「已弃用/已磬用」→ 按「购入日 → 弃用日」补定格快照

## 季节

- 配置键：`localStorage['fin_season_' + email]`
- 手动锁：`localStorage['fin_season_lock_' + email]`（锁定后季节切换不覆盖用户手选）
- `applySeasonStatus()` 在 `enterApp()` 里后台执行，不阻塞渲染

## 相关测试

`tests/verify-wish.js`、`tests/verify-live-wish.js`（线上 22 项）、`_scratch/probe-snapshot-col.js`（探测列存在性）
