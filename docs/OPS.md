# OPS.md — 运维手册（版本更新 / 备份与恢复）

> 建立：2026-08-09（外部审计 P0-1 修复）；2026-08-11 增补（审计批E R-6：uploads 备份 / restore 脚本 / DB 自愈 / GC 窗口）；2026-08-19 新增版本更新章节（§0）
> 背景：记账系统为单点 SQLite 文件（data/commission.db）+ 全部作品/参考图/交付文件（uploads/），
> 两者都无备份=容器/磁盘损坏即全部丢失。完整备份 = DB 快照 + uploads 归档（缺一不可）。
> 本文档讲「版本更新 / 备份 / 恢复 / 保留策略」，日常操作见《维护说明书.md》。

## 0. 版本更新（日常运维首条纪律：及时更新）

> **用户须知：每次收到新版本发布通知后，请及时在服务器上运行 `bash scripts/update.sh` 完成更新。**
> 长期不更新会累积迁移跨度与行为差异，越晚更新风险越大；及时更新则每次都是小步、可回滚。

Linux 服务器（项目目录内）：

```bash
bash scripts/update.sh
```

脚本自动完成全链路（无需手工步骤）：更新前 DB 备份（VACUUM INTO 不停服，保留 2 份轮转）→ `git pull --ff-only` 拉新代码 → 写版本标记（data/version.json，管理后台「系统更新」面板据此显示）→ 重建容器 → 等 healthy（150 秒上限）→ 体检（健康接口 + 迁移版本）→ 汇报新旧版本与回滚命令。

- 任一步骤失败即停，并直接给出回滚命令（`git reset --hard <旧版本> && docker compose up -d --build`）；备份失败会给警告与 5 秒取消窗口。
- 前提：服务器目录是 git 仓库（v124 起安装已默认 git 克隆；早期 ZIP 安装需先按《维护说明书》切换为 git 安装）+ docker 可用。
- 更新后请打开网站抽查一遍（脚本末尾也会提示）；管理后台「系统更新」面板可核对当前版本是否已追上 GitHub master。
- Windows 宿主开发机不走本脚本（开发环境直接 git pull + 本地起服即可）；本脚本面向 Linux 生产部署。
- 手工更新流程（不用脚本时的底线方案）见 §7；正常情况下优先用 update.sh。

## 1. 备份命令

容器内（或任何能访问数据卷的机器）：

```bash
# ① DB 快照（DB_PATH 由 compose 注入 /app/data/commission.db）
docker compose exec -T web npm --prefix /app/server run backup

# ② 上传文件归档（UPLOAD_DIR 由 compose 注入 /app/uploads）
docker compose exec -T web npm --prefix /app/server run backup:uploads

# 宿主机本地开发库
cd 仓库根目录 && cd server && npm run backup && npm run backup:uploads
```

- 脚本：`server/scripts/backup-db.ts`（DB）+ `server/scripts/backup-uploads.ts`（uploads）
- DB 原理：SQLite `VACUUM INTO` 一致性快照——运行中的库直接出完整独立 .db 文件，WAL 安全，不停服。
- uploads 原理：Node 原生 zlib + tar 流打包（ustar），含 `.recycle-bin`（回收站内仍是用户数据），零新依赖。
- 成功输出：DB 为 `BACKUP_OK <文件路径>`，uploads 为 `BACKUP_OK <文件路径> (<大小> bytes, <N> files)`；失败输出均为 `BACKUP_FAILED <原因>` 并退出码 1（cron 可据此告警）。

## 2. 备份存放位置与保留策略

- 容器内：`/app/data/backups/`（宿主 `./data/backups/`）
- 文件名：`commission.db.bak-<ISO时间戳>`（DB）+ `uploads-<ISO时间戳>.tar.gz`（文件），按文件名排序即时间序
- 保留：**DB 最多 3 份 / uploads 最多 2 份**（2026-08-11 用户拍板），超出自动删最旧（脚本内置，防磁盘撑爆）
- 建议：配合宿主机 cron 每日执行 + 定期把 data/backups 同步到异地（如网盘/对象存储）

宿主机 cron 示例（每日 03:30，DB 与 uploads 都要备）：

```cron
30 3 * * * cd /path/to/artist-commission && docker compose exec -T web npm --prefix /app/server run backup && docker compose exec -T web npm --prefix /app/server run backup:uploads >> /var/log/commission-backup.log 2>&1   # 容器 WORKDIR=/app，--prefix 指向 /app/server
```

