import { existsSync, readdirSync, readFileSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DB = resolve(ROOT, 'e2e/test.db')
const TEST_UPLOADS = resolve(ROOT, 'e2e/test-uploads')
const PID_FILE = resolve(ROOT, 'e2e/.server-pid')
const E2E_DIR = dirname(PID_FILE)

/** kill(pid,0) 探活；EPERM 表示进程存在但无权限发信号，同样按存活处理 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * F0055: 校验 PID 对应进程确实是本套件的测试服务器（tsx 跑 server/src/index.ts），
 * 防 PID 复用后误杀无关进程——旧实现仅凭存活检查就敢 SIGKILL。
 * Linux 读 /proc/<pid>/cmdline 匹配特征；无 /proc 的平台（Windows）无法核身，
 * 退化为旧的「仅存活检查」行为（E2E 门禁只在 Linux CI/本机跑，风险面已覆盖）。
 */
function looksLikeE2eServer(pid: number): boolean {
  if (!existsSync('/proc')) return true
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')
    return cmdline.includes('tsx') && cmdline.includes('src/index.ts')
  } catch {
    // 进程已消失或 cmdline 不可读：无法确认身份，不当作本套件进程
    return false
  }
}

export default async function globalTeardown(): Promise<void> {
  // 1. 停止服务器（F0056/F0057：PID 先校验、进程先确认退出，任一不成立都不动测试数据）
  let safeToClean = true
  if (existsSync(PID_FILE)) {
    let readOk = true
    let raw = ''
    try {
      raw = readFileSync(PID_FILE, 'utf8').trim()
    } catch (err) {
      // 读失败（如与并发运行撞车刚被删）：无从判断服务器状态，如实警告并保守跳过清理
      console.warn(`⚠️ E2E: .server-pid 读取失败（${(err as Error).message}）——保留测试数据不清理`)
      readOk = false
      safeToClean = false
    }
    const pid = Number.parseInt(raw, 10)
    const pidValid = readOk && raw !== '' && Number.isInteger(pid) && pid > 0
    if (readOk && !pidValid) {
      // F0056: PID 文件损坏（空/NaN/负数）——旧实现空 catch 吞掉后照常删库，
      // 服务器可能还开着；无法确认已停就保留现场，待下次 global-setup 重建
      console.warn(`⚠️ E2E: .server-pid 内容无效（"${raw}"）——无法确认服务器已停，保留测试数据`)
      safeToClean = false
    } else if (pidValid && isProcessAlive(pid) && !looksLikeE2eServer(pid)) {
      // F0055: PID 已被无关进程复用——绝不向它发信号；原服务器状态不明，保守保留测试数据
      console.warn(`⚠️ E2E: PID ${pid} 不属于本套件（疑似复用）——跳过停止服务器，保留测试数据，请人工确认`)
      safeToClean = false
    } else if (pidValid && isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch { /* 已退出 */ }
      // 优雅关闭等待（服务器有 10s 超时强退）
      await new Promise(r => setTimeout(r, 2000))
      if (isProcessAlive(pid) && looksLikeE2eServer(pid)) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch { /* 已退出 */ }
        await new Promise(r => setTimeout(r, 500))
      }
      // F0055: SIGTERM 等待期间身份校验不通过（PID 被复用）则不再补刀
      if (isProcessAlive(pid)) {
        // 强杀后仍存活（极端场景）——保留 PID 文件供人工处置，跳过清理
        console.warn(`⚠️ E2E: 服务器进程 ${pid} 未能确认退出——保留 .server-pid 与测试数据，请人工处理`)
        safeToClean = false
      } else {
        // F0057: 确认退出后才删 PID 文件——旧实现先删再确认，关闭失败时丢掉唯一进程句柄
        rmSync(PID_FILE)
      }
    } else if (pidValid) {
      // 进程本就退出：F0057 同款口径，确认退出后才删 PID 文件
      rmSync(PID_FILE)
    }
  }

  // 2. 清理测试数据（仅当服务器已确认停止/本就未启动——F0056：避免删掉仍在被使用的库）
  if (safeToClean) {
    for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`, `${TEST_DB}-journal`, resolve(ROOT, 'e2e/.tokens.json')]) {
      if (existsSync(f)) rmSync(f)
    }
    // F0063 配套：清掉原子写可能残留的临时文件（.tokens.json.<pid>.tmp，崩溃遗留）
    for (const name of readdirSync(E2E_DIR)) {
      if (/^\.tokens\.json\.\d+\.tmp$/.test(name)) rmSync(resolve(E2E_DIR, name))
    }
    if (existsSync(TEST_UPLOADS)) rmSync(TEST_UPLOADS, { recursive: true })
    console.log('🧹 E2E: 测试数据已清理')
  } else {
    console.log('🧹 E2E: 测试数据保留（服务器未确认停止）——下次 global-setup 会重建测试库')
  }
}
