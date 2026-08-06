# 批次 A 审计修复 + 交付卡死诊断实录（2026-08-04）

五个可复用技术点，按价值排序。

## 1. 子代理"UI 报错"≠ 真失败——磁盘恢复配方

用户报"子代理卡死/报错失败"时，**先读磁盘产物再下结论**，不要盲目重跑（重跑 = 浪费 20-35 分钟）。

产物位置（HERMES_HOME 下）：
- `cache/delegation/live/<delegation_id>/manifest.json` — 权威状态：每个 task 的 `status`/`exit_reason`/`completed` 时间
- `cache/delegation/live/<delegation_id>/task-N.log` — append-only 全量 transcript，末行 `final | status=...` 是最终状态，`assistant` 行含完整报告
- `cache/delegation/subagent-summary-<idx>-<时间戳>.txt` — 干净最终摘要（read_file 读，别用 PowerShell Get-Content——中文会变 GBK 乱码）

判定流程：manifest.json 显示 `status: completed` → 成果完好，只是结果回传/显示环节失败 → 读 summary 并入主报告，报告里写明"UI 报错仅回传环节，成果未丢"。

注意：批次结果回传时 summary 会被截断（"middle omitted"），**完整内容永远以 subagent-summary-*.txt 文件为准**，用 read_file offset/limit 翻页。

## 2. "末节点吸收尾差"的比例陷阱（BUG-4）

修分期/分摊类舍入漂移时，直觉写法"末项 = 总额 − 前 N-1 项之和"有个坑：**各项比例之和可能不等于 100%**（如单节点 30% 定金）。此时末项会吞下整个订单全额，把 30% 节点算成 100%。

正确写法：
```js
const totalBp = items.reduce((s, i) => s + i.basis_points, 0)
const ratioTotal = Math.round(total * totalBp / 10000)  // 按比例总额，不是订单全额
// 末项 = ratioTotal - allocated
```
**必须配两个测试**：多节点尾差场景 + 单节点比例≠100% 边界（后者守护这个陷阱，本次靠既有测试 TC-ADJ-01 逮住了错误初版）。

## 3. Fastify 路由注册的 TDZ 陷阱（BUG-8）

给早期注册的路由补 `schema: intId` 前先看 `intId` 定义位置——若它是函数体后段的 `const`（如 admin.routes.ts L455 定义、L261 路由引用），插件注册时求值直接 TDZ 崩溃。**函数声明（如 requireExistingArtist）有提升可前置引用，const 没有。** 改动路由 preHandler/schema 时，对照同文件内该路由之前已注册路由的写法，别引入它原本没有的引用。

## 4. i18n 缺键审计脚本模式（BUG-2）

errors.ts 错误码 vs locales 键的批量对照，用临时 .mjs 脚本一次跑完（跑完即删）：
- 正则提取错误码：`/^\s{2,4}([A-Z][A-Z0-9_]+):\s*'\1',?$/gm`（KEY: 'KEY' 自引用形态）
- `import(pathToFileURL(...))` 动态加载 locales ESM，取 `Object.keys(default.errors)`
- 输出四个维度：后端有/zh 缺、后端有/en 缺、中英互缺（孤儿键）、含 `{占位符}` 需插值的键
- 修复后重跑确认 122=122=122，结果写进交付报告

**口径区分**（写报告必注明）：zh↔en 互相对齐 ≠ 后端码→前端键全覆盖，两个比较轴各自独立成立，混着写会让审核人误读矛盾。

## 5. "无法X"报障的快速分诊

见 structured-bug-diagnosis 的"不可达功能"补丁。本次交付卡死案例：工作流订单 done 状态在 OrderDetail 的 v-if 工作流分支里没有交付按钮（按钮在 v-else 无工作流分支），后端 deliverOrder 完全支持——**纯前端入口不可达**。诊断顺序：后端守卫允许哪些状态 → 前端入口函数全部调用点 → 模板分支结构是否把当前场景隔在入口外 → 顺带 grep 确认"不用X"类能力是否真的存在过（零命中 = 从未实现，不是回归）。
