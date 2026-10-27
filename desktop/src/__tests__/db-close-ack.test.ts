// #22-2 跨窗关连接握手回归：广播带 requestId → 悬浮窗关完连接回 ack → 导入侧逐窗核对。
// 关键反例：未回执的仍存活窗必须进 missing（导入据此中止），已消失的窗不算 missing。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const win = window as unknown as Record<string, unknown>

type Listener = (event: { payload: unknown }) => void | Promise<void>

const h = vi.hoisted(() => {
  const listeners = new Map<string, Listener[]>()
  const emissions: Array<{ event: string; payload: unknown }> = []
  let labelBatches: string[][] = []
  let currentLabel = 'main'
  return {
    listeners,
    emissions,
    resetLabels(batches: string[][]) {
      labelBatches = batches
    },
    nextLabels(): string[] {
      return labelBatches.shift() ?? []
    },
    setCurrentLabel(label: string) {
      currentLabel = label
    },
    currentLabel() {
      return currentLabel
    },
    reset() {
      listeners.clear()
      emissions.length = 0
      labelBatches = []
      currentLabel = 'main'
    }
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'desktop_floating_window_labels') return h.nextLabels()
    return null
  }),
  convertFileSrc: (path: string) => path
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    const arr = h.listeners.get(event) ?? []
    arr.push(cb)
    h.listeners.set(event, arr)
    return () => {
      const current = h.listeners.get(event) ?? []
      h.listeners.set(event, current.filter(fn => fn !== cb))
    }
  }),
  emit: vi.fn(async (event: string, payload: unknown) => {
    h.emissions.push({ event, payload })
  })
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: h.currentLabel() })
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async () => ({
      execute: async () => ({ rowsAffected: 0, lastInsertId: 0 }),
      select: async () => [],
      close: async () => true
    })
  }
}))

async function freshDbModule(): Promise<typeof import('../bridge/db')> {
  vi.resetModules()
  return await import('../bridge/db')
}

function ackListeners(): Listener[] {
  return h.listeners.get('desktop-db-close-ack') ?? []
}

function closeAllPayload(): { requestId: string } {
  const call = h.emissions.find(e => e.event === 'desktop-db-close-all')
  expect(call, '应已广播 close-all').toBeTruthy()
  return call!.payload as { requestId: string }
}

beforeEach(() => {
  h.reset()
  vi.clearAllMocks()
  win.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  delete win.__TAURI_INTERNALS__
})

describe('missingAcks（纯函数）', () => {
  it('未回执且仍存活才算缺失；已消失的窗不算', async () => {
    const { missingAcks } = await freshDbModule()
    expect(
      missingAcks(
        ['floating-timer', 'floating-deadline', 'floating-gone'],
        ['floating-deadline'],
        ['floating-timer', 'floating-deadline']
      )
    ).toEqual(['floating-timer'])
  })

  it('全部回执为空清单；全都没回执且都还活着则全报', async () => {
    const { missingAcks } = await freshDbModule()
    expect(missingAcks(['a', 'b'], ['a', 'b'], ['a', 'b'])).toEqual([])
    expect(missingAcks(['a', 'b'], [], ['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('broadcastCloseAllDb（逐窗回执）', () => {
  it('没有悬浮窗：不发广播，直接空清单', async () => {
    h.resetLabels([[]])
    const { broadcastCloseAllDb } = await freshDbModule()
    await expect(broadcastCloseAllDb()).resolves.toEqual({ missing: [] })
    expect(h.emissions.some(e => e.event === 'desktop-db-close-all')).toBe(false)
  })

  it('全部悬浮窗回执：missing 为空，广播带 requestId', async () => {
    h.resetLabels([
      ['floating-timer', 'floating-deadline'],
      ['floating-timer', 'floating-deadline']
    ])
    const { broadcastCloseAllDb } = await freshDbModule()
    const pending = broadcastCloseAllDb()

    await vi.waitFor(() => expect(h.emissions.some(e => e.event === 'desktop-db-close-all')).toBe(true))
    const { requestId } = closeAllPayload()
    expect(typeof requestId).toBe('string')
    expect(requestId.length).toBeGreaterThan(0)

    for (const cb of ackListeners()) {
      await cb({ payload: { requestId, label: 'floating-timer' } })
      await cb({ payload: { requestId, label: 'floating-deadline' } })
    }
    await expect(pending).resolves.toEqual({ missing: [] })
  })

  it('一个窗不回执：超时后报该窗；requestId 不符的回执被忽略', async () => {
    h.resetLabels([
      ['floating-timer', 'floating-deadline'],
      ['floating-timer', 'floating-deadline']
    ])
    const { broadcastCloseAllDb } = await freshDbModule()
    const pending = broadcastCloseAllDb()

    await vi.waitFor(() => expect(h.emissions.some(e => e.event === 'desktop-db-close-all')).toBe(true))
    const { requestId } = closeAllPayload()
    for (const cb of ackListeners()) {
      await cb({ payload: { requestId: 'stale-request', label: 'floating-deadline' } })
      await cb({ payload: { requestId, label: 'floating-timer' } })
    }
    // 剩 deadline 不回执：真实计时器走满 3s 超时（本用例唯一慢点）
    await expect(pending).resolves.toEqual({ missing: ['floating-deadline'] })
  }, 10_000)

  it('回执后窗已消失：不算 missing（它已不可能持有句柄）', async () => {
    h.resetLabels([
      ['floating-timer', 'floating-gone'],
      ['floating-timer']
    ])
    const { broadcastCloseAllDb } = await freshDbModule()
    const pending = broadcastCloseAllDb()
    await vi.waitFor(() => expect(h.emissions.some(e => e.event === 'desktop-db-close-all')).toBe(true))
    const { requestId } = closeAllPayload()
    for (const cb of ackListeners()) {
      await cb({ payload: { requestId, label: 'floating-timer' } })
    }
    await expect(pending).resolves.toEqual({ missing: [] })
  })
})

describe('悬浮窗监听端（关连接后回执）', () => {
  it('收到带 requestId 的广播：先关本窗连接，再回发本窗 label', async () => {
    h.setCurrentLabel('floating-timer')
    await freshDbModule()
    await vi.waitFor(() => expect(h.listeners.get('desktop-db-close-all')?.length ?? 0).toBeGreaterThan(0))

    for (const cb of h.listeners.get('desktop-db-close-all') ?? []) {
      await cb({ payload: { requestId: 'req-1' } })
    }
    const ack = h.emissions.find(e => e.event === 'desktop-db-close-ack')
    expect(ack?.payload).toEqual({ requestId: 'req-1', label: 'floating-timer' })
  })

  it('旧广播（无 requestId）只关连接、不回执', async () => {
    await freshDbModule()
    await vi.waitFor(() => expect(h.listeners.get('desktop-db-close-all')?.length ?? 0).toBeGreaterThan(0))
    for (const cb of h.listeners.get('desktop-db-close-all') ?? []) {
      await cb({ payload: null })
    }
    expect(h.emissions.some(e => e.event === 'desktop-db-close-ack')).toBe(false)
  })
})
