# 815 第三批 I 路 交付日志：系统增项模板管理入口 + 覆盖开关（拍板 #5）

日期：2026-08-15
分支：`815-b3-addon`（git worktree：`d:\Hermes Agent CN Desktop\workspace\815-b3-addon`）

## 一、动手前核实（铁律 4 三项，结论先行）

### ① addon_templates 表结构与 artist_id NULL 的查询方式

- 结构见 `server/src/db/schema.ts`（401-421 行）：`id / artist_id(可空, NULL=系统预置) / name / control_type('switch','quantity') / price_mode('fixed','percent') / default_price / unit_label / sort_order / category('add','usage','rush') / max_quantity / created_at`。
- 系统模板查询方式：`WHERE artist_id IS NULL`（与迁移 v49/v50 种子、画师侧 `getAddonTemplates` 的 `artist_id IS NULL` 分支同口径）。索引 `idx_addon_templates_artist` 在 `(artist_id, sort_order)`。

### ② style_addons.price_override 与 addon_template_id 的 FK 行为

- `server/src/db/schema.ts` 473 行与迁移 v49/v50 均确认：`FOREIGN KEY (addon_template_id) REFERENCES addon_templates(id) ON DELETE SET NULL`。
- 因此删除系统模板**允许**；引用行 `addon_template_id` 自动置 NULL，快照列（`tpl_*`）保留。为防止“快照列为空导致解绑后独立增项失去展示/计价数据”，删除前仍显式把模板数据快照写入引用行（与画师侧删除策略一致）。

### ③ 计价读模板价 vs 覆盖价（price_override 消费点）

- `server/src/features/pricing/style-pricing.service.ts`（124-159 行）：绑定行以 `at.name/control_type/price_mode/default_price/category/max_quantity` 为权威；价格优先级为 **尺寸覆盖 > style_addons.price_override > 模板当前价**（`override?.price_override ?? sa.price_override ?? sa.default_price`，150-159 行）。
- 公开配置快照同口径：`server/src/features/pricing/style.service.ts` 913 行 `ov?.price_override ?? sa.price_override ?? sa.tpl_default_price`。
- 结论：`price_override IS NULL` 的行会自动跟随模板新价；写入 override 后即冻结在自身价格。冻结语义与同步语义落地时无需改计价引擎。

## 二、核心语义说明（按拍板口径实现，无自行发挥）

- **冻结（默认，sync=false 或缺省）**：仅当本次更新改变 `default_price` 时，先 `UPDATE style_addons SET price_override = 旧模板价 WHERE addon_template_id = ? AND price_override IS NULL`，再更新模板字段；全部在同一事务内，后置校验失败整体回滚。
- **同步（sync=true）**：只更新模板字段，不写任何 override；`price_override IS NULL` 的引用行自动跟随新价。
- **已覆盖行**（`price_override` 非 NULL，无论来源）：冻结/同步两种模式一律不碰。
- **不提供“解冻恢复跟随”**：v1 无法区分冻结写入与画师自定义；界面说明文案如实写明（`admin.addonTemplatesFreezeNote`）。
- **新画师导入仍取模板当前价**：现有 `setStyleAddons` 插入时 `price_override=NULL`，导入即跟随，未改动。
- **删除**：仅允许删 `artist_id IS NULL` 的行（画师私有模板经本端点一律 404，防误删）；FK 为 SET NULL，删除前快照模板数据到引用行，响应返回 `referenced` 数供前端二次确认文案使用。

## 三、改动文件清单（逐条）

### 后端（server/）

1. `server/src/features/admin/admin-addon-templates.service.ts`（新增）：系统模板列表（含 `referenced` 引用计数）、新建（artist_id 恒 NULL）、更新（冻结/同步语义）、删除（快照+SET NULL 解绑）；字段校验与画师侧 v50 口径一致（含用途/加急必须百分比+开关的组合约束、percent 0-1000 整数、max_quantity 1-999、sort_order 0-9999）。
2. `server/src/features/admin/admin.routes.ts`（修改）：新增 4 个端点，全部 `preHandler: requireAdmin`，写操作由 `registerAdminStepUpHooks` 自动追加 step-up 守卫（与 admin 内其他写路由同机制）：
   - `GET /api/admin/addon-templates`
   - `POST /api/admin/addon-templates`
   - `PUT /api/admin/addon-templates/:id`（body 可带 `sync: boolean`，缺省 false=冻结）
   - `DELETE /api/admin/addon-templates/:id`
   - PUT body 属性不带 AJV `default`（防缺省字段被默认值覆盖），与画师侧 PUT 口径一致；`sync` 保留 `default: false`。
