# 并行期安全：主 worktree 提交污染 / 子代理接力 / 合并后容器验证

> 来源：2026-08-05 v0.36 波 1 并行派工实战（四角色同时在跑：两个子代理 + 两个主 worktree 直提角色）。

## 一、主 worktree 提交污染（真实事故 + 防治）

### 事故经过（2026-08-05，commit e04f2f5）

左边三号在主 worktree 执行"直提 master"任务（errors.ts 死码清理），改完后**尚未 commit**。一号在主 worktree 提交自己的 comms 派工文件时，`git add docs/comms` 之后 commit——但工作区里三号的未提交改动仍在，**一号此前某次 add 范围控制不严，把 errors.ts 一起带进了 master 并推送**。提交信息只写了派工，完全没提 errors.ts。

### 预防清单（主 worktree 有角色直提任务时，一号每次 commit 必做）

1. commit 前 `git status --short` 逐行看：哪些是我的文件、哪些是别的角色的未提交改动
2. **只 `git add` 明确要提交的具体文件**（永远不用 `git add .` / `git add -A` / 甚至慎用目录级 add——目录里可能有别人的新文件）
3. add 之后 `git diff --cached --stat` 复核暂存区，确认只含目标文件
4. 提交信息必须与实际暂存内容一一对应；对不上就停下来查

### 事后恢复协议（已推送的污染 commit）

1. **不回滚历史**：master 已推送，禁止 reset --hard / rebase（项目硬规则）
2. **立即补审**：把被带入的改动当正常交付审——diff 对照原派工清单逐项核对、grep 确认零残留引用、重跑测试三件套（vitest + tsc + eslint）
3. **改动正确** → 保留，在 `docs/comms/01-note-合入瑕疵-<sha>-<日期>.md` 写瑕疵记录（事实/补审结果/新纪律），commit 进 master 让历史可追溯
4. **改动有问题** → 新 commit 显式 revert 或修正（同样不重写历史）
5. **告知被带入的角色**：他的改动已在 master，无需再 commit，直接回报验证结果即可——否则他会重复提交造成冲突

## 二、子代理迭代上限接力模式（大任务拆轮次）

### 现象

大型编码任务的子代理会撞 max_iterations（约 50 次工具调用）：
- 第一轮：侦察耗尽预算，**零代码落盘**就结束
- 第二轮：说"直接编码"，但仍在编码前一刻中断，留下**半成品**（未 commit 的工作区改动）

### 接力处置（v0.36 二号任务实测，三轮完成）

1. **第一轮结束后**：查子代理 live transcript 尾部 + worktree 的 `git status`/`git log`，确认实际产出
2. **半成品有价值**：一号亲自审 diff——质量过关的部分（如四档缩放逻辑+刻度适配）**自己补完收尾**（如补上子代理漏掉的 i18n 键），跑测试门后**固化成 commit**作为检查点
3. **下一轮派工三要素**：
   - 明确写"侦察已完成、前序编码已 commit（附 commit hash），**禁止重新侦察**，直接读指定位置编码"
   - 剩余任务清单精确到文件和行号区域
   - 控制预算的提示："把工具调用留给编码和测试"
4. **每轮之间都固化检查点**：即使子代理没 commit，一号把已就绪部分 commit，保证进度不因下轮中断而丢失

### 反模式

- 原样重发同一份派工（子代理会重复侦察再撞墙）
- 指望子代理一次跑完 6 个子任务的大派工（拆！前端大任务拆成 2~3 轮，每轮 ≤3 个子任务）

## 三、后端合并后的容器重建验证序列

后端改动合入 master 后，重建容器验证真环境（测试套件覆盖不到的运行时行为）。**顺序不可乱**：

```powershell
# 0. 前置：确认容器现状 + 备份 bind-mount 数据库（v38 事故教训：重建前必备份）
cmd.exe /c "docker compose ps"
Copy-Item data\commission.db "data\commission.db.bak-<版本>-verify" -Force

# 1. 重建（日志只取尾部）
cmd.exe /c "docker compose build web" 2>&1 | Select-Object -Last 4
cmd.exe /c "docker compose up -d web" 2>&1 | Select-Object -Last 3

# 2. 健康检查（等 15 秒）
Start-Sleep 15
cmd.exe /c "docker compose ps web"   # 看 healthy
# health 端点容器内探（宿主机 localhost 可能不通，见 memory）：
cmd.exe /c "docker exec commission-web node -e `"fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(d=>console.log('health:',d.status))`""

# 3. 数据完好计数（与基线对账）——注意 -w /app/server 才能 require better-sqlite3
cmd.exe /c "docker exec -w /app/server commission-web node -e `"const db=require('better-sqlite3')('/app/data/commission.db');console.log(JSON.stringify({...}))`""

# 4. 新代码路径真数据探活（tsx 跑 TS 源码）
cmd.exe /c "docker exec -w /app/server commission-web npx tsx -e `"import { fn } from './src/features/x/x.service.js'; console.log(JSON.stringify(fn(id)))`""

# 5. 已删端点 404 探针（删除类改动的关键验证）
cmd.exe /c "docker exec commission-web node -e `"fetch('http://127.0.0.1:3000/api/已删端点').then(r=>console.log(r.status))`""
```

要点：
- `docker exec` 的 node 模块解析按 workdir 走——better-sqlite3 装在 /app/server，必须 `-w /app/server`
- 容器内探活优先于宿主机 localhost（Docker Desktop WSL2 端口转发偶发失灵）
- `cmd.exe /c` 后面不能接 PowerShell 管道（会被 cmd 吞掉），要截断就先存变量
- 验证完把备份文件名写进 STATUS.md，方便后续清理或回滚
- entrypoint 不跑 demo-data 类脚本的话，脚本里的断言不会误杀容器启动——派工时确认这一点

## 四、跨端字段删除的合并顺序（2026-08-05 addons 第二批拆分）

删除 API schema 字段（`additionalProperties: false` 下的 `addons` 类字段）时，**前端停传必须先合，后端删字段后合**。顺序反了 = 旧前端还在传字段、新后端 ajv 直接 400，运行时断链。派工写法：前端批派工里明确写「你批先合（停传字段），后端批后合」，后端批等前端合入后**另派**（不同批拆到两个分支，不并行走）。同类场景：请求体字段改名、枚举值收窄——凡「发送方与接收方必须同步变更」的改动都适用：**发送方先收敛，接收方后收紧**。

对照另一方向：后端**新增**字段/端点时顺序相反（后端先合，前端后消费），门控分支模式见 `dispatch-delivery-discipline.md` §补遗 3。
