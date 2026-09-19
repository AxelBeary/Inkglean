# 一号常用命令序列（Windows PowerShell / pwsh）

## 0. 重建表类迁移的事务陷阱（v38 事故，2026-08-04）

迁移运行器把每个迁移包在 `database.transaction()` 里，而 SQLite 的 `PRAGMA foreign_keys` **在事务内是 no-op**。迁移里写 `pragma('foreign_keys = OFF')` 静默失效，DROP 父表（如 artists）触发所有子表 ON DELETE CASCADE，子表数据全灭。

修复模式（已落库 init.js）：① 迁移对象加 `noTransaction: true`，运行器跳过事务包裹；② 关 FK 后**立即回读**校验值=0 才继续，否则抛错中止绝不 DROP；③ SQLite 官方 12 步流程（新表→INSERT SELECT→DROP→RENAME→重建索引）；④ 重建后 `foreign_key_check` 验证零悬空；⑤ finally 恢复 FK=ON；⑥ 迁移测试断言重建前后子表行数一致（TC-MIG-38）。教训：**任何 DROP/RENAME 父表的迁移必须事务外执行并显式关 FK**；迁移开头的备份是恢复最后防线（本次靠 bak.v38 完整恢复）。

### 事故重演验证（incident replay，v38 事故后确立）

修完事故类 bug 后，除套件测试外再写一个 **ad-hoc 重演脚本**，逐字复现失败场景——它能抓到套件测试漏掉的边界。v38 实例：重演脚本模拟"存量库 CHECK 回退 → 重跑迁移"，过程中通过 rename 造出 sqlite_master 里带引号的表名（`CREATE TABLE "artists"`），抓出迁移正则只匹配无引号名的真实缺陷，修复后 15/15 断言全过。要点：① 重演脚本必须覆盖事故触发链的每一步（不只最终断言）；② 故意引入事故时的脏状态（旧 schema/引号/残留临时表）；③ 幂等复跑也要断言。脚本放项目根或 worktree 根（ESM 相对导入解析），跑完即删不入库。

### 在途派工追加条目的传达陷阱（v0.35 实例）

角色已基于 master 切出 worktree 开工后，一号在 master 上 patch 派工文件追加任务条目——**角色看不到**。worktree 分支基于旧 master，文件还是初始版；角色按旧版交付，追加条目全部漏做（v0.35 波 1 实例：追加的 5 条全漏，交付后审核才发现）。**规则**：派工文件 push 之后，任何追加条目都不能只靠"改文件等他下次读"——要么让用户转达一句"派工已更新，先 `git merge master` 再开工"，要么把追加内容以聊天内联发给用户转达，二选一必须做到。审核时若发现角色漏做追加条目：不追责（信息没送达不是角色的错），直接补派工文件并明确要求先同步 master。

工作目录：`D:\Hermes Agent CN Desktop\workspace\artist-commission`。主 worktree 永远停 master，只有一号操作。

## 0a. 数据丢失紧急恢复流程（迁移/误操作清空数据时，2026-08-04 实战）

发现数据被清空时按序执行（顺序不可颠倒——先修根因代码，再恢复数据重建，否则坏迁移重跑会再次清空）：

```powershell
# 1. 停容器（防继续写入）
cmd.exe /c "docker stop commission-web"
# 2. 保留损坏 DB 供事后分析
Copy-Item data\commission.db data\commission.db.corrupt-<事故名>
# 3. 恢复最近的迁移备份（.bak.vN 是迁移开头自动备份）
Copy-Item data\commission.db.bak.v38 data\commission.db -Force
# 4. 删 WAL/SHM（防残留干扰）
Remove-Item data\commission.db-wal, data\commission.db-shm -ErrorAction SilentlyContinue
# 5. 先在代码里修好迁移根因（+回归测试+ad-hoc 重演脚本验证全过）
# 6. 重建容器——修正后的迁移自动重跑
cmd.exe /c "docker compose up -d --build 2>&1" | Select-Object -Last 3
# 7. 端到端验证（容器内临时 .mjs：关键表行数 + 公开 API 冒烟）
```

**容器内 ad-hoc 脚本注意**：用 `better-sqlite3`（裸模块名）的脚本必须放 `/app/server/` 并 `-w /app/server` 执行（`docker exec -w /app/server commission-web node tmp-x.mjs`），放 /tmp 会 ERR_MODULE_NOT_FOUND。跑完 `docker exec ... rm` 清理。

