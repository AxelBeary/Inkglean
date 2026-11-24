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

function input(title = 'T', src = 'https://stuck.test/x.png'): DrawCardInput {
  return {
    title,
    contact: '',
    layout: 'A',
    groups: [{ name: '', tiers: [{ id: '1', name: 'A', priceYuan: 10, note: '', group: '' }] }],
    picks: [{ kind: 'local', src }],
    t: (k: string) => k
  }
}

/** TASK2-08: 快图立即 onload、stuck 图永不回调（只在 10s 超时时 settle） */
class MixedImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(v: string) { this._src = v; if (v.includes('fast')) this.onload?.() }
  get src() { return this._src }
  naturalWidth = 10
  naturalHeight = 10
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

  // TASK2-08: 悬挂预览 #1 在 10s 超时 settle 后，不得用旧输入重绘覆盖已更新的预览 #2。
  it('同画布竞态：旧绘制超时 settle 后不落笔（不覆盖新预览）', async () => {
    vi.stubGlobal('Image', MixedImage)
    const texts: unknown[][] = []
    // setup 的 Proxy stub 每次 get 都返回新函数，无法断言调用；本用例注入可记录的 ctx
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      measureText: (s: string) => ({ width: s.length * 8 }),
      fillText: (...args: unknown[]) => { texts.push(args) },
      fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {},
      lineTo: () => {}, stroke: () => {}, drawImage: () => {}, save: () => {},
      restore: () => {}, rotate: () => {}, translate: () => {}, setLineDash: () => {}
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    // #1：挂在半开连接上（stuck）
    const old = drawCard(ctx, canvas, input('OLD', 'https://stuck.test/x.png'))
    await Promise.resolve()
    // #2：同画布、快图，立即绘完落笔
    await drawCard(ctx, canvas, input('NEW', 'https://fast.test/x.png'))
    const callsAfterNew = texts.length
    expect(texts.some(args => args[0] === 'NEW')).toBe(true)
    expect(texts.some(args => args[0] === 'OLD')).toBe(false)

    // t+10s：#1 的 loadImage 超时 resolve(null) → 旧代次必须止步，不再写画布
    vi.advanceTimersByTime(IMAGE_LOAD_TIMEOUT_MS)
    await old
    expect(texts).toHaveLength(callsAfterNew)
    expect(texts.some(args => args[0] === 'OLD')).toBe(false)
  })
})
