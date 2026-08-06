# 浏览器级自测模式（派工验证标准"自测路径"的执行手册）

> 适用：派工验证标准含"自测路径：X → 刷新 → 恢复 → 状态回来"类浏览器验证（草稿防丢失、表单流程、价格联动）。
> 工具链：Hermes browser_* 工具 + `agent-browser` CLI（二者驱动同一个 Chrome 实例，tab 互通）。

## 一、worktree 自测环境搭建

1. **不要复制主 worktree 的 DB**——主库可能落后于最新迁移（如 v36 只在 Docker 验证过，本地主库无新表）。正确做法：删掉/不建 `server/data`，让 worktree server 首启时跑全量迁移建新库。
2. **种子数据用临时 `.cjs` 脚本**（better-sqlite3，`INSERT OR IGNORE` 幂等），放 `server/_tmp-seed.cjs`，自测后删除。
   - **`npm run db:seed` 尾部崩溃 ≠ 种子失败**（v0.36 实测）：seed.js 动态 import `workflow.service.js`（实际是 .ts，无对应 .js 文件）→ 尾部必抛 ERR_MODULE_NOT_FOUND；但此前全部迁移（v1~v38）与 artists/price_tiers/commission_rules 种子已入库提交。别修它（预存在 bug，常不在授权范围），直接用 `_tmp-seed.cjs` 补业务数据继续。
   - better-sqlite3 装完先跑一次 `node -e "require('better-sqlite3')(':memory:').prepare('select 1').get()"` 确认原生二进制可用（npm allow-scripts 常拦 install 脚本，但 prebuild 二进制通常已就位，拦了也未必坏）。
3. **端口冲突**：主 worktree server 占 3000 时，worktree server 用 `$env:PORT='3001'; npm run dev`，并把 `vite.config.js` 代理临时改到 3001。**交付前必须还原**，核验 `git diff master -- web/vite.config.js` 为空。
4. vite 默认启动（不要加 `--host 127.0.0.1`——本机实测默认 localhost 绑定可用，改绑 IPv4 反而连不上）。第一次成功的配置就是正确配置，别来回试绑定参数。
5. **agent-browser 首次使用报 "Chrome not found"** → `agent-browser install`（下载约 190MB）。Hermes browser_* 工具与 agent-browser CLI 共用该 Chrome。
6. **browser_navigate 偶发 10060 超时**（curl 同 URL 却 200）：瞬时连接抖动，直接重试即可；连续失败才排查绑定/代理。不要因一次超时就切换绑定方式。
7. **Browserbase 服务级故障 → 切本地 Playwright，不回头**（v0.36 六路回归实测）：`browser_console` 报 `SecurityError: Access is denied for this document`、返回 about:blank、或登录态连续两次在 navigate 后丢失 = 远程浏览器会话已死。切 `@playwright/test` + `npx playwright install chromium` 独立脚本（完整配方见 playwright-ui-diagnosis 技能 `references/standalone-fallback.md`：dev 登录 cookie+localStorage 注入、viewport 固定 1440×900、toast MutationObserver、合成 DragEvent 双路矩阵）。脚本证据可复跑可留档，比远程浏览器更稳；切换后不再混用两套状态（v0.36 实测：远程浏览器连丢 3 次会话，切脚本后 G1/G2 一次通过）。
8. **双布局重复控件的隐藏副本**：响应式页面桌面栏 + 移动抽屉会各渲染一份同一表单；`input[type=number]` 的 `.last()` 可能选中隐藏副本（click/fill 报 "element is not visible" 死循环重试）。用可见容器作用域（`.mo-col ...`）或独有属性（最终价格框 `max="999999.99"`，增项步进器是小 max）精确定位。线索：click 解析到 `mo-mobile-submit` 之类意外的 class = 选错了副本，改作用域而非重试。
9. **vite 冷启动依赖优化 reload 吞首次交互**（v0.37 详情按钮排查实锤）：`npm run dev` 后首次访问页面，优化器发现新依赖触发**全页 reload**（vite 终端日志 `optimized dependencies changed. reloading`，全新 worktree 首跑可能连触两次）。reload 窗口内的点击全部丢失 → "按钮点了没反应"的假 bug。对策：起 vite 后先空跑访问目标页热身（等 optimizer 跑完）再正式实测；诊断"点击无效"先看 vite 终端日志有无 reloading，别先怀疑代码。真实案例：v0.36 实测报告"订单列表详情按钮点击不跳转疑似 bug"，v0.37 用 Playwright 事件埋点排查（pointerdown→click→pushState 全链路 + vite 日志）实锤为环境问题，代码零改动结案。

