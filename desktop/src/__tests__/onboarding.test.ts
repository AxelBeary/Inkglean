// 本地核心环波12 测试：首次启动引导标记（口径哨兵）。
import { describe, it, expect, beforeEach } from 'vitest'
import { isOnboarded, markOnboarded } from '../tools/onboarding'

beforeEach(() => localStorage.clear())

describe('onboarding 标记', () => {
  it('未引导返 false，标记后返 true', () => {
    expect(isOnboarded()).toBe(false)
    markOnboarded()
    expect(isOnboarded()).toBe(true)
  })

  it('读失败口径：当作已引导（不困住用户）', () => {
    const broken = { getItem: (): string => { throw new Error('boom') } }
    expect(isOnboarded(broken)).toBe(true)
  })

  it('写失败静默不抛', () => {
    const broken = { setItem: (): void => { throw new Error('boom') } }
    expect(() => markOnboarded(broken)).not.toThrow()
  })
})
