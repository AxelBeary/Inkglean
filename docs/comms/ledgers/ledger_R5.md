# ledger_R5 · 第二轮定时开工 · 依赖与 CI 健康批（G9 解锁批）

> **性质**：R5 施工台账，只写本文件，**不写 STATUS**（收口由 R4 统一合并回写）。
> **触发**：链式第三环（R3 完成后动态创建），独立 Quest、goal 模式自持推进，🟢 全自动施工（含用户 9/13 授权的 remote 写操作）。
> **事实源**：`定时开工计划书-R5-依赖与CI健康批-20260913.md` + 总纲第 1/2 节。
> **HEAD 基线**：开工时 `de923472`，remote master 仍 `d4984edf`；工作区在途的 `web/src/**`（R1）与 `e2e/tests/e11-compliance.spec.ts`（R3）**本会话零改动**。**不 commit、不 push**（等 R4 收口 + 用户单独下令）。

---

## 一、结果一句话

七个 CI/依赖健康问题全部处理完：**CI 红叉清掉、sharp+vitest 本地升级到位、一条真假绿测试修好、两个 dependabot PR 已关、glib 警报已 dismiss**；server 三项门禁在最终代码态全绿，**用例数仍 1801（156 文件），与 baseline 一致，R4 无需同步 server 数字**。

---

## 二、施工清单（本批实际改动，共 3 个文件）

| 文件 | 改动 | 性质 |
|---|---|---|
| `server/package.json` | `sharp ^0.35.3 → ^0.35.4`、`vitest ^3.2.0 → ^4.1.11`（**仅这 2 行**，license/overrides/allowScripts 等字段未被 npm install 冲掉） | 依赖升级 |
| `server/package-lock.json` | sharp 与 26 个 `@img/sharp-*` 平台二进制条目 + vitest 系列条目 | lock 同步（自动） |
| `server/tests/publish-artwork.test.ts` | TC-PA-07 补 `await` + `it` 回调改 `async`（+1 行说明注释） | **真假绿修复**（领地内唯一源码改动） |

**领地核验**：`git status --porcelain -- server/` = 上述 3 项；`server/src/**`、`shared/**`、`desktop/**`、`scripts/**`、`e2e/**`、`web/**`、`STATUS.md`、`accept-baseline.json` **零改动**（实测见第五节）。

---

## 三、步骤逐项结果

### 步骤 1 · 重跑 flaky docker CI ✅
- 复诊确认：run `34700257030`（master）只有 docker job 红，日志实为 `npm error code ECONNRESET / network aborted`（`npm ci` 撞网络重置）→ 确诊 flaky，非代码问题。
- `gh run rerun 34700257030 --failed` → **一次即绿**，无需二次重跑。
- 终态核验：`status=completed, conclusion=success`，四 job（docker / desktop / web / server）**全 success**。

### 步骤 2 · sharp 0.35.3 → 0.35.4 ✅
- `npm install sharp@0.35.4` → `npm ls` 实测 `sharp@0.35.4`。
- lock 变更面逐条核过：只涉及 `sharp` 与其 26 个 `@img/*` 可选平台包，**无误伤其他依赖**。

### 步骤 3 · vitest 3.2.0 → 4.1.11 ✅（**未走降级路径**）
- `npm install -D vitest@4.1.11` → 实测 `vitest@4.1.11` + `@vitest/mocker@4.1.11`（一起到修复版）。
- **major 升级实际零破坏**：计划书预告的 breaking（配置项/mock API/environment 默认值）一处没撞上——`vitest.config.ts` 现用的 `globals`/`environment`/`include`/`testTimeout`/`fileParallelism`/`env` 六项在 v4 全部有效，未改一行配置；typecheck（含 `tsconfig.tests.json` strict）与 lint 也零错。
- 升级后**首轮全量测试即 156 文件 / 1801 例全过、退出码 0**，计数口径与 v3 一致（baseline 不变）。
- 本地 `npm audit`：`found 0 vulnerabilities`（升级前残留的 2 条 moderate 也随之清零）。

### 步骤 4 · 漏 await 假绿修复（1 处，全仓已穷尽）✅
- **修复清单**：`server/tests/publish-artwork.test.ts:163` **TC-PA-07**（service 层二次防御）
  - 改前：`it('...', () => { expect(() => publishArtwork(...)).rejects.toMatchObject({...}) })`
  - 改后：`it('...', async () => { await expect(() => publishArtwork(...)).rejects.toMatchObject({...}) })`
