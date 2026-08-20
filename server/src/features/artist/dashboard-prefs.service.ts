import db from '../../db/connection.js'

// ============================================
// 仪表盘自定义偏好服务（「自定义我的首页」批一骨架，v70）
//
// 存储：artists.dashboard_prefs JSON（schema v1；NULL=默认布局）
// 鲁棒性优先纪律（用户拍板：严防屎山）：
// - 任何非法/陈旧/缺字段数据一律逐字段归一化回落默认，永不抛错、永不透传脏值；
// - schema 版本号随结构升级递增，读旧版本按字段尽力归一（本版本 v=1 全量落默认亦可接受）；
// - 多设备冲突口径：后写覆盖先写（不做合并）。
//
// 吞并旧 dashboard_modules（视觉批 P2 四开关）：
// - 读：prefs 为空时把旧开关 false→hidden 合并进默认偏好；
// - 写：保存 prefs 成功后旧列置 NULL（旧信息已含在 hidden，单一事实源）。
// ============================================

export const PREFS_SCHEMA_VERSION = 1

/** 批一基础板块（10 块） */
export const CORE_MODULES = [
  'greet', 'plaque', 'stats', 'schedule', 'todo', 'guestbook', 'activity', 'announcement', 'onboarding', 'quick'
] as const
export type CoreModule = typeof CORE_MODULES[number]

/** 批二可选板块（板块库：默认不上首页，画师自愿添加；收入类与旧拍板「钱不进日报」并存：默认不见钱） */
export const OPTIONAL_MODULES = ['incomeChart', 'incomeMonth', 'ddlSoon'] as const

/** 全部已知板块（归一化白名单 = 基础 + 可选） */
export const ALL_MODULES: readonly string[] = [...CORE_MODULES, ...OPTIONAL_MODULES]

/** 默认横跨整行的板块（其余默认半行；收入趋势图同属长卡；问候卡默认半行——用户 2026-08-21 拍板） */
const DEFAULT_FULL: readonly string[] = ['stats', 'schedule', 'incomeChart']
/** 支持「显示行数」的列表板块（截稿倒计时同为列表型） */
const DENSITY_MODULES: readonly string[] = ['todo', 'guestbook', 'activity', 'ddlSoon']
const SCHEDULE_STYLES = ['bars', 'ledger', 'ptags', 'waybill'] as const
const GREET_STYLES = ['plain', 'seal', 'ribbon', 'rule'] as const
const PAGE_ALIGNS = ['left', 'center', 'full'] as const
const DENSITY_STEPS: readonly number[] = [0, 3, 5] // 0 = 全部
const PAGE_MAX_MIN = 1000
const PAGE_MAX_MAX = 1680
const PAGE_MAX_DEFAULT = 1200

export interface DashboardPrefs {
  v: number
  /** 板块顺序（恰好是 CORE_MODULES 的一个排列，含未来扩展 id 时补齐） */
  order: string[]
  /** 隐藏的板块 id */
  hidden: string[]
  /** 宽度档位 half/full（缺省取默认：greet/stats/schedule=full 其余 half） */
  width: Record<string, 'half' | 'full'>
  /** 列表卡显示行数 0/3/5（0=全部） */
  density: Record<string, number>
  /** 排期块款式 */
  scheduleStyle: typeof SCHEDULE_STYLES[number]
  /** 问候卡款式 */
  greetStyle: typeof GREET_STYLES[number]
  /** 页面位置三档：left/center/full */
  pageAlign: typeof PAGE_ALIGNS[number]
  /** 页面最大宽度（仅 left/center 档生效） */
  pageMax: number
}

export function defaultPrefs(): DashboardPrefs {
  const width: Record<string, 'half' | 'full'> = {}
  for (const m of ALL_MODULES) width[m] = DEFAULT_FULL.includes(m) ? 'full' : 'half'
  const density: Record<string, number> = {}
  for (const m of DENSITY_MODULES) density[m] = 0
  return {
    v: PREFS_SCHEMA_VERSION,
    order: [...CORE_MODULES],
    // 可选板块默认藏起（板块库机制：自愿添加才上首页）
    hidden: [...OPTIONAL_MODULES],
    width,
    density,
    scheduleStyle: 'bars',
    greetStyle: 'plain',
    pageAlign: 'center',
    pageMax: PAGE_MAX_DEFAULT
  }
}

const ALL_SET: ReadonlySet<string> = new Set(ALL_MODULES)

/**
 * 归一化任意输入为合法 prefs——鲁棒性核心：
 * 每个字段独立校验，非法即落该字段默认，绝不整体报错、绝不透传脏值。
 * order/hidden：过滤未知 id + 去重，order 缺失 id 按默认顺序补齐尾部。
 */
