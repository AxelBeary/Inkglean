# v0.15 文档一致性审计报告
> 审计日期：2026-07-30
> 审计人：五号
> 审计范围：soul文件 / REQ文件 / README / STATUS.md

## 审计结果摘要

共检查 18 个文件（5 soul + 10 REQ + README + STATUS.md），发现 **14 处不一致**：
- 高严重度：1 处（REQ-008 状态严重过时）
- 中严重度：6 处
- 低严重度：7 处

---

## A. Soul 文件审计

### 逐文件检查结果

#### soul-01-lead.md — ✅ 通过（无问题）
- 技术栈描述「Fastify 5 + better-sqlite3 / Vue 3 + Element Plus + Vite / Docker + Caddy / Vitest / ESLint + CI」与 package.json 一致
- 「迁移 v1–v14」与当前实际一致（v0.14 已合入，v15 迁移尚未执行）
- 「模板系统 4 布局 × 4 配色」与 README 一致
- 协作接口表格完整（二号/三号/四号/五号/实际操作人）
- v0.14 后新增的「依赖升级验证」「合并安全」「通信机制」「效率纪律」均为有效规则

#### soul-02-client-frontend.md — ✅ 通过（无问题）
- 技术栈「Vue 3 + Element Plus」与实际一致
- 文件权限列表中的 composables（useArtistData/usePalette/useScrollReveal/useStickyCta）与项目结构一致
- i18n/XSS/ESLint 硬规则与项目实际规范一致
- 协作接口表格完整（一号/三号/四号/五号）
- v0.14 后新增的「二号硬规则」「效率纪律」均为有效规则

#### soul-03-backend-artist.md — ⚠️ 发现 1 处问题
- 技术栈「Fastify 5 + better-sqlite3 + Vue 3 + Element Plus」与实际一致
- **问题 S3-1**：第 14 行「已发布迁移（v1–v10）不可改动」— 实际迁移已推进到 v14（v0.14 已合入），应更新为「v1–v14」
- 协作接口表格完整（一号/二号/四号/五号）
- 其余规则（JSON Schema 硬规则、v-html 硬规则、迁移安全补充等）均有效

#### soul-04-requirements.md — ⚠️ 发现 1 处问题
- 无技术栈描述（需求角色不直接涉及技术，合理）
- **问题 S4-1**：缺少协作接口表格。其他 4 个 soul 文件均有「协作接口」表格（| 对象 | 配合方式 |），四号只有一句「我通过一号协调其他角色，不直接指挥二号/三号/五号改代码」。格式不对称。内容上其他角色都提到了四号，四号也应列出与一号/二号/三号/五号的配合方式
- 文件权限、工作方式、事实验证原则等均有效

#### soul-05-bugfix.md — ✅ 通过（无问题）
- 验证命令（`cd server && npx vitest run` / `cd web && npx eslint . && npm run build`）与 package.json 脚本一致
- 协作接口表格完整（一号/二号/三号/四号）
- 九步审计流程、风险分级、提交纪律等均有效

### 交叉一致性

| 检查项 | 结果 |
|--------|------|
| 一号→二号/三号/四号/五号 | ✅ 协作接口表格完整 |
| 二号→一号/三号/四号/五号 | ✅ 协作接口表格完整 |
| 三号→一号/二号/四号/五号 | ✅ 协作接口表格完整 |
| 四号→其他角色 | ⚠️ 无表格，仅一句话概述（S4-1） |
| 五号→一号/二号/三号/四号 | ✅ 协作接口表格完整 |
| 技术栈描述一致性 | ✅ 所有 soul 文件中的技术栈描述与 package.json 一致 |
| 通信机制规则 | ✅ 五个 soul 文件均包含 2026-07-29 通信机制 + 效率纪律 |
| worktree 独立规则 | ✅ 一号/二号/三号/五号均提到独立 worktree（四号在 master 直接操作，无需 worktree） |

---

## B. REQ 文件状态审计

### 逐文件检查结果

