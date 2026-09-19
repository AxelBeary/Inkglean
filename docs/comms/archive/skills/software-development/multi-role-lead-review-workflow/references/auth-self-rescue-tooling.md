# 管理员锁死自救 / 自助重置工具打造

触发：用户报告「登不进去了」（管理员 cookie 过期 + 新认证机制未绑定）；用户丢了手机/换设备；用户问「重置/自救我得怎么自己操作」；或你发现现有自助脚本需要交给用户当救命索。

## 核心洞察：认证绑定是鸡蛋问题

TOTP（或任何"先绑定再登录"机制）上线时，**唯一管理员从未绑定 + 旧登录机制已删 = 死锁**：后台重置入口要先登录，登录要先绑定。cookie 有效期内不爆雷，过期即爆。
- 预防（合入认证改造时就做）：管理员绑定与代码合入同批完成，写进 STATUS 收尾清单（见 ci-e2e-triage-and-auth-fix.md §2）。
- 爆雷后唯一出路：**服务器本机干预**（用户就坐在服务器旁时这不算高风险操作，但仍先备份）。

## Bootstrap 处置序列（已实跑验证）

```
1. 备份：Copy-Item data\commission.db data\commission.db.bak-pre-admin-bootstrap
2. 写临时脚本（放 OS TEMP，别放项目树——扫描器会反复标记）：
   - import 项目自己的 totp.ts（generateSecret/buildOtpAuthUri/computeTotp），零重复实现
   - 裸 better-sqlite3 打开真实库：只设 busy_timeout，⚠️ 绝不碰 journal_mode pragma
     （不走 connection.js——它会把 Docker 生产库切 WAL，bind mount 下丢数据，v0.38 事故同款）
   - UPDATE artists SET totp_secret=?, totp_verified=1, totp_failed_attempts=0, totp_locked_until=NULL WHERE qq_number=?
   - 生成二维码到 <repo>/temp/（qrcode 包已是依赖）
   - 现算动态码打真实 /api/auth/verify 端到端验证（200 + cookie 签发）
3. tsx 跑脚本（node 直接跑解析不了 .ts 依赖）
4. 二维码用 MEDIA: 发给用户扫码入验证器 App；同时给密钥明文备用（手动录入）
5. 用户登录成功后：STATUS 关闭紧急待办 + 教训入账
```

## ⚠️ 救命索纪律：交付自助工具前必须实跑，存在的脚本 ≠ 能跑的脚本

用户要「我自己怎么操作」时，第一动作是**实测现有自助脚本**——大概率是坏的。实录：`totp-reset.js`（REQ-027 交付的 CLI 兜底）从未被实跑过，一测三个 bug：
1. `.js` 文件 import `.ts` 模块 → 裸 node 直接 ERR_MODULE_NOT_FOUND（需 tsx runner 或把脚本写成 .ts 用 tsx 跑）
2. 走 connection.js 默认 DB_PATH → 相对 CWD 解析到陈旧库（见 db-inspection-pitfalls.md）
3. 走 connection.js 会设 journal_mode → 生产库 WAL 风险

重写要点（totp-rebind.ts 模式）：tsx 跑 + 显式绝对路径库（`DB_PATH` env 可覆盖，默认仓库根 data/）+ 裸 better-sqlite3 + 一步"重置+重绑+二维码+端到端验证"（只 reset 不 rebind 的自救等于没救——reset 完还是登不进）。

## 工具自身的 E2E 验证（不碰生产库）

```
1. 复制生产库到 $env:TEMP\<name>.db
2. DB_PATH=<副本> 跑工具（绑定写入 + 二维码 + 密钥输出）
3. 闭环验证：副本库 + 临时服务器实例（换端口如 3998）+ 独立实现的 RFC 6238 现算码
   → 打真实 /api/auth/verify → 断言 200 + artist_token cookie
   （独立实现做交叉验证：工具用 totp.ts，验证脚本自己实现一遍算法）
4. 清理：副本库（含 -wal/-shm）+ 临时二维码 + 临时脚本全删，Test-Path 双确认
```

PowerShell 坑（实录）：
- 从脚本输出解析 secret 再 Set-Content：Select-Object/管道会把值包成 Object[] 写坏文件——密钥类字符串从已知干净的来源直接 `-NoNewline` 写入。
- 一次 terminal 调用里设的 `$env:` 不会带到下一次调用，跨调用要用文件传值或每次重设。

## 交付后的文档闭环

自助工具必须同步写进维护说明书（双路径：画师丢→管理员后台重置；管理员丢→服务器本机 CLI），含 Docker 内执行方式（`docker compose exec web npm run totp:rebind -- <QQ号>`，DB 路径自动解析为挂载点）、安全边界说明（仅物理接触服务器者可用）、DB_PATH 覆盖用法。并写入长期 memory（工具命令 + 管理员 QQ + 文档位置），下次用户问"怎么重置"直接答。
