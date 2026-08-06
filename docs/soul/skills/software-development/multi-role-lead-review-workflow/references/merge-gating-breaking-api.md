# 合并门控与破坏性 API 变更审核

## 触发条件
- 交付报告/派工写明「暂不合入 / 合并门控」（后端先行、前端批未完成等跨层改动）
- 交付改动了**公开 API 响应结构**：删字段、改字段名、改字段类型、改数组元素结构

## 审核流程（与常规批一致，不降标）
1. 读交付报告 → 核对分支实况（git status/log vs master）
2. diff 逐行（安全关键点：SQL 占位/白名单/事务/防投毒向量）
3. **独立复跑门禁**（不信 self-report）：vitest + tsc + lint，数字必须与报告一致
4. 报告与实测不符 → 打回；一致 → 进门控决策

## 门控决策清单
1. **grep 前端消费者**：对每个被删/改名的响应字段，`search_files` 搜 `web/src`（含 views/composables/components/api）。
   - 有消费者 → **绝不合并**，合入即打挂客户端渲染
   - 别忘了 admin 前端、e2e fixture、docs 中引用旧字段的段落（docs 漂移记入遗留，不阻塞）
2. **STATUS 记账格式**：角色行写明「已交付通过审核（分支 X HEAD `<sha>`，门禁 N/N 独立复跑全绿；按门控暂不合入，等 <依赖批> 一起合）」
3. **分支与 worktree 冻结**：不回收 worktree、不删分支；分支停在交付 sha，期间 master 前进由该角色下轮开工时自行 merge
4. **依赖批对接点清单**：交付报告应含「响应结构变化」一节（删了什么/改成什么/新增接口），派前端批时指令里写明「对照报告 §N」
5. **迁移安全性**：若门控批含迁移（如新建表+种子），确认纯 CREATE/ADD 类（事务内安全）且有幂等守卫——门控期间迁移不进生产，但合入时一次性生效

## 门控解除时的合入顺序
- 前端批适配新字段 → 前端批与后端批**同轮合入**：先后端（接口就位）再前端，每次合并后重跑全量测试
- 合入后再 search_files 一次被删字段，确认真无消费者残留

## 实例（F2 外链后端，2026-08-05）
- 后端删 `weiboUrl/bilibiliUrl/platformUrls`，`customLinks` 改 `[{platformId,url}]`，platformId 后端权威重推导
- 审核：877/877 独立复跑全绿、防投毒 17 类向量全过、迁移 v42 纯 CREATE+种子幂等 → 通过
- 但 `web/src` 仍有 16 处旧字段引用（Settings.vue/LandingPage.vue/useArtistData.js）→ 按派工门控暂不合入，等 v0.38 后 F2 前端批一起合
- STATUS 记账锁定 `f2-social-backend` HEAD `4946993`，worktree 保留
