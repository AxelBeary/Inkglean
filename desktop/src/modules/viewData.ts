// 模块视图数据供给（档②波17 四件）：拍板一四视图的白名单字段组装。
// 纪律：只给声明过的视图；字段白名单（联系方式类永不出现）；云端视图本地模式返 null（H5）。
import type { LocalOrder } from '../stores/localLedger'
import type { DayTime, DayTimeRow } from '../stores/autoTime'

export interface ViewSources {
  /** 本地记账（local 视图） */
  ledger: LocalOrder[]
  /** 画画时间（time 视图） */
  time: { today: DayTime; week: DayTimeRow[] }
  /** 当前模式（云端视图本地模式不给） */
  mode: 'cloud' | 'local'
  /** 云端订单（cloud 视图；本地模式/未取到为 null） */
  orders?: Array<Record<string, unknown>> | null
  /** 云端留言（cloud 视图；本地模式/未取到为 null） */
  messages?: Array<Record<string, unknown>> | null
}

/** 订单视图白名单字段（client_qq 等联系方式类永不出现） */
const ORDER_FIELDS = ['order_no', 'client_name', 'tier_name', 'status', 'deadline', 'total_price_cents']
const MESSAGE_FIELDS = ['nickname', 'content', 'created_at', 'status']

function pickFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (f in row) out[f] = row[f]
  }
  return out
}

/** 组视图数据（纯函数可测）：未声明/未知视图返 null（壳侧调用前已核声明，此处兜底） */
export function buildViewData(view: string, sources: ViewSources): unknown {
  switch (view) {
    case 'ledger': {
      // 纠形（同 9/4 波1 其余取数口径）：非数组按空数组，永不抛错拖垮壳
      const rows = Array.isArray(sources.ledger) ? sources.ledger : []
      return rows.map(o => ({
        client_name: o.client_name,
        title: o.title,
        price: o.price,
        deadline: o.deadline,
        status: o.status
      }))
    }
    case 'time': {
      // 9/4 波1 冒烟实测根治（波17 遗留缺陷）：原样返 sources.time 会把 Vue 响应式代理直接交给
      // postMessage，结构化克隆拒收 Proxy → DataCloneError，模块永远等不到 time 视图数据、
      // 5 秒后转灰牌（官方示例模块「稿情气象台」正好要 time 视图，一直踩这个坑）。
      // 逐字段拷成素对象：既断掉代理，也把下发字段钉死（不随 store 加字段而外泄）。
      const today = sources.time.today
      const week = Array.isArray(sources.time.week) ? sources.time.week : []
      return {
        today: { paint: today.paint, idle: today.idle, other: today.other },
        week: week.map(r => ({ date: r.date, paint: r.paint, idle: r.idle, other: r.other }))
      }
    }
    case 'orders':
      if (sources.mode !== 'cloud' || !sources.orders) return null
      return sources.orders.map(r => pickFields(r, ORDER_FIELDS))
    case 'messages':
      if (sources.mode !== 'cloud' || !sources.messages) return null
      return sources.messages.map(r => pickFields(r, MESSAGE_FIELDS))
    default:
      return null
  }
}
