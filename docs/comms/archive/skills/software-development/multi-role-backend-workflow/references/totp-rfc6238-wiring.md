# TOTP 动态口令改造实战（REQ-027 三号实施记录）

认证核心链路改造（登录码 → TOTP）的完整踩坑集，含迁移链地基教训、一刀切移除的依赖扫描、测试隔离坑。

## 1. TOTP 核心实现（RFC 6238，零依赖）

`server/src/features/auth/totp.ts` 纯函数模块模式：
- **Base32（RFC 4648）**：无 padding、大写 `A-Z2-7`；解码容错（小写/空格/连字符 → 自动清理，非法字符返回 null 而非抛错）；160bit（20 字节）随机密钥 = 32 字符 Base32
- **HOTP 动态截断（RFC 4226）**：8 字节大端 counter → HMAC-SHA1 → `offset = hash[19] & 0x0f` → 31 位 binary `% 10^digits` → padStart(6,'0')
- **±1 窗口校验**：遍历 counter-1/counter/counter+1，用 `timingSafeEqual` 比较；**先做 `/^\d{6}$/` 正则检查再进 HMAC**（防非法输入触发崩溃，沿用旧登录码教训）
- **otpauth URI**：`otpauth://totp/{issuer}:{account}?secret=...&issuer=...&algorithm=SHA1&digits=6&period=30`，account/issuer 做 encodeURIComponent

**RFC 6238 附录 B 官方测试向量**（密钥 = ASCII `12345678901234567890`，Base32 = `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`，8 位码截后 6 位）：
| 时间戳(秒) | 6 位码 |
|---|---|
| 59 | 287082 |
| 1111111109 | 081804 |
| 1111111111 | 050471 |
| 1234567890 | 005924 |
| 2000000000 | 279037 |
| 20000000000 | 353130 |

单测必须含这组向量（算法正确性的铁证）+ Base32 逆运算 + ±1 窗口 + 错误码不崩溃。

## 2. ⚠️ 迁移链地基教训（本次最大坑）

**schema 是迁移链的地基，已发布迁移依赖的建表语句不能从 schema 删除，即使最终迁移会 DROP 它。**

场景：R7 一刀切移除 login_codes 表。我同时删了：
- schema 里的 `CREATE TABLE IF NOT EXISTS login_codes` ❌
- v41 迁移加 `DROP TABLE IF EXISTS login_codes` ✅

结果：全新数据库 init 时，历史迁移 **v13（login_codes_expires_at_integer）引用 login_codes 表** → `INSERT INTO login_codes_new SELECT ... FROM login_codes` 崩（no such table）。

修复：schema 保留 login_codes 建表（注释标注「历史遗留：迁移 v13 依赖此表存在；v41 DROP 移除，此处保留仅维持迁移链完整」），v41 的 DROP 负责最终移除。
- 新库路径：schema 建表 → v1..v40 → v41 DROP → 最终无表 ✅
- 旧库路径：表还在 → v41 DROP ✅

推论：
- **schemaIndexes 反而必须删**（v41 DROP 表后全局索引语句引用已删除表会崩）——索引是迁移后执行的，不在迁移链保护内
- 已发布迁移（v1–v40）一字不改；「移除表」永远通过新迁移 DROP 实现，schema 建表保留

## 3. 一刀切移除旧机制的依赖扫描清单

「删旧登录码」远不止删 service 函数和路由。grep 全局（`login_codes|generateLoginCode|verifyLoginCode|send-code|verify-code`）后发现：
- `admin.routes.ts` transfer（更换管理员）用 verifyLoginCode 双码验证 → **连带改 TOTP 双码**（当前管理员 + 新管理员各自的动态码，双方须已绑定）
- `app.js` cleanupCodes 定时器（login_codes 过期清理）
- `tests/setup.js` cleanDb 的 `DELETE FROM login_codes`
- 测试文件：routes.test.js（send-code 限流）、v025（send-code 防枚举）、order.service.test.js（login_codes 列类型断言）、admin.routes.test.js（transfer 用 generateLoginCode）

规则：**删除任何功能前，先 `search_files` 全局 grep 引用面，连带改造全部引用方，测试从「测旧机制」改为「测新机制等价语义」**（如 send-code 防枚举 → verify 防枚举：未注册 QQ 返回与码错误相同的 TOTP_INVALID）。