export function normalizePrefs(raw: unknown): DashboardPrefs {
  const d = defaultPrefs()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d
  const obj = raw as Record<string, unknown>

  if (Array.isArray(obj.order)) {
    const seen = new Set<string>()
    const order: string[] = []
    for (const id of obj.order) {
      if (typeof id === 'string' && ALL_SET.has(id) && !seen.has(id)) {
        seen.add(id)
        order.push(id)
      }
    }
    // 缺失的基础板块补尾部（可选板块不自动补——未添加即不在首页）
    for (const m of CORE_MODULES) if (!seen.has(m)) order.push(m)
    d.order = order
  }

  if (Array.isArray(obj.hidden)) {
    const seen = new Set<string>()
    const hidden: string[] = []
    for (const id of obj.hidden) {
      if (typeof id === 'string' && ALL_SET.has(id) && !seen.has(id)) {
        seen.add(id)
        hidden.push(id)
      }
    }
    d.hidden = hidden
  }

  if (obj.width && typeof obj.width === 'object' && !Array.isArray(obj.width)) {
    for (const [k, v] of Object.entries(obj.width as Record<string, unknown>)) {
      if (ALL_SET.has(k) && (v === 'half' || v === 'full')) d.width[k] = v
    }
  }

  if (obj.density && typeof obj.density === 'object' && !Array.isArray(obj.density)) {
    for (const [k, v] of Object.entries(obj.density as Record<string, unknown>)) {
      if (DENSITY_MODULES.includes(k) && typeof v === 'number' && DENSITY_STEPS.includes(v)) {
        d.density[k] = v
      }
    }
  }

  if (typeof obj.scheduleStyle === 'string' && (SCHEDULE_STYLES as readonly string[]).includes(obj.scheduleStyle)) {
    d.scheduleStyle = obj.scheduleStyle as DashboardPrefs['scheduleStyle']
  }
  if (typeof obj.greetStyle === 'string' && (GREET_STYLES as readonly string[]).includes(obj.greetStyle)) {
    d.greetStyle = obj.greetStyle as DashboardPrefs['greetStyle']
  }
  if (typeof obj.pageAlign === 'string' && (PAGE_ALIGNS as readonly string[]).includes(obj.pageAlign)) {
    d.pageAlign = obj.pageAlign as DashboardPrefs['pageAlign']
  }
  if (typeof obj.pageMax === 'number' && Number.isFinite(obj.pageMax)) {
    d.pageMax = Math.min(PAGE_MAX_MAX, Math.max(PAGE_MAX_MIN, Math.round(obj.pageMax)))
  }

  return d
}

/** 旧 dashboard_modules 开关 false→hidden（吞并读路径） */
function legacyHidden(legacyRaw: string | null): string[] {
  if (!legacyRaw) return []
  try {
    const obj = JSON.parse(legacyRaw) as Record<string, unknown>
    if (!obj || typeof obj !== 'object') return []
    const hidden: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      if (v === false && ALL_SET.has(k)) hidden.push(k)
    }
    return hidden
  } catch {
    return []
  }
}

/**
 * 读取偏好（归一化后返回）：
 * - 有 prefs → 逐字段归一化；
 * - 无 prefs 但有旧开关 → 默认 + 旧 false 项进 hidden（吞并迁移读路径，不落写）；
 * - 都没有 → 默认。
 */
export function getDashboardPrefs(artistId: number): DashboardPrefs {
  const row = db.prepare('SELECT dashboard_prefs, dashboard_modules FROM artists WHERE id = ?')
    .get(artistId) as { dashboard_prefs: string | null; dashboard_modules: string | null } | undefined
  if (!row) return defaultPrefs()

  if (row.dashboard_prefs) {
    let raw: unknown = null
    try {
      raw = JSON.parse(row.dashboard_prefs)
    } catch {
      raw = null // 坏 JSON = 全落默认
    }
    return normalizePrefs(raw)
  }

  const prefs = defaultPrefs()
  const lh = legacyHidden(row.dashboard_modules)
  if (lh.length > 0) prefs.hidden = lh
  return prefs
}

/**
 * 保存偏好（归一化后入库；同时把旧 dashboard_modules 置 NULL 完成吞并）。
 * 多设备冲突口径：后写覆盖先写。
 */
export function saveDashboardPrefs(artistId: number, input: unknown): DashboardPrefs {
  const prefs = normalizePrefs(input)
  db.prepare('UPDATE artists SET dashboard_prefs = ?, dashboard_modules = NULL WHERE id = ?')
    .run(JSON.stringify(prefs), artistId)
  return prefs
}
