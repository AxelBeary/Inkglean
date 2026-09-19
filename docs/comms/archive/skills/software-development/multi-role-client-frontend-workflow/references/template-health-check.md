# 四模板体检 / 交互失效诊断配方（2026-08-06 模板体检批沉淀）

适用：二号/五号/四号在 artist-commission 做客户端四模板（classic/gallery/folio/atelier）浏览器实测、交互失效诊断、demo 数据准备。

## 起隔离实测环境（3000 被占时）

- 症状：`tsx` 报 `listen EADDRINUSE` 但 `netstat` 无 LISTENING 记录——**CLOSE_WAIT 半开连接**占端口。用 `netstat -ano | Select-String ':3000'` 找 CLOSE_WAIT 的 PID，`Get-CimInstance Win32_Process` 看命令行——可能是**其他 worktree 的 vite**（其 proxy 指向你端口留下的半开连接）。**别杀他人进程**。
- 解法：server 起独立端口（`$env:PORT='3001'; npx tsx src/index.js`），vite 用临时配置改 proxy（`web/vite.tpl-check.config.mjs` 内容复制 vite.config.js 改 target 端口），`npx vite --config vite.tpl-check.config.mjs`。用完先 kill vite 再删配置（vite watch 到配置被删会重启失败报错）。
- DB 独立：worktree 本地 `server/data/commission.db`（不影响其他 worktree）。init+seed：`npm run db:init`（node 纯 JS 可跑）→ seed 必须 `npx tsx src/db/seed.js`（import .ts 文件，node 跑 ERR_MODULE_NOT_FOUND）。

## 造 demo 数据前先读后端转换逻辑（教训）

给 `announcement` 字段写 `JSON.stringify({text, expiresAt})` 会直接显示 JSON 原文——后端 `getAnnouncement()`（artist.service.ts:656）把 TEXT 字段当纯文本包成 `{text, expiresAt}`。**造任何 demo 数据前先 grep 后端读取/转换函数，按最终 API 契约造数据**，不按直觉。

- seed 幂等性差：price_tiers 无唯一约束，`INSERT OR IGNORE` 只保护 artists（subdomain 唯一），seed 跑两次产生重复档位（id 1-3 与 6-8）→ 主页档位区重复展示。**开发库重复 seed 后的数据层现象，别误判为前端 bug**；A 测前建议清库重 seed。
- alice demo 数据配方：6 张 System.Drawing 生成的 800x600 PNG 放 `server/uploads/images/2/`，SQL 插 artworks（2 封面 + 4 普通）、avatar、留言（guestbook_messages 表 status='approved' 才显示）、art_styles/style_sizes（要测多画风 UI 需 `UPDATE artists SET multi_style_enabled=1`，否则 API slice(0,1) 只返回默认画风——这是设计行为不是 bug）。
- 临时脚本写 `server/scripts/tpl-*.mjs`（`import db from '../src/db/connection.js'`），测完即删。

## Vue 异步组件 ref 陷阱（吸底 CTA 类交互失效）

**症状**：依赖「哨兵元素 + IntersectionObserver」的交互（gallery/folio/atelier 吸底约稿条）完全不触发，滚到底部元素也不出现。

**根因**：模板经 defineAsyncComponent 加载（ArtistHome.vue），模板内 `ref="heroRef"` 绑子组件时 `heroRef` 为 null → `computed(() => heroRef.value?.sentinelEl?.value)` 恒 undefined → `useStickyCta(undefined)` 的 `watch(sentinelRef, setup)` 首次 setup(undefined) 直接 return，**observer 从未建立**，此后 computed 无变化不再触发。

**取证链**（浏览器 console）：
```js
// 1. 组件树遍历找实例（注意 AsyncComponentWrapper 包一层）
const app = document.querySelector('#app').__vue_app__; let found = null
const walk = (vnode, depth) => { if (found || depth > 10) return
  if (vnode.component && vnode.component.type && vnode.component.type.__name === 'ArtistHomeGallery') { found = vnode.component; return }
  if (vnode.component && vnode.component.subTree) walk(vnode.component.subTree, depth + 1)
  if (vnode.children && Array.isArray(vnode.children)) vnode.children.forEach(c => walk(c, depth + 1)) }
walk(app._instance.subTree, 0)
// found.setupState.heroRef → null 坐实；读 ref 自动解包，DOM 节点会序列化报错，先取 tagName
// 2. 反查子组件 expose 正常：TplHero 实例 exposed.sentinelEl.value 应是 HEADER
// 3. 读目标组件 props 佐证：sticky.props.visible === false 即使已滚出视口
```
**JS 派发 mouseover 不触发 CSS :hover**（transform 恒 none）——hover 位移验证需真实指针，代码层面读 transition 规则即可。

修复方向（参考）：哨兵改 DOM 查询（onMounted 后 `document.querySelector('.tpl-hero--fullscreen')`）或 useStickyCta 对 null 元素重试。

## themeStore 切换亮暗（客户端）

直接改 `pinia.state.value.theme.base` 不触发 watch；用 store 实例方法：
```js
const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
pinia._s.get('theme').setBase('light') // 或 'dark' —— watcher 同步 applyTheme
```
导航后 store 重置（base 回 localStorage），每页重新 set。

## 模板体检标准检查点（可复用清单）

1. **动画纪律**：hover 位移 -2px、时长 0.15s、无滥用 bounce。注意批 1 只授权 theme.css 全局 `.el-button`，**模板 scoped 样式里的漏网项**（如 TplHero `.tpl-btn` transition 0.25s）要单独记。
2. **空态防御**：无头像（el-avatar 首字兜底不破图）、无画风（TplTierGrid 兜底）、无作品（画廊区整段隐藏，导航锚点是否失效）、无公告。
3. **EP 出厂色泄漏**：亮/暗各采样 hero 按钮/徽章/CTA 的 computed backgroundColor 对比设计 token（亮 accent1=#34dbcb、success=#67c23a；暗 #4de8d9/#95d475）。
4. **CTA 重复**：数同页"约稿"类按钮（hero/nav/侧栏/吸底/CTA 区），区分专用按钮（"选择此画风"）。
5. **字体混用**：展示字体（--font-display 文楷）vs 硬编码字体（atelier 的 'Noto Serif SC' 是体系外硬编码，记待设计拍板）。

## 实测判类（四号报告分类法）

① 实现走样（违反现有规范，可修）② 规范缺失（没规定这块）③ 数据态观感（空数据导致，非缺陷）④ 评审已提但核实不实——**本批实测未复现任何被一号打回的指控**（avatar 破图/排序/无画风挂按钮），与一号静态核实一致，说明外部评审可信度打折判断成立。
