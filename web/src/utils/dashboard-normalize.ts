// ============================================
// 仪表盘纯逻辑函数（从 SFC 提取，可独立测试）
// v0.18 第三批技术债：前端测试基建
// ============================================

// ─── 收入统计（RevenueChart） ───

/** 收入统计单条柱状数据（后端字段口径多版本兼容） */
interface RevenueBar {
  label?: string
  name?: string
  key?: string
  cents?: number
  amountCents?: number
  amount?: number
  totalCents?: number
}

/** 收入统计 API 原始返回（已对齐三号 dashboard.service.js 实际字段） */
interface RevenueRaw {
  bars?: RevenueBar[] | null
  data?: RevenueBar[] | null
  buckets?: RevenueBar[] | null
  summary?: {
    totalCents?: number
    completedCount?: number | null
    orderCount?: number | null
    changePercent?: number | null
    changePct?: number | null
  } | null
  totalCents?: number
  total?: number
  orderCount?: number | null
  completedCount?: number | null
  changePct?: number | null
  momChange?: number | null
  prevLabel?: string
}

/**
 * 归一化后端收入统计返回（已对齐三号 dashboard.service.js 实际字段）
 * @param {object} raw - API 原始返回
 * @param {'month'|'quarter'|'year'} period - 当前维度
 * @param {string} locale - 当前语言（'zh-CN' | 'en'）
 * @returns {{ bars: Array<{label: string, cents: number}>, summary: object }}
 */
export function normalizeRevenue(raw: RevenueRaw | null | undefined, period: 'month' | 'quarter' | 'year', locale: string) {
  const list = raw?.bars || raw?.data || raw?.buckets || []
  const bars = list.map(b => ({
    label: b.label ?? b.name ?? b.key ?? '',
    cents: b.cents ?? b.amountCents ?? b.amount ?? b.totalCents ?? 0
  }))
  const s = raw?.summary || {}
  return {
    bars,
    summary: {
      totalCents: s.totalCents ?? raw?.totalCents ?? raw?.total ?? 0,
      orderCount: s.completedCount ?? s.orderCount ?? raw?.orderCount ?? raw?.completedCount ?? null,
      changePct: s.changePercent ?? s.changePct ?? raw?.changePct ?? raw?.momChange ?? null,
      prevLabel: raw?.prevLabel ?? prevPeriodLabel(period, locale)
    }
  }
}

/**
 * 环比标签：后端未返回 prevLabel 时，前端按维度计算上一周期名称
 * @param {'month'|'quarter'|'year'} period
 * @param {string} locale
 * @returns {string}
 */
export function prevPeriodLabel(period: 'month' | 'quarter' | 'year', locale: string): string {
  const now = new Date()
  if (period === 'month') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return prev.toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'long' })
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return q === 0 ? `Q4 ${now.getFullYear() - 1}` : `Q${q}`
  }
  return String(now.getFullYear() - 1)
}

// ─── 合并待办列表（TodoList） ───

/** 后端中文标签 → i18n 键后缀映射 */
export const TAG_KEY_MAP: Record<string, string> = { '逾期': 'overdue', '截稿': 'dueToday', '新单': 'pending', '修改': 'revision', '进行中': 'inProgress' }

/**
 * 标签键映射：后端返回中文标签时映射为英文 i18n 键；英文键直接透传
 * @param {string} tag
 * @returns {string}
 */
export function tagKey(tag: string | null | undefined): string {
  return TAG_KEY_MAP[tag ?? ''] || tag || 'inProgress'
}

/** 待办订单项（后端字段口径多版本兼容） */
interface TodoItem {
  id?: number | string
  order_no?: string | null
  orderNo?: string | null
  client_name?: string | null
  clientName?: string | null
  status?: string | null
  deadline?: string | null
  tag?: string | null
  label?: string | null
}

/**
 * 兜底：后端未返回 tag 时前端按状态推断（向后兼容）
 * @param {object} o - 订单对象（含 status, deadline）
 * @returns {string}
 */
export function guessTag(o: TodoItem): string {
  if (o.status === 'pending') return 'pending'
  if (o.status === 'revision') return 'revision'
  if (o.deadline) {
    const d = new Date(o.deadline)
    const now = new Date()
    const dayDiff = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
        - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000
    )
    if (dayDiff < 0) return 'overdue'
    if (dayDiff === 0) return 'dueToday'
  }
  return 'inProgress'
}

/**
 * 归一化后端待办列表返回
 * @param {object} raw - API 原始返回
 * @returns {Array}
 */
export function normalizeTodo(raw: { items?: TodoItem[] | null, todos?: TodoItem[] | null } | TodoItem[] | null | undefined) {
  const list = Array.isArray(raw) ? raw : (raw?.items || raw?.todos || [])
  return (Array.isArray(list) ? list : []).map(o => ({
    id: o.id,
    order_no: o.order_no ?? o.orderNo ?? '',
    client_name: o.client_name ?? o.clientName ?? '',
    status: o.status ?? '',
    deadline: o.deadline ?? null,
    tag: tagKey(o.tag ?? o.label ?? guessTag(o))
  }))
}

// ─── 最近活动流（ActivityFeed） ───

/** 活动流条目（后端字段口径多版本兼容） */
interface ActivityItem {
  id?: number | string
  orderId?: number | string | null
  order_id?: number | string | null
  orderNo?: string | null
  order_no?: string | null
  content?: string | null
  description?: string | null
  text?: string | null
  event?: string | null
  createdAt?: string | null
  created_at?: string | null
}

/**
 * 归一化后端活动流返回（已对齐三号 dashboard.service.js：content 字段）
 * @param {object} raw - API 原始返回
 * @returns {Array}
 */
export function normalizeActivity(raw: { items?: ActivityItem[] | null, activities?: ActivityItem[] | null } | ActivityItem[] | null | undefined) {
  const list = Array.isArray(raw) ? raw : (raw?.items || raw?.activities || [])
  return (Array.isArray(list) ? list : []).slice(0, 10).map(a => ({
    id: a.id,
    orderId: a.orderId ?? a.order_id ?? null,
    orderNo: a.orderNo ?? a.order_no ?? '',
    description: a.content ?? a.description ?? a.text ?? a.event ?? '',
    createdAt: a.createdAt ?? a.created_at ?? null
  }))
}

/**
 * 相对时间格式化（前端计算，验收 4.6）
 * @param {string} isoStr - ISO 时间字符串
 * @param {Function} t - i18n t 函数
 * @param {string} locale - 当前语言
 * @returns {string}
 */
export function relativeTime(isoStr: string, t: (key: string, params?: Record<string, number>) => string, locale: string): string {
  if (!isoStr) return ''
  // P2-#15 / a3: SQLite 空格格式补 T 并追加 Z（与 datetime.js 对齐），避免浏览器当本地时间解析（时区偏差 8h）
  const normalized = isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z'
  const diffMs = Date.now() - new Date(normalized).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return t('dashboard.timeJustNow')
  if (mins < 60) return t('dashboard.timeMinutesAgo', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('dashboard.timeHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('dashboard.timeDaysAgo', { n: days })
  // 超过 30 天显示日期
  return new Date(normalized).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
}