**宿主机 ad-hoc 验证脚本导入项目模块**：Windows 上 `import 'D:/path/to/init.js'` 报 ERR_UNSUPPORTED_ESM_URL_SCHEME（绝对路径必须是 file:// URL）。修法：`const ROOT = pathToFileURL('D:/.../server/src/db/').href; await import(ROOT + 'init.js')`，`createRequire(ROOT + 'init.js')` 解析裸依赖。

## 0b. STATUS.md 收口重写用 write_file 不用 patch（2026-08-04 教训）

STATUS.md 经多轮 patch 追加后结构散乱，收口需全量重写。**用 patch 替换头部行会把新内容插进去但旧正文仍留在下方**（old_string 只匹配头部，正文成了"追加内容"），产生重复，被迫再 write_file 覆盖一遍。规则：整体重写一律 write_file；patch 只用于局部小改。

## 1. 开场分诊

```powershell
cd "D:\Hermes Agent CN Desktop\workspace\artist-commission"
git status --short
git branch --show-current
git log --oneline -5
git diff --name-status HEAD          # 已跟踪文件的未暂存改动/删除
```

看被删但未暂存的 comms 内容（不恢复、只查看）：
```powershell
git show HEAD:"docs/comms/<文件名>.md" | Select-Object -First 20
```

确认某目录是否已被 ignore：
```powershell
git check-ignore -v temp/            # 输出 .gitignore:行号:规则 = 已生效
```

## 2. 审核（读真实 diff，不信 comms 报告）

```powershell
git fetch origin
git branch -a --sort=-committerdate | Select-Object -First 10
git log master..<branch> --oneline
git diff master..<branch> --stat
git diff master..<branch> -- <file>  # 逐文件
```

读分支上的 comms 提交报告（不在 master 上）：
```powershell
git show <branch>:"docs/comms/03-to-01-xxx.md"
```

**隔离单 commit 实际改动**（分支落后 master 时 `git diff master..<branch>` 噪音大）：
```powershell
git show <commit> --stat                        # 该 commit 改了哪些文件
git show <commit> -- <file1> <file2>            # 逐文件看真实 diff
```
这是审核角色实际产出的最可靠方式——跳过分支噪音，只看角色自己的 commit。

**merge-base 三点 diff（分支落后 master 时的另一选择）**：
```powershell
git merge-base master <branch>                  # 找到分支基点 hash
git diff --stat <base-hash>..<branch>           # 从基点算起的真实改动（无 master 新增文件的"删除"噪音）
git diff <base-hash>..<branch> -- <file>        # 逐文件
```
PowerShell 中 `$()` 子表达式嵌套 git 命令不可靠（报 usage 错误），先单独跑 merge-base 拿到 hash，再用字面 hash 跑 diff。适合分支含 merge commit（`git show` 看 merge commit 不便）或想一次看全分支真实改动时使用。

## 3. 合并 + 测试门 + 立即推送

```powershell
git log --oneline -5                 # 合并前确认 HEAD
git merge <branch> --no-ff -m "merge: v0.17-bX <内容>（<角色>）"

# ⚠️ 若分支改了 package.json（加了新依赖），先装依赖再跑测试门
cd web; npm install 2>&1 | Select-Object -Last 3
# 或 cd server; npm install（视哪边加了依赖）

# ⚠️⚠️ 合并态测试门大面积失败（几百例）时——先查 node_modules 滞后，别急着判回归
# 症状：错误清一色 'Cannot find package X'（模块级，非断言级），且该包是近期某批新加的依赖。
# 根因：角色在 worktree 里 npm install 过，但**主仓 node_modules 一直滞后**——
#       worktree 合入 master 不会同步主仓的 node_modules，隔几轮后主仓跑测试就缺包。
# 诊断：Test-Path server\node_modules\<包名>（False = 命中）
# 修复：cd server; npm install → 重跑立即绿（实录 243 failed → 装完 831/831 全绿，一分钟）。
# 判定：装完仍失败才是真回归。先排除滞后再下结论，别把缺包误报成合入事故。
# 预防：任何改了 package.json 的批次合入后，主仓立即 npm install，别留给下一轮。

# 后端测试门
cd server; npx vitest run 2>&1 | Select-Object -Last 5
# ⚠️ web 没有 `npm test` 脚本（脚本名是 test:web）——跑前端测试一律 `npx vitest run`（或 `npm run test:web`）。server 有 npm test。
# 前端测试门（eslint + build + 前端 vitest）
cd web; npx eslint . 2>&1 | Select-Object -Last 3; npm run build 2>&1 | Select-Object -Last 5
cd web; npx vitest run 2>&1 | Select-Object -Last 3   # 前端测试（如存在）
# ⚠️ `npx vite build` 可能被 terminal 工具误判为长驻进程而拒绝执行。
# 替代：node node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 12

git push origin master               # 与 merge 同链，禁止延迟
git log --oneline -6                 # 确认历史链完整
```

