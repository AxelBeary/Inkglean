# 二号工作流踩坑记录（累积）

> SKILL.md 已达字符上限，新踩坑记录在此文件。skill_view 加载技能时会自动列出本文件。

## worktree 没有 node_modules

`git worktree add` 创建的目录不含 node_modules。在 worktree 里跑 ESLint / build 前必须先 `cd web && npm install`，否则报 `Cannot find package '@eslint/js'`（ESLint）或 vite 找不到依赖。主 worktree 已装过不代表 worktree 有。

## 条件渲染区的入口条件审计（v0.31 F3 教训）

在 `v-if` 门控区域内新增 UI 时，必须检查控制该区域显示的入口条件是否包含新功能的触发器。

实例：折扣码输入区放在 price-preview 内，而 price-preview 在 `v-if="pricingExpanded"` 里，展开按钮由 `hasPricingExtras` 控制。画师开启折扣但没有增项/倍率时 `hasPricingExtras=false` → 展开按钮不显示 → 折扣码输入区永远不可见。

修复：`hasPricingExtras` 纳入 `discountEnabled`。

**通用规则**：新增 UI 前，沿模板向上追溯所有包裹它的 `v-if` / `v-show`，确认每个门控条件在新功能场景下也能为真。

## 派工文件名可能与实际不符

派工文档写的文件名可能是过时的或笔误（如写 `zh.json/en.json`，实际是 `zh-CN.js/en.js`）。开工前用 `search_files(target='files')` 确认实际文件路径，以实际为准，不盲目按派工字面创建新文件。

## computed 惰性求值允许"先引用后声明"

Vue computed 是惰性求值，`hasPricingExtras` 引用在其后声明的 `discountEnabled` / `usageMultipliers` 是安全的（求值发生在渲染时，届时所有 const 已初始化）。项目已有此模式，不必为重排序而重排。
