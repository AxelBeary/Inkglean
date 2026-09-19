# 四号模板体检批实测配方（2026-08-06，只读批）

> 场景：四个画师主页模板（classic/gallery/folio/atelier）浏览器巡检，零代码改动。
> 环境冲突：3000 被二号 worktree 的 CLOSE_WAIT 占用；vite proxy 硬编码 3000。
> 本配方是「多角色并行 + 只读巡检」的完整走通流程，可复用于后续视觉/模板巡检批。

## 环境搭建（不碰他人进程、不碰仓库文件）

1. worktree 建好后 `git merge master` 再读派工文件
2. `web/` + `server/` 各 `npm install`（worktree 无 node_modules，两个并行后台装）
3. server 初始化：`npm run db:init`（迁移到 v43 成功）→ **`npm run db:seed` 会挂**（seed.js 引 .ts 的 workflow.service，node 跑不了 ESM 扩展名），改 `npx tsx src/db/seed.js`
4. **3000 端口被他人 CLOSE_WAIT 套接字占用**（netstat 显示 CLOSE_WAIT，无 LISTENING；Get-NetTCPConnection -State Listen 查不到，但 tsx bind 仍报 EADDRINUSE）。不杀他人进程——**server 起 3001**：`$env:PORT='3001'; npx tsx src/index.js`
5. vite 起 5175 + 临时配置（见下）

## 临时 vite 配置（绕开 proxy 硬编码 3000，不改仓库 vite.config.js）

复制仓库 vite.config.js，只改 proxy target 3000→3001，存 `web/vite.tpl-check.config.mjs`（测完即删）：
```js
server: { port: 5175, strictPort: true, proxy: {
  '/api': { target: 'http://localhost:3001', changeOrigin: true },
  '/uploads': { target: 'http://localhost:3001', changeOrigin: true } } }
```
起：`npx vite --config vite.tpl-check.config.mjs`（不传 --port，配置里已含）

## demo 数据（seed 只给 alice/bob 档位+须知，无作品/头像/公告/画风）

临时脚本放 `server/scripts/tpl-demo-*.mjs`（测完即删），import 相对路径 `'../src/db/connection.js'`（脚本在 scripts/ 下）：
- 生成测试图：System.Drawing 纯色 800x600 PNG 写入 `uploads/images/{artistId}/`（alice 的 id=2）
- artworks 表 INSERT：6 张作品含 2 张封面（is_cover/cover_order/width/height 字段）
- 头像：`UPDATE artists SET avatar`；**公告：`UPDATE artists SET announcement = 纯文本`——不要写 JSON 字符串！** 后端 `getAnnouncement()`（artist.service.ts:656-666）把 TEXT 字段原样包成 `{text, expiresAt}`，写 JSON 字符串会导致前端 TplAnnouncement 显示 JSON 原文 `{"text":"...","expiresAt":null}`（实测踩坑）
- 留言：`guestbook_messages` status='approved'
- **画风**：art_styles + style_sizes INSERT 后，`/api/public/styles/:subdomain` **只返回 1 个画风**——不是 bug，是 `multi_style_enabled=0` 门控（getPublicGallery 注释：只有默认画风参与对外标注）。要测多画风 UI 需 `UPDATE artists SET multi_style_enabled=1`
- 踩坑：PowerShell 里 `npx tsx -e "..."` 内嵌 SQL 单引号会炸（Unterminated string literal），**写 .mjs 脚本文件再跑**，别用 -e

## 巡检指标（DOM 计算样式量化，无 vision 模型时）

browser_console 表达式**别写太长**（Evaluation error: SyntaxError: Unexpected end of input），分小块：
- `html.dark` 是否存在 + `data-palette` / `data-accent`（确认当前是亮/暗哪个模式！本会话浏览器默认暗色，CTA 色是暗色变体 #4de8d9，误判会以为 EP 蓝泄漏）
- `.tpl-status-dot` 背景色（open=success 绿 / full=warning 橙）
- CTA/按钮 `getComputedStyle(...).backgroundColor`（对比 palettes.css 亮暗两套值）
- 破图：`[...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length`
- EP 泄漏：`.el-button, .el-tag` 计数 + 实际渲染色（classic 模板用原生 button，epCount=0 正常）
- CTA 重复：统计含"约稿"文案的 button 数
- **disabled 一致性**：full/break 画师页对比 hero/侧栏/档位区按钮的 disabled 状态是否一致（本批实锤 TplTierGrid 按钮漏 status 判断）

## 亮/暗模式切换（关键坑）

- 直接删 `html` 的 dark class 会触发 store 重渲染，页面变空或回滚（实测）
- **用 pinia store 方法**：`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('theme').setBase('light'|'dark')`——有 watcher 同步 DOM + localStorage
- 页面意外跳 about:blank 后重新 `browser_navigate` 恢复

## Vue 组件状态读取（排查交互失效）

