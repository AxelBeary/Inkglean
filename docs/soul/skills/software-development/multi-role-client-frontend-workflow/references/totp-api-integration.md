# TOTP 登录联调 + 边界测试技巧（REQ-022 F1/F2 批实战沉淀）

> 场景：二号/三号需要对着本地真实后端联调。REQ-027 之后登录必须 TOTP（AUTH_DEV_MODE 不再跳过 verify），
> 没有「测试登录码」捷径。以下流程在 f1f2 前端批实跑通过。

## 一、worktree 本地 DB 联调流程（含 TOTP）

前置：worktree 的 server 起不来 3000（被其他 worktree 占用）时，用 `PORT=3001` 起：
```powershell
cd <worktree>/server; $env:PORT='3001'; $env:DB_PATH='<abs>\<worktree>\server\data\commission.db'; npm run start
```
- 不杀别人进程（3000 可能是其他角色 worktree 的 server）
- `DB_PATH` 必须显式指向 worktree 的 `server/data/commission.db`——totp-rebind 脚本默认仓库根 `data/`，worktree 无此目录会报 `Cannot open database because the directory does not exist`

步骤：
1. **插入测试画师**：临时 .mjs 脚本，`createRequire` 解析 better-sqlite3 + 绝对路径 DB（跑完即删，不留在仓库）。
   ```js
   const require = createRequire(import.meta.url)
   const Database = require(resolve(__dirname, 'server/node_modules/better-sqlite3'))
   const db = new Database(resolve(__dirname, 'server/data/commission.db'))
   ```
   注意 orders 表列名是 `total_price_cents`/`paid_total_cents`（不是 total_cents/paid_cents），列名不齐会报 `table orders has no column named ...`。
2. **TOTP 绑定**：`npm run totp:rebind -- <QQ>`（一步生成密钥+写入 DB+输出二维码，旧密钥失效）。
3. **生成动态码**：手写 RFC 6238（项目无 otplib/speakeasy 依赖）。核心：base32 解码密钥 → HMAC-SHA1(counter) → 取 4 字节转 6 位码。counter = floor(now/1000/30)。脚本模板见下。
4. **登录**：`POST /api/auth/verify` `{qqNumber, code}` → 响应 `{isAdmin, artist}`，cookie 进 WebRequestSession 复用。

TOTP 码生成脚本（临时 .cjs）：
```js
const crypto = require('crypto')
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function b32(s){s=s.toUpperCase().replace(/=+$/,'');let b=0,v=0,o=[];for(const c of s){const i=B32.indexOf(c);if(i<0)throw Error('bad');v=(v<<5)|i;b+=5;if(b>=8){o.push((v>>>(b-8))&255);b-=8}}return Buffer.from(o)}
function totp(secret){const t=Math.floor(Date.now()/1000/30),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(t));const h=crypto.createHmac('sha1',b32(secret)).update(buf).digest();const off=h[h.length-1]&15;const code=((h[off]&127)<<24)|(h[off+1]<<16)|(h[off+2]<<8)|h[off+3];return String(code%1000000).padStart(6,'0')}
```

## 二、URL 长度边界测试：总长 1800 必须用 hash 构造

`pathname+search ≤1500` 与 `总长 ≤1800` 有交互约束：hostname 上限 253 + path 上限 1500 + 前缀 ≈ 9 = 最多 ~1762，**普通 hostname+path 构造永远到不了 1800**。
正确构造（对齐后端 TC-FN-14/15）：用 fragment 填充——hash 不计入 hostname 也不计入 pathname+search：
```js
const ok = `https://a.cn/#${'h'.repeat(MAX_URL_LEN - 14)}`  // 恰好 1800，checkLinkLength 应通过
expect(checkLinkLength(ok + 'h')).toEqual({ ok: false, reason: LINK_TOO_LONG })
```
先犯的错：用 path 填 1800，结果路径 1779 > 1500 子限制，测试误报失败。

## 三、页面级联调受限时的替代验证组合

vite proxy 写死 3000 且 3000 是别人 worktree 的旧代码 server（无新接口）时，无法完整页面联调。用三组合替代：
1. 单测覆盖逻辑全分支（新纯函数 + composable 每个分支至少一组）
2. API 层 curl/PowerShell 实测契约（含防投毒向量）
3. 浏览器访问 dev server 验证「无新数据兜底路径不崩」+ 控制台零报错
交付报告里如实注明端口冲突与验证方式，不谎报截图。

## 四、patch 工具精确匹配坑（v0.39 实战）

patch 时 old_string 末尾多带一个换行 → 会把相邻两行误合并成一行（diff 显示两行拼一起）。发现后立即用精确 old_string（含正确换行）恢复。教训：**old_string 必须与源文件逐字符一致，尤其是行尾换行**；恢复时不靠记忆，直接读源文件对应行。
