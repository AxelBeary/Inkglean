import { execFileSync } from 'child_process'
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
 * SCR-09: 轮询 isProcessAlive 等待进程退出，替代固定 setTimeout(2000)+500。
 * server 通常 ~200ms 就退出，旧实现无论死活都硬等 2.5s；本函数退出即返回，
 * 仅在确需等待时才占用时间，返回是否在超时前确认退出。
 */
async function waitForProcessExit(pid: number, timeoutMs: number, intervalMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return !isProcessAlive(pid)
}

/** 读取进程命令行；null = 平台/权限不支持，必须按「无法核身」处理 */
export type CmdLineReader = (pid: number) => string | null

/**
 * PR114 MINOR-7：Windows 无 /proc，但 scripts/accept.ps1:146-148 会在本地 Windows 跑 E2E。
 * 旧实现 `if (!existsSync('/proc')) return true` 使 PID 复用防护空转，可能 SIGKILL 无关进程。
 * Windows 改走 PowerShell `Get-CimInstance Win32_Process` 查 CommandLine（pid 已校验为正整数，
 * 无注入面）；查不到/命令失败一律返回 null，由 looksLikeE2eServer 保守拒绝。
 */
function windowsCmdLine(pid: number): string | null {
  const command = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
  for (const shell of ['powershell.exe', 'pwsh']) {
    try {
      const out = execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command', command], {
        encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore']
      })
      return out.trim() || null
    } catch {
      // 换下一个 shell 再试；都失败则视为无法核身
    }
  }
  return null
}

/** 按平台读取进程命令行：Linux /proc → Windows CIM → 其它平台返回 null（保守） */
function readProcessCmdLine(pid: number): string | null {
  if (existsSync('/proc')) {
    try {
      return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')
    } catch {
      return null
    }
  }
  if (process.platform === 'win32') return windowsCmdLine(pid)
  return null
}

/**
 * F0055 / PR114 MINOR-7: 校验 PID 对应进程确实是本套件的测试服务器（tsx 跑 server/src/index.ts），
 * 防 PID 复用后误杀无关进程。第二参数可注入，供无 /proc 场景的定向回归钉住「不凭存活放行」。
 */
export function looksLikeE2eServer(pid: number, readCmdLine: CmdLineReader = readProcessCmdLine): boolean {
  try {
    const cmdline = readCmdLine(pid)
    // 无法核身 / 命令行不匹配 → 一律 false；绝不退回「仅凭存活就 return true」
    return cmdline != null && cmdline.includes('tsx') && cmdline.includes('src/index.ts')
  } catch {
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
      // 优雅关闭轮询（服务器自身有 10s 超时强退）：已退出立即返回，不再硬等 2s（SCR-09）
      const gracefulExit = await waitForProcessExit(pid, 10_000)
      if (!gracefulExit && isProcessAlive(pid) && looksLikeE2eServer(pid)) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch { /* 已退出 */ }
        await waitForProcessExit(pid, 2_000)
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