### Windows 计划任务（实际在用）

Windows 宿主的每日备份由计划任务 `CommissionDailyBackup` 在 03:30 触发仓库根目录 `daily-backup.bat`，日志统一追加到 `data/backups/daily-backup.log`（`daily-backup.bat:6,16`）。

- **依赖**：Docker Compose 服务可用（脚本调用 `docker compose exec -T web ...`）；宿主机 `node` ≥ 22.6 且在 PATH（校验阶段执行 `node scripts/verify-backup.mjs`）；仓库根/server 依赖已安装（校验使用 `better-sqlite3`）——见 `daily-backup.bat:7-8`。
- **执行内容**（按 `daily-backup.bat` 实际步骤）：
  1. 脚本先 `cd /d "%~dp0"` 定位仓库根，确保 `data/backups/` 存在；先用 `scripts/rotate-log.ps1` 按 5MB × 3 份轮转日志（best-effort），再用 `scripts/backup-log.ps1` 写 UTF-8 时间戳起始标记；
  2. `docker compose exec -T web npm --prefix /app/server run backup` 产出 DB 快照，解析 `BACKUP_OK <路径>`；
  3. `node scripts/verify-backup.mjs <路径>` 执行 SQLite `integrity_check` + `foreign_key_check`，未得到 `VERIFY_OK` 即退出 1（损坏产物不放行）；
  4. `docker compose exec -T web npm --prefix /app/server run backup:uploads` 备份 uploads；DB/校验/uploads 任一步失败写 `DB_BACKUP_FAILED` / `BACKUP_ARTIFACT_NOT_FOUND` / `VERIFY_FAILED` / `UPLOADS_BACKUP_FAILED` 标记并以退出码 1 结束（日志轮转失败仅记 `ROTATE_LOG_WARN`，不阻断）。
- **日志**：`data/backups/daily-backup.log`，超过 5MB 由 `rotate-log.ps1` 轮转为 `.1`/`.2`/`.3`（最多 3 份，best-effort）。
- **换机重建**：新机满足上述依赖后，把 Windows 计划任务指向新仓库根 `daily-backup.bat`，沿用任务名 `CommissionDailyBackup` 与 03:30 时间，手工触发一次并核对 `daily-backup.log` 出现 `BACKUP_OK` 与 `VERIFY_OK` 后再放行。仓库内没有创建/迁移计划任务的脚本，任务本身需在 Windows 计划任务中配置。

## 3. 恢复方式（备份文件 → 回滚）

### 3.1 DB 恢复（restore-db.ts，审计批E）

`server/scripts/restore-db.ts` 补齐了「手工 cp + 无校验」的缺口：目标库若存在先移为
`.bak-pre-restore-<时间戳>`（留证）→ 复制备份 → `PRAGMA integrity_check` + `foreign_key_check`
双重校验 → 失败自动回滚（恢复原库）并退出码 1。

```bash
# 1) 停服务，避免写库
docker compose down

# 2) 恢复最近一份备份（也可显式指定：npm run restore -- <备份文件绝对路径>）
docker compose run --rm -e DB_PATH=/app/data/commission.db web npm --prefix /app/server run restore

# 3) 起服务并验证
docker compose up -d
docker compose exec web curl -s localhost:3000/api/health   # 期望 {"status":"ok",...}
```

- 成功输出 `RESTORE_OK <备份路径>`；失败输出 `RESTORE_FAILED <原因>` 且原库已回滚（未丢失）。
- 文件属主：若容器以 node 用户跑，恢复后确认 `./data/commission.db` 属主可写（chown -R 1000:1000 视宿主机映射而定）。
- 回滚窗口：恢复到的备份点 = 丢失该点之后的全部数据；无更优方案时以最近一份为佳。

### 3.2 uploads 恢复（tar 解压）

```bash
# 1) 找最近归档并解压到 uploads 目录（保留原始相对路径结构，含 .recycle-bin）
tar -xzf ./data/backups/uploads-<选中的时间戳>.tar.gz -C ./uploads

# 2) 起服务并抽查作品图/参考图/交付文件 URL
docker compose up -d
```

> 恢复顺序建议：先恢复 DB（§3.1）再恢复 uploads，或同时恢复同一备份时点的两份——
> 若只恢复旧 DB 而不恢复 uploads，新上传文件会留在磁盘上成为「无引用」文件（见 §4 GC 窗口）。

