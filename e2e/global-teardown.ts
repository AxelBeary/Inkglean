import { existsSync, readFileSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DB = resolve(ROOT, 'e2e/test.db')
const TEST_UPLOADS = resolve(ROOT, 'e2e/test-uploads')
const PID_FILE = resolve(ROOT, 'e2e/.server-pid')

export default async function globalTeardown(): Promise<void> {
  // 1. 停止服务器
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8'), 10)
    try { process.kill(pid, 'SIGTERM') } catch { /* 已退出 */ }
    rmSync(PID_FILE)
    // 等待优雅关闭（服务器有 10s 超时强退）
    await new Promise(r => setTimeout(r, 2000))
    try { process.kill(pid, 0); process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ }
  }

  // 2. 清理测试数据
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`, `${TEST_DB}-journal`, resolve(ROOT, 'e2e/.tokens.json')]) {
    if (existsSync(f)) rmSync(f)
  }
  if (existsSync(TEST_UPLOADS)) rmSync(TEST_UPLOADS, { recursive: true })
  console.log('🧹 E2E: 测试数据已清理')
}
