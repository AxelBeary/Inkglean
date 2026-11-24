// SHR-04 回归：例图半开连接（onload/onerror 永不触发）不得让 drawCard 悬挂，
// 10s 超时 settle；卸载清理取消在途加载；abort 信号提前 settle。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { drawCard, cancelPendingImageLoads, IMAGE_LOAD_TIMEOUT_MS } from '../components/pricecard/draw'
import type { DrawCardInput } from '../components/pricecard/draw'

class HangingImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(v: string) { this._src = v }
  get src() { return this._src }
  naturalWidth = 10
  naturalHeight = 10
}

function input(): DrawCardInput {
  return {
    title: 'T',
    contact: '',
    layout: 'A',
    groups: [{ name: '', tiers: [{ id: '1', name: 'A', priceYuan: 10, note: '', group: '' }] }],
    picks: [{ kind: 'local', src: 'https://stuck.test/x.png' }],
    t: (k: string) => k
  }
}

describe('SHR-04 例图加载超时 / 卸载清理', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Image', HangingImage)
  })
  afterEach(() => {
    cancelPendingImageLoads()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('半开连接永不回调：drawCard 在 10s 超时后 settle（不永久挂起）', async () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    let settled = false
    const p = drawCard(ctx, canvas, input()).then(() => { settled = true })
    await Promise.resolve() // 让 loadImage 挂上 Image / 定时器
    expect(settled).toBe(false)
    vi.advanceTimersByTime(IMAGE_LOAD_TIMEOUT_MS - 1)
    await Promise.resolve()
    expect(settled).toBe(false)
    vi.advanceTimersByTime(1)
    await p
    expect(settled).toBe(true)
  })

  it('卸载清理 cancelPendingImageLoads：在途加载立即 settle', async () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    let settled = false
    const p = drawCard(ctx, canvas, input()).then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    cancelPendingImageLoads()
    await p
    expect(settled).toBe(true)
  })

  it('abort 信号：提前取消在途加载并 settle', async () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const controller = new AbortController()
    let settled = false
    const p = drawCard(ctx, canvas, input(), controller.signal).then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    controller.abort()
    await p
    expect(settled).toBe(true)
  })
})
