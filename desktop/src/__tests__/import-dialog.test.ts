// S5B（GHSA Claim6 后续）：用户自选目录导入改走壳侧 dialog 读件命令——
// pickAndReadBackup 必须调 importReadB64（只递过滤器/标题，无路径入参），
// 取消返回 null；浏览器环境降级为 null 不碰桥。
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../bridge', () => ({
  isDesktop: vi.fn(() => true),
  localDbPath: vi.fn(async () => '/appdata/local.db'),
  readBackupB64: vi.fn(async () => btoa('backup-db-bytes')),
  fileSizes: vi.fn(async () => [] as number[]),
  saveFile: vi.fn(async () => {}),
  shihuiHome: vi.fn(async () => 'C:\\Users\\me\\Documents\\拾绘'),
  closeLocalDb: vi.fn(async () => {}),
  exportSaveB64: vi.fn(async () => ({ savedPath: null })),
  importReadB64: vi.fn(async () => ({ dataB64: btoa('picked-zip'), path: 'D:\\任意位置\\拾绘备份-20261024.zip' }))
}))

import { pickAndReadBackup } from '../tools/importData'
import { importReadB64, isDesktop } from '../bridge'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isDesktop).mockReturnValue(true)
  localStorage.clear()
})

describe('pickAndReadBackup · S5B dialog 读件', () => {
  it('走 importReadB64 且参数只有过滤器/标题（类型上不存在路径入参）', async () => {
    const picked = await pickAndReadBackup()
    expect(importReadB64).toHaveBeenCalledTimes(1)
    const args = vi.mocked(importReadB64).mock.calls[0]
    expect(args[0]).toEqual([{ name: '拾绘备份包', extensions: ['zip'] }])
    expect(args[1]).toBe('选择拾绘备份包')
    expect(picked).not.toBeNull()
  })

  it('透传壳侧读回的字节与对话框路径（任意位置可选，个人目录之外也如实回给预检）', async () => {
    const picked = await pickAndReadBackup()
    expect(picked?.dataB64).toBe(btoa('picked-zip'))
    expect(picked?.path).toBe('D:\\任意位置\\拾绘备份-20261024.zip')
  })

  it('用户取消 → null（桥侧未写未读的对称口径）', async () => {
    vi.mocked(importReadB64).mockResolvedValueOnce(null)
    await expect(pickAndReadBackup()).resolves.toBeNull()
  })

  it('纯浏览器环境降级为 null 且不碰桥', async () => {
    vi.mocked(isDesktop).mockReturnValue(false)
    await expect(pickAndReadBackup()).resolves.toBeNull()
    expect(importReadB64).not.toHaveBeenCalled()
  })
})
