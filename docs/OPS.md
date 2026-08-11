# OPS.md — 运维手册（备份与恢复）

> 建立：2026-08-09（外部审计 P0-1 修复）；2026-08-11 增补（审计批E R-6：uploads 备份 / restore 脚本 / DB 自愈 / GC 窗口）
> 背景：记账系统为单点 SQLite 文件（data/commission.db）+ 全部作品/参考图/交付文件（uploads/），
> 两者都无备份=容器/磁盘损坏即全部丢失。完整备份 = DB 快照 + uploads 归档（缺一不可）。
> 本文档只讲「备份 / 恢复 / 保留策略」，日常操作见《维护说明书.md》。

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
- 成功输出：`BACKUP_OK <文件路径> (<大小> bytes, <N> files)`；失败输出 `BACKUP_FAILED <原因>` 并退出码 1（cron 可据此告警）。

## 2. 备份存放位置与保留策略

- 容器内：`/app/data/backups/`（宿主 `./data/backups/`）
- 文件名：`commission.db.bak-<ISO时间戳>`（DB）+ `uploads-<ISO时间戳>.tar.gz`（文件），按文件名排序即时间序
- 保留：**DB 最多 3 份 / uploads 最多 2 份**（2026-08-11 用户拍板），超出自动删最旧（脚本内置，防磁盘撑爆）
- 建议：配合宿主机 cron 每日执行 + 定期把 data/backups 同步到异地（如网盘/对象存储）

宿主机 cron 示例（每日 03:30，DB 与 uploads 都要备）：

```cron
30 3 * * * cd /path/to/artist-commission && docker compose exec -T web npm --prefix /app/server run backup && docker compose exec -T web npm --prefix /app/server run backup:uploads >> /var/log/commission-backup.log 2>&1   # 容器 WORKDIR=/app，--prefix 指向 /app/server
```

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

孤儿文件 GC（app.ts `gcUploads` / `scripts/gc-uploads.js`）把「DB 无引用」文件移入回收站，
回收窗口已从 **24h 提升到 72h**。原因（复合炸弹）：

- 手工恢复旧 DB 备份后，**备份时点之后新上传且已关联订单的文件**在新 DB 里「无引用」；
- 若按 24h 窗口回收，它们会在一次 GC 后进入回收站（30 天后被物理清除），数据丢失；
- 72h 给运维留出恢复后的关联核对窗口，超过 72h 仍未引用的才是真孤儿。

> 恢复后请尽快核对该备份点之后的新上传文件（可用回收站接口找回），并重新关联或迁移；
> 回收站内的文件也在 uploads 归档内（恢复窗口内一并备份）。

## 5. DB 损坏自愈（entrypoint.sh，审计批E）

`entrypoint.sh` 在起服前调用 `node scripts/check-db.js`（better-sqlite3 readonly 打开 +
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

## 7. 部署 / 重建清单（备份 → 构建 → 启动 → 验证）

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

> 本节补充迁移（schema 变更）的运维口径（P2-4，外部研判项）。迁移代码在 `server/src/db/init.js`。

### 当前机制（单机小项目取舍）

- 迁移均为 **up-only**：`MIGRATIONS` 共 48 条（version 1~48），全部只写 `up()`，**没有 `down()`**（grep 零命中）。
- 每次迁移执行前自动备份：`init.js` 的 `backupDbBeforeMigration` 会复制 `commission.db` → `commission.db.bak.v<N>`（仅文件数据库；`:memory:` 跳过）。
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

- 迁移前自动备份文件名含目标版本号（如 `commission.db.bak.v45`），按需选择。
- 恢复后确认数据完整：`sqlite3 ./data/commission.db "PRAGMA user_version"` 应与目标版本一致（`user_version` 由 init.js 维护）。

### 建议（技术债登记）

- 未来新迁移若涉及**破坏性变更**（删除/改约束/改数据语义），建议补充 `down()`；非破坏性变更（加列/建索引）可继续 up-only。
- 若补充 `down()`，命名与 `up()` 同构（`down(database)`），并在迁移对象内注释回滚动作与数据影响。
- 上线前执行 `npm run db:init` 验证迁移链可用，确认 `user_version` 前进到目标值。

> 本节补充迁移（schema 变更）的运维口径（P2-4，外部研判项）。迁移代码在 `server/src/db/init.js`。

### 当前机制（单机小项目取舍）

- 迁移均为 **up-only**：`MIGRATIONS` 共 48 条（version 1~48），全部只写 `up()`，**没有 `down()`**（grep 零命中）。
- 每次迁移执行前自动备份：`init.js` 的 `backupDbBeforeMigration` 会复制 `commission.db` → `commission.db.bak.v<N>`（仅文件数据库；`:memory:` 跳过）。
- 采用该取舍的原因：单机小项目、单部署点，schema 变更频率低，写 `down()` 的维护成本高于收益；错误回滚用备份恢复兜底（见第 3 节）。

### 回滚方式

schema 变更出错时**不提供自动 down 迁移**，统一走"备份恢复"：

```bash
# 1) 停服务
docker compose down
# 2) 用迁移前自动备份或手动备份恢复（第 3 节）
cp ./data/commission.db.bak.v<N> ./data/commission.db
# 3) 起服务
docker compose up -d
```

- 迁移前自动备份文件命名含目标版本号（如 `commission.db.bak.v45`），按需选择。
- 恢复后确认数据完整：`sqlite3 ./data/commission.db "PRAGMA user_version"` 应与目标版本一致（`user_version` 由 init.js 维护）。

### 建议（技术债登记）

- 未来新增迁移若涉及**破坏性变更**（删列/改约束/改数据语义），建议补充 `down()`；非破坏性变更（加列/建索引）可继续 up-only。
- 若补充 `down()`，命名与 `up()` 同构（`down(database)`），并在迁移对象内注释回滚动作与数据影响。
- 上线前执行 `npm run db:init` 验证迁移链可用，确认 `user_version` 前进到目标值。

---
## 10. GitHub Actions CI/CD（批7 事故教训，2026-08-09）

- 两个工作流：`.github/workflows/ci.yml`（server/web 门禁）与 `e2e.yml`（Playwright）。push 到 master 即触发。
- **仓库 Actions 权限必须保持 `selected`（仅 GitHub 官方行动）**，勿改成 `local_only`。
  - 2026-08-08 18:28 起因权限被设为 `local_only`，checkout/setup-node 等全部外部 actions 被拦，CI/E2E 连续 `startup_failure`（0 jobs），但本地测试全绿——**排查 CI 红先看仓库设置，再看代码**。
  - 查询：`gh api repos/AxelBeary/Brushline-HuiYue/actions/permissions`
  - 修复：`gh api -X PUT .../actions/permissions --input '{"enabled":true,"allowed_actions":"selected"}'` + `PUT .../selected-actions --input '{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":[]}'`
- `startup_failure` 的 run 不可 rerun，须新提交触发。
