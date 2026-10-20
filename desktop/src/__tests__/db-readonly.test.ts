// U45 回归：只读投影窗（撕悬浮三件）的 capability 无 execute，只读入口**绝不得偷偷建表**。
// db.ts 持模块级单例，故每个用例都 vi.resetModules() + 动态 import 取干净模块实例；
// Tauri 侧三个模块（plugin-sql / api/core / api/event）全替身，断言只看调用面。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'

const win = window as unknown as Record<string, unknown>

const DB_PATH = '/appdata/shihui/local.db'

/** 迷你库替身：记录每条 execute/select/close，便于按通道数调用次数 */
const h = vi.hoisted(() => {
  interface FakeDb {
    path: string
    executeCalls: string[]
    selectCalls: string[]
    closed: boolean
    execute(sql: string): Promise<{ rowsAffected: number; lastInsertId: number }>
    select<T>(sql: string): Promise<T>
    close(): Promise<boolean>
  }
  const opened: FakeDb[] = []
  const listened: Array<() => void> = []
  const loadedPaths: string[] = []

  function make(path: string): FakeDb {
    const db: FakeDb = {
      path,
      executeCalls: [],
      selectCalls: [],
      closed: false,
      async execute(sql: string) {
        db.executeCalls.push(sql)
        return { rowsAffected: 0, lastInsertId: 1 }
      },
      async select<T>(sql: string): Promise<T> {
        db.selectCalls.push(sql)
        return [] as unknown as T
      },
      async close() {
        db.closed = true
        return true
      }
    }
    opened.push(db)
    return db
  }

  return { opened, listened, loadedPaths, make }
})

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async (path: string) => {
      h.loadedPaths.push(path)
      return h.make(path)
    }
  }
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => (cmd === 'desktop_local_db_path' ? DB_PATH : null))
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, cb: () => void) => {
    h.listened.push(cb)
    return () => {}
  }),
  emit: vi.fn(async () => {})
}))

/** 取一份全新 db.ts 模块实例（单例归零）；须在钉好 __TAURI_INTERNALS__ 之后调用 */
async function freshDbModule(): Promise<typeof import('../bridge/db')> {
  vi.resetModules()
  return await import('../bridge/db')
}

beforeEach(() => {
  h.opened.length = 0
  h.listened.length = 0
  h.loadedPaths.length = 0
  vi.clearAllMocks()
  win.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  delete win.__TAURI_INTERNALS__
})