## 4. 清理分支（先删 worktree 再删分支）

`git branch -d` 会报 `cannot delete branch 'X' used by worktree at '...'`。先移 worktree：
```powershell
git worktree list                    # 看挂了哪些 worktree
git worktree remove "<worktree绝对路径>"
git branch -d <branch1> <branch2>
```

**Windows worktree remove 假错处置**：`git worktree remove` 可能报 `failed to delete ... Invalid argument`，但**实际已完成 git 侧注销并清掉大部分内容**（角色跑过 vite 的 worktree 留 node_modules 2 万+文件时高发）。处置：先核实实况（`git worktree list` 是否已无该项 + `Test-Path` + 目录内容计数），git 已注销则收尾完成；残留空目录（只剩 node_modules）无害，不要为强删反复申请审批（`rmdir /s /q` 会被审批拦截）——告知用户一句"残留空目录可手动删"即可。

**Permission denied 形态：占用进程可精确定位并杀**（v0.38 实录）：`git worktree remove` 报 Permission denied + `Remove-Item -Recurse -Force` 也删不掉时，元凶常是子代理遗留的 vite dev 进程占着文件。**先枚举再精确杀**，比直接放弃更彻底：
```powershell
# 枚举所有 node 进程的完整命令行（含 worktree 路径，可区分谁是谁）
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  [PSCustomObject]@{Pid_=$_.ProcessId; Cmd=$_.CommandLine.Substring(0,[Math]::Min(120,$_.CommandLine.Length))}
} | Format-Table -AutoSize -Wrap
# 只杀命令行含目标 worktree 路径的进程，其他 worktree/主仓的 dev 进程不碰
Stop-Process -Id <pid> -Force; Start-Sleep 2
Remove-Item "<worktree路径>" -Recurse -Force   # 通常一次成功，Test-Path 核实 False
```
注意：npm 外壳进程（`npm-cli.js run dev`）与 vite 子进程成对出现，杀 vite 子进程即可，外壳自行退出。

## 5. comms 合入即删 + STATUS 更新（一个 commit）

```powershell
git rm "docs/comms/01-to-02-xxx.md" "docs/comms/02-to-01-xxx.md" ...  # 批量列已合入的
# 更新 docs/comms/STATUS.md（HEAD/测试数/迁移版本/已合入内容/角色状态）
git add docs/comms/STATUS.md
git commit -m "docs(comms): v0.17-bX合入——清理已合入comms×N+STATUS更新"
git push origin master
```

## 6. 派工

写 `docs/comms/01-to-0N-<主题>-<日期>.md`，然后：
```powershell
git add docs/comms/
git diff --cached --name-status      # ⚠️ 验证暂存区只有本次派工文件，无其他角色残留
git commit -m "docs(comms): v0.17下一轮派工——<角色A任务>+<角色B任务>"
git push origin master
```
给用户每角色一句触发语：「开工。读 docs/comms/STATUS.md 和 docs/comms/<派工文件>，按派工执行。」

## 7. 清理分支/worktree（安全检查）

```powershell
git worktree list                    # 看哪些 worktree 活跃
# ⚠️ 非 prunable 的 worktree 可能角色还在用，先问用户再动
git worktree remove "<path>"         # 仅已合入且角色完工的
git branch -d <branch>
git push origin --delete <branch1> <branch2>  # 批量清远端残留
```

## 8. 容器重建 + 验证

```powershell
# 重建
cmd.exe /c "docker compose up -d --build 2>&1" | Select-Object -Last 5
# 确认 Healthy
cmd.exe /c "docker compose ps 2>&1"
```

**用户质疑"确定重建了吗"时的验证**（Docker 层缓存可能导致旧产物）：
```powershell
# 对比容器内构建产物与本地 dist 的文件名哈希
cmd.exe /c "docker exec commission-web node -e ""const fs=require('fs');const f=fs.readdirSync('/app/web/dist/assets').filter(x=>x.startsWith('main-'));console.log(f)"" 2>&1"
Get-ChildItem web/dist/assets/main-*.js -Name
# 两者文件名一致 = 确认最新代码。不一致 = 缓存问题，需 --no-cache 重建
```

