import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
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
 * 逐个尝试 ±1 窗口内未被本进程消费的时间步；全部命中 TOTP_INVALID（锁定/封禁/重放五态统一）
 * 时按「时间步是否推进」分流：步已推进直接用新码快重试，步未推进则**最多等一次**到下个 30s 边界
 * 拿 n+2 新码（恢复能力）；已等过一次仍全 401 说明是持久拒绝，立刻抛最后一次真实错误。
 */
// F0052: 等下一时间步的重试必须有上限——匿名 401 五态统一后锁定/封禁不再可判别，
// 无上限的旧实现会无限递归烧防爆破预算（每 30s 一轮直到人为中断）。
// F-02/SCR-03 + TASK2-03: 预算必须与唯一调用方 E8（e8-passkey.spec.ts）的 120s 超时对账，
//   且不能丢掉旧实现「同窗口全被消费→等下一时间步拿新码」的恢复路径（E7 消费 n+1、setup 消费 n、
//   E8 重试 worker 消费 n-1 时，只有 n+2 能救场）。最终策略：
//   - 每轮全 401 时先看时间步是否已在轮内自然推进（跨步）→ 直接用新码快重试，零额外等待；
//   - 步未推进且从未等过 → 等到下个 30s 边界（≤30s），拿新步的码重试一次（恢复窗口被消费的场景）；
//   - 已等过一次仍全 401 → 立即抛 lastError（锁定/封禁/持久拒绝，等再久也不会变绿）。
//   最坏 ≈ 1 次边界等待(≤30s) + ≤4 轮 × 3 次登录，远小于 120s；首次成功路径零等待。
const TOKEN_REFRESH_MAX_ROUNDS = 4 // 安全上限（含一次跨步等待）；正常路径 2~3 轮内收敛
const TOTP_STEP_MS = 30_000
const TOTP_BOUNDARY_SKEW_MS = 100 // 跨过边界后的微小余量，避免恰好卡在整 30s

/** 可注入的时钟/等待——生产走真实 Date.now/setTimeout；定向回归样例用伪时钟证明跨步恢复与快失败两场景 */
export interface RefreshTiming {
  now: () => number
  sleep: (ms: number) => Promise<void>
}
const REAL_TIMING: RefreshTiming = {
  now: () => Date.now(),
  sleep: ms => new Promise(r => setTimeout(r, ms))
}

export async function refreshArtistTokenCache(
  baseURL: string,
  qqNumber: string = '10001',
  timing: RefreshTiming = REAL_TIMING
): Promise<string> {
  let lastError: unknown = null
  let crossStepWaited = false
  let baseStep = Math.floor(timing.now() / TOTP_STEP_MS)

  const attempt = async (round: number): Promise<string> => {
    // F0052: 上限检查放在每轮尝试之前——超限抛最后一次真实错误（不吞），由调用方决定失败语义
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
    // 本轮候选中 TOTP 级拒绝（五态统一，无法区分「窗口被消费」与「持久拒绝」）
    const currentStep = Math.floor(timing.now() / TOTP_STEP_MS)
    if (currentStep > baseStep) {
      // 轮内已自然跨步：nextLoginTotp 下一轮会给出新步的码，零等待快重试
      baseStep = currentStep
      return attempt(round + 1)
    }
    if (crossStepWaited) {
      // 已等过一次完整边界、在新步仍全 401 → 持久拒绝，立刻抛真实错误（F-02 核心：不裸超时）
      throw lastError
    }
    // 步未推进 → 等一次到下个边界拿 n+2 新码（TASK2-03 恢复路径，全程仅此一次长等待）
    crossStepWaited = true
    const waitMs = TOTP_STEP_MS - (timing.now() % TOTP_STEP_MS) + TOTP_BOUNDARY_SKEW_MS
    await timing.sleep(waitMs)
    baseStep = Math.floor(timing.now() / TOTP_STEP_MS)
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

/**
 * SCR-08 + TASK2-02: 判断 web/dist 是否需要重建。
 * - E2E_SKIP_BUILD=1：调用方（如 scripts/accept.ps1 的 web-build 门禁）已构建，显式跳过；
 * - 否则按 mtime 增量：dist/index.html 存在且不早于全部真实构建输入则跳过。
 * 真实输入须含：
 *   · web/src（web 应用源码）
 *   · shared/src + shared/package.json（web 经 "file:../shared" 依赖，exports 指向 ./src/index.ts，
 *     Vite 直接内联编译——本批 SHR-02/SHR-04 正是只改 shared 源码，漏算会导致 E2E 跑旧 bundle 假绿）
 *   · vite.config.ts（envDir 指向仓库根）、web/package.json、web/index.html
 *   · 根 .env / .env.local / .env.production（vite 从根读取，VITE_* 影响构建产物）
 * 保持单向职责：本函数只判定，不执行构建。
 */
export const WEB_BUILD_INPUT_DIRS = ['web/src', 'shared/src']
export const WEB_BUILD_INPUT_FILES = [
  'web/index.html', 'web/vite.config.ts', 'web/package.json',
  'shared/package.json',
  '.env', '.env.local', '.env.production'
]

/** 计算全部构建输入的最新 mtime（ms）——导出供 TASK2-02 定向样例验证「shared/.env 纳入判定」 */
export function newestBuildInputMtime(root: string, dirs: readonly string[], files: readonly string[]): number {
  let newest = 0
  for (const dir of dirs) {
    const p = resolve(root, dir)
    if (existsSync(p)) newest = Math.max(newest, newestMtime(p))
  }
  for (const cfg of files) {
    const cfgPath = resolve(root, cfg)
    if (existsSync(cfgPath)) newest = Math.max(newest, statSync(cfgPath).mtimeMs)
  }
  return newest
}

function needsWebBuild(): boolean {
  if (process.env.E2E_SKIP_BUILD === '1') {
    console.log('📦 E2E: E2E_SKIP_BUILD=1，跳过前端构建（调用方已构建 web/dist）')
    return false
  }
  const distIndex = resolve(ROOT, 'web/dist/index.html')
  if (!existsSync(distIndex)) return true
  const builtAt = statSync(distIndex).mtimeMs
  const newestSource = newestBuildInputMtime(ROOT, WEB_BUILD_INPUT_DIRS, WEB_BUILD_INPUT_FILES)
  return newestSource > builtAt
}

/** 递归返回目录下最新文件的 mtime（ms），空目录返回 0 */
function newestMtime(dir: string): number {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(p))
    else if (entry.isFile()) newest = Math.max(newest, statSync(p).mtimeMs)
  }
  return newest
}