- 组件树 walk：从 `document.querySelector('#app').__vue_app__._instance.subTree` 递归，按 `vnode.component.type.__name` 找组件实例；**异步模板会包 AsyncComponentWrapper**（`__name='ArtistHomeGallery'` 在 wrapper 内部），walk 时穿透 `subTree` 即可
- 读 setupState：`comp.setupState.heroRef`（proxy 自动解包）；**undefined 说明 ref 绑定未生效**
- 读 props：`comp.props.visible`（TplStickyCta 实测 false 即实锤吸底条不触发）
- **坑：表达式返回 DOM 节点会序列化失败**（"Expression returned a live DOM node"）——只返回 primitive（tagName、instanceof Element 布尔）

## 本批已实锤缺陷（浏览器实测证据，入清单）

1. **三模板吸底 CTA 永不触发（gallery/folio/atelier，P1）**：滚到页面底部（hero 早已滚出视口 -2000px+），`.tpl-sticky-cta` 始终不在 DOM，TplStickyCta visible prop 恒 false。根因：`heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)`，实测 `heroRef` 为 null（TplHero expose 正常，sentinelEl 是合法 HEADER）→ computed 返回 undefined → `useStickyCta` 的 `watch(sentinelRef, setup)` 拿 undefined 直接 return，IntersectionObserver 从未建立。**排查法见上节 Vue 组件状态读取。**
2. **folio 导航锚点缺失**：navItems 只有 gallery/pricing，页面有 rules/guestbook 区块；空数据时 #gallery section v-if 隐藏 → 导航"作品"指向不存在锚点，点击无反应。实测空态 `document.getElementById('gallery')` 为 null。
3. **TplTierGrid「选择此档位」未随画师状态禁用（P1）**：bob status=full 时 hero/侧栏"我要约稿"正确 disabled，但 TplTierGrid.vue:58-64 只判断 `visibility === 'showcase'`，未检查 artist.status → full/break 画师档位按钮仍可点。TplStyleGrid 同样无 status 判断。OrderForm 无前端 status 拦截（grep 确认）。
4. **seed 幂等性差**：price_tiers 无唯一约束，seed 跑两次产生重复档位（bob 主页实测「全身插画 ¥350」出现 2 次）——真实可见，A 测数据卫生问题。
5. **TplHero 按钮动画时长违规（漏网项）**：`TplHero.vue:115` `.tpl-btn` transition `0.25s cubic-bezier(0.22,1,0.36,1)`——四模板共享 hero 按钮违反批 1 的 0.15s 纪律（位移 -2px 已符合）。classic-cta 0.2s / gb-submit 0.2s+0.15s / gallery-filter 0.2s 时长混用。
6. **atelier 字体体系不一致**：标题/公告/留言板硬编码 `'Noto Serif SC'`（ArtistHomeAtelier.vue），其他模板/后台用 `var(--font-display)`（LXGW WenKai）——设计系统外字体。

## 已排除（非缺陷，实测确认）

- EP 出厂色泄漏：四模板亮/暗实测 CTA/徽章/按钮全走设计系统色值（亮 #34dbcb/#67c23a，暗 #4de8d9/#95d475），无泄漏
- 空态破图：el-avatar 首字兜底正常（"B"），无 img 破图
- "全封面"画廊边界：TplGallery:294-296 `filtered.length > 0 ? filtered : list` 有兜底，全封面不空
- gallery/fullscreen hero 无图时：纯色底 + 底部黑渐变（数据态观感，非缺陷，待设计判断）
- 画风只返回 1 个 = multi_style_enabled 门控（设计行为）
- classic 同页 2 个"我要约稿"（hero + 侧栏常驻卡）——设计注释"约稿按钮常驻"，判为规范既有设计

## 拍板后落档流程（用户对体检清单逐项拍板后，2026-08-06 实证）

体检报告交付后用户可能直接拍板（「1，修，怪不得我一直感觉少了。2不进，封面上限设置为6。3，疑似漏网。4先不做。」）。落档纪律：

1. **拍板原文逐字记录**进报告（含用户原话，如「怪不得我一直感觉少了」是用户此前就察觉缺陷的信号——拍板内容里往往藏了用户体感线索，别丢）
2. **同步更新报告所有相关节**（一次改完不留漏网）：摘要表（T8 行加拍板结论）→ 详情节 → 修复分组 C 组（"需拍板"→"已拍板"）→ 待确认问题节（划线划掉 + 指向拍板记录节）→ 新增「用户拍板记录」节（表格：项/用户结论/落实方向）
3. **区分「确认维持既有规则」与「新增规则」**：用户说"不进"是对 REQ-017 约束 2 的确认维持；"封面上限设置为 6"是**新需求**（此前无上限）——新规则要单独标注「建议补 REQ/明确验收标准」，不能混在既有规则里
4. 拍板前先核实现状：如「封面上限」搜代码确认当前无上限（is_cover/cover_order 无数量校验），拍板才成立
5. commit 到分支，交付时告知一号（含新需求待排期）

## 只读批铁律

- 所有临时文件（vite 配置 / demo 脚本）**不入库**，交付报告前 `git status` 必须干净
- 交付报告写「据实测」与「代码静态观察」区分，不把推测当事实
- 端口冲突不杀他人进程（二号/三号/五号可能正在用）
- 截图存 `docs/audit-screenshots/template-check/`（worktree 内建目录），交付随报告给一号
