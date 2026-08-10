// utils/storage 安全封装测试（P3-10）
// 覆盖：get/set/remove 在 localStorage 抛错时静默降级（返回 null / 不抛错），正常路径照常
import { describe, it, expect, vi, afterEach } from 'vitest'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../storage.js'

// vitest 4 的 restoreAllMocks 对 happy-dom Storage.prototype spy 不生效，须显式 mockRestore
let storageSpy = null
// happy-dom 的 localStorage 是 window 自有访问器属性，测试覆盖后按原描述符还原
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

afterEach(() => {
  storageSpy?.mockRestore()
  storageSpy = null
  Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
})

describe('safe storage（P3-10）', () => {
  it('getItem 抛错 → 返回 null（不向上抛，调用方按默认值降级）', () => {
    storageSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(safeGetItem('artist_logged_in')).toBeNull()
  })

  it('setItem 抛错 → 静默失败不抛错', () => {
    storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => safeSetItem('k', 'v')).not.toThrow()
  })

  it('removeItem 抛错 → 静默失败不抛错', () => {
    storageSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => safeRemoveItem('k')).not.toThrow()
  })

  it('localStorage 属性访问本身抛错 → 同样降级', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied')
      }
    })
    expect(safeGetItem('k')).toBeNull()
    expect(() => safeSetItem('k', 'v')).not.toThrow()
    expect(() => safeRemoveItem('k')).not.toThrow()
  })

  it('正常可用时读写删除照常', () => {
    safeSetItem('storage-test-key', 'v1')
    expect(safeGetItem('storage-test-key')).toBe('v1')
    safeRemoveItem('storage-test-key')
    expect(safeGetItem('storage-test-key')).toBeNull()
  })
})
