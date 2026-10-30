# 自定义日历组件

> 2026-10-27 建成。**勿退回浏览器原生日期控件。** 默认不读本文。

## 铁律

**全站禁用原生 `date` / `month` / `number` 日期控件**，所有日期选择统一走自建日历。原生控件在各浏览器样式不一致、移动端难用，已被用户明确否掉。

## API

```js
App.openCalendar(inp, mode)
```

| 参数 | 说明 |
|---|---|
| `inp` | 触发它的输入框 DOM |
| `mode` | `'day'` \| `'month'` \| `'year'` —— 决定**提交粒度** |
| `view`（内部） | 决定当前面板层级，日 → 月 → 年三级联动 |

内部实现：
- `_renderCal()` 渲染面板
- `_calCommit(kind, val)` 提交选择

## 绑定写法（照抄）

```html
<input type="text" class="cal-input" readonly
       data-cal-mode="day" data-date="2026-10-30">
```

```js
inp.onclick = () => this.openCalendar(inp, 'day');
```

- `type` 必须是 `text`（宁可只读，也不要用 `type="date"`）
- 已选值放 `data-date` / `data-month` / `data-year`，跟 `data-cal-mode` 对应
- `readonly` 防止手机弹键盘

## 结构

popover 挂在 `document.body`（不是输入框内），避免被 `overflow:hidden` 的容器裁掉：

```
.cal-pop        z-index: 220
  └ .cal-card
```

## 样式

- 白底圆角卡片：`radius: 14px`
- 浅灰边框 + 柔和阴影
- `calIn .18s` 淡入
- 标题色 `#111827`、字重 800，**可点击进入下一级**（日 → 月 → 年）
- 今天 / 选中态：品牌蓝填充

## 已接入的 7 处

1. 出租屋月份跳转
2. 筛选浮层 —— 开始日期
3. 筛选浮层 —— 结束日期
4. 统计页 —— 月份
5. 统计页 —— 年份
6. 记账弹窗 —— 日期
7. 编辑弹窗 —— 日期

（外加快捷记账的日期，写法相同）

## ⚠️ 浮层互不误关

筛选浮层的 outside-click 判断**必须排除 `#cal-pop` 内的元素**，否则点日历本身会把筛选层关掉。

```js
if (e.target.closest('#cal-pop')) return;   // 别关筛选层
```

## 测试

- `tests/verify-calendar.js` —— 本地静态服务 + Supabase stub
- `tests/verify-calendar-live.js` —— 线上真实站点，26 项
- `tests/smoke-test.js` 内含 33 项日历断言
