# 用户直接报障的单 Bug 修复流程（2026-08-03 实战：{count} 占位符直出）

## 场景
用户（实际操作人）绕过一号直接报障。五号纪律：**先建独立 worktree 定位修复，同步通知一号补派工授权**。本次完整走通：报障 → wt-05 worktree → 容器内 API 复现 → 最小修复（后端+前端+locales+回归测试）→ 全量验证 → ad-hoc verify → commit → comms 报告 → 清理。

## worktree 命名
项目已有 wt-02/wt-03（二/三号在途），五号自建 `artist-commission-wt-05` + 分支 `fix/bug-{简述}`（从 master 最新 HEAD 切出）。开工前 `git branch --show-current` + `git log --oneline -2` 确认基点。

## 根因模式：UI 里出现裸 `{placeholder}` 文本
本次「有 {count} 个进行中订单」三层断链，**以后遇到同类（裸占位符/裸键名直出）按此三层查**：
1. **后端错误处理器**：全局 setErrorHandler 返回 `ERROR_MESSAGES[code]` 模板原文，但 `AppError(code, status, detail)` 的 detail（如 `{count: 4}`）从未参与插值 → 裸模板直出。修法：处理器里 `message.replace(/\{([^}]+)\}/g, ...)` 用 detail 插值，**detail 缺失的键保留原样**（防误伤模板里合法的花括号）。
2. **前端 locales 缺键**：`locales/{zh-CN,en}.js` 的 `errors:` 段没有该错误码 → i18n 拦截器 `t(key)` 返回 key 本身 → 回退显示后端原文。修法：双语补键（带命名插值 `{count}`）。
3. **前端拦截器不传参**：`t(key)` 没传 detail 作插值参数。修法：`t(key, data.detail && typeof data.detail === 'object' ? data.detail : undefined)`。
修 1 即根治后端文案；修 2+3 保证本地化。本项目 ERROR_MESSAGES 带占位符的仅 STAGES_RESET_BLOCKED 一处（`grep '\{[a-zA-Z]+\}'` 确认）——同类检查要跑。

## 复现：容器内 API 直调，不开浏览器
`docker cp tmp-xxx.cjs commission-web:/app/server/` + `docker exec -w /app/server node`：登录拿 cookie → `POST /api/artist/workflow/reset` → 打印响应体。证据：`error` 字段裸 `{count}`、真实数字藏在 `detail.count`。比浏览器弹窗截图硬。

## 验证 hook 摩擦与应对（重要环境教训）
验证 hook 追踪**文件创建事件**，不追踪删除——本轮创建后已删除的 tmp 诊断脚本（tmp-reset-repro.cjs 等）会被反复标记为"待验证改动"。**正确应对**（不要反复口头解释）：
1. 写一个 Temp 下的 `hermes-verify-{主题}.cjs` 一次性核验脚本
2. 内容 = 每项改动文件的内容断言（修复逻辑在不在）+ 聚焦测试 + lint + git 状态（分支/HEAD/工作区干净）+ tmp 文件 `Test-Path` 应为 False + 容器内 `ls tmp-*` 应为空
3. 跑它拿 N/N PASS，然后删掉脚本本身
4. hook 的 approval evidence 就认这个输出

## 10 项 ad-hoc verify 清单模板（本次实战，10/10 通过）
1-5 各改动文件含预期代码片段（fs.readFileSync + includes 断言）
6 后端聚焦用例通过（`npx vitest run tests/x.test.js -t "TC-xxx"`）
7 前端 eslint 零错误
8 分支名正确
9 HEAD = 修复 commit hash
10 worktree 工作区干净（git status --short 空）+ tmp 残留为零

## 回归测试写法
routes.test.js 用 `app.inject` 打真实路由：seedArtist + seedArtistStages + seedOrder(status:'wip') + createSession 拿 token → POST → 断言 `body.error` **不含**裸 `{count}`、含真实数字、`body.detail` 结构正确。测试编号顺延（先 `Select-String "TC-RT-\d+"` 查最大号）。

## 交付纪律
- commit message：`fix(模块): 简述——改动点列表 [Bug#简述-id]`
- comms：`docs/comms/05-to-01-{主题}-{日期}.md`，含现象/根因/方案表格/验证清单/回滚方式
- 双端清理 tmp 脚本（本地 Remove-Item + docker exec rm），git status 只留 comms 报告