3. `server/tests/admin-addon-templates.test.js`（新增）：4 条服务端测试：
   - TC-AT-01 冻结语义（旧价入 NULL 引用行 override、模板价更新、已覆盖行不动）
   - TC-AT-02 同步语义（NULL 行跟随、已覆盖行不动）
   - TC-AT-03 删除守卫（画师私有模板/不存在 404；系统模板删除后引用行快照保留并解绑）
   - TC-AT-04 列表仅含系统模板且带引用计数；非管理员 403

### 前端（web/）

4. `web/src/views/admin/AddonTemplateManage.vue`（新增）：管理端“系统增项模板”页——列表（名称/类别/控件/计价/价格/排序/引用画风数）、新建/编辑弹窗（字段同 I1）、编辑弹窗内“同步到已导入画师”复选框（默认不勾选=冻结，含同步/冻结说明与“冻结后不再跟随、恢复须画师手动改”说明）、删除两步确认（引用数>0 时说明保留为独立增项）。复用 `components/artist/addon-utils.js` 的控件/类别标签函数与 `constants/addon.js` 价格魔数，不新造口径。
5. `web/src/components/admin/AdminLayout.vue`（修改）：侧栏配置组新增“系统增项模板”入口（`Files` 图标）。
6. `web/src/router/index.js`（修改）：新增 `/admin/addon-templates` 子路由（`requiresAdmin`，标题键 `admin.addonTemplates`）。
7. `web/src/api/index.ts`（修改）：`adminApi` 新增 `getAddonTemplates / createAddonTemplate / updateAddonTemplate / deleteAddonTemplate`。
8. `web/src/api/types.ts`（修改）：新增 `AdminAddonTemplate / AdminAddonTemplateInput / AdminAddonTemplateUpdate / DeleteAdminAddonTemplateResult`。
9. `web/src/locales/zh-CN.js`、`web/src/locales/en.js`（修改）：新增 `admin.addonTemplates*` 一组键，中英同步。

### 交付日志

10. `docs/815-b3-addon-交付日志.md`（本文件）。

## 四、验证与静态自查记录

- `server`：`tsc --noEmit` 通过；`oxlint`（本次改动文件）通过；`eslint` 对该仓库 TS 文件报“no matching configuration”忽略（仓库实际主 lint 为 oxlint，已覆盖）。
- `web`：`vue-tsc --noEmit` 通过；`check-i18n` 通过（存量豁免 13 条，无新增硬编码中文）；`eslint` 对本次 `.vue` 文件通过（`index.ts/types.ts` 同样被 flat config 报告为忽略，未产生错误）。
- 布局自检（huiyue-layout-audit v2）：
  - `measure.mjs`（仅本次新增页面）：圆角族 0、野生圆角 0、离栅间距 0、需人工核验 0 → 阻塞=false。
  - `measure.mjs`（含本次碰过的 `AdminLayout.vue` 全文件）会命中该文件**存量**的野生圆角（8px/9px/2px）与离栅间距（6/9/10/11/14/26px）。这些均非本任务引入，且修它们超出本清单范围（铁律 1），故未改动，如实记录。
  - 截图/VL：无法产出。本沙箱禁止派生子进程（`spawn EPERM`，errno -4048）：`tsx/esbuild` worker、`vitest` 配置加载、Edge headless（crashpad/mojo 启动失败）均被拒，因此技能要求的 before/round 截图与 VL 评审无法执行；已按技能护栏“如实写明原因”，未静默跳过。后续可在可派生进程的环境中补跑截图与 VL。
  - 人工静态评审（截图不可用时按 huiyue-layout-audit 清单逐项自评，仅针对新增页面代码与可复用公共样式）：
    - C1 列表层次：el-table 标准行 + 类别/控件标签分组，无等高密堆 → 否（无问题）。
    - C2 圆角统一：新页面未写任何字面圆角，卡片/按钮走 `admin-section-card`/EP 默认 token → 否（无问题）。
    - C3 空间浪费：单卡片 + 页头操作区，无 >20% 低信息密度区 → 否（无问题）。
    - C4 视觉层次：标题 → 主表 → 行内操作按钮层级明确 → 否（无问题）。
    - S1/S2/S3：列对齐由 el-table 保证；新页面字面间距仅 4px/8px（4px 倍数），其余走公共 token → 否（无问题）。
    - S4/S5：页头下边距 24px、卡片内边距走 EP 默认；窄屏由 AdminLayout 侧栏折叠 + el-table 横向滚动兜底，未做视觉确认（受截图限制）→ 如实记录待补。
- 测试运行：`vitest` 在沙箱内因 esbuild worker spawn EPERM 无法启动；4 条测试已就绪待 CI/本地运行。
- 完整门禁未运行（按铁律 3 禁止）；未执行 `git add` / `git commit`（按铁律 2）。
