// 桌面端云端响应类型（方向 A 落码批）
// 同名接口照主仓 web/src/api/types.ts 抄入（派工口径：类型照抄，桌面端自带一份，不跨包引用）。
// 仅收录四板块 + 挂牌消费的接口形状；命名约定与主仓一致（实体 snake_case / 显式映射 camelCase）。

// ─── 通用分页 ───

/** 标准分页包裹（与主仓同名同形） */
export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface SimpleSuccessResult {
  success: true
}

// ─── 画师状态（挂牌） ───

export type ArtistStatus = 'open' | 'full' | 'break' | 'hidden'

// ─── today 今日要办 ───

/** GET /artist/dashboard/schedule 近 7 日排期条（主仓同名抄入） */
export interface ScheduleBar {
  id: number
  orderNo: string
  clientName: string | null
  status: string
  startDate: string | null
  deadline: string | null
  stageName: string | null
  /** E1 补全（清扫批）：画风/尺寸名，旧单无 style_size_id 时为 null */
  styleName: string | null
  sizeName: string | null
}

export interface ScheduleResult {
  bars: ScheduleBar[]
}

/** GET /artist/dashboard/todo 待办项（主仓同名抄入） */
export interface TodoItem {
  id: number
  orderNo: string
  clientName: string | null
  status: string
  deadline: string | null
  tag: string
  /** E3: 当前工作流节点名（后端增补字段；旧服务端/无节点时缺失或 null，前端降级为既有措辞） */
  stageName?: string | null
  /** 815 审计 P1-2: 当前工作流节点 id（无节点/旧服务端时缺失或 null） */
  currentStageId?: number | null
  /** 815 审计 P1-2: 下一节点 id（已是末节点/无流程时为 null，待办推进用） */
  nextStageId?: number | null
}

export interface TodoResult {
  items: TodoItem[]
}

// ─── ops 经营 ───

/** 自定义首页批二：收入概览板块数据源（到账与导出 CSV 同源同口径，主仓同名抄入） */
export interface IncomeOverview {
  monthReceivedCents: number
  yearReceivedCents: number
  pendingCents: number
  pendingCount: number
}

export interface RevenueBar {
  label: string
  cents: number
  count: number
}

/** GET /artist/dashboard/revenue 响应（主仓同名抄入） */
export interface RevenueResult {
  period: string
  bars: RevenueBar[]
  summary: {
    totalCents: number
    completedCount: number
    changePercent: number | null
  }
}

/** GET /artist/stats 响应（order-stats.service.ts，主仓同名抄入） */
export interface ArtistStats {
  pendingCount: number
  activeCount: number
  monthRevenue: number
  monthRevenueCents: number
  totalCompleted: number
  todayNewOrderCents: number
  todayNewOrderCount: number
  todayRevenueCents: number
  todayRevenueCount: number
  todayTodoCount: number
}

// ─── msgs 留言 ───

/** 画师/管理端留言行（snake_case 实体，主仓同名抄入） */
export interface GuestbookMessage {
  id: number
  artist_id: number
  nickname: string
  content: string
  language: string
  status: 'pending' | 'approved' | 'rejected'
  artist_reply: string | null
  replied_at: string | null
  deleted_by_admin: number
  created_at: string
}

/** 留言审核/回复通用结果（主仓同名抄入） */
export type GuestbookActionResult = GuestbookMessage

// ─── orders 订单速览 ───

export type OrderStatus = 'pending' | 'confirmed' | 'wip' | 'revision' | 'done' | 'delivered' | 'cancelled'
export type OrderPriority = 'high' | 'medium' | 'low'

/** 订单基础行（orders 表全列，主仓同名抄入） */
export interface Order {
  id: number
  order_no: string
  artist_id: number
  style_size_id: number | null
  client_qq: string
  client_name: string | null
  description: string | null
  priority: OrderPriority
  status: OrderStatus
  source: 'self' | 'manual'
  client_notify: number
  queue_position: number | null
  completed_at: string | null
  price_snapshot: number | null
  total_price_cents: number | null
  queue_zone: 'formal' | 'buffer'
  current_stage_id: number | null
  deadline: string | null
  paid_total_cents: number
  version: number
  created_at: string
  updated_at: string
}

/** 订单列表/队列行（主仓同名抄入；速览只消费基础字段） */
export type ArtistOrderItem = Order & {
  tier_name: string | null
  tier_price: number | null
  /** 817-D 7-7：焦点参考图路径（速览不用） */
  focus_image_path?: string | null
  focusImageUrl?: string
}

/** GET /artist/orders 分页响应（主仓同名抄入） */
export type ArtistOrdersResult = PagedResult<ArtistOrderItem>

/** 自定义首页批二：截稿倒计时条目（daysLeft 负数=已逾期，主仓同名抄入） */
export interface DeadlineSoonItem {
  id: number
  orderNo: string
  clientName: string | null
  deadline: string
  daysLeft: number
}

export interface DeadlineSoonResult {
  items: DeadlineSoonItem[]
}

// ─── schedule 排期（9/4 主页重设计落码波1：三视图只读数据源）───

/** 队列行（GET /api/artist/queue，**返回裸数组**非分页对象）。
 *  字段照 server `order-queue.service.getArtistQueue` 显式列清单 + `order-list.routes` 的
 *  startDate/currentStageId 驼峰映射抄入；只声明桌面端消费的列（端点其余列存在但本端不消费）。 */
export interface QueueRow {
  id: number
  order_no: string
  client_name: string | null
  client_qq: string
  status: OrderStatus
  queue_zone: 'formal' | 'buffer'
  queue_position: number | null
  deadline: string | null
  start_date: string | null
  /** 路由层驼峰副本（= start_date），前端消费它不消费 snake_case */
  startDate: string | null
  created_at: string
  tier_name: string | null
  /** 波1 只读不消费；波2 拖排改期的乐观锁起步值 */
  version: number
}

/** 画师本人资料（GET /api/artist/profile）。名额结构化字段供「能否接单」复刻——
 *  9/3 回流批网页端 F11 同源口径：用结构化字段算，**不匹配后端中文文案**（防后端改词即崩）。 */
export interface ArtistProfile {
  status: string
  name: string
  subdomain: string | null
  slotDisplay?: string | null
  messagesEnabled?: boolean
  batch_limit?: number | null
  buffer_limit?: number | null
  monthly_quota?: number | null
  quotaInfo?: { used: number; quota: number | null; remaining: number | null } | null
}