| REQ | 当前标注状态 | 实际状态 | 一致？ | 问题编号 |
|-----|-------------|---------|--------|---------|
| REQ-001 | 已审核，开发中 | v0.11 全部功能已合入（报价快照/焦点图/粘贴上传/修改次数告示/模板/问候/仪表盘），v0.14 也已完成 | ❌ | B-1 |
| REQ-002 | 已审核。R9 立即执行，R10/R11 并入 v0.11，R12/R13 备案 v0.12 | R9/R10/R11 已实施；R12 被 REQ-009 R50 替代；R13 未实施 | ❌ | B-2 |
| REQ-003 | 已审核。C26-C33 按建议执行 | R14-R20 全部已实施（v0.11.x + v0.12） | ❌ | B-3 |
| REQ-004 | 已审核（实际操作人确认 C34/C35） | R21 侧边栏折叠已在 v0.12 实施（README 功能特性已列出） | ❌ | B-4 |
| REQ-005 | 已审核，全部延期（待 v0.14+ 安排） | v0.14 已完成，R22-R25 仍未实施；v0.15 候选中未明确列出 | ⚠️ | B-5 |
| REQ-006 | 已审核，部分实施（R27/R30 v0.13 合入，其余待排期） | R27/R30 确实 v0.13 合入；R26/R28/R29/R31/R32 仍待排期 | ✅ | — |
| REQ-007 | 已审核，v0.13 核心项已实施（R33/R34/R35/R30 合入，R37 关闭，R36 延后） | 与 STATUS.md 一致 | ✅ | — |
| REQ-008 | **待一号审核** | v0.14 已全部合入（STATUS.md 明确「v0.14 合入完成」，172 测试通过） | ❌❌ | B-6 |
| REQ-009 | 待一号审核 | STATUS.md 四号状态「REQ-008/009 已交付」；REQ-010 第 73 行引用「REQ-009 已审核」 | ❌ | B-7 |
| REQ-010 | 待一号审核 | v0.15 规划文档，尚未开始实施，「待审核」合理 | ✅ | — |

### 问题详情

- **B-1（中）**：REQ-001 状态「已审核，开发中」严重过时。R1-R8 全部在 v0.11 实施完毕，应更新为「已关闭（v0.11 全部实施）」
- **B-2（低）**：REQ-002 状态未标注已完成。R9/R10/R11 已实施，R12 被 REQ-009 R50 替代，R13 未实施。应更新为「已关闭（R9-R11 已实施，R12 由 REQ-009 R50 替代，R13 取消）」
- **B-3（低）**：REQ-003 状态未标注已完成。R14-R20 全部已实施。应更新为「已关闭（v0.11.x + v0.12 全部实施）」
- **B-4（低）**：REQ-004 状态未标注已完成。R21 已在 v0.12 实施。应更新为「已关闭（v0.12 已实施）」
- **B-5（低）**：REQ-005 状态「待 v0.14+ 安排」措辞过时。v0.14 已完成且未包含 R22-R25。建议更新为「已审核，全部延期（v0.14 未包含，待 v0.15+ 安排）」
- **B-6（高）**：REQ-008 状态「待一号审核」严重错误。v0.14 已全部合入 master（STATUS.md 第 3 行「v0.14 合入完成」），R39/R42a/R42b/R43/R44/R45/R41 均已实施。应更新为「已关闭（v0.14 全部实施）」
- **B-7（中）**：REQ-009 自身标注「待一号审核」，但 REQ-010 第 73 行写「REQ-009 已审核」，STATUS.md 第 28 行写「REQ-008/009 已交付」。三处描述不一致。应统一为「已审核」或「已交付，待 v0.15 实施」

---

## C. README 审计

### 技术栈描述

| 检查项 | README 描述 | 实际 | 一致？ |
|--------|------------|------|--------|
| 前端框架 | Vue 3 + Element Plus + Pinia + Vue Router + Vite + vue-i18n | web/package.json: vue ^3.5, element-plus ^2.9, pinia ^2.2, vue-router ^4.4, vite ^6.0, vue-i18n ^9.14 | ✅ |
| 后端框架 | Fastify 5 + better-sqlite3 | server/package.json: fastify ^5.0, better-sqlite3 ^11.0 | ✅ |
| 部署 | Docker Compose + Caddy | docker-compose.yml + Caddyfile 存在 | ✅ |
| 认证 | HMAC-SHA256 + httpOnly cookie + 登录码 | 与代码一致 | ✅ |
| 测试 | Vitest（**165 个用例**） | STATUS.md：**172/172** 通过（7 文件） | ❌ C-1 |
| 工程化 | ESLint + Prettier + GitHub Actions CI | eslint ^10.8 + prettier ^3.9 + ci.yml | ✅ |

