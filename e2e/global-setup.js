import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { createRequire } from 'module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DB = resolve(ROOT, 'e2e/test.db')
const TEST_UPLOADS = resolve(ROOT, 'e2e/test-uploads')
const PID_FILE = resolve(ROOT, 'e2e/.server-pid')
const TOKENS_FILE = resolve(ROOT, 'e2e/.tokens.json')
const PORT = 3999

// ─── TOTP 预登录（REQ-027）：E2E 走真实动态口令登录链路，无开发后门 ───
// 固定测试密钥（RFC 6238 文档示例密钥）——仅注入 e2e 独立测试库，与生产/开发数据完全隔离
const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'

/** Base32 解码（与 server/src/features/auth/totp.ts 的 base32Decode 一致） */
function base32Decode(input) {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = String(input).toUpperCase().replace(/[\s-]/g, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of cleaned) {
    if (ch === '=') break
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) return null
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** 计算指定时间步的 6 位动态码（RFC 6238：30s 步长 / HMAC-SHA1 / 动态截断，与 totp.ts 一致） */
function totpForCounter(secretBase32, counter) {
  const key = base32Decode(secretBase32)
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  msg.writeUInt32BE(counter >>> 0, 4)
  const hash = crypto.createHmac('sha1', key).update(msg).digest()
  const offset = hash[19] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3]
  return String(binary % 10 ** 6).padStart(6, '0')
}

/** 计算当前时刻的 6 位动态码 */
function currentTotp(secretBase32) {
  return totpForCounter(secretBase32, Math.floor(Date.now() / 1000 / 30))
}

/**
 * REQ-041：计算下一时间步的动态码——预登录已消费当前步的码（重放防护），
 * step-up 必须用下一个步的码（校验窗口 ±1 恒可命中，且不与登录码哈希冲突）
 */
function nextStepTotp(secretBase32) {
  return totpForCounter(secretBase32, Math.floor(Date.now() / 1000 / 30) + 1)
}

/** 给测试画师（Alice 10001 / 管理员 10003）注入已绑定状态的 TOTP 密钥，预登录走真实 /api/auth/verify */
function seedTotpForE2e() {
  // 从 server 的依赖树解析 better-sqlite3（e2e 目录自身没有 node_modules）
  const requireServer = createRequire(resolve(ROOT, 'server/package.json'))
  const Database = requireServer('better-sqlite3')
  const db = new Database(TEST_DB)
  try {
    db.prepare(
      'UPDATE artists SET totp_secret = ?, totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL WHERE qq_number IN (?, ?)'
    ).run(E2E_TOTP_SECRET, '10001', '10003')
  } finally {
    db.close()
  }
}

/** 通过真实 TOTP 登录接口拿 token（httpOnly cookie），失败抛错含状态码与响应体 */
async function apiLogin(baseURL, qqNumber) {
  const code = currentTotp(E2E_TOTP_SECRET)
  const verifyRes = await fetch(`${baseURL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber, code })
  })
  if (!verifyRes.ok) {
    const detail = await verifyRes.text().catch(() => '')
    throw new Error(`预登录失败 (QQ: ${qqNumber}): ${verifyRes.status} ${detail}`)
  }

  const setCookie = verifyRes.headers.getSetCookie?.() || []
  const tokenCookie = setCookie.find(c => c.startsWith('artist_token='))
  if (!tokenCookie) throw new Error('预登录成功但未收到 artist_token cookie')
  return tokenCookie.split(';')[0].split('=').slice(1).join('=')
}

/** REQ-041：管理员二次验证（step-up），返回升级后的 token（httpOnly cookie 同域名可覆盖） */
async function apiStepUp(baseURL, token, qqNumber) {
  const code = nextStepTotp(E2E_TOTP_SECRET)
  const stepUpRes = await fetch(`${baseURL}/api/auth/step-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: 'totp', code })
  })
  if (!stepUpRes.ok) {
    const detail = await stepUpRes.text().catch(() => '')
    throw new Error(`管理员 step-up 失败 (QQ: ${qqNumber}): ${stepUpRes.status} ${detail}`)
  }
  const setCookie = stepUpRes.headers.getSetCookie?.() || []
  const tokenCookie = setCookie.find(c => c.startsWith('artist_token='))
  if (!tokenCookie) throw new Error('step-up 成功但未收到升级后的 artist_token cookie')
  return tokenCookie.split(';')[0].split('=').slice(1).join('=')
}