## 4. GC 风险窗口（审计批E R-6，务必阅读）

孤儿文件 GC（app.ts `gcUploads` / `scripts/gc-uploads.ts`）把「DB 无引用」文件移入回收站，
回收窗口已从 **24h 提升到 72h**。原因（复合炸弹）：

- 手工恢复旧 DB 备份后，**备份时点之后新上传且已关联订单的文件**在新 DB 里「无引用」；
- 若按 24h 窗口回收，它们会在一次 GC 后进入回收站（30 天后被物理清除），数据丢失；
- 72h 给运维留出恢复后的关联核对窗口，超过 72h 仍未引用的才是真孤儿。

> 恢复后请尽快核对该备份点之后的新上传文件（可用回收站接口找回），并重新关联或迁移；
> 回收站内的文件也在 uploads 归档内（恢复窗口内一并备份）。

## 5. DB 损坏自愈（entrypoint.sh，审计批E）

`entrypoint.sh` 在起服前调用 `npx tsx scripts/check-db.ts`（better-sqlite3 readonly 打开 +
`integrity_check` + `foreign_key_check`）：

- 探测通过 → 正常启动；
- 探测失败（文件存在但打不开/校验不过）→ 打印 `SELF-HEAL:` 告警并自动执行
  `restore-db.ts` 恢复最近备份 → 恢复成功继续启动，**恢复失败才退出**；
- 文件不存在（全新部署）→ 跳过探测，由 initDatabase 首启建库（避免无备份可恢复时误退出）。

> 效果：DB 损坏不再导致 `restart: unless-stopped` 崩溃循环，Caddy 的
> `depends_on: service_healthy` 能等到自愈后的健康实例。

## 6. 验证备份可用性（建议每季度一次）

```bash
# 拿一份 DB 备份开个临时库查表
sqlite3 /tmp/verify.db ".tables" && sqlite3 /tmp/verify.db "SELECT COUNT(*) FROM orders"

# 拿一份 uploads 归档列出内容（应包含 images/references/deliverables/notes）
tar -tzf ./data/backups/uploads-*.tar.gz | head -20
```

（临时验证库放在 /tmp，用完即删，别污染数据目录。）

## 7. 手工部署 / 重建清单（备份 → 构建 → 启动 → 验证）

> 日常版本更新请用 §0 的 `bash scripts/update.sh`（自动完成下述全部步骤）；本节为不用脚本时的手工底线方案与故障排查参考。

版本更新或容器重建前，先备份（见 §1），再按序执行：

```bash
# 0) 重建前备份（防重建失败丢数据）
docker compose exec -T web npm --prefix /app/server run backup

# 1) 拉新代码 + 重建镜像并启动（多阶段构建，自动编译前端）
git pull
docker compose up -d --build

# 2) Caddy 会自动跟随 web 容器（depends_on: service_healthy），
#    若 Caddy 未自动恢复，显式重启
docker compose restart caddy

# 3) 三层验证
docker compose exec web curl -s localhost:3000/api/health          # ① health：应返回 {"status":"ok",...}
docker compose exec web curl -s -X POST localhost:3000/api/anon-token               # ② 匿名凭证：应返回 64 位 hex token（埋点防刷链路可用）
docker compose exec web ls /app/web/dist/assets/ | tail            # ③ 前端产物：应看到本次版本新增的 chunk
```

> 注意：`docker compose up -d` 不会应用 compose 新增的 logging/mem_limit 等创建期选项，需 `--build`（或 `--force-recreate`）重建容器才生效。

## 8. AUTH_DEV_MODE（生产必须 false）

- `AUTH_DEV_MODE=true` 时，TOTP 绑定接口（bind-init）响应会附带密钥明文 `_dev_secret`（仅开发/测试辅助用）。
- **生产环境必须设为 `false` 或删除该行**，否则 TOTP 密钥泄露，任何人可伪造动态口令登录。
- 检查：`docker compose exec web printenv AUTH_DEV_MODE` 应输出 `false`（或为空）。

## 9. 数据库迁移与回滚

> 本节补充迁移（schema 变更）的运维口径（P2-4，外部研判项）。迁移代码已拆分：`server/src/db/schema.ts`（建表/索引）+ `server/src/db/migrate.ts`（执行器）+ `server/src/db/migrations/`（版本化 TS）；`server/src/db/init.ts` 为门面导出。

