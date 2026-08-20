// 全局错误提示去重测试（P3-9）
// 覆盖：同一消息 5 秒窗口内只放行一次、不同消息互不影响、窗口过后重新放行
import { describe, it, expect } from 'vitest'
import { createGlobalErrorDedup } from '../globalErrorDedup'

describe('createGlobalErrorDedup（P3-9）', () => {
  let t = 0
  const now = (): number => t

  it('同一消息 5 秒内只弹一次，窗口过后可再弹', () => {
    const shouldShow = createGlobalErrorDedup(5000, now)
    t = 1000
    expect(shouldShow('boom')).toBe(true)
    t = 1001
    expect(shouldShow('boom')).toBe(false)
    t = 5999
    expect(shouldShow('boom')).toBe(false)
    t = 6000
    expect(shouldShow('boom')).toBe(true)
  })

  it('不同消息互不影响（各自独立计数）', () => {
    const shouldShow = createGlobalErrorDedup(5000, now)
    t = 0
    expect(shouldShow('a')).toBe(true)
    expect(shouldShow('b')).toBe(true)
    expect(shouldShow('a')).toBe(false)
    expect(shouldShow('b')).toBe(false)
  })

  it('过期键被清理：跨窗口后再次放行', () => {
    const shouldShow = createGlobalErrorDedup(5000, now)
    t = 0
    shouldShow('x')
    t = 5000
    expect(shouldShow('x')).toBe(true)
    // 再次入窗
    t = 5001
    expect(shouldShow('x')).toBe(false)
  })
})
