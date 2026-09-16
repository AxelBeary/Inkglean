// 波2 DSK-02/03/08/09 桌面路径回归：mock 桥层，验证导入整库覆写的真实顺序与口径——
// DSK-02 备份打包走 readBackupB64（100MB）绝不走 readFileB64（5MB）；
// DSK-03 替换前自动备份名带时分秒；DSK-08 五类数据任一即触发备份；
// DSK-09 覆写前「跨窗广播关连接 → 关本窗连接 → 清 -wal/-shm 边车 → 覆写库」且边车失败不阻塞。
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../bridge', () => ({
  isDesktop: () => true,
  localDbPath: vi.fn(async () => '/appdata/local.db'),
  readBackupB64: vi.fn(async () => btoa('backup-db-bytes')),
  // DSK-02 哨兵：旧 5MB 通道一旦被调用即让测试炸（导出/备份不应再走它）
  readFileB64: vi.fn(async () => { throw new Error('DSK-02：不应再走 5MB readFileB64 通道') }),
  fileSizes: vi.fn(async () => [] as number[]),
  saveFile: vi.fn(async () => {}),
  shihuiHome: vi.fn(async () => 'C:\\Users\\me\\Documents\\拾绘'),
  closeLocalDb: vi.fn(async () => {})
}))

vi.mock('../bridge/db', () => ({
  broadcastCloseAllDb: vi.fn(async () => {}),
  deleteDbSidecar: vi.fn(async () => {}),
  DB_CLOSE_ALL_EVENT: 'desktop-db-close-all'
}))

import { runImport } from '../tools/importData'
import type { BackupPreview } from '../tools/importData'
import { readBackupB64, readFileB64, saveFile, closeLocalDb } from '../bridge'
import { broadcastCloseAllDb, deleteDbSidecar } from '../bridge/db'

const DB_PATH = '/appdata/local.db'

function validPreview(): BackupPreview {
  return { ok: true, reason: '', dbB64: btoa('new-db-bytes'), prefs: null, manifestCount: null }
}

/** saveFile 调用中「覆写本地库」那一次的 path（区别于备份包落盘） */
function dbWriteIndex(): number {
  return vi.mocked(saveFile).mock.calls.findIndex(c => c[0] === DB_PATH)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('runImport 桌面路径 · DSK-02（备份走 100MB 通道）', () => {
  it('打包备份调 readBackupB64，绝不触碰 5MB 的 readFileB64', async () => {
    const r = await runImport([], [], validPreview(), true)
    expect(r.ok).toBe(true)
    expect(readBackupB64).toHaveBeenCalledWith(DB_PATH)
    expect(readFileB64).not.toHaveBeenCalled()
  })
})

describe('runImport 桌面路径 · DSK-03（替换前备份名带时分秒）', () => {
  it('自动备份落盘名形如 拾绘备份-替换前-YYYYMMDD-HHMMSS.zip', async () => {
    await runImport([], [], validPreview(), true)
    const backupCall = vi.mocked(saveFile).mock.calls.find(c => String(c[0]).includes('替换前'))
    expect(backupCall).toBeTruthy()
    expect(String(backupCall![0])).toMatch(/拾绘备份-替换前-\d{8}-\d{6}\.zip$/)
  })
})

describe('runImport 桌面路径 · DSK-08（五类数据任一即备份）', () => {
  it('无账目无文件但 hasLocal=true（档案/模板/工时）→ 仍自动备份', async () => {
    const r = await runImport([], [], validPreview(), true)
    expect(r.backupPath).not.toBe('')
    expect(vi.mocked(saveFile).mock.calls.some(c => String(c[0]).includes('替换前'))).toBe(true)
  })

  it('hasLocal=false 且无账目无文件 → 不备份，只覆写库', async () => {
    const r = await runImport([], [], validPreview(), false)
    expect(r.ok).toBe(true)
    expect(r.backupPath).toBe('')
    expect(vi.mocked(saveFile).mock.calls.some(c => String(c[0]).includes('替换前'))).toBe(false)
    expect(dbWriteIndex()).toBeGreaterThanOrEqual(0) // 库仍被覆写
  })

  it('缺省 hasLocal（兼容旧三参调用）回退 orders/files 口径', async () => {
    const r = await runImport([], [], validPreview())
    expect(r.backupPath).toBe('') // 无 orders 无 files → 不备份
  })
})

describe('runImport 桌面路径 · DSK-09（覆写前跨窗关连接 + 清边车）', () => {
  it('广播 → 关本窗连接 → 清边车 → 覆写库，顺序正确', async () => {
    await runImport([], [], validPreview(), false)

    expect(broadcastCloseAllDb).toHaveBeenCalledTimes(1)
    expect(closeLocalDb).toHaveBeenCalledTimes(1)
    expect(deleteDbSidecar).toHaveBeenCalledTimes(1)

    const broadcastOrder = vi.mocked(broadcastCloseAllDb).mock.invocationCallOrder[0]
    const closeOrder = vi.mocked(closeLocalDb).mock.invocationCallOrder[0]
    const sidecarOrder = vi.mocked(deleteDbSidecar).mock.invocationCallOrder[0]
    const writeIdx = dbWriteIndex()
    expect(writeIdx).toBeGreaterThanOrEqual(0)
    const writeOrder = vi.mocked(saveFile).mock.invocationCallOrder[writeIdx]

    expect(broadcastOrder).toBeLessThan(closeOrder)
    expect(closeOrder).toBeLessThan(sidecarOrder)
    expect(sidecarOrder).toBeLessThan(writeOrder)
  })

  it('边车清理失败不阻塞导入（兜底关连接自删），落 console.warn 可见', async () => {
    vi.mocked(deleteDbSidecar).mockRejectedValueOnce(new Error('command desktop_delete_db_sidecar not found'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await runImport([], [], validPreview(), false)
    expect(r.ok).toBe(true)
    expect(dbWriteIndex()).toBeGreaterThanOrEqual(0) // 库仍被覆写
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
