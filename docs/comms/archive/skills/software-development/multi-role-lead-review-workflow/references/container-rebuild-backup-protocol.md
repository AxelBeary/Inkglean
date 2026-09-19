# 容器重建前 DB 备份协议（一号部署门禁）

触发：容器重建（master 领先容器一批改动需重建）、任何可能丢数据的部署动作前。soul 规则：生产配置修改前必须给风险+影响范围+回滚方案；STATUS 规则：重建前报用户确认。**备份没做完、没验证过，不许开始重建。**

## 为什么必须用 backup API 而不是拷文件

宿主 DB 实测 WAL 模式（记忆⑥），且容器环境 SQLite 用 DELETE journal mode——无论哪种，直接 copy `.db` 文件都可能漏掉未 checkpoint 的 WAL 数据。**唯一安全做法：在容器内跑 better-sqlite3 的 `db.backup()`**（SQLite online backup API，原子一致）。绝不 `cp commission.db`，绝不删 WAL/SHM 文件（删前必 pragma 实测 journal_mode）。

## 执行步骤（2026-08-06 实录全流程）

1. **写备份脚本**（write_file，放 workspace/temp/ 或 OS temp）：

```js
// db-backup.cjs —— 必须 .cjs，见陷阱①
const db = require('better-sqlite3')('/app/data/commission.db');
const out = '/app/data/' + process.env.BAK_NAME;
db.backup(out).then(() => {
  const st = require('fs').statSync(out);
  console.log('backup ok: ' + out + ' (' + st.size + ' bytes)');
}).catch(e => { console.error('backup failed', e); process.exit(1); });
```

2. **命名规范**：`commission.db.bak-pre-<原因>-<yyyyMMdd-HHmm>`（如 `bak-pre-env-rebuild-20260806-0636`），用 `$ts = Get-Date -Format "yyyyMMdd-HHmm"` 生成。
3. **cp 进容器并在 deps 目录执行**（docker exec 引号地狱见 windows-agent-environment，一律走文件不内联）：

```powershell
docker cp db-backup.cjs commission-web:/app/server/db-backup.cjs
docker exec -e "BAK_NAME=commission.db.bak-pre-env-rebuild-$ts" -w /app/server commission-web node db-backup.cjs
docker exec commission-web rm /app/server/db-backup.cjs   # 容器内清理
```

4. **验证备份完整性**（备份不验证 = 没有备份）。再写一个 .cjs 脚本对**备份文件**开 readonly：
   - `db.pragma('integrity_check', {simple:true})` 必须返回 `ok`
   - 行数抽查（orders/artists 计数）与当前库量级一致——证明不是空壳
   - 表数抽查（`sqlite_master` count）
5. **清理**：容器内脚本 + 本机临时脚本都删（Remove-Item / docker exec rm）。
6. **向用户报告**：备份文件名 + integrity ok + 抽查数字，作为回滚保险；然后等用户明确说"重建"才动手。

## 陷阱实录

① **扩展名**：server 的 package.json 是 `"type": "module"`，脚本叫 `.js` 会被当 ESM，`require` 直接 `ReferenceError: require is not defined in ES module scope`。一律 `.cjs`。（2026-08-06 实录：db-backup.js 失败 → db-backup.cjs 成功）
② **执行目录**：脚本必须 cp 到 `/app/server/` 且 `docker exec -w /app/server` 执行——`/tmp` 下 require 找不到 better-sqlite3（node_modules 只在 /app/server）。
③ **不要内联 node -e**：PowerShell 双引号 + docker exec + node -e 三层转义必坏（反引号被 PS 吃掉、单引号被 PS 解析），本会话两次内联全失败，写文件一次成功。

## 回滚方案模板（报用户时附上）

重建失败回滚 = 还原旧镜像 + 这份备份覆盖 `/app/data/commission.db`（backup API 产物是完整一致的单文件，直接覆盖即可，无 WAL 依赖）。中断窗口与恢复时长（本次预估：重建 1-3 分钟，frp 端口不变）一并告知。
