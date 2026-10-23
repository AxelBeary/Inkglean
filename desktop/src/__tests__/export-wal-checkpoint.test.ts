// 审计 #22 条目 1：备份必须是一致性快照
// 包内只装 local.db 本体、不含 -wal 边车 ⇒ 读文件前必须先 checkpoint，
// 且折叠后边车仍非 0 时要**在读取之前**中止（否则出的是一份看着完整、实际缺最近提交的包）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { assertBackupSnapshotSelfContained, buildBackupBlob } from '../tools/exportData'

const h = vi.hoisted(() => ({
  calls: [] as string[],
  walBytes: 0
}))

vi.mock('../bridge', () => ({
  isDesktop: () => true,
  BridgeUnavailableError: class extends Error {},
  localDbPath: async () => {
    h.calls.push('localDbPath')
    return 'C:\\Users\\test\\AppData\\local.db'
  },
  checkpointWalForBackup: async () => {
    h.calls.push('checkpointWalForBackup')
    return h.walBytes
  },
  readBackupB64: async () => {
    h.calls.push('readBackupB64')
    return 'U1FMITEUQTpEQkI='
  },
  fileSizes: async (paths: string[]) => {
    h.calls.push('fileSizes')
    return paths.map(() => 128)
  },
  saveFile: async () => {
    h.calls.push('saveFile')
  }
}))

describe('备份前的 WAL 折叠门槛（#22-1）', () => {
  beforeEach(() => {
    h.calls = []
    h.walBytes = 0
  })

  it('assertBackupSnapshotSelfContained：边车归零放行，非 0 抛错且带字节数', () => {
    expect(() => assertBackupSnapshotSelfContained(0)).not.toThrow()
    expect(() => assertBackupSnapshotSelfContained(4096)).toThrow('4096')
    expect(() => assertBackupSnapshotSelfContained(1)).toThrow('备份已中止')
  })

  it('打数据包先折叠 WAL 再读主库文件（顺序即修复本身）', async () => {
    const blob = await buildBackupBlob([], [])

    expect(blob.size).toBeGreaterThan(0)
    expect(h.calls).toEqual(['localDbPath', 'checkpointWalForBackup', 'readBackupB64', 'fileSizes'])
    expect(h.calls.indexOf('checkpointWalForBackup')).toBeLessThan(h.calls.indexOf('readBackupB64'))
  })

  it('折叠后边车仍非 0 → 在读文件之前中止，不出缺数据的包', async () => {
    h.walBytes = 32_768

    await expect(buildBackupBlob([], [])).rejects.toThrow('备份已中止')
    expect(h.calls).toEqual(['localDbPath', 'checkpointWalForBackup'])
    expect(h.calls).not.toContain('readBackupB64')
  })
})