## 二、sessionStorage 与 tab 语义（最易误判）

- **sessionStorage 按 tab+origin 隔离**。`browser_navigate` / `agent-browser open` 可能落到新 tab，旧 tab 写入的草稿在新 tab 读不到 → 会误判"草稿丢了"。先 `agent-browser tab list` 确认在哪个 tab。
- **模拟刷新 = 同 tab 内 `location.reload()`**，不是重新 navigate。

## 三、beforeunload 拦截（自动化的死穴，也是证据）

- 页面有草稿时 `location.reload()` 触发原生确认弹窗，**自动化工具无法点击原生弹窗** → reload 挂起/中止，tab 可能重置为 about:blank，console 上下文全部丢失。
- **拦截出现本身就是 R57 生效的正向证据**，不要当故障排查。
- 等价验证路径（实测可行）：
  1. 全新加载页面（表单空 → hasDraftContent=false → 不拦截）
  2. `sessionStorage.setItem(key, ...)` 注入草稿——**内容取自保存阶段实测的真实草稿 JSON**（字节一致），不手写
  3. `location.reload()` → 恢复弹窗（`.el-message-box`）出现
  4. eval 点确认按钮 → 断言恢复结果

## 四、Element Plus 控件的自动化点击

| 控件 | browser_click 问题 | 可靠做法 |
|------|-------------------|---------|
| `el-switch` | 报"covered by span.el-switch__core" | `document.querySelector('.el-switch .el-switch__core').click()` |
| `el-radio-button` | 装饰层遮挡 | eval 找 `.el-radio-button__original-radio`，按 `parentElement.innerText` 匹配目标（如含"商用"）再 click |
| `el-input-number` | 增减按钮可正常点 ref | 点"增加数值"按钮 N 次，读 `input.value` 断言 |
| `ElMessageBox` | — | `[...document.querySelectorAll('.el-message-box__btns button')]`，末位=确认、首位=丢弃 |
| 卡片/步骤按钮 | — | 按 `innerText.includes('下一步') && !b.disabled` 找按钮 |

### 四·补 EP date-picker × Playwright 交互测试（v0.39 手动录单日期批实测）

date-picker 是 EP 里最易踩的自动化坑，实测四条铁律：

0. **disabled-date 的经典时间比较 bug（业务侧）**：面板日期 `d` 是**当天 0 点对象**，`(d) => d < new Date()` 里 `new Date()` 带当前时分秒 → 今天 0 点 < 当前时刻 = true → **今天被灰掉**（"今天选不了"）。修法：`const today0 = new Date(); today0.setHours(0,0,0,0)` 归一化后 `(d) => d < today0`。setup 期构造一次即可，勿过度设计。

1. **面板 DOM 常驻**：所有 date-picker 的 popper 首次渲染后**永久挂在 DOM**（未打开的 `display:none`）。`td.today`、按日号 `hasText` 匹配会跨 picker 重复命中 → strict mode violation（"resolved to 2 elements"）。对策：所有 cell 定位**限定当前打开的面板**（`page.locator('.el-picker-panel:visible')` 作作用域），或用 `getByRole('combobox', { name: '截稿日（可选）' })` 精确打开目标 picker。
2. **面板关闭有 transition，关闭中的面板仍 `:visible`**：上一个面板还在收起动画里时开下一个，`':visible'.first()` 会命中旧面板 → 断言错位（flaky 根因）。铁律：**点选日期后等 `await expect(page.locator('.el-picker-panel:visible')).toHaveCount(0)` 再操作下一个**；每次 openPicker 前也先 Escape + 等 count 0。
3. **input 定位歧义**：`.el-form-item` hasText + `.locator('input')` 实测会打开错面板（点截稿日 input 弹出开稿日面板）。EP combobox 的 accessible name 就是 label 文本，用 `getByRole('combobox', { name })` 最稳。
4. **disabled-date 同时约束输入解析（不只面板）**：input 键入超限日期（如 startDate 8/21 > 截稿日 8/16）会被 EP 拒绝回显空——**UI 层无法构造非法状态**。验证「提交守卫/兜底逻辑」这类防御性代码，E2E 测不到，走组件级 vitest：自定义 date-picker stub（`props:['modelValue'], emits:['update:modelValue']`），`wrapper.findAllComponents({ name: 'ElDatePicker' })[0].vm.$emit('update:modelValue', '2026-08-16')` 直接驱动 v-model 构造冲突，断言 `ElMessage.error` 调用 + `createManualOrder` 未被调。注意：**UI 选不出冲突日期恰恰是修复生效的正向证据**，comms 里要写明"守卫走组件测试、E2E 无法构造"。

