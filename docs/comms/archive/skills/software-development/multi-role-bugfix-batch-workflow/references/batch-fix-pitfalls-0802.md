# A 类批次修复踩坑记录（2026-08-02 实战）

## 新 worktree / 分支切换后必须装依赖
`git worktree add` 后 server/ 和 web/ 各需 `npm install`，否则 vitest 报 `Cannot find package 'vitest'`、eslint 报模块找不到。**同一 worktree 路径切到新分支时同样需要重装**（前一轮的 node_modules 可能已被清理或分支重建）。开工第一步就装，别等跑测试才发现。

## 写 API 测试前先确认实际路由路径
本次把 `/api/artists/:subdomain` 误写成 `/api/public/artist/:subdomain`，5 个测试全 404。**先读路由文件确认 URL 模式，再写测试。**

## 测试认证用 createSession 直生成 token
不走登录流程（send-code → verify），直接：
```js
import { createSession } from '../src/features/auth/auth.service.js'
const token = createSession(artist.id, artist.token_version ?? 0)
// headers: { authorization: `Bearer ${token}` }
```
快、稳、不依赖验证码逻辑。

## 新增输入校验 → 搜现有测试中的边界值用例
本次 #36 加了"公告过期日不得早于今天"校验，导致 TC-ANN-03（用 2020 年日期测过期读取逻辑）挂了。修复方法：该测试目的是验证读取层过期判断，不是验证写入校验——改为直接 `db.prepare('UPDATE ...').run(...)` 绕过 service 层写入。

**规则**：每次在 service 层加新校验后，`search_files` 搜所有测试文件中调用该函数的用例，检查是否有用"非法"输入测其他逻辑的。

## 共享文件加变量前先搜已有声明
app.js 中 `sentryDsn` 已被 Sentry 初始化代码声明（L196），CSP 修复又声明同名变量 → esbuild 报 `already been declared`，11 个测试文件全挂。**加变量前 `search_files` 搜全文。**

## vue-i18n ICU 花括号转义
`{name}` 会被 vue-i18n 当 ICU 插值语法吞掉。转义写法：`{'{'}name{'}'}`。locale 文件中该键改用双引号包裹（因为内含单引号）。

## 浏览器工具不可用时的 UI 运行时诊断
委派子代理（delegate_task），让它在 workspace/temp/ 下写 Playwright 脚本：
1. `npm install playwright`（在 temp 目录）
2. 登录：API 拿 cookie + `page.evaluate(() => localStorage.setItem('artist_logged_in', '1'))`（路由守卫检查此标记）
3. 导航到目标页 → 检查元素渲染/computed style
4. 模拟 pointer 事件 → 监听 Network 请求
5. 脚本用完即删

本次 #4 时间条拖拽用此法确认功能正常，非代码 bug。

## 每个修复独立 commit 但可共享文件
errors.ts 被 #35 和 #36 共同修改——先提交 #35（含 errors.ts 的 INVALID_START_DATE），#36 再追加 INVALID_ANNOUNCEMENT_DATE 到同一文件。git add 时只加当前修复涉及的文件，不 `git add -A`。

## 纯 CSS 改动的 ad-hoc 验证脚本
系统要求每次改动都有验证证据，即使只改一行 CSS。写一个 Node 脚本读源文件做正则断言：
```js
import { readFileSync } from 'fs'
const src = readFileSync('path/to/Component.vue', 'utf8')
const checks = [
  ['目标块存在', /\.target-class \{/.test(src)],
  ['新值已生效', /\.target-class \{[^}]*width: 14px/.test(src)],
  ['旧值已移除', !/\.target-class \{[^}]*width: 8px/.test(src)],
  ['相邻属性未动', /\.target-class::after \{[^}]*width: 2px/.test(src)],
]
// 逐项打印 ✅/❌，全过 exit 0
```
放 `os.tmpdir()` 下，跑完即删。比跑完整 build 快，且产出结构化证据。

## "功能不工作"排查：先搜功能名→再搜相关概念→追踪完整路径→确认前端调用点
本次"修改加钱"排查：搜 `surcharge|加钱|extra_charge` = 零命中 → 扩大搜 `final_price|extra_items|price_adjust` → 找到实际实现叫"附加工作项"(SPEC-003) → 追踪完整路径（route → service → DB → api/index.js → .vue 组件）。

**关键断点发现技巧**：在 `api/index.js` 中找到 `updatePrice` 方法定义后，搜所有 `.vue` 文件中的调用 → 发现仅 ManualOrder.vue 调用，OrderDetail.vue 零调用 → 根因 = "后端能力完整，前端入口缺失"。

**规则**：排查"功能不工作"时，不要只搜用户用的词（"加钱"），要搜技术实现词（price/extra/adjust）。找到 API 定义后，**必须搜前端组件中的实际调用点**——API 方法存在 ≠ 用户能用。

## 排查研究任务（只研究不修）的交付格式
五号也接"排查根因 + 出方案"任务（不改代码）。交付 comms 格式：
1. **根因链条**：用 `→` 箭头链从用户现象追到代码层（精确到文件:行号）
2. **关键证据**：列出支撑根因的代码片段（文件+行号+内容）
3. **为什么现有修复没解决**：解释前一轮修复为何无效
4. **方案对比表**：2-3 个方案，列原理/工程量/效果/副作用
5. **推荐方案详细步骤**：编号步骤，可直接作为后续派工依据
6. 末尾注明"不实施，等一号研判后派修"

本次 #15 瀑布流跳动：CSS `columns: 2` + `el-image lazy` + skeleton 固定 200px ≠ 真实高度 → 每张图加载完触发整列 reflow。推荐方案：上传时 sharp 读 width/height 存 DB → 前端 `aspect-ratio` 精确预留。
