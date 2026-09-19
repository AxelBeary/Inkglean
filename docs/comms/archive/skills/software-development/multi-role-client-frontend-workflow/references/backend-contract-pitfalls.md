# 后端契约校验与前端跨层技巧（v0.31–v0.32 实战沉淀）

## 1. 提交链路接通前必读后端 route schema（最重要）

本项目 Fastify 路由用 ajv schema 校验，业务路由 body 普遍声明 `additionalProperties: false`。
前端接任何提交 payload 前：

- 打开对应路由文件（`server/src/features/**/**.routes.ts`）核对 body schema 的
  `required` 与 `additionalProperties`
- **新字段未在 schema 声明 → 400 VALIDATION**（不是静默剥离，直接拒单）
- v0.32 Phase 2 教训：`POST /api/orders` schema 无 styleSizeId/addons 新格式字段，
  直传会 400。兼容方案：结构化信息写入 description 前缀（如 `[画风 / 尺寸 / 增项摘要]`），
  tierId=null、addons=[]，并在交付报告"需一号关注"里注明后端待扩展。
  **绝不臆造后端未声明的字段指望它接受。**
- 注意区分两种 ajv 行为：`removeAdditional`（静默剥离，个别路由）vs
  `additionalProperties: false`（拒绝，主流）。两种都查，别只记一种。
- 派工里写的响应格式仍要对照源码复核（派工是摘要，可能漏字段/漏嵌套）。

## 2. 空 items 的 PUT = 只读查询（免新增后端端点）

GET 返回的嵌套数据缺失时（如 GET /art-styles 不返回 size_addon_overrides），
若对应 PUT 是 upsert 语义，`PUT .../overrides { items: [] }` 可当只读查询用——
空数组不产生写入，返回值就是当前覆盖列表。
前提：读 service 层确认空数组时循环体不执行、末尾照常 return 现有数据。
适用场景：展开面板时按需回显，避免为一号/三号加端点。

## 3. 派工文件名不可盲信

派工曾写 locales 为 `zh.json/en.json`，实际是 `zh-CN.js/en.js`。
开工前用 search_files 确认实际文件名，以实际为准，报告里注明差异即可，不用回问。

## 4. 新功能 UI 门控自检（防"功能做了但永远看不见"）

新增功能区域后，枚举所有控制其可见性的 `v-if`/入口条件逐个验证：
v0.31 教训：折扣码输入区藏在"详细计价"展开面板里，而展开入口
`hasPricingExtras` 只看增项+倍率——画师开折扣但无增项/倍率时入口不显示，
折扣输入区永远不可见。修复：门控条件纳入 `discountEnabled`。

## 5. i18n：t() 生成的选项数组必须 computed

下拉选项/筛选选项等由 `t()` 映射生成的数组，用 `computed(() => [...])`
而非普通常量，否则切换语言后标签不更新（logTypeOptions 教训）。
控件类型/计价模式等枚举标签同理。

## 6. 交付侧固定动作

- worktree 无 node_modules：先 `npm install` 再跑 eslint/build
- 交付报告写到**主 worktree** 的 `docs/comms/`（不进分支）；报告注明 commit hash + ESLint/build 结果
- commit 拆分需保证每个 commit 独立可 build（i18n 键无法按组件拆时整体放首个 commit）
- 完成后转交输出格式固定："二号转交一号，文件：docs/comms/xxx.md"
