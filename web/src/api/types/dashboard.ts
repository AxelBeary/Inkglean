// API 边界 DTO · 仪表盘（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 仪表盘（dashboard.service.ts） ───

export interface RevenueBar {
  label: string
  cents: number
  count: number
}

/** GET /artist/dashboard/revenue 响应 */
export interface RevenueResult {
  period: string
  bars: RevenueBar[]
  summary: {
    totalCents: number
    completedCount: number
    changePercent: number | null
  }
}

/** GET /artist/dashboard/todo 待办项 */
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

/** GET /artist/dashboard/schedule 近 7 日排期条（视觉批卷轴数据源） */
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

/** 自定义首页批一（v70）：仪表盘布局偏好（服务端归一化 schema v1，GET 永远返回完整合法值） */
export interface DashboardPrefs {
  v: number
  /** 板块顺序（基础 9 块的排列） */
  order: string[]
  /** 隐藏的板块 id */
  hidden: string[]
  /** 宽度档位 half/full */
  width: Record<string, 'half' | 'full'>
  /** 列表卡显示行数 0/3/5（0=全部） */
  density: Record<string, number>
  /** 排期块款式 */
  scheduleStyle: 'bars' | 'ledger' | 'ptags' | 'waybill'
  /** 问候卡款式 */
  greetStyle: 'plain' | 'seal' | 'ribbon' | 'rule'
  /** 页面位置三档 */
  pageAlign: 'left' | 'center' | 'full'
  /** 页面最大宽度（仅 left/center 档生效，1000〜1680） */
  pageMax: number
}

/** 自定义首页批二：收入概览板块数据源（到账与导出 CSV 同源同口径） */
export interface IncomeOverview {
  monthReceivedCents: number
  yearReceivedCents: number
  pendingCents: number
  pendingCount: number
}

/** 自定义首页批二：截稿倒计时条目（daysLeft 负数=已逾期） */
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

/** GET /artist/dashboard/activity 活动项 */
export interface ActivityItem {
  id: number
  orderId: number
  orderNo: string
  content: string
  createdAt: string
}

export interface ActivityResult {
  items: ActivityItem[]
}
