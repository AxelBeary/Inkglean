# CI / E2E 门禁分诊 + 认证链路变更后的 E2E 修复

触发：GitHub Actions 出现 "Process completed with exit code 1"（尤其 e2e workflow），或合入了登录/认证/运行时变更后 CI 变红。

## 1. CI 失败分诊（先定位再定性，别急着怪最后一个 commit）

```powershell
cd <主仓>
gh run list --workflow e2e.yml --limit 10   # 看历史——从哪次开始挂的？
# ⚠️ 关键：翻全历史找"首次失败点"。E2E 可能是几小时/几天前某次合入就挂了的，
#    不是今天最后一笔 commit 的锅（实录：TOTP 合入后所有 push 的 E2E 全挂，
#    用户以为最新的 docs-only commit 有问题）。docs(comms) commit 不可能挂测试——
#    看 commit 类型就能排除一大批嫌疑。
gh run view <run-id> --log-failed 2>&1 | Select-Object -Last 30   # 真实报错
gh run list --workflow ci.yml --limit 3     # 对照：单测 workflow 绿不绿
```

**区分 error 与 warning**：annotation 里 "Process completed with exit code 1" 是真失败；"Node.js 20 is deprecated..." 只是弃用警告（actions@v4 被强制跑 node24），不阻塞但可顺手升级 actions v4→v6（`gh api repos/<owner>/tags --jq '.[].name'` 确认大版本 tag 存在再改）。

## 2. 认证链路变更 → E2E 预登录必须同步改（"追踪所有消费者"第三次应验）

项目规则"运行时/认证变更必须追踪所有调用方"，已知消费者清单（每次改认证都过一遍）：
1. `e2e/global-setup.js` 的 `apiLogin()` 预登录（最易漏——它不在 server/tests 里，单测全绿也发现不了）
2. `e2e/fixtures/auth.js`（token 消费方）
3. 前端 Login.vue / api 层
4. 容器 entrypoint、Dockerfile、docker-compose 环境变量
5. 文档（维护说明书/切换指南里的旧接口示例）

实录：REQ-027 TOTP 一刀切删旧登录码（send-code/_dev_code），E2E setup 还在走旧链路，`Error: 预登录失败：未获取到开发登录码`，globalSetup 阶段直接崩，5 个用例一个没跑。**单测 845 全绿 ≠ E2E 绿**——E2E 是独立门禁，合入后必须看 CI 两个 workflow。

### ⚠️ 认证切换的完整性盲区：修完链路还要查真实账号状态

修完 E2E/登录链路后，必须**直查真实库确认关键账号已完成新机制的绑定**，否则测试全绿照样埋锁死雷。实录：TOTP 合入 + E2E 修绿后，管理员账号 QQ 10003 `totp_verified=0`（从未绑定）——旧登录码已删，管理员只靠旧 cookie 撑着，**cookie 一过期即锁死门外**。测试用注入的固定 secret 走绿，掩盖了真实账号没绑定的洞。

**认证切换收尾清单**（合入后立即过一遍）：
1. E2E 预登录已走新链路且绿 ✅
2. **真实库每个真实账号（尤其管理员）的新凭据状态**——直查 `totp_secret IS NOT NULL, totp_verified`；未绑定的记紧急待办（查库防连错库，方法见 `references/db-inspection-pitfalls.md`）
3. 旧机制兜底入口还剩多久（旧 cookie 有效期 / AUTH_DEV_MODE 后门）→ 把「锁死时间窗」写进待办
4. **关闭开发后门（AUTH_DEV_MODE=false 等）的前置条件 = 关键账号完成绑定**，顺序不能反——先关后门再补绑定 = 自锁。

## 3. E2E 预登录修复模式（走真实链路，不复活后门）

登录机制被换掉后，E2E 预登录**不许**重新加 dev 后门（项目纪律：已拍板删掉的东西不能复活）。正确模式——E2E 走真实认证链路：

1. **注入固定测试凭据**：seed 后直接改测试库（e2e/test.db 是独立文件，与开发/生产数据完全隔离）。TOTP 实例：给测试画师写固定 secret + `totp_verified=1`。
   - e2e 目录自身没有 node_modules，解析 better-sqlite3 要用 `createRequire(resolve(ROOT, 'server/package.json'))`
2. **setup 里现算凭据**：TOTP 就在 setup 内用 node:crypto 实现 RFC 6238（30s 步长/HMAC-SHA1/动态截断/6位补零），逐字对照 server 的 totp.ts 实现；服务端有 ±1 窗口容忍，30s 边界无虞。
3. **打真实登录接口**，从 setCookie 取 token——与真实用户链路一字不差，E2E 顺带回归覆盖新认证机制。

## 4. 本地实跑 E2E 验证（Windows）

```powershell
cd <主仓>
npx playwright install chromium        # 首次需装（%LOCALAPPDATA%\ms-playwright）
Remove-Item -Recurse -Force web\dist -ErrorAction SilentlyContinue  # 强制重建 dist
npm run test:e2e 2>&1 | Select-Object -Last 15    # 根目录脚本名 test:e2e
```

global-setup 会自动：构建前端（dist 不存在时）→ seed 测试库 → 起服 3999 端口 → 预登录写 token → 跑 5 用例 → teardown 清理。本地全绿 + 推送后 CI 对同一 commit 全绿，双重确认。

## 5. 汇报

CI 修复按 hotfix 报告格式：根因（哪次合入引入/为什么漏）→ 修复方案（为什么选这个而不是后门）→ 本地实跑证据（逐条用例）→ CI 远端证据（run 状态 + 警告消失）。
