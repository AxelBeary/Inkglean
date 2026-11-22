// F0004: 给 checkpointWalForBackup 补直接单测——此前只有 buildBackupBlob 的上层间接用例，
// checkpoint 执行与边车字节数回传一旦回归，会静默产出「看着完整、实际缺数据」的备份。
// 钉住两条：①真的执行 PRAGMA wal_checkpoint(TRUNCATE)；②返回 -wal 边车字节数原值。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const win = window as unknown as Record<string, unknown>
const DB_PATH = '/appdata/shihui/local.db'

const h = vi.hoisted(() => {
  const executeCalls: string[] = []
  let walBytes = 0
  const sizeQueries: string[][] = []
  return { executeCalls, get walBytes() { return walBytes }, set walBytes(v: number) { walBytes = v }, sizeQueries }
})

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async () => ({
      execute: async (sql: string) => { h.executeCalls.push(sql); return { rowsAffected: 0, lastInsertId: 0 } },
      select: async () => [],
      close: async () => true
    })
  }
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: { paths?: string[] }) => {
    if (cmd === 'desktop_local_db_path') return DB_PATH
    if (cmd === 'desktop_file_sizes' && args?.paths) {
      h.sizeQueries.push(args.paths)
      return args.paths.map(() => h.walBytes)
    }
    return null
  })
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {})
}))

async function freshDbModule(): Promise<typeof import('../bridge/db')> {
  vi.resetModules()
  return await import('../bridge/db')
}

beforeEach(() => {
  h.executeCalls.length = 0
  h.sizeQueries.length = 0
  h.walBytes = 0
  vi.clearAllMocks()
  win.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  delete win.__TAURI_INTERNALS__
})

describe('checkpointWalForBackup（F0004 直接单测）', () => {
  it('先执行 PRAGMA wal_checkpoint(TRUNCATE)，再回读 -wal 边车字节数', async () => {
    h.walBytes = 4096
    const { checkpointWalForBackup } = await freshDbModule()

    const bytes = await checkpointWalForBackup()

    expect(h.executeCalls).toContain('PRAGMA wal_checkpoint(TRUNCATE)')
    expect(h.sizeQueries).toEqual([[`${DB_PATH}-wal`]])
    expect(bytes).toBe(4096)
  })

  it('边车已归零返回 0（备份可放行）；非零原样回传（上层据此中止）', async () => {
    const { checkpointWalForBackup } = await freshDbModule()
    expect(await checkpointWalForBackup()).toBe(0)

    h.walBytes = 12345
    expect(await checkpointWalForBackup()).toBe(12345)
  })

  it('纯浏览器环境抛 BridgeUnavailableError（逃生门不变）', async () => {
    delete win.__TAURI_INTERNALS__
    const { checkpointWalForBackup } = await freshDbModule()
    await expect(checkpointWalForBackup()).rejects.toMatchObject({
      name: 'BridgeUnavailableError',
      message: expect.stringContaining('checkpointWalForBackup')
    })
  })
})
