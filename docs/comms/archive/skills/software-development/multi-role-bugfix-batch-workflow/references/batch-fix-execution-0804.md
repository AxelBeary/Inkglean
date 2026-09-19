# 批次修复执行实录（2026-08-04 audit 批次 A）

## 1. TDZ 陷阱：给前面的路由加 preHandler/schema 时
admin.routes.ts 插件函数内 `requireExistingArtist` 是**函数声明**（提升，前面的路由可用），但 `const intId = {...}` 在 L455——L261 的路由引用 `schema: intId` 会在注册时 ReferenceError（const 不提升）。
**规则**：给路由加 preHandler/schema 前确认符号声明形态：函数声明随处可用；const 只能在声明位置之后用。本次曾误加后自查发现并移除。

## 2. 尾差吸收必须按"比例总额"而非订单总额
修 recalcInstallmentAmounts 初版写末节点 = totalCents − 前 N-1 之和，单节点 30% 场景（现有 TC-ADJ-01）会把 30% 节点算成 100%。
**正确**：`ratioTotal = Math.round(totalCents × Σbasis_points / 10000)`，末节点 = ratioTotal − allocated。
**规则**：改共享重算公式前，先搜调用它的全部现有测试（尤其非常规比例），并加"比例和≠100%"边界用例（TC-ADJ-03）守护。

## 3. Vue 模板 :disabled 绑定必须用 ref
Settings.vue `let rulesLoaded = false` 无法支撑模板 `:disabled="!rulesLoaded"`（非响应式）。改 `const rulesLoaded = ref(false)` 后**同步改全部脚本内引用为 `.value`**（loadRules 判断、saveRules 守卫）。

## 4. el-alert 双渲染
`:description` prop 和默认 slot 同时用，内容渲染两次。二选一（slot 里要放重试按钮时用 slot，去掉 description）。

## 5. 守卫位置取决于路由的标识形态
- subdomain 标识的公开路由 → 路由层守卫 `requireVisibleArtist(subdomain)` 抛 404
- 实体 ID 标识的路由（artworks/:id/like，拿不到 subdomain）→ 服务层按 artist_id 查可见性（`isArtistVisibleById`）返回 null → 404

## 6. 服务层不得 import auth 中间件（循环依赖）
middleware/auth.ts import artist.service，反向 import 中间件的 getAdminQq 会成环。在 artist.service.ts 本地实现 `readAdminQq()`（platform_config 优先、env 兜底），注释注明语义对齐+避免循环依赖的原因。

## 7. ad-hoc 验证脚本 FAIL：先怀疑脚本再怀疑代码
本次脚本 `indexOf("'/api/admin/artists/:id/rules'")` 命中的是先定义的 GET 路由，误报 PUT 未修。
**规则**：① 定位路由锚点带方法前缀（`put('/api/...`）；② 脚本报 FAIL 先 read_file 实际源码确认，代码可能一直是对的；③ 修脚本后重跑，全绿才算数。

## 8. i18n 批量补齐：双轴对照
"后端错误码 → 前端 errors.* 键"与"zh-CN ↔ en 互相对齐"是**两个不同比较轴**。子代理报"i18n 完全对齐"（zh↔en 轴）与自挖"缺 56 键"（后端→前端轴）可以同时成立——报告必须写明口径，否则一号误以为结论矛盾。
对照脚本：`scripts/i18n-code-coverage-diff.mjs`（正则提码 + ESM import locales + 缺键/不对称/空值/占位符检测），跑完即删。

## 9. 子代理"报错"≠工作丢失
UI 显示子代理报错时先查磁盘产物再决定是否重派：
- `cache/delegation/live/<id>/manifest.json` → status 字段（本次两任务均 status=completed）
- `cache/delegation/subagent-summary-*.txt` → 完整报告原文
本次 task-0/task-1 实际都完成了，仅结果回传环节失败，read_file 磁盘产物直接并入即可。summary 末尾的 "subagent modified files" NOTE 可能是误报——用 git diff 核实（本次 STATUS.md diff 为 0）。

## 10. 批次验证标准（一号授权模板）
tsc --noEmit 0 错 + 后端 vitest 全绿（本次 672/672，+5 新用例）+ 前端 vitest + eslint 0 + build 成功 + ad-hoc 聚焦脚本（Temp 下，跑完即删）。新用例编号顺延（TC-RT-21 起、TC-ADJ-02 起）。