### 当前机制（单机小项目取舍）

- 迁移均为 **up-only**：`MIGRATIONS` 共 68 条（version 1~68，最新 v68 artists 留言开关 + 统计开关默认值，2026-08-18 刷新），全部只写 `up()`，**没有 `down()`**（grep 零命中）。
- 每次迁移执行前自动备份：`server/src/db/migrate.ts` 的 `backupDbBeforeMigration` 产出一致性快照 `commission.db.bak.v<N>`（事务外 VACUUM INTO / 事务内 checkpoint 后复制；仅文件数据库，`:memory:` 跳过；**备份失败即中止迁移**，815 审计加固）。
- 采用该取舍的原因：单机小项目、单部署点，schema 变更频率低，写 `down()` 的维护成本高于收益；错误回滚用备份恢复兜底（见 §3）。

### 回滚方式

schema 变更出错时**不提供自动 down 迁移**，统一走「备份恢复」：

```bash
# 1) 停服务
docker compose down
# 2) 用迁移前自动备份或手动备份恢复（第 3 节）
cp ./data/commission.db.bak.v<N> ./data/commission.db
# 3) 起服务
docker compose up -d
```

- 迁移前自动备份文件名含目标版本号（如 `commission.db.bak.v64`），按需选择。
- 恢复后确认数据完整：`sqlite3 ./data/commission.db "SELECT MAX(version) FROM schema_migrations"` 应与目标版本一致（已应用版本记录在 `schema_migrations` 表，由 `migrate.ts` 维护）。

### 建议（技术债登记）

- 未来新迁移若涉及**破坏性变更**（删除/改约束/改数据语义），建议补充 `down()`；非破坏性变更（加列/建索引）可继续 up-only。
- 若补充 `down()`，命名与 `up()` 同构（`down(database)`），并在迁移对象内注释回滚动作与数据影响。
- 上线前执行 `npm run db:init` 验证迁移链可用，确认 `schema_migrations` 最高 version 前进到目标值。

---
## 10. GitHub Actions CI/CD（批7 事故教训，2026-08-09）

- 两个工作流：`.github/workflows/ci.yml`（server/web 门禁）与 `e2e.yml`（Playwright）。push 到 master 即触发。
- **仓库 Actions 权限必须保持 `selected`（仅 GitHub 官方行动）**，勿改成 `local_only`。
  - 2026-08-08 18:28 起因权限被设为 `local_only`，checkout/setup-node 等全部外部 actions 被拦，CI/E2E 连续 `startup_failure`（0 jobs），但本地测试全绿——**排查 CI 红先看仓库设置，再看代码**。
  - 查询：`gh api repos/AxelBeary/Inkglean/actions/permissions`
  - 修复：`gh api -X PUT .../actions/permissions --input '{"enabled":true,"allowed_actions":"selected"}'` + `PUT .../selected-actions --input '{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":[]}'`
- `startup_failure` 的 run 不可 rerun，须新提交触发。

---
## 11. 上线前恢复演练（强制 checklist，REQ-043 I5）

> 执行时机：**每次部署上线前**；执行人：**一号 / 运维**。
> 本项为强制项，未完成不得上线。演练走 `server/scripts/backup-db.ts`（DB）+ `backup-uploads.ts`（uploads）
> + `restore-db.ts` 的真实链路（§1/§3），不依赖「假设可用」的备份；**本批只落 checklist，不实际执行删库恢复**。

- [ ] ① 备份：`cd server && npm run backup && npm run backup:uploads` → 确认 DB 输出 `BACKUP_OK <文件路径>`、uploads 输出 `BACKUP_OK <文件路径> (<大小> bytes, <N> files)`
- [ ] ② 留档基准：记录备份文件路径与当前已应用迁移版本（`sqlite3 data/commission.db "SELECT MAX(version) FROM schema_migrations"`）
- [ ] ③ 删库：停服后把 `data/commission.db*`（含 `-wal`/`-shm`）移到临时目录（演练建议用临时目录而非物理删除，双保险）
- [ ] ④ 恢复：`npm run restore`（或显式 `npm run restore -- <备份绝对路径>`）→ 确认输出 `RESTORE_OK <备份路径>`
- [ ] ⑤ 验证数据完整：
  - `sqlite3 data/commission.db "PRAGMA integrity_check"` 返回 `ok`
  - `PRAGMA foreign_key_check` 无悬空行
  - `schema_migrations` 最高 version 与 ② 一致（迁移链未回退）
  - 抽查关键业务表行数（artists / orders / artworks / guestbook_messages 等）与备份前一致
  - uploads 归档抽查：作品图 / 参考图 / 交付文件 URL 可访问（§3.2）
