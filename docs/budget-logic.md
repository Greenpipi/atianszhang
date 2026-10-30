# 预算设置页逻辑

> 2026-10-30 重构为「年度总控 + 关注类目月度规划」。默认不读本文。

## 页面结构

`App.renderBudget()` 全量重写，从上到下：

1. **年度总控卡** —— 可输入年度总预算；显示 总预算 / 已用 / 剩余 三格 + 进度条 + 进度文案
2. **感兴趣的类目（月度规划）表** —— 表头：关注类目 | 小类 | 月度限额 | 本月已用 | 进度
3. **颜色规则卡**

## ⚠️ 存储约束：不新增表、不新增列

预算元数据复用 `budgets` 的**标记行**（云端无需任何 DDL）：

```js
// 年度总预算
{ category: '__annual__', sub: '<年份>', amount: <年度总预算> }

// 关注的类目（JSON 数组，元素形如 "大类::小类"）
{ category: '__follow__', sub: '', note: '["餐饮::早餐","交通::油费"]' }
```

常量在 `app.js` 顶部：`BUDGET_ANNUAL` / `BUDGET_FOLLOW` / `isBudgetMeta(b)`

**铁律**：所有遍历 `budgets` 的地方（`budgetAlerts()` 等）都必须用 `!isBudgetMeta(b)` 过滤，否则标记行会被当成预算参与计算。

## 计算口径

- **年度已用** = 该账本**全年支出**记录合计，**包含未关注类目**
- 月度表**只渲染关注项**
- `yearSummary(ledgerId, year)`：按 `date.slice(0, 4)` 归年，收入/支出分离
- `followKeys()`：无 `__follow__` 行时，回退成「已有 `amount > 0` 的预算类目」（老数据平滑过渡）

## 阈值配色

| 区间 | 颜色 |
|---|---|
| < 80% | 绿 |
| 80% – 100% | 橙 `var(--warn)` |
| > 100% | 红 |

- 超支行的「本月已用」数字同步变色（`.tbl .num.over` / `.tbl .num.warn`）
- 未设限额但有消费 → 虚线占位条 + 「未设置月度预算，建议补充」

## ⚠️ 两个 CSS 坑

1. **占位虚线进度条必须用 `.bar.blank`**
   不能用 `.bar.empty` —— `.empty` 是全局空状态样式（`padding: 46px`），会把 9px 的条撑成大块。

2. **窄屏 media 块必须放 `styles.css` 最末尾**
   `≤760px` 时表格转成「每类目一张行卡」：
   ```css
   display: grid;
   grid-template-areas: "cat limit" "sub limit" "used used" "prog prog";
   ```
   thead 隐藏，`::before` 补「月度限额 / 本月已用」标签。
   如果这个 media 块不在文件末尾，`.tbl td { padding: 11px 12px }` 和 `.tbl .num { text-align: right }` 会盖掉它；`.bc-used` 的 `text-align: left` 需要 `.tbl.budget-tbl .bc-used` 提权。

## 关注类目选择器

`openFollowPicker()`：分类树弹窗 `.modal.follow-modal`

- 大类整组勾选，支持 `indeterminate` 半选态
- 右上角 n/m 计数
- 三个动作：全不选 / 取消 / 确定
- 排序按**分类管理里的原始大类→小类顺序**（不是字面排序）

## 侧栏导航

`index.html` 里静态写的 7 个 `<a class="nav-item">`，**没有** menuList / 拖拽配置。

当前顺序：记账本 → 好物仓库 → 待办账单 → 出租屋 → 预算设置 → 统计 → 设置

调顺序直接调换 HTML 块即可，图标/路由/`data-route` 跟着块走；`bills-badge` 红点在待办账单块内，随块移动。

## 相关测试

`tests/verify-budget.js`（33 项断言）；截图脚本在 `_scratch/shots/shot-budget.js`