export default async function globalSetup() {
  // 1. 清理旧测试数据（P-AC3: 不污染开发数据）
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`, `${TEST_DB}-journal`]) {
    if (existsSync(f)) rmSync(f)
  }
  if (existsSync(TEST_UPLOADS)) rmSync(TEST_UPLOADS, { recursive: true })
  mkdirSync(TEST_UPLOADS, { recursive: true })

  // 2. 构建前端（服务器 SPA fallback 需要 web/dist）
  if (!existsSync(resolve(ROOT, 'web/dist/index.html'))) {
    if (!existsSync(resolve(ROOT, 'web/node_modules/.bin'))) {
      console.log('📦 E2E: 安装前端依赖...')
      execSync('npm install', { cwd: resolve(ROOT, 'web'), stdio: 'inherit', timeout: 120_000 })
    }
    console.log('📦 E2E: 构建前端...')
    execSync('npm run build', { cwd: resolve(ROOT, 'web'), stdio: 'inherit', timeout: 120_000 })
  }

  // 3. 初始化 + 种子数据库
  if (!existsSync(resolve(ROOT, 'server/node_modules/.bin'))) {
    console.log('📦 E2E: 安装服务端依赖...')
    execSync('npm install', { cwd: resolve(ROOT, 'server'), stdio: 'inherit', timeout: 120_000 })
  }
  console.log('🌱 E2E: 初始化测试数据库...')
  const tsxCli = resolve(ROOT, 'server/node_modules/tsx/dist/cli.mjs')
  execSync(`"${process.execPath}" "${tsxCli}" src/db/seed.js`, {
    cwd: resolve(ROOT, 'server'),
    env: { ...process.env, DB_PATH: TEST_DB, ADMIN_QQ: '10003' },
    stdio: 'pipe',
    timeout: 30_000
  })

  // 3.5 给测试画师注入 TOTP 密钥（REQ-027：预登录走真实动态口令链路）
  console.log('🔐 E2E: 注入测试 TOTP 密钥...')
  seedTotpForE2e()

  // 4. 启动服务器
  console.log(`🚀 E2E: 启动服务器 (port ${PORT})...`)
  const server = spawn(process.execPath, [tsxCli, 'src/index.js'], {
    cwd: resolve(ROOT, 'server'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: TEST_DB,
      UPLOAD_DIR: TEST_UPLOADS,
      AUTH_DEV_MODE: 'true',
      ADMIN_QQ: '10003',
      WEB_DIST: resolve(ROOT, 'web/dist'),
      NODE_ENV: 'development'
    },
    stdio: 'pipe'
  })
  writeFileSync(PID_FILE, String(server.pid))

  // 5. 等待健康检查
  const baseURL = `http://localhost:${PORT}`
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/health`)
      if (res.ok) break
    } catch { /* 重试 */ }
    await new Promise(r => setTimeout(r, 500))
  }

  // 6. 预登录画师 + 管理员，token 写入文件（fixture 只读文件，不网络请求）
  console.log('🔑 E2E: 预登录...')
  const artistToken = await apiLogin(baseURL, '10001')
  const adminToken = await apiLogin(baseURL, '10003')
  // REQ-041：管理后台已挂 step-up 入口级守卫——管理员会话必须升级后缓存，
  // 否则既有 admin E2E 用例会被 401 STEP_UP_REQUIRED 拦截
  const adminUpgradedToken = await apiStepUp(baseURL, adminToken, '10003')
  writeFileSync(TOKENS_FILE, JSON.stringify({ artist: artistToken, admin: adminUpgradedToken }))

  console.log('✅ E2E: 服务器就绪，token 已缓存')
}
