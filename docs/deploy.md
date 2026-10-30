# 部署与推送

## 路径

| 用途 | 路径 |
|---|---|
| 工作区根 | `E:/Workbuddy/账册/` （**不是仓库**，散文件无版本控制） |
| git 仓库根 | `E:/Workbuddy/账册/finance-app/` |
| 线上 | https://greenpipi.github.io/atianszhang/ |
| 远端 | `https://github.com/Greenpipi/atianszhang.git` |

GitHub Pages 部署，无 Vercel / 无构建步骤。推上去 1–2 分钟自动生效。

## 分支映射（容易出错）

- 本地分支 `master`，远端部署分支 `main`
- 推送必须写双冒号映射：`git push origin master:main`
- 只写 `git push` 会推到 `origin/master`，**线上不会更新**

## 推送前检查

长时间没动这个项目时，其他会话可能已经推进了 main：

```bash
git fetch origin
git log --oneline HEAD..origin/main   # 有输出说明落后
git merge --ff-only origin/main
```

## 代理 502 / CONNECT tunnel 失败

现象：`schannel` 报错、`CONNECT tunnel failed, response 502`、`Connection reset`。

按顺序试：

1. **直连绕开本机代理**（2026-10-30 实测有效）：
   ```bash
   HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy= git push origin master:main
   ```
2. 还失败就重试几次（github.com:443 偶发抖动，重试常常就过）
3. 别急着改配置或 force push

## 工作流约定（2026-10-30 用户明确）

**只走云端验证，不要求用户在本地跑 localhost。**

1. 改代码 → `git commit` → `git push origin master:main`
2. 告诉用户等 1–2 分钟
3. 用户直接开线上 URL 核对

只有新建应用或不可逆改动才先确认。

## 改完提醒用户强刷

浏览器会缓存 `index.html`，用户看到旧版会以为没生效。
→ 提醒 `Ctrl+F5`（Mac `Cmd+Shift+R`）。

## 根目录纪律

`E:/Workbuddy/账册/` 根目录**不在任何 git 仓库内**，放进去的文件：

- 不会进版本控制，删了找不回来
- 移动/删除对线上零影响，也不需要 push
- 会让 AI 每次扫目录变慢

现有分区（2026-10-30 整理完成，勿再往根目录丢脚本）：

| 目录 | 内容 |
|---|---|
| `_scratch/` | 一次性调试脚本（dbg-*/debug-*/repro-*/fix-*/probe-*） |
| `_scratch/shots/` | 截图脚本；`output/` 存验证截图 |
| `tests/` | 回归测试套件 |
| `tools/` | DDL 工具（apply-schema 等） |
| `archive/` | 历史素材、一次性导入数据、旧记忆备份 |
