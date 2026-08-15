import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { E2E_TOTP_SECRET, currentTotp, nextLoginTotp, nextStepTotp, noteTotpLogin } from './totp-util.js'
import { writeArtistToken, writeTokens } from './token-store.js'
import { E2E_BASE_URL, E2E_PORT } from '../playwright.config.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DB = resolve(ROOT, 'e2e/test.db')
const TEST_UPLOADS = resolve(ROOT, 'e2e/test-uploads')
const PID_FILE = resolve(ROOT, 'e2e/.server-pid')

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
export async function apiLogin(baseURL, qqNumber, code = currentTotp(E2E_TOTP_SECRET)) {
  const verifyRes = await fetch(`${baseURL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber, code })
  })
  if (!verifyRes.ok) {
    const detail = await verifyRes.text().catch(() => '')
    const err = new Error(`预登录失败 (QQ: ${qqNumber}): ${verifyRes.status} ${detail}`)
    err.status = verifyRes.status
    err.detail = detail
    throw err
  }

  const setCookie = verifyRes.headers.getSetCookie?.() || []
  const tokenCookie = setCookie.find(c => c.startsWith('artist_token='))
  if (!tokenCookie) throw new Error('预登录成功但未收到 artist_token cookie')
  return tokenCookie.split(';')[0].split('=').slice(1).join('=')
}

/**
 * E8 登出后解毒：用真实 TOTP 登录重签 artist token 并写回 .tokens.json。
 * 逐个尝试 ±1 窗口内未被本进程消费的时间步；若同一窗口内的候选全部命中重放防护
 * （如 E7 已消费 current+1、global-setup 已消费 current），则等到下一时间步再试，
 * 保证用例失败重试时共享缓存仍持有有效 token。
 */
export async function refreshArtistTokenCache(baseURL, qqNumber = '10001') {
  const attempt = async () => {
    let lastError = null
    for (const { counter, code } of nextLoginTotp(qqNumber)) {
      try {
        const token = await apiLogin(baseURL, qqNumber, code)
        noteTotpLogin(qqNumber, counter)
        writeArtistToken(token)
        return token
      } catch (err) {
        lastError = err
        // 只有“该动态口令已使用”才换下一个候选；其余错误（网络/锁定/校验失败）直接抛
        if (!(err?.status === 401 && /已使用/.test(err?.detail || ''))) throw err
      }
    }
    const waitMs = 30_000 - (Date.now() % 30_000) + 100
    await new Promise(r => setTimeout(r, waitMs))
    return attempt()
  }
  return attempt()
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
  execSync(`"${process.execPath}" "${tsxCli}" src/db/seed.ts`, {
    cwd: resolve(ROOT, 'server'),
    // 815 审计 L-6 适配：测试库播种显式声明非生产环境（seed 生产守卫会拦 NODE_ENV=production；
    // 根 .env 的 NODE_ENV 经 P1-8 会被 dotenv 载入，故此处显式覆盖为 test）
    env: { ...process.env, NODE_ENV: 'test', DB_PATH: TEST_DB, ADMIN_QQ: '10003' },
    stdio: 'pipe',
    timeout: 30_000
  })

  // 3.5 给测试画师注入 TOTP 密钥（REQ-027：预登录走真实动态口令链路）
  console.log('🔐 E2E: 注入测试 TOTP 密钥...')
  seedTotpForE2e()

  // 4. 启动服务器
  console.log(`🚀 E2E: 启动服务器 (port ${E2E_PORT})...`)
  const server = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: resolve(ROOT, 'server'),
    env: {
      ...process.env,
      // 815 审计 L-6/P1-8 适配：测试服务器显式声明非生产（根 .env 的 NODE_ENV=production 经
      // dotenv 载入后会使 cookie 走 secure 标志，http 测试会话会丢；测试环境恒为 test）
      NODE_ENV: 'test',
      PORT: String(E2E_PORT),
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
  const baseURL = E2E_BASE_URL
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
  writeTokens({ artist: artistToken, admin: adminUpgradedToken })

  console.log('✅ E2E: 服务器就绪，token 已缓存')
}
