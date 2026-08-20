// ============================================
// 自定义首页批一（v70）：仪表盘布局偏好解析（纯函数层，可单测）
//
// 形状契约：DashboardPrefs 钉死在 web/src/api/types.ts（GET 永远返回服务端归一化后的合法值）；
// 本层只做「拉取失败回落 / 字段缺省兜底」的防御性解析，永不抛错、永不透传脏值。
//
// 默认值镜像 server/src/features/artist/dashboard-prefs.service.ts：
// - 顺序 = CORE_MODULES（10 块）；隐藏 = 空；
// - 宽度 = greet/stats/schedule 默认 full，其余 half；
// - 密度 = todo/guestbook/activity 默认 0（全部）。
//
// 批二字段（scheduleStyle/greetStyle/pageAlign/pageMax）本批一律不消费——见批二注释。
// ============================================

import type { DashboardPrefs } from '../api/types'

/** 批一+批二全部板块 13 块（镜像服务端 CORE_MODULES+OPTIONAL_MODULES；types.ts 只钉类型无常量，前端自钉一份） */
export const DASHBOARD_PANEL_IDS = [
  'greet', 'plaque', 'stats', 'schedule', 'todo', 'guestbook', 'activity', 'announcement', 'onboarding', 'quick',
  'incomeChart', 'incomeMonth', 'ddlSoon'
] as const
export type DashboardPanelId = (typeof DASHBOARD_PANEL_IDS)[number]

/** 基础板块 10 块（默认在首页；可选板块不自动补——未添加即不在首页） */
export const CORE_PANEL_IDS: readonly DashboardPanelId[] = DASHBOARD_PANEL_IDS.slice(0, 10)

/** 默认横跨整行的板块（其余默认半行；对齐服务端 DEFAULT_FULL，收入趋势图同属长卡） */
export const DEFAULT_FULL_PANELS: readonly DashboardPanelId[] = ['greet', 'stats', 'schedule', 'incomeChart']

/** 支持「显示行数」density 的列表板块（对齐服务端 DENSITY_MODULES，ddlSoon 属批二） */
export const DENSITY_PANELS: readonly DashboardPanelId[] = ['todo', 'guestbook', 'activity', 'ddlSoon']

/** density 合法档位（0 = 全部） */
const DENSITY_STEPS: readonly number[] = [0, 3, 5]

/** 解析后的单个板块（渲染层直接消费） */
export interface ResolvedPanel {
  id: DashboardPanelId
  /** half = 自动流进两列；full = 横跨整行（grid-column: 1 / -1） */
  width: 'half' | 'full'
  /** 列表板块行数上限（0 = 全部）；非 DENSITY_PANELS 恒 0 */
  maxRows: number
}

/** id 是否属于全部 13 块（未知 id 一律丢弃，防 prefs 夹带未来/脏 id） */
export function isDashboardPanelId(id: unknown): id is DashboardPanelId {
  return typeof id === 'string' && (DASHBOARD_PANEL_IDS as readonly string[]).includes(id)
}

/**
 * 板块宽度：prefs.width[id] 合法则取之；缺省/非法落默认（greet/stats/schedule=full，其余 half）。
 * prefs 为 null（拉取失败回落）时全部走默认。
 */
export function resolvePanelWidth(prefs: DashboardPrefs | null | undefined, id: DashboardPanelId): 'half' | 'full' {
  const w = prefs?.width?.[id]
  if (w === 'half' || w === 'full') return w
  return DEFAULT_FULL_PANELS.includes(id) ? 'full' : 'half'
}

/**
 * 列表板块行数上限：仅 DENSITY_PANELS 生效，取 prefs.density[id]（0/3/5）；
 * 非法值/缺省/prefs 为 null → 0（全部）。非列表板块恒 0。
 */
export function resolveMaxRows(prefs: DashboardPrefs | null | undefined, id: DashboardPanelId): number {
  if (!DENSITY_PANELS.includes(id)) return 0
  const d = prefs?.density?.[id]
  return typeof d === 'number' && DENSITY_STEPS.includes(d) ? d : 0
}

/**
 * 解析最终渲染序列：
 * - 按 prefs.order 顺序取板块，prefs.hidden 中的不渲染；
 * - 未知 id / 重复 id 过滤；order 缺失的板块按默认顺序补到尾部（服务端已补齐，此处兜底）；
 * - prefs 为 null/undefined（拉取失败）→ 默认布局（默认顺序、无隐藏、默认宽度/密度）。
 * 注：guestbook 总闸（820-L）与「announcement 无数据不渲染」属系统控制优先，
 * 由 Dashboard.vue 在本结果之上再过滤，不在纯函数层处理。
 */
export function resolveDashboardLayout(prefs: DashboardPrefs | null | undefined): ResolvedPanel[] {
  const hidden = new Set<string>(prefs?.hidden ?? [])
  const seen = new Set<DashboardPanelId>()
  const ids: DashboardPanelId[] = []

  for (const id of prefs?.order ?? []) {
    if (isDashboardPanelId(id) && !seen.has(id) && !hidden.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  for (const id of DASHBOARD_PANEL_IDS) {
    // 缺失补齐仅限基础板块：可选板块未添加即不在首页（与服务端归一化同口径）
    if (!seen.has(id) && !hidden.has(id) && (CORE_PANEL_IDS as readonly DashboardPanelId[]).includes(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  return ids.map(id => ({
    id,
    width: resolvePanelWidth(prefs, id),
    maxRows: resolveMaxRows(prefs, id)
  }))
}