- [ ] ⑥ 恢复后核对 GC 风险窗口（§4）：备份点之后新上传的文件重新关联/迁移后再开服，防止 72h 后进回收站
- [ ] ⑦ 结论留档：演练日期、备份路径、验证结果写入交付记录；任一环节失败即阻塞上线并先修复备份链路

---
## 12. Cloudflare 代理下的真实 IP 透传与源站认证（2026-08-19 拍板落地）

> 背景：域名套 CF 橙色云时，若不做本节配置，后端限流拿到的是 **CF 边缘节点 IP**（同地区大量用户共享）而非用户真实 IP——限流配额被全站共享，正常用户可能被误伤 429。本方案 2026-08-19 用户拍板（方案 A）。

### 12.1 真实 IP 透传（必做）

入口反代的 reverse_proxy 块加一行（宿主机 Caddy 与仓库内 docker 版 Caddyfile 均已含）：

```
reverse_proxy 127.0.0.1:3000 {
    header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
}
```

原理：CF-Connecting-IP 是 Cloudflare 写入的用户真实 IP；后端 trustProxy 默认只信内网代理（172.16/10.0/192.168 三段），会自动采纳这个唯一值作为 request.ip。不经 CF 直连时该头为空被删，后端回退用连接地址。**改完需重载反代**（`systemctl reload caddy`）。

### 12.2 Authenticated Origin Pulls（推荐加固，防绕 CF 伪造）

风险场景：源站真实 IP 泄露后，攻击者绕过 CF 直连源站并自己带一个假 CF-Connecting-IP 头，即可伪造任意 IP 绕过限流。两步堵死：

1. **Cloudflare 控制台**：域名 → SSL/TLS → Origin Server → 打开 **Authenticated Origin Pulls** 开关。开启后 CF 回源会出示官方客户端证书。
2. **源站 Caddy 验证该证书**：下载 CF 官方 CA（https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem，存如 /etc/caddy/certs/authenticated-origin-pull-ca.pem），站点块的 tls 指令扩展为：

```
tls /etc/caddy/certs/你的域名.crt /etc/caddy/certs/你的域名.key {
    client_auth {
        mode require_and_verify
        trusted_ca_cert_file /etc/caddy/certs/authenticated-origin-pull-ca.pem
    }
}
```

改完 `caddy validate && systemctl reload caddy`。此后非 CF 的直连（无客户端证书）在 TLS 层即被拒，伪造头无从谈起。

> **生效顺序（2026-08-21 实战校正，与早期口径相反）**：先在 CF 控制台打开 AOOP 开关、再在源站 reload client_auth 配置。CF 带证书回源时若 Caddy 尚未要求验证，证书只是被忽略、无害；反过来（Caddy 已硬性要求证书而 CF 开关未开）则 CF 回源被拒、站点不可用。
> 不想配客户端证书验证的替代：防火墙 80/443 只放行 CF IP 段（前提该端口无其他直连服务）。
> **实战坑（2026-08-21 cute-goose-1 实测）**：
> ① 现装 Caddy（2.10.x）上 client_auth 的 CA 写法只有 `trusted_ca_cert_file` 能过验证（带 deprecation WARN 但无害）；`trust_pool` / `ca_pool` 新写法均报解析错误，不要为消警告去试。
> ② Caddy 铁律：`caddy validate` 通过后只用 `systemctl reload caddy`——reload 失败保留旧配置、网站不掉线；在未验证通过时 `restart` 会令服务直接停摆、该 Caddy 承载的所有站点全 502。
> ③ 源站证书（Origin CA 的 .crt/.key）在 Strict 模式下是**必需品**不是可选项，误删会致 reload 失败/526；私钥权限 `chmod 640` + caddy 组可读，root 独享 600 会让 Caddy 进程读不到。

### 12.3 验证方法

- 部署后从外网访问任一限流接口（如反复刷新公开主页），观察是否按真实 IP 计数：不同设备/网络交替访问不应互相挤占配额；同一设备狂刷应在阈值处收到 429。
- 后端日志里的请求 IP 应为真实公网 IP（而非 172.68.x.x/162.158.x.x 等 CF 边缘段）。
