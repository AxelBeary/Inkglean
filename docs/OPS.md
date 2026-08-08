# OPS.md — 运维手册（备份与恢复）

> 建立：2026-08-09（外部审计 P0-1 修复）
> 背景：记账系统为单点 SQLite 文件（data/commission.db），无备份=容器/磁盘损坏即全部丢失。
> 本文档只讲「备份 / 恢复 / 保留策略」，日常操作见《维护说明书.md》。

## 1. 备份命令

容器内（或任何能访问数据卷的机器）：

```bash
# 进 web 容器执行（DB_PATH 由 compose 注入 /app/data/commission.db）
docker compose exec -T web npm --prefix /app/server run backup

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
30 3 * * * cd /path/to/artist-commission && docker compose exec -T web npm --prefix /app/server run backup >> /var/log/commission-backup.log 2>&1   # 容器 WORKDIR=/app，--prefix 指向 /app/server
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
docker compose exec web curl -s localhost:3000/api/health   # 期望 {"status":"ok",...}
```

- 文件属主：若容器以 node 用户跑，恢复后确认 `./data/commission.db` 属主可写（chown -R 1000:1000 视宿主机映射而定）。
- 回滚窗口：恢复到的备份点 = 丢失该点之后的全部数据；无更优方案时以最近一份为佳。

## 4. 验证备份可用性（建议每季度一次）

```bash
# 拿一份备份开个临时库查表
sqlite3 /tmp/verify.db ".tables" && sqlite3 /tmp/verify.db "SELECT COUNT(*) FROM orders"
```

（临时验证库放在 /tmp，用完即删，别污染数据目录。）

## 5. 部署 / 重建清单（备份 → 构建 → 启动 → 验证）

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

## 6. AUTH_DEV_MODE（生产必须 false）

- `AUTH_DEV_MODE=true` 时，TOTP 绑定接口（bind-init）响应会附带密钥明文 `_dev_secret`（仅开发/测试辅助用）。
- **生产环境必须设为 `false` 或删除该行**，否则 TOTP 密钥泄露，任何人可伪造动态口令登录。
- 检查：`docker compose exec web printenv AUTH_DEV_MODE` 应输出 `false`（或为空）。