- 🔴 **诚实声明**：**只补 `await`（+ 回调转 async），未删断言、未改期望值、未 skip、未回退 vitest 版本**。
- 唯一性双证：① 全仓静态扫 `server/tests/**/*.test.ts` 的 `.rejects|.resolves` 共 18 处，除 TC-PA-07 外 17 处均已正确 await（`artist.service`/`webauthn`/`security-failfast`/`audit-batch-a`/`audit-batch-e`）；② 运行期 vitest 4 自己报的 `was not awaited` 警告**全跑一遍只出现 1 次**，就是 TC-PA-07。
- **补 await 后断言真绿**（无被掩盖的业务 bug）：单文件复跑 `19 passed`，整批复跑警告数 `0`。事前读 `order-gallery.service.ts:232` 亦印证 `order.artist_id !== artistId → AppError(ORDER_NOT_OWNED, 403)` 逻辑本就成立，故这条属"断言没真正跑过"的假绿，不属"防护有 bug"。
- ⚠ **未触发第五节任何降级路径**（无需停下报用户的阻断路）。

### 步骤 5 · server 三项门禁 ✅（最终代码态亲跑）
见下节完整输出。

### 步骤 6 · 关闭两个 dependabot PR ✅
- 关前复核对应关系：**#8 = sharp**、**#7 = vitest/@vitest/mocker**（`gh pr list --json headRefName` 比对分支名，未关错号）。
- 两者均已 `CLOSED`，中文说明完整落库（字节级取证确认 UTF-8 无乱码）；dependabot 各自回帖 `OK, I won't notify you again...`（关 PR 的正常反应）。
- 关前另核实 6 条 open 警报的修复版本线：sharp `<0.35.4 → patched 0.35.4`、vitest 与 @vitest/mocker `>=2.1.0,<4.1.11 → patched 4.1.11` —— **本地版本恰好命中修复线**，故"已本地升级"的说明属实，非敷衍关 PR。

### 步骤 7 · dismiss glib 警报 #10 ✅
- 关前复核：alert #10 = `glib`（rust crate，`desktop/src-tauri/Cargo.lock`，`GHSA-wrw7-89jp-8q8g`，medium，vulnerable `>=0.15.0,<0.20.0`）—— 与计划书一致。
- 结果：`state=dismissed`、`dismissed_reason=not_used`、`dismissed_by=AxelBeary`，说明文字"仅 Linux 构建才编译进产物、已备案不做 Linux、桌面端只发 Windows/macOS"已落库。

---

## 四、门禁完整输出（主代理亲跑，非引用）

```
=========== npm run typecheck ===========
> artist-commission-server@1.0.1 typecheck
> tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit && tsc -p tsconfig.tests.json --noEmit

TYPECHECK_EXIT=0
=========== npm run lint ===========
> artist-commission-server@1.0.1 lint
> eslint . && oxlint src tests

Found 0 warnings and 0 errors.
Finished in 87ms on 337 files with 98 rules using 28 threads.

LINT_EXIT=0
=========== npm test（最终态）===========
Test Files  156 passed (156)
      Tests  1801 passed (1801)
   Start at  00:26:34
   Duration  423.82s (transform 5.00s, setup 0ms, import 242.95s, tests 142.27s, environment 18ms)

FINAL_TEST_EXIT=0
```

- typecheck：三个 tsc 项目（src / scripts / tests）**零错误**。
- lint：eslint + oxlint **0 警告 0 错误**（337 文件 / 98 规则）。
- test：**156 文件 / 1801 例全过，退出码 0**。日志里 16 处含 `FAIL|failed` 的行逐条核过，全是文件名（`security-failfast.test.ts`、`init-failfast.test.ts`）与用例标题里的 "fail-open"，**无一条真实失败**。
- **交 R4**：server 数字 **1801 / 156** 与现 baseline 一致，`accept-baseline.json` 的 server 项本批无需改动。
- 按计划书第四节，本批**只跑 server 门禁**，未跑 web/desktop/e2e/全量 `accept.ps1`（那是 R1/R3/R4 的领地与时段），故本批**不得简称"门禁全绿"**，准确说法是「server 三项全绿」。
- 取证日志（gitignored，仅供复核，可删）：`temp/r5-test-1.log`（升级后、修 await 前的首轮全量）、`temp/r5-test-final.log`（最终态全量）、`temp/r5-test-pa.log`（TC-PA-07 单文件复跑）。

---

## 五、remote 操作核验（收工态实测）

| 核验项 | 命令 | 实测结果 |
|---|---|---|
| CI 红叉 | `gh run view 34700257030` | `completed` / `success`，docker+desktop+web+server 四 job 全绿 |
| PR 状态 | `gh pr list --state all` | #8 CLOSED、#7 CLOSED（中文评论落库完好） |
| 警报 | `gh api .../dependabot/alerts?state=open` | **open = 6**（#24/#25 sharp、#19/#20 mocker、#22/#23 vitest）；#10 glib = `dismissed` |
| 领地 | `git status --porcelain -- server/` | 仅 `package.json` / `package-lock.json` / `tests/publish-artwork.test.ts` |
| 越界 | `git status --porcelain -- server/src/ shared/ desktop/ scripts/ e2e/` | 空输出（`e11-compliance.spec.ts` 是 R3 产物，本批未碰） |

