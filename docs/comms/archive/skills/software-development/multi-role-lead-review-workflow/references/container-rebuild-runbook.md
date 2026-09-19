# 容器重建 Runbook（一号：部署/上线/A 测前置）

触发：master 领先容器（安全批/迁移/功能批累积），A 测在即，用户授权重建。
实录：2026-08-06 环境批+视觉批重建（server 925/web 215 基线）。

## 重建前（必做，缺一不可）

1. **DB 备份——SQLite WAL 模式禁止直接拷文件**，必须 better-sqlite3 的 `.backup()`：
   - 写备份脚本（见下方模板要点），`docker cp` 进容器 `/app/server/`，`docker exec -w /app/server commission-web node db-backup.cjs`
   - **脚本必须用 `.cjs` 扩展名**：server/package.json 是 `"type": "module"`，`.js` 会被当 ESM，`require` 直接报错
   - **必须 `-w /app/server`**：better-sqlite3 从该目录的 node_modules 解析，放 /tmp 跑会 MODULE_NOT_FOUND
   - 备份命名 `commission.db.bak-pre-<事由>-<时间戳>`，落在 /app/data（volume 内，宿主可见）
2. **备份完整性验证**（重建的回滚保险，不验证等于没备份）：readonly 打开备份 → `PRAGMA integrity_check` 必须 ok → 行数抽查（orders/artists 计数与生产一致，防备份是空壳）
3. 确认 master 领先容器哪些批（git log），写进重建记账

## 重建执行（2026-08-06 实录踩坑，按序出现）

1. **PowerShell 引号战争**：`docker exec ... node -e "..."` 里反引号/嵌套引号会被 PS 逐层吃掉（实测两次全炸）。**别硬拼引号**——一律走「write_file 脚本 → docker cp → docker exec node 文件」路线。
2. **非 root 镜像 + 存量卷权限冲突（必踩）**：镜像切 `USER node`（uid 1000）后，旧容器 root 创建的 data/uploads 卷文件 node 写不进 → 启动 `SQLITE_READONLY` crash-loop。Dockerfile 里的 chown 只对全新卷生效，存量卷必须手动修：
   ```powershell
   docker compose stop web
   docker run --rm -v "${PWD}/data:/data" -v "${PWD}/uploads:/uploads" alpine sh -c "chown -R 1000:1000 /data /uploads"
   docker compose up -d web
   ```
   任何「镜像切非 root」后的首次启动都会撞这个，提前做可省一轮 crash-loop。
3. **AUTH_DEV_MODE=***（不是 bug，是闸门）**：安全加固批 F4 故意拦——生产开 dev mode 会让 bind-init 明文回 TOTP 密钥。STATUS 规则 9：关 AUTH_DEV_MODE = A 测启动事件，**必须用户拍板，一号不擅自改 .env**。识别信号：用户说「frp 穿透给画师访问」「直连开放」= 实质启动 A 测，此时向用户确认是否同步关 dev mode。回退选项：维持旧镜像，A 测真启动那天再关。
4. **terminal 工具误判**：前台跑 `docker compose up -d` 会被判为长驻进程拒跑 → 用 background=true + notify，然后单独命令轮询健康。

## 重建后验证

- `docker ps` → commission-web healthy（healthcheck = /api/health）
- `curl localhost:3000/api/health` = 200
- 外网链路（frp 端口不变）请用户或自测验证画师访问路径
- 回滚预案常备：旧镜像 + 备份文件（这就是备份必须验证完整性的原因）

## 重建后记账

- STATUS「容器」行更新：含了哪几批、备份文件名、chown/AUTH 处置记录
- 重建 commit message 写全：批次清单 + 审核结论 + 独立复跑测试数
- 同批交付文件按规矩合入即删

## 附带审核纪律（同日实录）

审核交付时若**交付报告文件不在分支 diff 里**（三号曾声称提交报告但 commit 只有代码）：不阻塞验收——以代码 diff + 独立复跑测试为准，但 merge message 里如实记一笔「交付报告未随 commit 提交」，不当作已交付。

## crash-loop 会被 Sentry 抓上报（用户可能贴过来）

容器 crash-loop 期间 Sentry 会持续上报启动异常（如 F4 fail-fast 的 `AUTH_DEV_MODE=*** 拦截错误）。用户可能把这些上报转成「New issue」贴给一号。**别当成新 bug**：这是重建过程本身的 fail-fast 在上报，开门/回滚后错误源消失即不再新增。回复用户时一句话点破来源（「这是安全加固合入的 Sentry 监控抓到的重建期拦截」），不当新工单处理。

## 多批并行时一次重建收全部（省停机）

四批并行合入 + 用户授权重建时：先把**已审完的批全部合入 master**（逐个独立复跑测试 → merge → push），再一次性 `docker compose build web` + up——镜像带全部批次，只停一次机。切忌审一批重建一次：用户侧每次重建都是 frp 断流 + 数据风险，能并则并。五号批审完合入后**重新 build**（因为第一次 build 不含它），这次重 build 是必要的，不算浪费。
