// S5B（GHSA Claim6 后续）：用户自选目录导出改走壳侧 dialog 命令的桌面路径回归——
// runExport 必须调 exportSaveB64（只递「建议文件名 + 字节数据」），
// 渲染层任何时刻不把落点路径交给 path-命令（saveFile 零调用）。
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../bridge', () => ({
  isDesktop: vi.fn(() => true),
  localDbPath: vi.fn(async () => '/appdata/local.db'),
  readBackupB64: vi.fn(async () => btoa('backup-db-bytes')),
  fileSizes: vi.fn(async () => [] as number[]),
  saveFile: vi.fn(async () => {}),
  shihuiHome: vi.fn(async () => 'C:\\Users\\me\\Documents\\拾绘'),
  closeLocalDb: vi.fn(async () => {}),
  exportSaveB64: vi.fn(async () => ({ savedPath: 'D:\\拾绘导出\\拾绘备份-20261024.zip' })),
  importReadB64: vi.fn(async () => null)
}))

import { runExport } from '../tools/exportData'
import { exportSaveB64, saveFile } from '../bridge'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('runExport 桌面路径 · S5B dialog 命令', () => {
  it('走 exportSaveB64 且建议文件名不含路径分隔符（落点由壳侧对话框定）', async () => {
    const r = await runExport([], [])
    expect(exportSaveB64).toHaveBeenCalledTimes(1)
    const args = vi.mocked(exportSaveB64).mock.calls[0]
    expect(args[0]).toMatch(/^拾绘备份-\d{8}\.zip$/)
    expect(args[0]).not.toMatch(/[\\/]/)
    expect(args[1]).toBeInstanceOf(Uint8Array)
    expect(r.ok).toBe(true)
  })

  it('返回体透传对话框落点（个人目录之外的自选盘符如实回显）', async () => {
    const r = await runExport([], [])
    expect(r.path).toBe('D:\\拾绘导出\\拾绘备份-20261024.zip')
  })

  it('全程零调用 saveFile（path-命令）：导出不再「JS 对话框选路 → 传 path 落盘」', async () => {
    await runExport([], [])
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('用户取消（savedPath=null）→ ok=false、path=cancelled、不报错', async () => {
    vi.mocked(exportSaveB64).mockResolvedValueOnce({ savedPath: null })
    const r = await runExport([], [])
    expect(r.ok).toBe(false)
    expect(r.path).toBe('cancelled')
    expect(saveFile).not.toHaveBeenCalled()
  })
})
