# 绘约浏览器实测补充陷阱（v0.38 D路实测沉淀）

补 huiyue-browser-regression-testing 未覆盖的实测细节（该 skill 为手动创建不可改，内容放此处）。

## Windows localhost 双面性（2026-08-05 实测实证）

- PowerShell `Invoke-WebRequest localhost:3000` **超时**（localhost→::1，docker [::] 映射在 Windows NAT 下不通），但 `127.0.0.1:3000` **通**
- node fetch / axios / vite proxy（node 进程）的 `localhost:3000` **正常**（vite proxy 无需改配置）
- 规则：API 准备/验证脚本 BASE 用 `http://127.0.0.1:3000`；浏览器与 vite dev 用 localhost；判断容器服务存活先试 127.0.0.1
- `docker exec <容器> node -e "..."` 在 PowerShell 三层引号嵌套必炸（ParserError），**改用临时脚本文件**（e2e/temp-*.mjs 或 python 文件）执行，禁内联 -e/-c

## API 数据准备/清理陷阱

- **setStyleAddons 是增量语义**：`PUT /api/artist/art-styles/:id/addons {items: []}` **不会清除**既有增项（响应仍含旧行）。实测临时挂的增项要用 `DELETE FROM style_addons WHERE art_style_id=?`（sqlite3 直删）恢复原状
- DB 直查/直改安全模式：容器挂载主 worktree `data/commission.db`，Python sqlite3 只读查询安全；写操作（禁画风/删行）加 `timeout=15` 可用，测试完必须恢复
- 测试数据纪律：临时挂增项→测完删；禁画风→测完恢复 is_active=1；造单→测→取消（stageOff + status=cancelled）

## 演示账号画像（多/单画风三态实测用）

- **多画风**：Alice qq 10001 subdomain alice，multi_style_enabled=1，画风 id 2「默认」+5「厚涂插画」+7「草线」（尺寸 80/180/280），有档位 240-242
- **单画风**：Carol qq 10004 carol，仅 1 默认画风（multi_style_enabled=0 也只返默认）
- **旧档位模式**：Bob qq 10002 bob，档位 243/244；禁默认画风（id 3，is_active=0）后 getPublicStyles 返回 [] → 页面回退档位卡片（实测验证路径）
- 登录：POST /api/auth/send-code {qqNumber} → `_dev_code` 直接可用；verify → artist_token cookie

## 提交结果断言 + 守恒验证模式（Playwright 直跑）

```js
// 成功弹窗提取订单号
const noMatch = dialogText.match(/订单号[:：]\s*([A-Z0-9-]+)/)
// API 验证：价格 + 档位模式 + 分期守恒
GET /api/artist/orders?page=1&pageSize=N  → total_price_cents / tier_id(null=画风模式, 非空=档位) / quote_snapshot
GET /api/artist/orders/:id → installments[].amountCents 之和 === total_price_cents（引擎 allocateInitial 守恒）
```

## 异常排查顺序（页面数据异常时）

API curl 正常但页面渲染异常 → ① browser_console 看 JS 错误与 resource entries（`performance.getEntriesByType('resource')`）→ ② 若 localStorage Access is denied = 自动化浏览器环境问题（非代码）→ ③ 降级本地 Playwright（context.addCookies + addInitScript 设置登录态）重跑全流程
