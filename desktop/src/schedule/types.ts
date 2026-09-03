// 排期归一形状（9/4 主页重设计落码波1 · 契约层）。
// 云端队列行与本地记账行一律先归一到 SchedOrder，下游纯函数（band/cal/strip）只认它——
// 这是双模式共用一套渲染逻辑的唯一入口，也是「本地模式不调云端接口」纪律的落点。
// 拍板②（9/4 用户当场定）：本地模式按本地记账自建，缺的诚实缺席——
// 记账表没有开工日（start_date），created_at 是「记账时刻」不是开工日，刻意置 null 不参与带区间，
// 本地单在月历上按截稿日单日落格，绝不拿记账日凑区间（那是给画师看假数据）。
import type { QueueRow } from '../api/types'
import type { LocalOrder } from '../stores/localLedger'
// band.ts 对本文件只有 import type（类型边，编译后擦除），故此处运行时引用不成环
import { daysLeft } from './band'

/** 排期统一行：三视图（列表/月历/时间条）与卷尾摘要签共用的唯一形状 */
export interface SchedOrder {
  id: number
  /** 唯一键：云端 cloud-<id> / 本地 local-<id>（防两模式 id 撞车，渲染 v-for 一律用它） */
  key: string
  /** 客户名（云端 client_name || client_qq；本地 client_name） */
  who: string
  /** 内容/档位（云端 tier_name；本地 title） */
  what: string
  /** 原状态串（云端 OrderStatus 七态 / 本地 LocalOrderStatus 四态），文案映射由消费方建表 */
  status: string
  /** 区位（本地一律 formal：记账无缓冲区概念） */
  zone: 'formal' | 'buffer'
  /** 开工日（本地一律 null，见文件头拍板②） */
  startDate: string | null
  deadline: string | null
  /** 下单/确认时刻，作开工日缺失时的带区间回退（本地一律 null） */
  createdAt: string | null
  /** 已完成（云端 delivered|done；本地 delivered|paid） */
  done: boolean
  /** 波1 只读不消费；波2 拖排改期的乐观锁起步值（本地无写路径，恒 undefined） */
  version?: number
}

const CLOUD_DONE = new Set(['delivered', 'done'])
const LOCAL_DONE = new Set(['delivered', 'paid'])

/** 云端：正式区 + 缓冲区归一（保持后端 queue_position 升序，正式区在前）。
 *  纠形纪律（826 教训：分页对象误当裸数组致整页渲染炸）：非数组一律按空数组处理，永不抛错。 */
export function fromQueueRows(formal: QueueRow[], buffer: QueueRow[]): SchedOrder[] {
  const mapZone = (rows: QueueRow[], zone: 'formal' | 'buffer'): SchedOrder[] => {
    if (!Array.isArray(rows)) return []
    return rows.map(r => ({
      id: r.id,
      key: `cloud-${r.id}`,
      who: r.client_name || r.client_qq || '有一位客户',
      what: r.tier_name || '定制',
      status: r.status,
      // 以行自带的 queue_zone 为准，缺则按请求区位落（后端两路口径一致，此处只是自卫）
      zone: r.queue_zone === 'buffer' ? 'buffer' : zone,
      startDate: r.startDate ?? r.start_date ?? null,
      deadline: r.deadline ?? null,
      createdAt: r.created_at ?? null,
      done: CLOUD_DONE.has(r.status),
      version: r.version
    }))
  }
  return [...mapZone(formal, 'formal'), ...mapZone(buffer, 'buffer')]
}

/** 本地：记账行归一。排序口径与 buildLocalDeadlineRows 同款——逾期置顶、无截稿沉底。 */
export function fromLocalOrders(orders: LocalOrder[]): SchedOrder[] {
  if (!Array.isArray(orders)) return []
  const rows: SchedOrder[] = orders.map(o => ({
    id: o.id,
    key: `local-${o.id}`,
    who: o.client_name || '有一单',
    what: o.title || '未写内容',
    status: o.status,
    zone: 'formal',
    startDate: null,
    deadline: o.deadline ?? null,
    createdAt: null,
    done: LOCAL_DONE.has(o.status)
  }))
  return rows.sort((a, b) => (daysLeft(a.deadline) ?? 9999) - (daysLeft(b.deadline) ?? 9999))
}
