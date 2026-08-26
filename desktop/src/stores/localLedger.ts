// 本地委托记账（本地核心环波1 · F2）：REQ-014 §F2 口径——客户名/委托类型/价格/截稿日/状态，
// 纯本地不联网；状态流转（草稿→进行中→已交付→已收款）由画师手动单向推进。
// 数据持久化走 bridge/db（SQLite）；纯浏览器环境（vitest/降级）读写全静默为空。
// 归一化纪律与 prefs/timer 同款：坏数据落默认，绝不把异常抛进渲染。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { openLocalDb } from '../bridge/db'
import { isDesktop } from '../bridge'

/** 状态流转（单向手动，§F2 拍板口径） */
export type LocalOrderStatus = 'draft' | 'in_progress' | 'delivered' | 'paid'

export const STATUS_LABEL: Record<LocalOrderStatus, string> = {
  draft: '草稿',
  in_progress: '进行中',
  delivered: '已交付',
  paid: '已收款'
}

/** 下一状态；已收款为终点返回 null（纯函数，单测覆盖） */
export function nextStatus(s: LocalOrderStatus): LocalOrderStatus | null {
  switch (s) {
    case 'draft': return 'in_progress'
    case 'in_progress': return 'delivered'
    case 'delivered': return 'paid'
    case 'paid': return null
  }
}

export interface LocalOrder {
  id: number
  client_name: string
  title: string
  price: number
  deadline: string | null
  status: LocalOrderStatus
  created_at: string
  updated_at: string
}

export interface NewLocalOrder {
  client_name: string
  title: string
  price: number
  deadline: string | null
}

function isStatus(v: unknown): v is LocalOrderStatus {
  return v === 'draft' || v === 'in_progress' || v === 'delivered' || v === 'paid'
}

/** 行归一化：坏形状落安全默认（渲染永不因单行脏数据炸） */
function normalizeRow(raw: Record<string, unknown>): LocalOrder {
  const price = typeof raw.price === 'number' && Number.isFinite(raw.price) ? raw.price : 0
  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    client_name: typeof raw.client_name === 'string' ? raw.client_name : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    price,
    deadline: typeof raw.deadline === 'string' && raw.deadline !== '' ? raw.deadline : null,
    status: isStatus(raw.status) ? raw.status : 'draft',
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : ''
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

export const useLocalLedgerStore = defineStore('desktop-local-ledger', () => {
  const orders = ref<LocalOrder[]>([])
  /** 数据层不可用（纯浏览器/打开失败）：面板退为一行诚实提示 */
  const unavailable = ref(false)
  const loaded = ref(false)

  async function loadAll(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; loaded.value = true; return }
    try {
      const db = await openLocalDb()
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM local_orders ORDER BY id DESC'
      )
      orders.value = rows.map(normalizeRow)
    } catch {
      unavailable.value = true
    } finally {
      loaded.value = true
    }
  }

  /** 记一笔：客户名为必填门槛（其余宽进），成功返回新行 */
  async function addOrder(input: NewLocalOrder): Promise<LocalOrder | null> {
    const name = input.client_name.trim()
    if (!name) return null
    const price = Number.isFinite(input.price) && input.price >= 0 ? input.price : 0
    const ts = nowIso()
    try {
      const db = await openLocalDb()
      const result = await db.execute(
        'INSERT INTO local_orders (client_name, title, price, deadline, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [name, input.title.trim(), price, input.deadline, 'draft', ts, ts]
      )
      const row: LocalOrder = {
        id: result.lastInsertId ?? 0,
        client_name: name,
        title: input.title.trim(),
        price,
        deadline: input.deadline,
        status: 'draft',
        created_at: ts,
        updated_at: ts
      }
      orders.value = [row, ...orders.value]
      return row
    } catch {
      return null
    }
  }

  /** 状态推进一步（单向手动）；终点（已收款）不再推进 */
  async function advanceStatus(id: number): Promise<void> {
    const row = orders.value.find(o => o.id === id)
    if (!row) return
    const next = nextStatus(row.status)
    if (!next) return
    const ts = nowIso()
    try {
      const db = await openLocalDb()
      await db.execute('UPDATE local_orders SET status = $1, updated_at = $2 WHERE id = $3', [next, ts, id])
      orders.value = orders.value.map(o => (o.id === id ? { ...o, status: next, updated_at: ts } : o))
    } catch {
      // 写失败：界面态不动，下次重开自愈
    }
  }

  /** 本月已收款合计（口径：已收款且收款时间在本月，展示用） */
  const paidThisMonth = computed(() => {
    const n = new Date()
    const ym = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
    return orders.value
      .filter(o => o.status === 'paid' && o.updated_at.startsWith(ym))
      .reduce((sum, o) => sum + o.price, 0)
  })

  const inProgressCount = computed(() => orders.value.filter(o => o.status === 'in_progress').length)

  return { orders, unavailable, loaded, paidThisMonth, inProgressCount, loadAll, addOrder, advanceStatus }
})