翻月辅助：面板 header 年月文本读 `.el-date-picker__header-label` 两个 label（zh 格式 `'2026 年'`/`'8 月'`，parseInt 取数），循环点 `.el-picker-panel__icon-btn.arrow-right` 直到年月匹配目标（上限 13 次防死循环）；日号 cell 过滤 `td:not(.prev-month):not(.next-month)` 避免同号跨月误命中。

## 五、eval 卫生

- `agent-browser eval` **共享页面 JS 上下文**：`const next = ...` 会在后续 eval 报 "Identifier 'next' has already been declared"。一律用 IIFE `(() => { ... })()` 或唯一变量名。
- reload 类 eval 必然"超时"（页面导航中断等待）——预期行为，不是失败。reload 后用 `Start-Sleep -Seconds 3~4` 再发新 eval。
- Hermes browser_console 在页面刷新后上下文失效；长脚本序列优先 `agent-browser eval`（CLI 更稳）。
- 断言价格：`document.body.innerText.match(/¥[\d.]+/g)` 抓明细+总价，对照公式手工核算（如 `(80+30+40)×2=300`）。

## 六、交付前清理清单

- [ ] 还原临时改动的配置（vite 代理等），`git status --porcelain` 干净
- [ ] 删除临时脚本（`_tmp-seed.cjs` 等）与自测 `server/data` 目录
- [ ] 停掉自测 server/vite 进程（`netstat` 确认端口释放）
- [ ] **`npm run dev`（tsx --watch）必须用 `process kill <session_id>` 杀整个会话**——`Stop-Process` 只杀 node 子进程会留下 tsx watch 外壳，它无限重启崩溃（MODULE_NOT_FOUND 循环日志）。杀完 `process poll` 确认 exited
- [ ] comms 里如实写明自测路径与等价替代（如 beforeunload 拦截导致改注入法），不编造

## 七、收尾后仍会收到后台进程的延迟通知

后台 dev 进程被杀后，watch_patterns 匹配的缓冲日志仍会在数分钟后推送（"listening"、"已应用"、"Error [ERR_MODULE_NOT_FOUND]" 等）。处理纪律：
- 先 `process poll <session_id>` 确认 exited（不是新故障）
- 已 kill 且 netstat 无监听 → 回复一句"旧进程缓冲日志，已确认退出"即可，不重新排查
- 只有 poll 显示 running 才需要再 kill

## 八、点击断言时序：Vue DOM 更新是异步的

- eval `el.click()` 后**立即**读 `classList`/DOM 拿到的是旧值（如选中态 class 还是 false）。Vue 在 nextTick 才 flush DOM。
- 断言要包成 Promise：`el.click(); new Promise(r => setTimeout(() => r(el.classList.contains(...)), 100))`，或点击与断言分两次 eval。

## 九、browser_click 静默无效 → 先验证效果再降级

- `browser_click(ref)` 后导航可能根本没发生（ref 过期/按钮没真正命中）。每次点击导航类按钮**必须验证效果**（`location.href` 变化 / 目标 DOM 出现）。
- 没效果时的顺序：① `browser_snapshot` 拿新 ref 重试（旧 ref 点击常落空）；② 降级 eval `document.querySelector('选择器').click()`（实测可靠）。
- 注意区分"点击落空"和"业务逻辑丢状态"：v0.34 曾把一次点击后 URL 缺 sizeId 误判为代码 bug，重测（点击→等 DOM→再点）后参数完整——先排除自动化时序再怀疑代码。

## 十、顺序纪律：自动化门禁绿 → 先 commit → 再手动走查

