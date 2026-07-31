import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DB = resolve(ROOT, 'e2e/test.db')
const TEST_UPLOADS = resolve(ROOT, 'e2e/test-uploads')
const PID_FILE = resolve(ROOT, 'e2e/.server-pid')
const TOKENS_FILE = resolve(ROOT, 'e2e/.tokens.json')
const PORT = 3999

/** 通过 API 登录，返回 httpOnly cookie 中的 token */
async function apiLogin(baseURL, qqNumber) {
  const sendRes = await fetch(`${baseURL}/api/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber })
  })
  const body = await sendRes.json()
  if (!body._dev_code) throw new Error(`预登录失败：未获取到开发登录码 (QQ: ${qqNumber})`)

  const verifyRes = await fetch(`${baseURL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber, code: body._dev_code })
  })
  if (!verifyRes.ok) throw new Error(`预登录验证失败: ${verifyRes.status}`)

  const setCookie = verifyRes.headers.getSetCookie?.() || []
  const tokenCookie = setCookie.find(c => c.startsWith('artist_token='))
  if (!tokenCookie) throw new Error('预登录成功但未收到 artist_token cookie')
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
  execSync('node src/db/seed.js', {
    cwd: resolve(ROOT, 'server'),
    env: { ...process.env, DB_PATH: TEST_DB, ADMIN_QQ: '10003' },
    stdio: 'pipe',
    timeout: 30_000
  })

  // 4. 启动服务器
  console.log(`🚀 E2E: 启动服务器 (port ${PORT})...`)
  const server = spawn('node', ['src/index.js'], {
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
  writeFileSync(TOKENS_FILE, JSON.stringify({ artist: artistToken, admin: adminToken }))

  console.log('✅ E2E: 服务器就绪，token 已缓存')
}
