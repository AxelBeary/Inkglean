# 安全关键类交付（认证/加密/登录）的审核协议

> 2026-08-05 三号 REQ-027 TOTP 登录审核实录（29 文件 +1720 行，认证核心改造）。

## 触发条件

交付涉及认证流程、加密算法、会话/Token、权限守卫、登录码/口令时，在常规「逐 diff + 测试门」之外必加五项。这类交付 self-report 风险最高（算法错但测试绿很常见——测试可能用自家算法生成期望值）。

## 五项必做

### 1. 算法对照权威测试向量独立跑（不信交付方"向量全过"）

加密/哈希/签名类纯函数，找 RFC/规范的**官方测试向量**，一号自己写脚本跑交付方的函数：

```powershell
# 临时脚本写 Temp（不污染仓库），tsx 直接 import 交付 worktree 里的实现
# C:\Users\<user>\AppData\Local\Temp\hermes-verify-<用途>.ts
# 然后 cp 进交付 worktree 的 server 目录用 npx tsx 跑（拿得到依赖与 tsconfig）
Copy-Item $tmp -Destination <worktree>\server\hermes-verify.ts -Force
Set-Location <worktree>\server; npx tsx hermes-verify.ts; Remove-Item hermes-verify.ts
```

实录：TOTP 用 RFC 6238 Appendix B 的 6 条官方向量（密钥 ASCII "12345678901234567890"，SHA1，8 位模式），import 交付方的 `computeTotp` 逐条对照，全过才信。

### 2. DROP/删表前先查反向 FK（v38 教训的正向应用）

迁移里出现 `DROP TABLE X` 时，删前全 schema 搜 `REFERENCES X`——有别的表指向它 = CASCADE 风险或悬空 FK：

```powershell
git -C <worktree> show <commit>:server/src/db/init.js | Select-String -Pattern "REFERENCES <表名>"
# 空 = 无反向 FK，DROP 安全（事务内可）；非空 = 停下评估
```

实录：`DROP TABLE login_codes` 前确认无任何表 REFERENCES 它 → 事务内安全。注意区分：**DROP 子表/叶子表**（无反向 FK）可事务内；**DROP/RENAME 父表**必须事务外（v38）。

### 3. 被删接口的契约与残留扫描

删除旧机制（接口/函数/错误码使用方）时：
- `git grep` 旧函数名/旧端点全仓扫，确认零代码引用（注释提及不算）
- 前端同步扫（locales 死键、api 封装函数、组件调用）
- **e2e/ 目录也是消费者，必须纳入扫描**：`e2e/global-setup.js` 的预登录常直连旧认证接口（send-code/_dev_code），它不在 server/tests 里，**单测全绿完全发现不了**。TOTP 合入即漏掉此处——残留扫描通过但 E2E 预登录仍打旧端点，globalSetup 阶段直接崩、5 用例一个没跑，数小时后才由 CI 红暴露。认证/运行时变更后过一遍完整消费者清单（含 e2e、容器 entrypoint、文档示例）。修复模式与 CI 分诊见 `references/ci-e2e-triage-and-auth-fix.md`。
- 保留的对外响应结构不能变（如登录接口的请求/响应字段保持 = 契约兼容，只换内部实现）

实录：`generateLoginCode/verifyLoginCode/send-code` 扫描零残留；前端 locales 发现 `sendCode`/`codeSent` 两个死键（旧流程删了键没清）——非阻塞，记建议项下轮顺手清。**死键判定**：grep 键名在 locales 外的使用处，空 = 死键，但要先确认没有动态键名拼接。

### 4. 防爆破/防枚举逻辑逐条核

认证接口必查：①未注册账号与错误凭证是否同响应（防枚举）②失败计数与锁定时长③锁定期间正确凭证是否也拒④锁存哪（行内字段 vs 新表）⑤比对接口（如绑定确认）不计数是否有理由（仅管理员可调 = 可信身份，可接受但要声明）。

### 5. 兜底恢复路径实测可读

CLI 兜底脚本（本机重置类）读全文：参数校验、initDatabase 调用、操作后输出是否告诉操作者下一步。认证被锁死时这是唯一出路，必须存在且正确。

### 6. 敏感字段剔除类修复：写路径回显扫描（v0.39 安全加固批实录）

交付声称「X 字段不再泄露」时（DTO 投影/显式列/select 剔除），**只查 GET 读路径必然漏**。高频缺口 = **写路径回显**：update/create 服务函数内部 `return getXxxById(id)` 返回完整行，路由直接 `return service.updateXxx(...)` 把密钥原样带回响应。实录：F1 DTO 覆盖 4 个 GET 端点全对，但 `updateArtist()` 返回完整行（含 totp_secret），画师 `PATCH /api/artist/profile` 改自己资料后响应带回自己的 TOTP 密钥——与要堵的攻击面完全相同，另有 admin PUT status/profile 两处。五号交付报告未覆盖，一号 grep 抓出，打回返工。

扫描命令序列（三步，缺一不可）：

```powershell
# ① 服务层：找出所有返回完整行的函数（UPDATE/INSERT 后 return getXxxById 的模式）
git -C <worktree> show <branch>:<service文件> | Select-String -Pattern "return get.*ById" -Context 2,2
# ② 路由层：找出所有直接返回这些函数的端点
git grep -n "return <service>.update\|return <service>.create" <branch> -- server/src
# ③ 兜底：request 上挂的完整实体直接返回的路径
git grep -n "return request.<entity>\|return { \.\.\.request.<entity>" <branch> -- server/src
```

修复要求与判定规则：
- **不改服务函数返回值**（认证中间件等内部消费者需要完整行，如 token_version）——在路由返回处包 DTO。派工时写明这条，防止角色「好心」改服务层破坏内部链路。
- 显式列 SELECT 核完整性：表列数 = SELECT 列数 + 剔除列数，对照 schema 逐列核（漏一列 = 静默丢功能）。
- 回归测试必须覆盖写路径响应（PATCH/PUT 后断言响应不含敏感字段），只测 GET 不算闭合。
- 消费者清单同样扫 e2e/前端（见 §3 同款规则）。

## 附：需求稿定稿与开发派工的时序缺口（本轮最大教训）

二号 D 路按派工实现完了，四号才和用户聊完 REQ-029 定稿——交付对照需求稿发现 4 项用户拍板功能缺失（不是实现者失误，是派工早于需求定稿）。规则：

1. **需求深聊与开发并行时**：未定稿的功能点不进开发派工；必须先派的，派工文件注明「以需求稿定稿为准，定稿后一号对照补漏」。
2. **需求稿落库后**：对已合入/在途的实现做**逐项对照**（grep 需求稿每条 R 规则/B 边界在实现文件里的落点，零匹配 = 缺口），缺口走补漏批派工，不返工已合入核心。
3. **审核报告里的"自查确认"要复核**：交付方说"R4 自查零改动"时，一号 grep 验证该点确实无需改，不直接采信。

## 附：多分支同改 locales 的合并注意

两分支都动 `locales/*.js` 时 merge 常自动合并成功，但**必须重跑 web 测试**确认无静默冲突（键覆盖/结构破坏）。实录：TOTP 分支与 D 路补漏批同改 locales，merge 后重跑 186/186 才放行。

## 附：terminal workdir 纪律

审核命令序列里**不要用 `cd ..` 切目录**——它把后续命令带出仓库，`fatal: not a git repository`。每段命令用 `workdir` 参数或 `git -C <path>` 定位。
