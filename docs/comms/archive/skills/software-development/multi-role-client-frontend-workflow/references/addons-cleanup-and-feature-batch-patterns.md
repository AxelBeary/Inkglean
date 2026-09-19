# addons 旧模型清理批 + 前端批通用教训（2026-08-05，D 软提示批 + F1F2 批）

## 1. Vue 3 `<script setup>`：函数内给 ref 赋值必须 `.value`（模板自动解包，函数不自动）

**事故**：`goNextFromDetail()` 里写 `step.value = contactStep`（contactStep 是 computed），把 computed 对象赋给了 ref。
组件测试抓出：`wrapper.vm.step` 变成 `{ Object (fn, setter, ...) }` 而非数字，`expect(step).toBe(5)` 失败。

**规律**：模板里 `@click="step = contactStep"` 自动解包没问题；但 script 函数里 `step.value = contactStep.value`。
凡是「把 computed/ref 赋给另一个 ref 的 .value」都要带 `.value`。
**验证**：写组件测试断言 `wrapper.vm.step` 的具体数值（toBe 数字），能抓出这类对象赋值 bug。

## 2. git + PowerShell：中文文件名八进制转义导致「文件缺失」误报

**事故**：核查「疑似删了我的文件」时跑 `git ls-tree -r --name-only HEAD` + `Test-Path` 全量比对，
所有中文路径（docs/comms/*.md 等）显示 MISS + 「路径中具有非法字符」——因为 git 默认 `core.quotepath=true` 把非 ASCII 输出成 `\345\211\215...` 八进制，PowerShell 把它当字面量路径。

**正确做法**：
- 首选 `git status`：git 自己比较 HEAD vs 工作区，真有文件被删会显示 `deleted`，`clean` = 零缺失。
- 需要全量比对时：`git -c core.quotepath=false ls-tree -r --name-only HEAD` 再 Test-Path。
- master 上没有分支文件 ≠ 被删：可能是「尚未合入」（合入顺序由一号控制）。先看 `git log origin/master..HEAD`。

## 3. 删 composable 旧链路（旧模型清理批）的完整执行清单

删 `useOrderForm.js` 的旧模型 addons（availableAddons/addonGroups/addonSelections/addonToggles/buildSelectedAddons/formatAddonPrice/CATEGORY_META）时，按此顺序清引用，否则残留引用崩（v0.19 教训同款）：

1. **composable 本体**：删状态、computed、函数；连带删 watcher（deep watch 旧状态）、草稿 save/restore 分支、hasDraftContent 判断、提交 payload 字段、return 导出。
2. **组件模板**：删旧 UI 渲染块（v-for 区）；同步删解构列表里已删的变量。
3. **组件测试 mock**：`OrderForm.stepnav/summary.test.js` 的 `buildMockComposable` 返回对象里同步删 mock 字段（reactive({})/ref([])/vi.fn()）。
4. **composable 单测**：删专测用例（本批 10 例：formatAddonPrice 3 + availableAddons 3 + addonGroups 1 + buildSelectedAddons 2 + 默认值初始化 1），改受影响断言（onTierChange 清空断言、hasPricingExtras 语义、草稿恢复断言）。
5. **提交断言新写法**：前端停传后，`expect(h.created.addons).toEqual([])` → `expect(h.created.addons).toBeUndefined()`（断言「不存在」而非「空数组」）。
6. **UI 移除断言**：旧增项块删除后，旧用例「出现 addons 文本」→ 改为断言「不出现」：`expect(wrapper.text()).not.toContain('manualOrder.addons')` + `findAll('.addon-group')).toHaveLength(0)`。

**grep 残留清点**（派工要求列清单）：区分三类——旧模型 price_addons（清零）、画风 style_addons（一字不动）、自定义增项 customAddons（保留）。slot 透传无数据消费（如 TplTierGrid addons slot）无害可保留。

**合入顺序**：前端先停传（防 ajv additionalProperties:false 400），后端后删 schema——交付报告必须注明「本批先合、后端批后合」。

## 4. 前端校验纯函数复刻后端（防投毒/URL 校验类）

F2 外链批：前端 `linkValidation.js` 逐行复刻后端 `platform.ts`（裸链补 https/协议白名单/长度 253-1500-1800/域名末尾匹配），做成模块级纯函数 + 单测向量（27 例对齐后端 877 测试）。
**好处**：前端识别体验层与后端硬校验语义一致；测试可独立于组件跑。
**注意**：安全边界必须留在后端——前端校验只是体验层，后端强制重推导（platformId 后端忽略前端传值）。

## 5. 并行 worktree 端口冲突处理

3000 被其他角色 worktree（如 polish）占用时：**不杀别人进程**，自己的 server 用 `$env:PORT='3001'` 起。
vite proxy 写死 3000 时前端浏览器联调受限——改用「单测覆盖渲染行为 + curl 直测 3001 API 契约」替代。
f1f2 联调实测路径：`npm run start`（迁移 v42 实跑）→ 插入测试画师 → `npm run totp:rebind -- <QQ>`（需设 `DB_PATH` 指向 worktree 的 server/data/commission.db，默认指向仓库根 data/ 会报目录不存在）→ 手写 TOTP 码（RFC 6238 HMAC-SHA1 base32）登录 → curl 验证。
