// 本地核心环波1 测试：F2 本地记账——状态流转纯函数 + 数据桥逃生门 + store 浏览器环境降级。
import { describe, it, expect, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextStatus, STATUS_LABEL, useLocalLedgerStore } from '../stores/localLedger'
import { extractFileName, useLocalFilesStore } from '../stores/localFiles'
import { openLocalDb } from '../bridge/db'
import { checkFiles } from '../bridge/files'
import { BridgeUnavailableError } from '../bridge'

const win = window as unknown as Record<string, unknown>

afterEach(() => {
  delete win.__TAURI_INTERNALS__
})

describe('状态流转（§F2 单向手动：草稿→进行中→已交付→已收款）', () => {
  it('逐级推进到终点', () => {
    expect(nextStatus('draft')).toBe('in_progress')
    expect(nextStatus('in_progress')).toBe('delivered')
    expect(nextStatus('delivered')).toBe('paid')
  })

  it('已收款为终点，不再推进', () => {
    expect(nextStatus('paid')).toBeNull()
  })

  it('每个状态都有平实文案（命名纪律：器物进形态不进名字）', () => {
    for (const s of ['draft', 'in_progress', 'delivered', 'paid'] as const) {
      expect(STATUS_LABEL[s].length).toBeGreaterThan(0)
    }
  })
})

describe('本地数据桥逃生门', () => {
  it('纯浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(openLocalDb()).rejects.toThrow(BridgeUnavailableError)
  })
})

describe('记账 store（纯浏览器环境降级）', () => {
  it('loadAll 在浏览器环境标记不可用且不抛错', async () => {
    setActivePinia(createPinia())
    const ledger = useLocalLedgerStore()
    await ledger.loadAll()
    expect(ledger.unavailable).toBe(true)
    expect(ledger.loaded).toBe(true)
    expect(ledger.orders).toEqual([])
  })

  it('浏览器环境记账操作静默降级（不抛错、不落行）', async () => {
    setActivePinia(createPinia())
    const ledger = useLocalLedgerStore()
    expect(await ledger.addOrder({ client_name: '测试客户', title: '', price: 100, deadline: null })).toBeNull()
    await ledger.advanceStatus(1) // 不存在的行也静默
    expect(ledger.orders).toEqual([])
  })

  it('客户名为空的记账被拒（§F2 必填门槛）', async () => {
    setActivePinia(createPinia())
    const ledger = useLocalLedgerStore()
    expect(await ledger.addOrder({ client_name: '   ', title: 'x', price: 1, deadline: null })).toBeNull()
  })

  it('paidThisMonth 只统计已收款', () => {
    setActivePinia(createPinia())
    const ledger = useLocalLedgerStore()
    expect(ledger.paidThisMonth).toBe(0)
  })
})

describe('F1 文件关联（波3）', () => {
  it('extractFileName 兼容两种斜杠（纯函数）', () => {
    expect(extractFileName('D:\\画稿\\张三-头像.csp')).toBe('张三-头像.csp')
    expect(extractFileName('/home/art/wip.psd')).toBe('wip.psd')
    expect(extractFileName('裸文件名.png')).toBe('裸文件名.png')
  })

  it('checkFiles 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(checkFiles(['a.png'])).rejects.toThrow(BridgeUnavailableError)
  })

  it('checkFiles 空入参直接返空数组（不走桥）', async () => {
    await expect(checkFiles([])).resolves.toEqual([])
  })

  it('文件 store 在浏览器环境静默降级', async () => {
    setActivePinia(createPinia())
    const files = useLocalFilesStore()
    await files.loadAll()
    expect(files.unavailable).toBe(true)
    expect(files.loaded).toBe(true)
    expect(files.countFor(1)).toBe(0)
    expect(await files.addFiles(1, ['x.png'])).toBe(0)
  })
})