/**
 * SCR-01: 探测目标端口上的服务健康特征。
 * 200 且 body.status==='ok' 才算「本套件遗留的 E2E 服务器」；其它 HTTP 响应（404/503/非 JSON）
 * 只算「端口被其它进程占用」；连接失败/超时算端口空闲（真被占用时 spawn 的 earlyExit 会收口）。
 */
interface HealthProbe { httpOk: boolean; statusOk: boolean }
async function fetchHealth(baseURL: string): Promise<HealthProbe> {
  try {
    const res = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(3_000) })
    if (!res.ok) return { httpOk: false, statusOk: false }
    let status: unknown
    try {
      status = (await res.json() as { status?: unknown }).status
    } catch {
      // 非 JSON 响应：不是本套件的健康端点
    }
    return { httpOk: true, statusOk: status === 'ok' }
  } catch {
    return { httpOk: false, statusOk: false }
  }
}

/** SCR-02: 轮询等待子进程退出（SIGKILL 是异步信号）——exitCode/signalCode 非空即确认退出 */
async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return child.exitCode !== null || child.signalCode !== null
}

export default async function globalSetup(): Promise<void> {
  const baseURL = E2E_BASE_URL

  // 0. SCR-01: 端口探测提到删库/构建之前——占用时零成本失败，不白跑最贵步骤；
  //    且校验 health 特征（200 + status:ok），避免把任意 HTTP 响应误判为「遗留 E2E 服务器」。
  const probe = await fetchHealth(baseURL)
  if (probe.statusOk) {
    throw new Error(`端口 ${E2E_PORT} 有遗留 E2E 服务器在响应 ${baseURL}/api/health——请先停掉上一次的 E2E 服务器（或改用 E2E_PORT）`)
  }
  if (probe.httpOk) {
    throw new Error(`端口 ${E2E_PORT} 已被其它进程占用（${baseURL}/api/health 未返回健康 E2E 特征 status:ok）——请释放端口或改用 E2E_PORT`)
  }
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
  if (needsWebBuild()) {
    console.log('📦 E2E: 构建前端...')
    execSync('npm run build', { cwd: resolve(ROOT, 'web'), stdio: 'inherit', timeout: 120_000 })
  } else {
    console.log('📦 E2E: web/dist 已是最新，跳过构建（SCR-08；需要重建时更新源码 mtime 或去掉 E2E_SKIP_BUILD）')
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

  // 4. 启动服务器（端口探测已前移到最顶部，见步骤 0 / SCR-01）
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
    // SCR-01: 与端口探测同口径——不仅 200，还要 body.status==='ok' 才算真健康（别的服务假绿挡不住）
    if ((await fetchHealth(baseURL)).statusOk) {
      healthy = true
      break
    }
    await new Promise(r => setTimeout(r, 500))
  }
  if (!healthy) {
    // F0050: 失败必须当场抛错；子进程若还活着（只是慢），杀掉本次 spawn 的实例，不留孤儿占端口
    server.kill('SIGKILL')
    // SCR-02: SIGKILL 是异步信号——必须轮询确认子进程退出后再删 PID 文件，
    // 否则 setup 抛错后 teardown 见 PID 文件已不在就立刻删库，与仍在退出的 server 竞态（WAL 可能半截重建）。
    // 超时仍未确认退出时保留 PID 文件，交 teardown 统一 kill + 确认后清理。
    if (await waitForChildExit(server, 5_000)) {
      rmSync(PID_FILE)
    } else {
      console.warn('⚠️ E2E: 服务器 SIGKILL 后 5s 内未确认退出——保留 .server-pid 交 teardown 统一清理')
    }
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