describe('U45 · 只读通道与读写通道分离', () => {
  it('只读开库：execute 调用 0 次（不建表），select 可用，且与读写通道同库同路径', async () => {
    const { openLocalDbReadOnly } = await freshDbModule()
    const db = await openLocalDbReadOnly()

    expect(h.opened).toHaveLength(1)
    const fake = h.opened[0]
    expect(fake.executeCalls).toHaveLength(0)
    expect(h.loadedPaths).toEqual([`sqlite:${DB_PATH}`])

    await db.select('SELECT * FROM local_orders')
    expect(fake.selectCalls).toEqual(['SELECT * FROM local_orders'])
  })

  it('读写开库：execute 恰好 7 次（7 张建表），证明两条路径分离', async () => {
    const { openLocalDb } = await freshDbModule()
    await openLocalDb()

    expect(h.opened).toHaveLength(1)
    const stmts = h.opened[0].executeCalls
    expect(stmts).toHaveLength(7)
    const tables = stmts.map(s => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1] ?? '')
    expect(tables.sort()).toEqual([
      'local_files',
      'local_img_cache',
      'local_order_time',
      'local_orders',
      'local_profile',
      'local_templates',
      'local_time_log'
    ])
  })

  it('两条单例互不污染：各自只 load 一次，只读通道不被读写通道的建表波及', async () => {
    const { openLocalDb, openLocalDbReadOnly } = await freshDbModule()

    const ro = await openLocalDbReadOnly()
    const roAgain = await openLocalDbReadOnly()
    expect(roAgain).toBe(ro)
    expect(h.opened).toHaveLength(1)

    const rw = await openLocalDb()
    const rwAgain = await openLocalDb()
    expect(rwAgain).toBe(rw)
    expect(h.opened).toHaveLength(2)
    expect(rw).not.toBe(ro)

    // 读写通道建 7 表，只读通道仍零 execute（两条连接各记各的账）
    expect(h.opened[0].executeCalls).toHaveLength(0)
    expect(h.opened[1].executeCalls).toHaveLength(7)
  })

  it('closeLocalDb 关闭两条连接并重置单例，之后两条都可重开（新连接）', async () => {
    const { openLocalDb, openLocalDbReadOnly, closeLocalDb } = await freshDbModule()

    const ro = await openLocalDbReadOnly()
    const rw = await openLocalDb()
    await closeLocalDb()

    expect(h.opened[0].closed).toBe(true)
    expect(h.opened[1].closed).toBe(true)

    const ro2 = await openLocalDbReadOnly()
    const rw2 = await openLocalDb()
    expect(ro2).not.toBe(ro)
    expect(rw2).not.toBe(rw)
    expect(h.opened).toHaveLength(4)
    expect(h.opened[2].closed).toBe(false)
    expect(h.opened[3].closed).toBe(false)
  })

  it('打开失败不缓存单例：只读通道下次可重试', async () => {
    const { openLocalDbReadOnly } = await freshDbModule()

    vi.mocked(invoke).mockRejectedValueOnce(new Error('IPC 未就绪'))
    await expect(openLocalDbReadOnly()).rejects.toThrow('IPC 未就绪')
    expect(h.opened).toHaveLength(0)

    await openLocalDbReadOnly()
    expect(h.opened).toHaveLength(1)
  })

  it('跨窗广播关连接覆盖两条单例（armCloseListener → closeLocalDb）', async () => {
    const { openLocalDb, openLocalDbReadOnly } = await freshDbModule()

    await openLocalDbReadOnly()
    await openLocalDb()
    await vi.waitFor(() => expect(h.listened).toHaveLength(1))

    h.listened[0]()
    await vi.waitFor(() => {
      expect(h.opened[0].closed).toBe(true)
      expect(h.opened[1].closed).toBe(true)
    })
  })

  it('纯浏览器环境：两条通道都抛 BridgeUnavailableError（逃生门不变）', async () => {
    delete win.__TAURI_INTERNALS__
    const { openLocalDb, openLocalDbReadOnly } = await freshDbModule()

    // resetModules 会重评 errors.ts，instanceof 跨模块实例不可靠：按类名 + 能力名断言
    await expect(openLocalDb()).rejects.toMatchObject({
      name: 'BridgeUnavailableError',
      message: expect.stringContaining('openLocalDb')
    })
    await expect(openLocalDbReadOnly()).rejects.toMatchObject({
      name: 'BridgeUnavailableError',
      message: expect.stringContaining('openLocalDbReadOnly')
    })
    expect(h.opened).toHaveLength(0)
  })
})

describe('U45 · 记账 store 走只读通道（真实 db 层串联）', () => {
  it('loadAll(true)：零建表、select 真跑、不被置为不可用', async () => {
    vi.resetModules()
    const { useLocalLedgerStore } = await import('../stores/localLedger')

    const ledger = useLocalLedgerStore(createPinia())
    await ledger.loadAll(true)

    expect(h.opened).toHaveLength(1)
    expect(h.opened[0].executeCalls).toHaveLength(0)
    expect(h.opened[0].selectCalls).toEqual(['SELECT * FROM local_orders ORDER BY id DESC'])
    expect(ledger.unavailable).toBe(false)
    expect(ledger.loaded).toBe(true)
  })

  it('loadAll() 不传参：仍走读写通道并建表（既有调用点行为不变）', async () => {
    vi.resetModules()
    const { useLocalLedgerStore } = await import('../stores/localLedger')

    const ledger = useLocalLedgerStore(createPinia())
    await ledger.loadAll()

    expect(h.opened).toHaveLength(1)
    expect(h.opened[0].executeCalls).toHaveLength(7)
    expect(ledger.unavailable).toBe(false)
  })

  it('一次失败后再成功：unavailable 复位为 false（U45 瞬时竞态可自愈）', async () => {
    vi.resetModules()
    const { useLocalLedgerStore } = await import('../stores/localLedger')

    const ledger = useLocalLedgerStore(createPinia())
    vi.mocked(invoke).mockRejectedValueOnce(new Error('表还没建好'))
    await ledger.loadAll(true)
    expect(ledger.unavailable).toBe(true)
    expect(ledger.loaded).toBe(true)

    await ledger.loadAll(true)
    expect(ledger.unavailable).toBe(false)
    expect(ledger.orders).toEqual([])
  })
})
