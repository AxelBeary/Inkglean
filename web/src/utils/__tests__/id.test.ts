// CodeQL #26-#30（js/insecure-randomness）跟进回归测试。
// 目的：锁死 generateId() 的非安全上下文行为，防止日后重新引入 Math.random 导致本类报警复发。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateId } from '../id'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('generateId', () => {
  it('返回非空字符串且多次调用不碰撞', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = generateId()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      ids.add(id)
    }
    expect(ids.size).toBe(1000)
  })

  it('从不调用 Math.random（CodeQL insecure-randomness 防再犯锁）', () => {
    const spy = vi.spyOn(Math, 'random')
    for (let i = 0; i < 500; i++) generateId()
    expect(spy).not.toHaveBeenCalled()
  })

  it('randomUUID 抛错时降级到 crypto.getRandomValues 返回合法唯一串', () => {
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 0xff
      return arr
    })
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new TypeError('crypto.randomUUID unavailable in insecure context')
      },
      getRandomValues,
    })
    const id = generateId()
    expect(getRandomValues).toHaveBeenCalled()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    // 降级路径同样不得触碰 Math.random
    const spy = vi.spyOn(Math, 'random')
    generateId()
    expect(spy).not.toHaveBeenCalled()
  })

  it('randomUUID 缺失且无 getRandomValues 时走非随机兜底（不含 Math.random，仍唯一）', () => {
    const spy = vi.spyOn(Math, 'random')
    vi.stubGlobal('crypto', {})
    const a = generateId()
    const b = generateId()
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
    expect(spy).not.toHaveBeenCalled()
  })
})
