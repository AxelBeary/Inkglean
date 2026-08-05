#!/usr/bin/env node
// ============================================
// TOTP 丢失自救工具（REQ-027 R5 兜底，2026-08-05 重写）
//
// 场景：管理员自己手机丢失/验证器 App 删除/换手机，登不进后台（后台重置入口
//       本身要登录才能用，形成死锁）；或新部署管理员从未绑定。
//       在服务器本机执行本脚本 = 一步「重置旧绑定 + 生成新绑定」：
//       新密钥直接入库并标记已绑定 → 二维码交用户扫码 → QQ 号 + 新动态码登录。
//
// 安全边界：只有能物理操作服务器的人可用（不经网络、不开端口）。
//           执行后旧密钥立即失效，旧验证器上的动态码全部作废。
//
// 历史教训（2026-08-05 实测发现旧版根本跑不起来）：
//   1. 旧版 import auth.service.ts —— node 直接跑 .js 解析不了 .ts 依赖
//   2. 旧版走 connection.js —— DB_PATH 默认值指向 server/data/ 旧库（真实库在仓库根 data/）
//   3. 旧版经 connection.js 开库 —— 会把生产库 journal_mode 切成 WAL
//      （Docker bind mount 下数据会丢，v0.38 迁移事故同款教训）
//   本版：tsx 跑（可 import totp.ts 零重复实现）+ 显式库路径 + 裸 better-sqlite3 不设 journal pragma。
//
// 用法：npm run totp:rebind -- <QQ号>
// 示例：npm run totp:rebind -- 10003
// ============================================
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { createRequire } from 'module'
import { generateSecret, buildOtpAuthUri, computeTotp } from '../src/features/auth/totp.js'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const QRCode = require('qrcode')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..') // 仓库根目录
// 显式库路径：真实库在仓库根 data/（docker-compose 挂载同一文件）。
// 可用环境变量 DB_PATH 覆盖（测试用，勿指向生产库）。
const DB_PATH = process.env.DB_PATH || resolve(ROOT, 'data/commission.db')

const qq = (process.argv[2] || '').trim()
if (!/^\d{5,15}$/.test(qq)) {
  console.error('❌ 用法: npm run totp:rebind -- <QQ号>')
  console.error('   示例: npm run totp:rebind -- 123456789')
  process.exit(1)
}

// ─── 1. 打开数据库（裸开：只设 busy_timeout，绝不碰 journal_mode） ───
const db = new Database(DB_PATH)
db.pragma('busy_timeout = 5000')

const artist = db.prepare(
  'SELECT id, qq_number, name FROM artists WHERE qq_number = ? AND deleted_at IS NULL'
).get(qq)
if (!artist) {
  console.error(`❌ 未找到 QQ ${qq} 对应的账号（已删除账号不在此列）`)
  db.close()
  process.exit(1)
}

// ─── 2. 生成新密钥，直接标记已绑定（自救场景：用户拿到二维码扫码即完成确认） ───
const secret = generateSecret()
db.prepare(
  'UPDATE artists SET totp_secret = ?, totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?'
).run(secret, artist.id)
db.close()
console.log(`✅ 账号「${artist.name}」(QQ ${qq}) 已重新绑定（旧密钥立即失效）`)

// ─── 3. 出二维码 + 密钥（手动录入备用） ───
const uri = buildOtpAuthUri(secret, qq)
console.log('')
console.log('otpauth URI:', uri)
console.log('密钥（手动录入用，妥善保管）:', secret)
console.log('')
const tempDir = resolve(ROOT, 'temp')
mkdirSync(tempDir, { recursive: true })
const qrPath = resolve(tempDir, `totp-rebind-${qq}.png`)
await QRCode.toFile(qrPath, uri, { margin: 1, width: 400 })
console.log('二维码已生成，用验证器 App 扫码:', qrPath)

// ─── 4. 尽力而为的端到端验证（服务没在跑也不阻塞，只提示） ───
try {
  const code = computeTotp(secret, Date.now())
  const res = await fetch('http://localhost:3000/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber: qq, code })
  })
  const body = await res.json().catch(() => null)
  if (res.ok && body?.artist) {
    console.log(`✅ 端到端验证通过：登录接口 ${res.status}，账号 ${body.artist.name} 可用`)
  } else {
    console.log(`⚠️ 登录接口返回 ${res.status}（${JSON.stringify(body)}）——请检查后手动登录验证`)
  }
} catch {
  console.log('ℹ️ 服务未在 localhost:3000 运行，跳过端到端验证。扫码后直接登录页验证即可。')
}
