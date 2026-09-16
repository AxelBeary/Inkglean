// 本地委托记账（本地核心环波1 · F2）：REQ-014 §F2 口径——客户名/委托类型/价格/截稿日/状态，
// 纯本地不联网；状态流转（草稿→进行中→已交付→已收款）由画师手动单向推进。
// 数据持久化走 bridge/db（SQLite）；纯浏览器环境（vitest/降级）读写全静默为空。
// 归一化纪律与 prefs/timer 同款：坏数据落默认，绝不把异常抛进渲染。
// 时区口径（审计波2 DSK-07）：库里存 UTC ISO 串，**判定一律按本地日历月/日**
// （同 components/home/localGlance.ts 的本地零点归一），不拿 UTC 串前缀比本地月份。
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

/** 时间戳 → 本地月份键 YYYY-MM（纯函数可测，DSK-07）；空串/坏串返 null（不计入任何月，不炸渲染）。
 *  updated_at 存的是 UTC ISO 串，直接用串前缀比本地月份会让东八区每月 1 号 00:00–08:00 的收款算进上月；
 *  这里按本地时区解析后再取年月。纯日期串（无时间与时区，如导入的历史行）按本地日历日直取前缀，
 *  免掉 `new Date('YYYY-MM-DD')` 被当 UTC 零点、负偏移时区整体差一天/差一月的坑。 */
export function localMonthOf(ts: string): string | null {
  if (!ts) return null
  const dateOnly = /^(\d{4})-(\d{2})-\d{2}$/.exec(ts)
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}`
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 本地当月键 YYYY-MM（判定基准与 localMonthOf 同一时区口径） */
function thisMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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

  /** 本月已收款合计（口径：已收款且收款时间在**本地**本月，展示用；DSK-07 按本地日历月判定） */
  const paidThisMonth = computed(() => {
    const ym = thisMonthKey()
    return orders.value
      .filter(o => o.status === 'paid' && localMonthOf(o.updated_at) === ym)
      .reduce((sum, o) => sum + o.price, 0)
  })

  const inProgressCount = computed(() => orders.value.filter(o => o.status === 'in_progress').length)

  return { orders, unavailable, loaded, paidThisMonth, inProgressCount, loadAll, addOrder, advanceStatus }
})
