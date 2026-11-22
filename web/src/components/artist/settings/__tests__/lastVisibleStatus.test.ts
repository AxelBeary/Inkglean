// F0226: 小店可见性状态记忆/恢复逻辑回归——页面以 hidden 重新加载后不把满单/休息中重置为 open
import { describe, it, expect } from 'vitest'
import { resolveLastVisibleStatus } from '../lastVisibleStatus'

describe('resolveLastVisibleStatus（F0222/F0226）', () => {
  it('当前为 hidden → 用缓存的 visible 状态（full/break 不丢）', () => {
    expect(resolveLastVisibleStatus('full', 'hidden')).toBe('full')
    expect(resolveLastVisibleStatus('break', 'hidden')).toBe('break')
  })

  it('当前为可见态 → 以当前态为准（比缓存更新）', () => {
    expect(resolveLastVisibleStatus('full', 'open')).toBe('open')
  })

  it('缓存非法/缺失且当前 hidden → 回落 open', () => {
    expect(resolveLastVisibleStatus(null, 'hidden')).toBe('open')
    expect(resolveLastVisibleStatus('bogus', 'hidden')).toBe('open')
  })
})