### npm 脚本命令

| README 命令 | server/package.json | web/package.json | 存在？ |
|-------------|--------------------|--------------------|--------|
| `npm run db:init` | ✅ `"db:init": "node src/db/init.js"` | — | ✅ |
| `npm run db:seed` | ✅ `"db:seed": "node src/db/seed.js"` | — | ✅ |
| `npm run dev` | ✅ `"dev": "node --watch src/index.js"` | ✅ `"dev": "vite"` | ✅ |
| `npm test` | ✅ `"test": "vitest run"` | — | ✅ |
| `npm run lint` | ✅ `"lint": "eslint ."` | ✅ `"lint": "eslint ."` | ✅ |
| `npm run build` | — | ✅ `"build": "vite build"` | ✅ |

全部命令均存在，无虚列命令。

### 目录结构

| README 描述 | 实际 | 一致？ |
|-------------|------|--------|
| server/src/features/auth/ | ✅ 存在 | ✅ |
| server/src/features/artist/ | ✅ 存在（含 workflow.service.js + greeting.service.js） | ✅ |
| server/src/features/order/ | ✅ 存在 | ✅ |
| server/src/features/upload/ | ✅ 存在 | ✅ |
| server/src/features/admin/ | ✅ 存在 | ✅ |
| （未列出） | server/src/features/**pricing/**（pricing.routes.js + pricing.service.js） | ❌ C-2 |
| server/src/shared/ | ✅ 存在 | ✅ |
| server/src/db/ | ✅ 存在 | ✅ |
| web/src/views/ | ✅ 存在 | ✅ |
| web/src/components/ | ✅ 存在 | ✅ |
| web/src/api/ | ✅ 存在 | ✅ |
| web/src/router/ | ✅ 存在 | ✅ |
| web/src/stores/ | ✅ 存在 | ✅ |
| web/src/locales/ | ✅ 存在 | ✅ |
| web/src/i18n/ | ✅ 存在 | ✅ |

### 环境变量

| README 提到的变量 | .env.example 中 | 一致？ |
|-------------------|-----------------|--------|
| SESSION_SECRET | ✅ 存在 | ✅ |
| **SIGN_SECRET** | ❌ **不存在** | ❌ C-3 |
| COOKIE_SECRET | ✅ 存在 | ✅ |
| ADMIN_QQ | ✅ 存在 | ✅ |

.env.example 注释说明 SESSION_SECRET「同时用于：JWT 签名、文件访问签名（HMAC）、Cookie 签名」，表明 SIGN_SECRET 已合并入 SESSION_SECRET。README 第 52 行（`修改 SESSION_SECRET、SIGN_SECRET、COOKIE_SECRET`）和第 148 行（安全说明）仍引用 SIGN_SECRET，过时。

### 功能特性与版本

- **C-4（中）**：README 功能特性列表止于 v0.13（hidden 状态），未包含 v0.14 已合入功能：R39 状态区重构、R42a 手动录单合并、R42b 须知编辑合并、R44 焦点/放大互换、R43 图库闪烁修复、R45 多选删除、R41 备注拖拽
- **C-5（低）**：README 第 128 行变更日志链接描述「v0.1 ~ v0.13」，应更新为包含 v0.14

---

## D. STATUS.md 格式检查

### 格式规范性

| 检查项 | 结果 |
|--------|------|
| 标题层级（# → ##） | ✅ 规范，无跳级 |
| 表格格式（表头 + 分隔线 + 数据行） | ✅ 3 个表格均格式正确 |
| 节间分隔线（---） | ✅ 每节之间均有 --- |
| 断行/排版 | ✅ 无异常断行 |
| 引用块（>） | ✅ 头部元信息使用引用块，格式正确 |

### 重要规则提醒完整性

STATUS.md 列出 8 条规则，逐条对照 soul 文件中的跨角色通用规则：

| # | STATUS.md 规则 | 来源 | 覆盖？ |
|---|---------------|------|--------|
| 1 | 合并到 master 后立即推送 | soul-01 合并安全 | ✅ |
| 2 | 操作 master 前 git log --oneline -5 确认 HEAD | soul-01 合并安全 | ✅ |
| 3 | 禁止对 master 执行 git reset --hard / git rebase | soul-01 合并安全 | ✅ |
| 4 | 提交前 git diff --stat 确认授权文件（禁止 git add -A） | soul-05 提交纪律 | ✅ |
| 5 | 开工前读本文件了解当前状态 | 所有 soul 通信机制 | ✅ |
| 6 | 代码必须在 git 里，未 commit 不算完成 | 所有 soul 通信机制 | ✅ |
| 7 | 实际操作人不是中继，交接写 comms 文件 | 所有 soul 通信机制 | ✅ |
| 8 | 并行角色必须在独立 worktree 工作 | soul-01/02/03/05 | ✅ |

**结论**：重要规则提醒部分覆盖了所有跨角色通用规则，无遗漏。角色特定规则（如 i18n 硬规则、JSON Schema 硬规则、依赖升级验证）不属于全局提醒范围，不列入是合理的。

### 格式问题

未发现格式错误。

---

## 问题汇总与建议修复

| # | 文件 | 问题 | 严重度 | 建议修复 |
|---|------|------|--------|---------|
| S3-1 | soul-03-backend-artist.md:14 | 「已发布迁移（v1–v10）不可改动」过时，实际已到 v14 | 中 | 改为「已发布迁移（v1–v14）不可改动」 |
| S4-1 | soul-04-requirements.md | 缺少协作接口表格，与其他 4 个 soul 文件格式不对称 | 低 | 补充「协作接口」表格（一号/二号/三号/五号） |
| B-1 | REQ-001:7 | 状态「已审核，开发中」过时，v0.11 已全部实施 | 中 | 改为「已关闭（v0.11 全部实施，一号审核通过 2026-07-29）」 |
| B-2 | REQ-002:7 | 状态未标注已完成，R12 被替代、R13 未实施 | 低 | 改为「已关闭（R9-R11 已实施，R12 由 REQ-009 R50 替代，R13 取消）」 |
| B-3 | REQ-003:7 | 状态未标注已完成，R14-R20 全部已实施 | 低 | 改为「已关闭（v0.11.x + v0.12 全部实施）」 |
| B-4 | REQ-004:7 | 状态未标注已完成，R21 已在 v0.12 实施 | 低 | 改为「已关闭（v0.12 已实施）」 |
| B-5 | REQ-005:7 | 「待 v0.14+ 安排」措辞过时，v0.14 已完成未包含 | 低 | 改为「已审核，全部延期（v0.14 未包含，待 v0.15+ 安排）」 |
| B-6 | REQ-008:7 | 状态「待一号审核」严重错误，v0.14 已全部合入 | **高** | 改为「已关闭（v0.14 全部实施，172 测试通过）」 |
| B-7 | REQ-009:7 | 自身标注「待一号审核」，但 REQ-010 和 STATUS.md 均引用为「已审核/已交付」 | 中 | 改为「已审核（四号已交付，待 v0.15 实施）」 |
| C-1 | README.md:42 | 测试数量「165 个用例」过时，实际 172 | 中 | 改为「172 个用例」 |
| C-2 | README.md:94-99 | 目录结构缺少 server/src/features/pricing/ | 低 | 在 features/ 下补充 `pricing/  # 价格计算（service + routes）` |
| C-3 | README.md:52,148 | 引用 SIGN_SECRET，但 .env.example 中已不存在（合并入 SESSION_SECRET） | 中 | 删除 SIGN_SECRET 引用，改为「修改 SESSION_SECRET、COOKIE_SECRET」 |
| C-4 | README.md:5-33 | 功能特性列表止于 v0.13，缺少 v0.14 功能 | 中 | 补充 v0.14 功能：状态区重构、手动录单合并、须知编辑合并、焦点/放大互换、图库闪烁修复、多选删除、备注拖拽 |
| C-5 | README.md:128 | 变更日志描述「v0.1 ~ v0.13」 | 低 | 改为「v0.1 ~ v0.14」 |

### 修复优先级建议

1. **立即修复**（高）：B-6（REQ-008 状态）— 严重误导，可能让角色误以为 v0.14 规划未审核
2. **本轮修复**（中）：S3-1、B-1、B-7、C-1、C-3、C-4 — 影响文档可信度和新角色理解
3. **顺手修复**（低）：S4-1、B-2、B-3、B-4、B-5、C-2、C-5 — 不影响工作流但应保持整洁