- vitest + eslint + build 三关全绿时代码已可交付。**先 commit 进 git**，再继续浏览器手动验证（切主题、4 模板走查、截图留证）。
- **commit 是门禁绿后的下一个动作，中间不插环境搭建**：起 server（npm install、端口探测、等启动）吃掉的迭代预算不可预测。v0.36 第三轮复发：三关全绿后先去搭自测环境（server 缺 node_modules → tsx not recognized → 补装依赖），迭代上限在环境搭建中途触发，零 commit。教训：**vitest+eslint+build 绿 → 立即 git add + commit（哪怕只 commit 代码不含 comms）→ 再搭环境**；commit 后剩多少预算都不影响交付。
- v0.34 教训：7 任务全完成、自动化全绿，但手动自测耗尽迭代预算，**一个 commit 都没打**——会话结束代码全丢。手动验证是锦上添花，commit 是底线（soul 硬规则"切了分支=当轮必须写完代码+commit"）。
- **v0.36-w2 复发实录（G1 拖拽守卫 + G2 录单价格）**：vitest 156/156 + eslint 0 + build ✓ 全绿后，先去装 server 依赖、起 WEB_DIST 测试服务器、走开发登录、做浏览器实测——迭代上限在实测收尾时触发，**零 commit**，代码只躺在 worktree。与 v0.36 波1 同一失败模式，本规则第三次被验证：**三关绿后的下一个动作永远是 git add + commit，环境搭建与浏览器实测排在 commit 之后**。

### 十·补 被打断后的恢复协议（迭代上限/会话中断，v0.35 波 2 实测）

即使遵守"先 commit"，仍可能在自测中途被硬中断（迭代上限、会话关闭）。恢复时的固定协议：

1. **第一件事查 git 三件套**：`git branch --show-current`（确认在正确分支）+ `git status --short`（未提交改动清单）+ `git log origin/master..HEAD`（已交付的 commit）。未提交 ≠ 丢失，worktree 里的改动还在——先稳住，别重写。
2. **未提交时：不启新功能**。把剩余验证压到最小（只补最关键的一两条链路），立即 commit + comms。comms 里如实标注哪些验证已做、哪些未做。
3. **后台 dev server 可能还活着**：`process poll <session_id>` 确认；活着就复用（省去重启+等依赖优化），死了再起新的。
4. **浏览器会话状态全部不可信**：tab 可能重置为 about:blank、console 上下文丢失、sessionStorage 残留旧草稿。恢复后每条验证链路都从 `browser_navigate` 重新走；测订单页 query 预选前先 `sessionStorage.clear()`——残留草稿会弹恢复弹窗，污染 query 落点断言（v0.35 曾把草稿弹窗干扰误判为"URL 丢 sizeId"）。
5. **已验证过的结论不重复验证**：上一段会话已确认过的链路（如 F3 三条图路径），恢复后不必重跑，只补中断点之后的部分。comms 证据引用即可。

## 十一、临时脚本别落进 ESLint lint 范围

- emoji 扫描/清理用的临时 `web/scripts/*.cjs` 放在 web/ 下会被 `npx eslint .` 抓到（no-undef require、no-misleading-character-class 等），产生看起来像代码问题的报错。
- 对策：临时脚本用完**立即删**（在跑 eslint 之前），或放 lint 范围外。验证顺序建议：删临时脚本 → eslint → build。

## 十一·补 npm approve-scripts 会把 allowScripts 写进 package.json（v0.39 实测）

Hermes 环境的 npm 拦 install 脚本时，`npm approve-scripts` / `npm rebuild` 会把 `"allowScripts": { "esbuild@x.y.z": true, ... }` **写进 package.json**（npm 9.11+ 的 allowScripts 字段持久化）→ `git status` 出现 `M server/package.json` / `M web/package.json`，不是你的改动。**提交前必须 `git checkout -- server/package.json web/package.json` 还原**，否则把本机 npm 配置带进 PR。同理 npm install 产生的 lockfile 变更（如有）也要逐文件核验再决定去留。

## 十二、批量文本替换（如 emoji 清理）的脚本边界- 用正则匹配 JS 字符串字面量不可靠：`"Today's todos"` 这类双引号串里的撇号会破坏单引号正则的配对边界 → 漏改（v0.34 实测 zh 64/en 65 处后仍漏 3 处）。
- 纪律：脚本跑完**必须重扫 + 手工补漏**，以重扫结果为准；"已处理 N 处"不是最终结论。改完抽查 git diff 确认只删目标字符、未动措辞、未丢键。

## 十三、PowerShell 跑内联脚本

