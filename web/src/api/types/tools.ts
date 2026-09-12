// API 边界 DTO · 画师工具（客户标记/散单/收入趋势与排名）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 画师工具（tools.service.ts） ───

/** 客户标记（画师私有） */
export interface ClientProfile {
  id: number
  clientQq: string
  tags: string[]
  note: string
}

/** 客户消费汇总 */
export interface ClientSummary {
  clientQq: string
  totalOrders: number
  totalPaidCents: number
  lastOrderAt: string | null
  lastOrderStatus: string | null
}

/** 老客召回行（>days 天未下单） */
export type ReturningClient = ClientSummary & { daysSinceLastOrder: number }

export interface ToolsClientsResult {
  items: ClientProfile[]
}

export interface ToolsClientResult {
  profile: ClientProfile | null
  summary: ClientSummary | null
}

export interface SaveToolsClientResult {
  profile: ClientProfile
}

export interface OkResult {
  ok: true
}

export interface ReturningClientsResult {
  items: ReturningClient[]
}

/** 散单记账行 */
export interface StandaloneIncome {
  id: number
  amountCents: number
  clientName: string
  note: string
  incomeDate: string
}

export interface StandaloneIncomesResult {
  items: StandaloneIncome[]
}

export interface CreateStandaloneIncomeResult {
  item: StandaloneIncome
}

/** GET /artist/tools/income-summary 响应（t1 围剿：概览口径对齐导出 CSV——订单收款+散单） */
export interface IncomeSummaryResult {
  orderIncomeCents: number
  standaloneIncomeCents: number
  totalCents: number
  from: string
  to: string
}

/** 客户标记写请求（REQ-035 批A） */
export interface SaveToolsClientRequest {
  tags?: string[]
  note?: string
}

/** POST /artist/tools/standalone-incomes 请求体 */
export interface CreateStandaloneIncomeRequest {
  amountCents: number
  clientName: string
  note: string
  incomeDate: string
}

/** oimimo 吸纳批四：月度收入行（GET /api/artist/tools/income-monthly，与 income-summary 同源同口径） */
export interface IncomeMonthRow {
  /** 月份键 YYYY-MM（本地时区） */
  month: string
  /** 订单收款（分，按到账日归属本地月，含退款负数） */
  orderCents: number
  /** 散单记账（分） */
  standaloneCents: number
  /** 合计（分） */
  totalCents: number
}

/** GET /api/artist/tools/income-monthly 响应 */
export interface IncomeMonthlyResult {
  months: IncomeMonthRow[]
}

/** oimimo 吸纳补遗：画风收入分布行（GET /api/artist/tools/income-by-style） */
export interface IncomeByStyleRow {
  /** 画风名；空串 = 无画风关联（手动录单等），前端落「未分类」桶 */
  styleName: string
  cents: number
}

/** GET /api/artist/tools/income-by-style 响应 */
export interface IncomeByStyleResult {
  styles: IncomeByStyleRow[]
}

/** oimimo 吸纳补遗：客户消费排名行（GET /api/artist/tools/top-clients） */
export interface TopClientRow {
  clientQq: string
  /** 可能为 null（未填昵称），前端回落 QQ */
  clientName: string | null
  totalCents: number
  orderCount: number
}

/** GET /api/artist/tools/top-clients 响应 */
export interface TopClientsResult {
  clients: TopClientRow[]
}
