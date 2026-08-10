// theme store localStorage 降级测试（P3-10）
// 覆盖：存储读写抛错时 state 工厂/主题切换不抛，按默认值降级
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

import { useThemeStore } from '../theme.js'

const originalMatchMedia = window.matchMedia
// vitest 4 的 restoreAllMocks 对 happy-dom Storage.prototype spy 不生效，须显式 mockRestore
let storageSpy = null

afterEach(() => {
  storageSpy?.mockRestore()
  storageSpy = null
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
})

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })
}

describe('theme store 存储禁用降级（P3-10）', () => {
  it('localStorage.getItem 抛错 → store 初始化不抛，降级默认值', () => {
    stubMatchMedia()
    storageSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    setActivePinia(createPinia())
    const store = useThemeStore()
    expect(store.base).toBe('auto')
    expect(store.accent).toBe('1')
    expect(store.artistTheme).toBe('paper')
  })

  it('localStorage.setItem 抛错 → 切换主题不抛（持久化静默失败）', async () => {
    stubMatchMedia()
    storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    setActivePinia(createPinia())
    const store = useThemeStore()
    expect(() => store.setBase('dark')).not.toThrow()
    await nextTick() // watch 默认异步 flush，等持久化回调跑完
    expect(store.base).toBe('dark')
  })
})
