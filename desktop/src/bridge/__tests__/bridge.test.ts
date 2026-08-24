// desktop-bridge 逃生门行为单测：
// 纯浏览器（happy-dom）环境下 isDesktop=false、原生能力调用抛 BridgeUnavailableError；
// 模拟 Tauri 壳（注入 __TAURI_INTERNALS__）时探测翻转为 true。
import { describe, it, expect, afterEach } from 'vitest'
import { isDesktop, ping, openWithSystem, pickDirectory, BridgeUnavailableError } from '../index'

const win = window as unknown as Record<string, unknown>

afterEach(() => {
  delete win.__TAURI_INTERNALS__
})

describe('isDesktop 环境探测', () => {
  it('纯浏览器环境返回 false', () => {
    expect(isDesktop()).toBe(false)
  })

  it('注入 __TAURI_INTERNALS__ 后返回 true', () => {
    win.__TAURI_INTERNALS__ = {}
    expect(isDesktop()).toBe(true)
  })
})

describe('原生能力逃生门', () => {
  it('ping 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(ping()).rejects.toThrow(BridgeUnavailableError)
  })

  it('openWithSystem 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(openWithSystem('C:\\test.clip')).rejects.toThrow(BridgeUnavailableError)
  })

  it('pickDirectory 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(pickDirectory()).rejects.toThrow(BridgeUnavailableError)
  })

  it('错误信息带能力名便于排查', async () => {
    try {
      await ping()
      expect.unreachable('应当抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(BridgeUnavailableError)
      expect((e as Error).message).toContain('ping')
    }
  })
})