**警报清除链路（须知情，别误判"没消"）**：
- 现在 open 仍有 6 条**不是升级失败**，而是这 6 条要靠 **R4 提交 → 用户下令 push → dependabot 重扫 master** 才自动关闭。
- R5 **刻意不手动 dismiss 这 6 条**（升级=真修，走自动关；dismiss 会掩盖事实）。
- glib 那 1 条已本批直接 dismiss，不依赖 push。
- 故链路是：**开工 7 条 open → 收工 6 条 open（glib 已消）→ push 后 0 条**。

---

## 六、与计划书事实源的偏差（4 条，均已按"以代码/API 实测为准"处置并记账）

1. 🔴 **计划书给的 dismiss 命令不可用**：`gh api -X POST .../dependabot/alerts/10/dismiss` 返回裸 `404 Not Found`（换 `X-GitHub-Api-Version: 2023-10-18`、换枚举 `no_application_or_usage` 仍 404；已排除权限因素——token 对该仓 `admin=true`，且同 alert 的 GET 正常）。改用官方现行路由 **`PATCH /repos/{owner}/{repo}/dependabot/alerts/{n}` + `state=dismissed` + `dismissed_reason=not_used` + `dismissed_comment`** 一次成功。**建议 R4 落档时把这条更新进计划书/OPS 备忘**，下次别再踩。
2. **PR #7 的真实目标不是 4.1.11 而是 vitest 5.0.0**：dependabot 取的是 latest，其 PR body 明写 `Bumps @vitest/mocker to 5.0.0`、"Vitest 5 is officially out"，并列 "Remove `sequential` test/suite options" 等 v5 破坏项。**这才是 PR #7 server job 必红的根因**——v5 把未 await 的异步断言**直接判失败**（其 CI 日志原文：`Error: Promise returned by ... was not awaited`，`1 failed | 1701 passed`）。
3. **4.1.11 的行为与计划书描述不同（但结论不变）**：计划书说"vitest 4.x 未 await 会直接 fail"，实测 4.1.11 只是**警告**（`Vitest currently auto-awaits hanging assertions ... but this will cause the test to fail in the next Vitest major`），TC-PA-07 在 4.1.11 下不补 await 也照样"过"。补 await 依然必须做——它是货真价实的假绿，且 v5 会炸。选 4.1.11 而非 5.0.0 既命中警报修复线，又把 major 破坏面降到零。
4. **计划书自检关 #4 的算术笔误**："open 数 = 1" 与第三节自身叙述（"7 → 1，剩 sharp/vitest 6 条"）互相矛盾；实测 **收工 open = 6**（7 减掉已 dismiss 的 glib）。本节第五节的实测为准。

（另记一条开工前提的偏差：计划书 §1 说 PR #7/#8 的 `mergeable=UNKNOWN`、有冲突风险；本批开工实测两者均为 `MERGEABLE`。**"不合并、走本地升级"的策略仍然正确**——理由是 PR #7 合进去就是红的，与 mergeable 与否无关。）

---

## 七、环境坑备忘（本批踩过，值得沉淀）

本机 PowerShell 会话的控制台解码是 GBK，`gh` 输出的 UTF-8 中文在**显示层**会变乱码（`为` → `涓?`）。本批一度据此误判"GitHub 落库文字被打坏"。
判据：用 `Start-Process -RedirectStandardOutput` 做**字节级重定向**再十六进制核对（`E4-B8-BA` = 合法的「为」），即可区分"落库坏了"与"只是终端显示坏了"。实测两处（glib 警报说明、PR #7 评论）落库均为完好 UTF-8，无需返工。

---

## 八、遗留与交 R4

- **交 R4 回写 STATUS 的本批摘要**：CI flaky 重跑转绿；sharp→0.35.4、vitest→4.1.11 本地升级并修 1 处漏 await 假绿；关 dependabot PR #7/#8；dismiss glib #10；server 三项门禁全绿，1801/156 不变。
- **等用户下令**：R4 提交 → push → dependabot 重扫自动关掉剩余 6 条警报。**push 前本批的 3 个文件改动一直留在工作区未提交**。
- **本批不做**（计划书第六节，已遵守）：未 `gh pr merge`、未 `git pull`、未改 `server/src/**`、未碰 web/e2e/desktop/shared/STATUS/baseline、未手动 dismiss sharp/vitest 6 条、未动 accept.ps1 的 npx bug（红灯 N2，用户定先不修）。
- **本批不建定时任务**（用户指示：schedule 服务当前不可用，R4 由用户另开会话手动跑）。链式接力到此由用户手动续，R5 未创建 R4 任务。
