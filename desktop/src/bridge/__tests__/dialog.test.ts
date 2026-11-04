// 桌面端系统对话框桥（askConfirm）行为单测：
// 1. 桌面环境（__TAURI_INTERNALS__ 注入）下调用 @tauri-apps/plugin-dialog 的 ask 接口；
// 2. 纯浏览器环境安全降级为原生 window.confirm；
// 3. 壳内调用异常时降级为 window.confirm。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { askConfirm } from '../dialog'

const win = window as unknown as Record<string, unknown>

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(async () => true)
}))

afterEach(() => {
  delete win.__TAURI_INTERNALS__
  vi.clearAllMocks()
})

describe('askConfirm 系统确认框桥', () => {
  it('纯浏览器环境下降级调用 window.confirm', async () => {
    const origConfirm = window.confirm
    try {
      window.confirm = vi.fn(() => true)
      const res = await askConfirm('确定执行该操作？', { title: '拾绘 · 提示' })
      expect(res).toBe(true)
      expect(window.confirm).toHaveBeenCalledWith('确定执行该操作？')
    } finally {
      window.confirm = origConfirm
    }
  })

  it('桌面环境下调用 @tauri-apps/plugin-dialog 的 ask', async () => {
    win.__TAURI_INTERNALS__ = {}
    const { ask } = await import('@tauri-apps/plugin-dialog')
    const res = await askConfirm('新版本已下载，现在重启完成更新？', {
      title: '拾绘 · 检查更新',
      kind: 'info'
    })
    expect(res).toBe(true)
    expect(ask).toHaveBeenCalledWith('新版本已下载，现在重启完成更新？', {
      title: '拾绘 · 检查更新',
      kind: 'info',
      okLabel: undefined,
      cancelLabel: undefined
    })
  })

  it('options 支持传入简写字符串作为 title', async () => {
    win.__TAURI_INTERNALS__ = {}
    const { ask } = await import('@tauri-apps/plugin-dialog')
    const res = await askConfirm('确认删除？', '拾绘 · 删除确认')
    expect(res).toBe(true)
    expect(ask).toHaveBeenCalledWith('确认删除？', {
      title: '拾绘 · 删除确认',
      kind: 'info',
      okLabel: undefined,
      cancelLabel: undefined
    })
  })

  it('桌面壳内调用抛错时安全降级至 window.confirm', async () => {
    win.__TAURI_INTERNALS__ = {}
    const { ask } = await import('@tauri-apps/plugin-dialog')
    vi.mocked(ask).mockRejectedValueOnce(new Error('IPC permission denied'))

    const origConfirm = window.confirm
    try {
      window.confirm = vi.fn(() => false)
      const res = await askConfirm('危险操作确认')
      expect(res).toBe(false)
      expect(window.confirm).toHaveBeenCalledWith('危险操作确认')
    } finally {
      window.confirm = origConfirm
    }
  })
})