若不一致：
```powershell
cmd.exe /c "docker compose build --no-cache web 2>&1" | Select-Object -Last 5
cmd.exe /c "docker compose up -d 2>&1" | Select-Object -Last 5
```

**用户报告"之前反馈过的问题"时**：先验证容器产物（上述），再问用户具体看到什么。三种可能：浏览器缓存（Ctrl+Shift+R）、排了后续版本未修的老问题、新引入 bug。不急于承认"没重建"。

## 10. 版本开工（派工 + 建 worktree 一次性完成）

新版本开工时分支尚不存在，`git worktree add <path> <branch>` 会报 `fatal: invalid reference`。必须用 `-b` 创建分支：

```powershell
cd "D:\Hermes Agent CN Desktop\workspace\artist-commission"

# 确认主 worktree 在 master 且干净
git branch --show-current   # 必须是 master
git status --short          # 必须为空

# 批量建 worktree（-b 创建新分支，起点为 master）
git worktree add -b feat/v020-client ../artist-commission-wt-02 master 2>&1
git worktree add -b feat/v020-artist ../artist-commission-wt-03 master 2>&1
git worktree add -b docs/v020-audit ../artist-commission-wt-05 master 2>&1

# 确认
git worktree list
```

**命名约定**：worktree 目录 `artist-commission-wt-0N`（N=角色编号），分支名 `feat/vNNN-<受众>` 或 `docs/vNNN-<主题>` 或 `fix/vNNN-<描述>`。

**完整开工序列**（用户确认范围后一次性执行）：
1. 写所有角色的 comms 派工文件（`01-to-0N-*.md`）
2. **立即 commit + push comms**：`git add docs/comms/ && git diff --cached --name-status` 验证 → `git commit -m "docs(comms): vN 派工" && git push origin master`。**硬门控——comms 未 push 前禁止建 worktree。**
3. 建 worktree（上述命令）
4. 更新 STATUS.md → commit → push
5. 给用户每角色一句触发语

**⚠️ comms 必须先 commit+push 再建 worktree**：`write_file` 产出的文件是 untracked 的，只存在于主 worktree 磁盘上。角色在独立 worktree 里只能看到 master 上已 commit 的内容。v0.20 实例：写了 3 份派工 + 建了 3 个 worktree 但忘了 commit comms，五号报告"空闲，无分配任务"。

## 效率纪律

- Docker 构建日志 `| Select-Object -Last 3`，不输出全量。
- STATUS.md 一轮结束统一更新一次，中间不逐次 commit。
- 多角色同时有产出时一次性批量审核，不逐个来回。
- 不省的：读 diff、跑测试、git 操作前确认 HEAD。质量底线不省。

## 9. 从 minified bundle 定位崩溃根因（角色修了但用户仍报错时）

用户报的 Vue 错误堆栈含 `OrderForm-*.js:2:2704` 这样的位置。minified 文件通常只有 2 行（第 1 行是 import/export，第 2 行是全部逻辑），列号是字符偏移。

```powershell
cd web/dist/assets
$f = Get-ChildItem OrderForm-*.js | Select-Object -First 1
$lines = Get-Content $f.FullName
Write-Output "LINE COUNT: $($lines.Count)"
$line2 = $lines[1]   # 通常是第 2 行（index 1）
Write-Output "LINE2 LEN: $($line2.Length)"
$col = 2704           # 从错误堆栈提取
$start = [Math]::Max(0, $col - 150)
$end = [Math]::Min($line2.Length, $col + 150)
Write-Output $line2.Substring($start, $end - $start)
```

输出是 minified 代码片段，对照源码变量名（如 `availableAddons`→`l.availableAddons`）定位真正的崩溃表达式。

**关键判断**：如果 minified 代码中崩溃点是 `l.availableAddons.length`，但源码中 `availableAddons` 是从 composable 解构的——检查解构列表是否真的包含该变量。`const { a, b, c } = useComposable()` 漏了一个变量，模板中访问它就是 `undefined.length`。

**验证部署产物是否最新**：对比容器内和本地的构建哈希文件名：
```powershell
cmd.exe /c "docker exec commission-web node -e ""const fs=require('fs');console.log(fs.readdirSync('/app/web/dist/assets').filter(x=>x.startsWith('main-')))"" 2>&1"
Get-ChildItem web/dist/assets/main-*.js -Name
# 文件名一致 = 最新代码已部署
```