- `node -e "..."` 含反引号模板串（`${p}`）会被 PowerShell 展开破坏（SyntaxError: Expected ','）。一律写临时 `.cjs` 文件再 `node 文件.cjs`，用完删除。python -c 多行同理。
- 例外：纯单行、无反引号/无 `$` 的 `node -e`（如 locales 键校验）可以直接跑。判断标准是有没有 PS 展开字符，不是一刀切。
- **PowerShell 网络栈 ≠ node 网络栈**（v0.38 实测）：`Invoke-WebRequest http://localhost:3000` 超时（localhost→::1 解析在 PS 侧不通），但 node fetch localhost:3000 正常、浏览器正常、http://127.0.0.1:3000 也通。**探测 API 用 node fetch 或 127.0.0.1，别用 Invoke-WebRequest 判死**；vite proxy 写 localhost 不受影响（proxy 走 node 网络栈）。
- **vite 自身第二实例**：5173 被别的 node 进程占用时，`npm run dev -- --port 5174 --strictPort` 起独立 vite（proxy 照常到容器 3000），不用改 vite.config.js。
- **Windows ESM 动态 import 必须 pathToFileURL**（v0.39 实测）：`.mjs` 脚本里 `await import(resolve(ROOT, 'web/src/locales/zh-CN.js'))` 报 `ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'd:'`——Windows 下绝对路径字符串被 ESM loader 当 URL 解析。改 `import(pathToFileURL(resolve(ROOT, '...')))`（`pathToFileURL` 从 `url` 导入）。凡在 Windows 跑 ESM 脚本动态 import 本地文件，一律套 pathToFileURL。

## 十四、snapshot 说"空页" ≠ 页面是空的（v0.35 实测）

- `browser_navigate`/`browser_snapshot` 返回 `(empty page)` / `element_count: 0` 时页面 DOM 可能已完整渲染（Vue 异步组件 + el-* web component，a11y 树抓取时机错过）。
- **判定顺序**：snapshot 空 → `browser_console` eval `document.querySelector('.根class')?.innerHTML.length` 确认 → 有内容就用 console/vision 继续，不因 snapshot 空就重导航或判定故障。
- SPA 异步加载页统一 `setTimeout(..., 1500~2000)` 再断言 DOM（ArtistHome 模板是 defineAsyncComponent）。

## 十五、点击触发导航后的 console 断言

- 点击触发路由跳转（router.push）时，`browser_console` 的 CDP target 可能还挂在旧上下文 → 报 "Inspected target navigated or closed"，或下一次 console 返回 `about:blank`/旧 URL——**不代表跳转失败**，是 console 会话没跟上。
- 处理：报导航错 → 等 1s 重新发 console 读 `location.href`；拿到 about:blank → 重新 `browser_navigate` 目标 URL 继续，不推翻前面的点击验证。
- "点击→跳转带 query"链路最可靠写法：点击与断言分开两次 tool call（点击 → 单独 console 读 `location.href`，必要时重连）；同一个 eval 里 `click(); setTimeout(resolve)` 会被 SPA 导航打断而报错。

## 十五·补 browser_console 表达式过大 → SyntaxError（v0.40 视觉通病批1 实测）

- browser_console 的 expression 传**大而复杂的多行表达式**时，报 `SyntaxError: Unexpected end of input`（工具侧截断），不是页面 JS 问题。返回值里对象/数组会序列化，但表达式本身超长就炸。
- 对策：**拆成小表达式 + 单行**（用 `(() => {...})()` IIFE 但控制行长），或先跑一步存数据（如 `window.__t = {...}`）再分步读。实测：V2 色值断言首版 5 行多属性表达式报错，拆成单行字符串拼接即通过。

## 十六、批量遍历筛选/tab 状态：单个 async eval 走完

