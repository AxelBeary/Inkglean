# 诊断类任务踩坑记录（2026-08-03 实战：时间条拖不动）

## 结论先行：本次根因是演示数据缺字段，不是代码
「时间条没法拖动」→ 根因：demo-data.ts 的 orders INSERT 没写 deadline 列 → 4 条演示订单 deadline 全 NULL → REQ-019 的整条平移（`tlCanDragMove`）要求 `!noDeadline` → 全部禁用。拖拽机制本身完好。

**通用教训**：该项目 demo-data.ts 有反复漏列的历史（width/height、queue_position、deadline）。诊断「功能不工作」时，**先查数据字段存在性**（docker exec 直查 DB），再怀疑代码。数据层一刀切掉一半假设。

## docker exec 引号地狱（Windows PowerShell）
嵌套引号（`docker exec sh -c "node -e \"...\""`）在 pwsh 下反复断句失败。**解法**：
1. 工作区写 `tmp-diag.cjs`（只读诊断脚本）
2. `docker cp` 进容器 `/app/server/`（必须放这里——better-sqlite3 装在这层，`-e` 在 /app 根跑不了）
3. `docker exec -w /app/server commission-web node tmp-diag.cjs`
用完双端清理（本地 Remove-Item + 容器 `docker exec rm`），git status 只留 comms 报告。

## 容器内直查 DB 的模式
```js
const db = require('better-sqlite3')('/app/data/commission.db', { readonly: true })
const rows = db.prepare('SELECT id, order_no, status, deadline, start_date FROM orders').all()
```
readonly:true 是纪律——诊断脚本绝不写库。数据卷在 `./data`（docker-compose.yml），DB 路径 `/app/data/commission.db`。

## 开发模式登录（容器内走 API，不走浏览器）
AUTH_DEV_MODE=true 时：`POST /api/auth/send-code` 返回 `_dev_code` 字段；再 `POST /api/auth/verify` 拿 set-cookie 的 `artist_token`。画师 alice QQ=10001。登录页 UI 也会在 alert 里显示开发码。注意容器 NODE_ENV=production → cookie 带 Secure，浏览器走 http://localhost 时 cookie 会掉——**浏览器会话不稳定就别硬撑，切容器内复现**。

## 决定性复现：容器内 1:1 复刻前端逻辑
浏览器快照前后矛盾（会话重置 + 中途数据被重跑，订单 ID 785→789 漂移）时，停止和浏览器搏斗。写一个 node 脚本：**调真实 API 拿数据 → 逐行复刻前端的 computed/判定函数（tlRows、bandClass、tlCanDragMove/Start/End）→ 对每条数据输出该渲染什么**。三种缩放全跑一遍，证据不可辩驳。这比截图和 DOM 快照硬得多。

## 合成 PointerEvent 验证拖拽类交互
```js
function pe(t, x) { return new PointerEvent(t, {bubbles:true, cancelable:true, clientX:x, clientY, pointerId:1, pointerType:'mouse', button:0}) }
handle.dispatchEvent(pe('pointerdown', cx))
handle.dispatchEvent(pe('pointermove', cx-96))
// ⚠️ Vue 响应式更新是异步的——dispatch 后必须【另开一次 console 调用】再读 DOM，
// 同一表达式里连读会拿到旧值，造成假阴性（"拖拽没触发"）
```
本次用此法证明 handle 拖拽跟手+浮动标签+API 落库全正常。

## 验证"容器跑的是不是最新代码"
```sh
docker exec commission-web sh -c "cd /app/web/dist/assets && grep -o 'function ft(e){[^}]*}' QueueBoard-*.js"
```
从 minified bundle 里抠出函数定义与源码对比。本次确认部署 bundle 的拖拽判定与 master 源码一致，排除"构建滞后"假设。

## 中途数据被重跑的污染陷阱
调查数据类 bug 时，其他角色可能中途重跑 demo-data.ts（本次订单 ID 全变）。**数据事实以 docker exec 查库为准，不信任跨时间的浏览器 DOM**。报告里注明证据采集时刻。

## git 中文文件名转义
验证脚本里断言 `git status --short` 输出时，中文路径默认被转义成八进制（`\346\227...`）导致误判 FAIL。用 `git -c core.quotepath=false status --short`。
