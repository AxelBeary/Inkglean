# OPS.md — 运维手册（备份与恢复）

> 建立：2026-08-09（外部审计 P0-1 修复）
> 背景：记账系统为单点 SQLite 文件（data/commission.db），无备份=容器/磁盘损坏即全部丢失。
> 本文档只讲「备份 / 恢复 / 保留策略」，日常操作见《维护说明书.md》。

## 1. 备份命令

容器内（或任何能访问数据卷的机器）：

```bash
# 进 web 容器执行（DB_PATH 由 compose 注入 /app/data/commission.db）
docker compose exec web npm run backup

# 宿主机本地开发库
cd 仓库根目录 && cd server && npm run backup
```

- 脚本：`server/scripts/backup-db.ts`
- 原理：SQLite `VACUUM INTO` 一致性快照——运行中的库直接出完整独立 .db 文件，WAL 安全，不停服。
- 成功输出：`BACKUP_OK <文件路径>`；失败输出 `BACKUP_FAILED <原因>` 并退出码 1（cron 可据此告警）。

## 2. 备份存放位置与保留策略

- 容器内：`/app/data/backups/`（宿主 `./data/backups/`）
- 文件名：`commission.db.bak-<ISO时间戳>`，按文件名排序即时间序
- 保留：**最多 7 份**，超出自动删最旧（脚本内置，防磁盘撑爆）
- 建议：配合宿主机 cron 每日执行 + 定期把 data/backups 同步到异地（如网盘/对象存储）

宿主机 cron 示例（每日 03:30）：

```cron
30 3 * * * cd /path/to/artist-commission && docker compose exec -T web npm run backup >> /var/log/commission-backup.log 2>&1
```

## 3. 恢复方式（备份文件 → 回滚）

前提：备份文件是完整独立的 .db，可直接作为 commission.db 使用。

```bash
# 1) 停服务，避免写库
docker compose down

# 2) 找一份备份
ls -t ./data/backups/commission.db.bak-* | head -1

# 3) 备份当前（坏）库留证，再把备份复制成正式库
mv ./data/commission.db ./data/commission.db.corrupt-$(date +%Y%m%d-%H%M%S)
cp ./data/backups/commission.db.bak-<选中的时间戳> ./data/commission.db

# 4) 起服务并验证
docker compose up -d
curl -s http://127.0.0.1:3000/api/health   # 期望 {"status":"ok",...}
```

- 文件属主：若容器以 node 用户跑，恢复后确认 `./data/commission.db` 属主可写（chown -R 1000:1000 视宿主机映射而定）。
- 回滚窗口：恢复到的备份点 = 丢失该点之后的全部数据；无更优方案时以最近一份为佳。

## 4. 验证备份可用性（建议每季度一次）

```bash
# 拿一份备份开个临时库查表
sqlite3 /tmp/verify.db ".tables" && sqlite3 /tmp/verify.db "SELECT COUNT(*) FROM orders"
```

（临时验证库放在 /tmp，用完即删，别污染数据目录。）
## 5. 数据库迁移与回滚

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