## 4. 测试隔离坑

- **限流桶跨测试累积**：rate-limit 桶在 app 实例内存中，同一测试文件里多个用例共享。transfer 有目标级限流（`transfer:{qq}` 3次/15分钟），前几个用例消耗后，后续用例同 QQ 直接 429 而非预期 401。解决：**每个用例用独立 QQ**（20002 → 20003）。
- **subdomain 连字符 → artist_code 校验拒绝**：createArtist 默认 artist_code = subdomain 大写，`isValidArtistCode` 只允许字母数字。测试建号用 `e2e-artist` 会 400 CODE_FORMAT，改用无连字符 `e2eartist`。（823 规则对齐批后：主页标识字母表已全面去连字符，此类 400 在入口层即被拦截，死角根除）
- **vitest 断言失败时 console.log 不执行**：调试 400 响应时，log 放 `expect` 之前才能看到响应体（或先断言再 log 会跳过）。

## 5. 二维码库选型（唯一依赖例外）

- **qrcode（node-qrcode @1.5.4）**：Node 端 `QRCode.toDataURL(uri)` 生成 PNG data URL 开箱即用（内置 PNG 编码器）；纯 JS 无原生编译；依赖 dijkstrajs+pngjs+yargs（轻量）。**需另装 @types/qrcode**（包不自带类型）。
- 替代 qrcode-generator 零依赖但 Node 端无 canvas 输出 PNG 麻烦；手写 QR 编码不可靠。

## 6. 防爆破与错误消息设计

- 存储：artists 表加计数列（totp_failed_attempts/totp_locked_until），不建新表；对齐旧机制 MAX_ATTEMPTS=5，锁定 15 分钟；锁定期间正确码也拒绝；成功登录清零
- **绑定接口（bind-confirm）失败不计数不锁定**：仅管理员可调，管理员身份本身可信；防爆破只在登录接口
- **自定义错误消息 vs ERROR_MESSAGES 默认**：`setErrorHandler` 里 `ERROR_MESSAGES[code] || error.message`，默认消息存在时覆盖 error.message——想返回动态消息（剩余机会/剩余分钟）时**不要用 AppError + 覆盖 message**，直接在路由层 `reply.code(401).send({ code, error: 动态消息, detail })`（响应结构仍与全局一致）
- 错误码只增不删（旧 CODE_INVALID 等保留，契约兼容）

## 7. 迁移实跑验证（副本法，不动主库）

「容器重建验证迁移实跑」的本地等价做法（v38/v40/v41 通用，合入前自证数据完好）：

1. 复制主 worktree 的 `data/commission.db`（旧版本库）到分支 worktree 临时路径——**先建目标目录**（Copy-Item 目标目录不存在会报「未能找到路径的一部分」，尽管源文件存在）
2. 写临时验证脚本（.mjs，见第 8 节），用分支代码 `initDatabase(db)` 触发迁移；**DB 路径传绝对路径**（脚本放 server/ 下，相对路径会落到 server/data/ 找不到）
3. 断言四项：`schema_migrations` 有新版记录 / `PRAGMA table_info` 目标表列就位 / `sqlite_master` 中被删表消失 / 关键表行数（artists/orders/order_price_entries/installments）before/after 完全一致
4. 验证后删副本 + 删临时脚本，不 commit；结论写进 comms 转交

## 8. Windows 下验证脚本执行坑（PowerShell）

- **node -e 内联嵌套引号会被 PowerShell 吞**（SQL 字符串引号炸 SyntaxError）→ 复杂逻辑一律写 `.mjs` 文件再 `node 文件` 跑，不用 `-e` 拼长命令
- **ps1 脚本含中文在 Hermes 的 Invoke-Expression 包装下乱码/函数体解析错位** → 验证脚本用 node .mjs 而不是 ps1；ps1 只做最简单的命令拼接
- **node ESM `import('D:/...')` 绝对 Windows 路径报 ERR_UNSUPPORTED_ESM_URL_SCHEME** → 必须 `import { pathToFileURL } from 'node:url'` 包一层再 import
- 脚本内 `execSync` 跑 vitest 指定文件（如 TOTP 相关 5 文件）时，`stdio` 默认管道捕获，异常要读 `e.stdout` 而不是直接抛