- 验证"一排筛选标签逐个切换"不要一个标签一次 tool call（吃迭代预算）。单个 console 表达式里跑 async IIFE：

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const btns = Array.from(document.querySelectorAll('.筛选按钮'))
  const results = []
  for (const b of btns) {
    b.click(); await sleep(320)
    results.push({ f: b.textContent, items: document.querySelectorAll('.项').length })
  }
  btns[0].click() // 回到默认态
  return JSON.stringify(results)
})()
```

- sleep 300ms+ 覆盖 Vue nextTick + Transition；一次调用拿全量状态表，异常项（0 结果）一目了然——v0.35 靠这个发现 mock tags 覆盖不全的档位。

## 十七、共享 Docker 后端 DB 的临时种子（联调用真实数据验证）

前端要验证真实数据链路（画师尚未在后台配置的功能，如尺寸图/作品标注），而后端是共享 Docker 容器（commission-web + /app/data/commission.db）时，不起 worktree 本地 server，直接给容器 DB 临时种子。

**探测端点（先于写码）**：容器没有 wget/curl/head，但 node 22 自带 fetch：
```
docker exec commission-web node -e "fetch('http://localhost:3000/api/public/xxx/alice').then(r=>r.text()).then(t=>console.log(t.slice(0,900)))"
```
PS 管道接 `| head` 会报 'head' is not recognized——用 node 内截断。

**种子脚本三要点**（写临时 .cjs → `docker cp` → `docker exec -w /app node` → 删）：
1. 脚本必须放 **/app/** 下执行，不能 /tmp（/tmp 解析不到 node_modules）；better-sqlite3 用绝对路径 `require("/app/server/node_modules/better-sqlite3")`（/app 根 node_modules 里没有）。
2. 幂等：`UPDATE ... WHERE id` + `INSERT OR IGNORE`，可复跑。
3. **验证完立即跑清理脚本**（恢复 NULL、DELETE 插入行），并用 SELECT COUNT 确认还原——这个 DB 是一号/用户共享的，残留种子会污染用户体验。种子与清理都写进 comms。

v0.35 联调实例：给 alice 尺寸 1/2 设 image_artwork_id/image + 描述天数、artwork_size_tags 插 5 行标注 → 浏览器实测 F3 三条图路径 + F6 筛选/标签全通 → 清理脚本还原，tags 表归 0。

## 十八、四主页模板视觉改动的自测路径（v0.36 画册翻页实测）

改 TplGallery/模板级视觉时，要逐模板验证，固定路径：

1. **切模板不用动 DB/后台**：ArtistHome.vue 的预览参数 `_tpl` 只覆盖渲染层——`/artist/alice?_tpl=classic|gallery|folio|atelier` 直接切模板（`_pal`/`_accent` 同理切配色/强调色，会带预览横幅）。四个 URL 走一遍即覆盖四模板。
2. **画廊组件测试需要作品数据**（seed 不带 artworks）：`_tmp-seed.cjs` 插 artworks（含 width/height 供 aspect-ratio、description、sort_order），要测 F6 筛选链再加 art_styles + style_sizes + artwork_size_tags（标注多对多）。
3. **占位图用临时脚本生成 SVG** 到 `server/uploads/images/`（不同宽高比方/竖/横各几张，纯色+居中文字即可），`/uploads/images/*` 是公开路径无需签名。
4. **清理增量**（在第六节清单之上）：`server/uploads/` 自测目录、`server/data/`、`server/_tmp-*.cjs` 都要删——它们此前均不存在，删净即还原。
5. **翻页/轮播类组件的断言点**：箭头 click → 当前图 src/counter 文本变化（sleep 320ms 等 Transition）；单张作品时箭头/页码应 `length===0`；筛选切换后 counter 回到 `1 / N`；滑动用 `dispatchEvent(new PointerEvent('pointerdown/up', {clientX}))` 模拟。

## 十九、WEB_DIST 单服务器自测（无 vite dev，v0.36-w2 实测）

不想搭 vite dev + 代理时，worktree server 直接挂构建产物提供 SPA（e2e/global-setup.js 同款配方）：

```powershell
cd <worktree>/web; npm run build           # 先构建（代码每改一轮要重 build）
cd <worktree>/server; npm install          # worktree 依赖不共享
$env:PORT='3899'; $env:DB_PATH="$PWD\..\e2e\manual-test.db"; $env:UPLOAD_DIR="$PWD\..\e2e\manual-test-uploads"
$env:AUTH_DEV_MODE='true'; $env:WEB_DIST="$PWD\..\web\dist"; $env:NODE_ENV='development'
node node_modules/tsx/dist/cli.mjs src/db/seed.js; node node_modules/tsx/dist/cli.mjs src/index.js
```

- 浏览器直接访问 `localhost:<PORT>`，无代理、无端口探测、路径与 e2e 环境一致。
- **代价**：前端每改一轮必须重 `npm run build`——适合"代码冻结后验证"，不适合频繁改码迭代（那种用 vite dev）。
- 测试数据补充用临时 `.mjs` 脚本（better-sqlite3 直写 worktree 测试 DB），验证完与脚本一起删。
- **别猜表名/列名——先探 schema**：验证脚本按业务语义猜表名（order_addons / operation_logs）连错三次。固定配方：先 `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%关键词%'` 列候选表，再 `PRAGMA table_info(表名)` 确认列；或写探测循环（try prepare 每个候选表名，catch 跳过）。artist-commission 实例：增项明细在 `order_extra_items`、日志在 `order_activity_logs`（无 action 列）。
- 开发登录：`send-code` 响应含 `_dev_code`（AUTH_DEV_MODE=true），verify 拿 httpOnly `artist_token` cookie；浏览器里走正常登录页流程即可（页面开发模式直接显示登录码）。

## 二十、拖拽事件模拟（G1 守卫类验证）

浏览器自动化无法从 OS 拖真实文件，用合成 DragEvent 验证守卫逻辑：

```js
const dt = new DataTransfer()
dt.setData('text/html', '<img src="x.png">')   // 页内拖拽特征：只有 text/html / text/plain
// 系统文件拖拽特征：dt.items 含 kind='file'（types 含 'Files'）
for (const type of ['dragenter', 'dragover', 'drop']) {
  dragger.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
}
```

- 断言分两次 console 调用（dispatch → 等 800ms → 查 `.el-message` toast 文案 + 文件列表数量）。注意 browser_console 对 IIFE/async 返回值常序列化为 null，**别依赖复杂表达式返回值**，改用简单表达式或分步断言。
- 真实 OS 拖文件链路合成事件无法覆盖，comms 里如实标注"系统拖入走单测 types 判断 + 人工确认"。

## 二十一、后端契约易错字段（实测脚本 400 高发点，v0.37）

- 改价 `PUT /api/artist/orders/{id}/price`：字段是 `finalPriceCents` + `quoteSnapshot`（写成 priceCents/note 直接 400）。抄契约前先读 OrderDetail.vue 里 submitPriceChange 的真实调用，别凭记忆写。
- **自定义增项/extra-items 验证**（v0.38 补漏批实测）：手动录单提交自定义增项走 `POST /api/artist/orders/{id}/extra-items`（name≤100 + priceCents 允许负数），提交后查 `GET /api/artist/orders/{id}` 的 `extraItems` 数组断言 name/price_cents。**后端 addExtraItem 会把条目金额并入 final_price_cents**——断言按 手输价+自定义增项合计 算（实测：手输 200 + 加急 100 → final=30000 且 total_price_cents=null，是正确入账语义不是 bug；先写手输价再补条目，顺序由 submit 保证）。
- 造单 `POST /api/artist/orders/manual` 带 `tierId` 才自动生成 installments 节点（测待收横幅等节点类功能必备）；不带 tierId 的单无节点。
- 新单默认自动接入工作流：status 端点拒收（400 INVALID_TRANSITION），先 `PUT /stage {stageId:null}` 再推状态。

## 二十二、大型 SFC 首次组件测试的 mock 面（v0.37 OrderDetail 实测）

OrderDetail.vue（1700 行、10+ composables、6 个子组件）首次建组件测试的配方：
- **模板用全局 `$t`/`$tm`：只 mock `useI18n` 不够**，必须 `global.mocks: { $t, $tm }` 注入，否则 `_ctx.$t is not a function`（`$t` 与 useI18n 的 `t` 是两条通道）。带参断言用 `t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key`。
- EP 组件未注册就 stub；要断言 label 动态切换时，`el-form-item` stub 带 `props:['label']` 并渲染 `<span class="form-item-label">{{label}}</span>`。
- 订单数据用 `vi.hoisted` 容器（`const h = vi.hoisted(() => ({ order: null }))`），api mock 的 getOrder 返回 `h.order`，每用例 mount 前赋值——比 mockResolvedValue 逐个换更省事。
- 子组件 ArtistLayout/OrderTimeline/DeliverDialog stub 成透传 div；composables（useOrderPayments/useActivityLog/useSlideConfirm/useDropGuard/usePasteUpload/useSignatureRefresh）全 mock 并给齐解构面。
- 参照系：`OrderForm.stepnav.test.js` 同款风格（mocks/composables/stubs 分层）。
