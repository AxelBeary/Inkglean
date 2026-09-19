# 容器专属脚本验证 + 环境陷阱（2026-08-05 demo-installments 派工）

## 1. 容器专属脚本（demo-data.ts 类）验证五步

特征：脚本 import `/app/...` 绝对路径，本地无法执行。验证 = tsc + 走查 + **争取容器实跑**（实跑能证明真修复，值得做）。

1. **探查先行**：本地写只读探查脚本（CJS：`require('/app/server/node_modules/better-sqlite3')('/app/data/commission.db', { readonly: true })`），`docker cp` 进容器 exec。⚠️ 不要试图 `docker exec node -e "...含 $ / 括号 / 引号的 SQL..."`——PowerShell 转义必炸，写文件+cp 是唯一稳路。
2. **备份**容器内将被覆盖的源码：`docker exec commission-web cp /app/server/src/xxx.ts /tmp/xxx.ts.bak`
3. 拷入修改后的文件。⚠️ **脚本必须放 `/app/server/` 目录下**，不能放 `/tmp/`——node_modules（sharp 等）相对脚本位置解析，/tmp 下跑会 MODULE_NOT_FOUND。
4. 跑脚本 → 再跑探查脚本验证数据 → **复跑一次验幂等** → 容器内 `fetch` API 做 E2E（如 track 接口读分期明细）。
5. **还原**：`mv` 备份回原路径，删除全部临时脚本，`ls` 确认无残留。容器代码是镜像内的，与 worktree 无关，还原安全。

数据注意：`/app/data` 是 bind mount 真库，demo-data 类脚本本来就该写真库（这是它的设计意图），但探查先行确认现状，跑完核对行数。

## 2. npm approve-scripts 污染 package.json

本机 npm 有 install-script 审计（allowScripts）。worktree 首次 `npm install` 时 better-sqlite3/esbuild 的 install 脚本被拦，执行 `npm approve-scripts better-sqlite3 esbuild` 批准后，**它会把 allowScripts 配置段写进 server/package.json**——该文件通常不在授权列表。
纪律：worktree 首次 npm install 后必须 `git status` + `git diff server/package.json`，被污染立即 `git checkout -- server/package.json`。（0805 任务 commit 前发现并还原，diff 保持干净。）

## 3. 派工前提核实：「抽函数」指令可能已有现成函数

派工写「若没有现成导出，可把 createOrder L279-300 的分期生成段抽成函数」——实际 order.service.ts L799 已有私有 `generateInstallmentsForOrder`（SPEC-004 递补场景写的），实际改动缩到 export + 补守卫。
纪律：派工给出具体重构方向时，先 grep 符号确认现状；有现成函数优先复用，交付报告写明方案选择理由。给已有函数新增守卫条件前，必须核实所有存量调用点兼容（本案 promoteOrder 先 UPDATE zone 再调用，守卫无影响）。

## 4. 测试助手坑：`?? default` 吞显式 null

`overrides.total_price_cents ?? 20000`——测试想显式传 null（测无报价分支）时，null 会被默认值替换，测试必挂。字段有「有意义的 null」时用 `'key' in overrides ? overrides.key : default`。

## 5. Ad-hoc 验证脚本用 tsx，不要用 node

server/src 是 .ts 但 import 带 `.js` 扩展名（moduleResolution: bundler），plain node ESM 跑 ad-hoc 脚本会 ERR_MODULE_NOT_FOUND。用 `npx tsx 脚本` （cwd=server/）。内存库 ad-hoc 脚本须在 import 前设 `process.env.DB_PATH = ':memory:'` + `UPLOAD_DIR`，并显式调 `initDatabase(db)`（connection.js 不自动建表）。

## 6. STATUS.md 清账条目与 git log 交叉核对

STATUS「已知遗留」列着 BUG-1 方案 b，但 `git log` 显示 `18bab37 fix(order): BUG-1方案b` 已合入 master——条目过期。读到可疑的清账/待办条目时顺手 `git log --oneline --grep=关键词` 核对，发现矛盾写进交付报告提一号更新，自己不改 STATUS（一号维护）。
