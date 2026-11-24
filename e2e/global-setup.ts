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

/** 预登录抛出的动态属性错误（err.status / err.detail），catch 内以 as 断言兼容 useUnknownInCatchVariables */
interface ApiLoginError extends Error {
  status?: number
  detail?: string
}

/** better-sqlite3 实例最小结构类型（经 createRequire 动态载入，无现成类型） */
interface BetterSqliteDatabase {
  prepare(sql: string): { run(...params: Array<string | number | null>): unknown }
  close(): void
}

/** 给测试画师（Alice 10001 / 管理员 10003）注入已绑定状态的 TOTP 密钥，预登录走真实 /api/auth/verify */
function seedTotpForE2e(): void {
  // 从 server 的依赖树解析 better-sqlite3（e2e 目录自身没有 node_modules）
  const requireServer = createRequire(resolve(ROOT, 'server/package.json'))
  const Database = requireServer('better-sqlite3') as new (path: string) => BetterSqliteDatabase
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
export async function apiLogin(baseURL: string, qqNumber: string, code: string = currentTotp(E2E_TOTP_SECRET)): Promise<string> {
  const verifyRes = await fetch(`${baseURL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber, code })
  })
  if (!verifyRes.ok) {
    const detail = await verifyRes.text().catch(() => '')
    const err = new Error(`预登录失败 (QQ: ${qqNumber}): ${verifyRes.status} ${detail}`) as ApiLoginError
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
 * F0053: 判定 401 是否「TOTP 级拒绝」（可换下一候选码重试）。
 * 服务端匿名登录已五态统一（GHSA-6pf3）：一律 401 + { code: 'TOTP_INVALID' }
 * （值取自 server/src/shared/errors.ts 的 E.TOTP_INVALID，机器可读、跨文案改版稳定）；
 * 旧实现按中文文案「已使用|动态口令错误」判定，文案一改即静默失去重试能力。
 */
function isTotpInvalid401(err: unknown): boolean {
  const e = err as ApiLoginError | null | undefined
  if (e?.status !== 401 || typeof e?.detail !== 'string') return false
  try {
    const body = JSON.parse(e.detail) as { code?: unknown }
    return body.code === 'TOTP_INVALID'
  } catch {
    // 响应体不是 JSON（网关拦截页/代理 401 等）：无法确认为 TOTP 拒绝，按不可重试处理
    return false
  }
}

/**
 * E8 登出后解毒：用真实 TOTP 登录重签 artist token 并写回 .tokens.json。
 * 逐个尝试 ±1 窗口内未被本进程消费的时间步；若同一窗口内的候选全部命中重放防护
 * （如 E7 已消费 current+1、global-setup 已消费 current），则等到下一时间步再试，
 * 保证用例失败重试时共享缓存仍持有有效 token。
 */
// F0052: 等下一时间步的重试必须有上限——匿名 401 五态统一后锁定/封禁不再可判别，
// 无上限的旧实现会无限递归烧防爆破预算（每 30s 一轮直到人为中断）
const TOKEN_REFRESH_MAX_ROUNDS = 3

export async function refreshArtistTokenCache(baseURL: string, qqNumber: string = '10001'): Promise<string> {
  let lastError: unknown = null
  const attempt = async (round: number): Promise<string> => {
    // F0052: 上限检查放在每轮尝试之前——最多 3 轮（≤9 次尝试）后抛出最后一次真实错误（不吞），
    // 由调用方决定失败语义；旧实现无上限会无限递归烧防爆破预算
    if (round >= TOKEN_REFRESH_MAX_ROUNDS) {
      throw lastError ?? new Error(`TOTP 刷新登录重试 ${TOKEN_REFRESH_MAX_ROUNDS} 轮后仍未成功 (QQ: ${qqNumber})`)
    }
    for (const { counter, code } of nextLoginTotp(qqNumber)) {
      try {
        const token = await apiLogin(baseURL, qqNumber, code)
        noteTotpLogin(qqNumber, counter)
        writeArtistToken(token)
        return token
      } catch (err) {
        lastError = err
        // F0053: 改按响应 code 字段判定可换下一候选（见 isTotpInvalid401）；
        // 锁定/网络/网关等其余错误直接抛，不空耗防爆破计数
        if (!isTotpInvalid401(err)) throw err
      }
    }
    const waitMs = 30_000 - (Date.now() % 30_000) + 100
    await new Promise(r => setTimeout(r, waitMs))
    return attempt(round + 1)
  }
  return attempt(0)
}

/** REQ-041：管理员二次验证（step-up），返回升级后的 token（httpOnly cookie 同域名可覆盖） */
async function apiStepUp(baseURL: string, token: string, qqNumber: string): Promise<string> {
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

export default async function globalSetup(): Promise<void> {
  // 1. 清理旧测试数据（P-AC3: 不污染开发数据）
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`, `${TEST_DB}-journal`]) {
    if (existsSync(f)) rmSync(f)
  }
  if (existsSync(TEST_UPLOADS)) rmSync(TEST_UPLOADS, { recursive: true })
  mkdirSync(TEST_UPLOADS, { recursive: true })

  // 2. 构建前端（服务器 SPA fallback 需要 web/dist；每次重建，防手工跑 E2E 测到旧包）
  if (!existsSync(resolve(ROOT, 'web/node_modules/.bin'))) {
    console.log('📦 E2E: 安装前端依赖...')
    execSync('npm install', { cwd: resolve(ROOT, 'web'), stdio: 'inherit', timeout: 120_000 })
  }
  console.log('📦 E2E: 构建前端...')
  execSync('npm run build', { cwd: resolve(ROOT, 'web'), stdio: 'inherit', timeout: 120_000 })

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
  // F0054: spawn 前先探一次端口——此刻本套件尚无子进程，任何响应都只能是上次遗留的服务器，
  // 直接报错拒绝（否则下面的健康检查会打到旧进程上假绿，预登录踩到陈旧数据/陈旧端口）
  const baseURL = E2E_BASE_URL
  const stalePort = await fetch(`${baseURL}/api/health`).then(() => true, () => false)
  if (stalePort) {
    throw new Error(`端口 ${E2E_PORT} 已有遗留进程在响应 ${baseURL}/api/health——请先停掉上一次的 E2E 服务器（或改用 E2E_PORT）`)
  }

  console.log(`🚀 E2E: 启动服务器 (port ${E2E_PORT})...`)
  const server = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: resolve(ROOT, 'server'),
    env: {
      ...process.env,
      // 815 审计 L-6/P1-8 适配：测试服务器显式声明非生产（根 .env 的 NODE_ENV=production 经
      // dotenv 载入后会使 cookie 走 secure 标志，http 测试会话会丢；测试环境恒为 test）
      // 注：原 JS 此处有两个 NODE_ENV 键，对象字面量后者覆盖前者（'development' 胜出），TS 禁止重复键，
      // 故删除第一个 NODE_ENV: 'test'，运行时取值仍为 'development' 不变
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
  // F0051: stdio 'pipe' 若无人读取，服务器启动报错日志会丢，且管道写满会反压阻塞子进程——转发到主进程输出
  server.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk))
  server.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
  server.on('error', (err: Error) => {
    // spawn 本身失败（如 node 可执行异常）——记录后由下方健康检查统一收口报错
    console.error(`E2E 服务器 spawn 失败：${err.message}`)
  })
  if (!server.pid) {
    // F0056 配套：spawn 未返回 PID（同步失败）时不写 PID 文件，杜绝把 "undefined" 落盘
    throw new Error('E2E 服务器进程启动失败（spawn 未返回 PID），详见上方日志')
  }
  writeFileSync(PID_FILE, String(server.pid))

  // 5. 等待健康检查
  // F0050: 窗口耗尽必须抛错——旧实现循环超时后静默继续，启动失败被拖到预登录才暴露
  const deadline = Date.now() + 30_000
  let healthy = false
  let earlyExit: string | null = null
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      // 子进程在等待期内退出（端口被占/启动崩溃等）——立即收口，日志已由 F0051 转发
      earlyExit = `exitCode=${server.exitCode ?? 'null'} signalCode=${server.signalCode ?? 'null'}`
      break
    }
    try {
      const res = await fetch(`${baseURL}/api/health`)
      if (res.ok) {
        healthy = true
        break
      }
    } catch { /* 重试 */ }
    await new Promise(r => setTimeout(r, 500))
  }
  if (!healthy) {
    // F0050: 失败必须当场抛错；子进程若还活着（只是慢），杀掉本次 spawn 的实例，不留孤儿占端口
    server.kill('SIGKILL')
    rmSync(PID_FILE)
    throw new Error(
      earlyExit
        ? `E2E 服务器启动即退出（${earlyExit}），详见上方转发的服务器日志`
        : `E2E 服务器 30s 内未通过健康检查（${baseURL}/api/health），详见上方转发的服务器日志`
    )
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
