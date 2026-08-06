# artist-commission 前端实现模式与踩坑（二号）

项目特定知识库。Vue 3 + Element Plus + vue-i18n。随任务积累，新条目往下追加。

---

## 文件与命名（先查文件系统，别信派工文档）

- locale 文件实际是 `web/src/locales/zh-CN.js` 和 `en.js`（**不是** zh.json/en.json——派工文档写错过）。动手前 `search_files` 确认。
- 派工里给的文件名/路径可能与实际不符，一律以文件系统为准。

## API / 数据层模式

- **axios 响应拦截器自动翻译错误码**：拦截器读 `errors.${code}` i18n key。新增 API 错误展示时，只需在两个 locale 的 `errors` 命名空间加键（中英同步），组件里直接用 `err.message` 即可，**不需要**逐组件写错误码映射。
- **先查现有响应再决定加不加接口**：`getPricing` 已返回 `discountEnabled`（前端 `pricingData` 已有）；`getArtStyles` 返回嵌套 `sizes` + `addons`，addon 行带 `template_name/template_control_type/template_default_price` 等 JOIN 字段。读 `server/src/features/**/*.service.ts` 的返回结构，不只看路由签名。
- **空 items 的批量 PUT = 只读回显**：没有 GET 端点时，`setSizeOverrides(styleId, sizeId, [])`（空 items）返回当前覆盖列表且不改动数据。可用于展开面板时回显。
- 后端契约确认三件套：路由 schema（请求体字段）+ service 返回结构 + 错误码枚举（`shared/errors.ts`）。

## Vue / i18n 实现踩坑

- **i18n 选项数组必须用 `computed`**：`const opts = computed(() => [...].map(v => ({ label: t(...) })))`。setup 时一次性 `.map()` 的静态数组在切换语言后标签不更新。
- **条件渲染容器里加 UI，先追完整可见性链**：折扣码输入区在 `price-preview` 内，而 `price-preview` 被 `pricingExpanded && hasPricingExtras` 门控。画师开启折扣但无增项/倍率时 `hasPricingExtras=false` → 输入区永远不可见。修复：把 `discountEnabled` 并入 `hasPricingExtras`。新增嵌套 UI 时逐层检查每个 v-if/v-show。
- **新组件全 i18n**：旧组件（AddonManager 等）有硬编码中文，属历史债；新组件一律 `$t()`，不照抄旧风格。
- **composable 解构自检**：模板引用的每个变量必须出现在 `const { ... } = useXxx()` 解构里（v0.19 事故：`availableAddons` 漏解构致 undefined.length 崩溃）。
- 共享组件（Tpl*.vue）只输出内容与状态，不带装饰性 CSS；视觉由各模板 class 控制。

## Git / worktree 工作流

- **新 worktree 先 `npm install`**：`web/node_modules` 不跨 worktree 共享，ESLint/build 前必须在 worktree 的 `web/` 里装依赖。
- **commit 拆分与共享 i18n 键**：locale 键无法按组件拆进不同 commit。把共享 locale 改动放进第一个 commit，保证每个 commit 独立可 build（后续 commit 引用的键已存在）。
- 验证以终端为准：`npx eslint .`（零错误零警告）+ `npm run build`。patch/write_file 工具内联的 lint 输出在本机常因路径转译报假的 MODULE_NOT_FOUND，**不要**据此判断代码有问题。

## 提交材料

- 交付报告写 `docs/comms/02-to-01-{主题}-report.md`（主 worktree，不进分支）：做了什么 + 改了哪些文件 + 分支名 + commit hash + 验证结果（ESLint/build 数字）。
- 转交话术：`二号转交一号，文件：docs/comms/xxx.md`（短文字直接给，别让操作人反问）。
