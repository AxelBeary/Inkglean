// ============================================
// 自定义首页批一（v70）：仪表盘布局偏好工具 + 共享读写 composable
//
// 契约（后端已完工，web/src/api/types.ts DashboardPrefs 钉死）：
// - GET /artist/dashboard/prefs 永远返回完整归一化值（坏数据落默认）；
// - PUT 全量对象，服务端逐字段归一化入库；多设备口径：后写覆盖先写；
// - PUT {} = 恢复默认。
//
// 前端职责只有三样：
//   1. 打开时拉取；
//   2. 任何改动 → 本地 mutate → PUT 完整对象；失败 ElMessage 报错并回滚本地快照；
//   3. 恢复默认 → PUT {} 后重新拉取。
// 纯函数（reorderModules / toggleModuleHidden / clampPageMax / clonePrefs）
// 与组件解耦，走单测兜底。
// ============================================
import { ref } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../api/index'
import type { DashboardPrefs } from '../api/types'

// ─── 板块登记表（批一 10 基础 + 批二 3 可选，与服务端 CORE_MODULES/OPTIONAL_MODULES 同序同量） ───

export const DASHBOARD_MODULE_IDS = [
  'greet', 'plaque', 'stats', 'schedule', 'todo', 'guestbook', 'activity', 'announcement', 'onboarding', 'quick',
  'incomeChart', 'incomeMonth', 'ddlSoon'
] as const

/** 基础板块（默认在首页；可选板块默认在库里，自愿添加） */
export const CORE_MODULE_IDS: readonly DashboardModuleId[] = DASHBOARD_MODULE_IDS.slice(0, 10)
/** 可选板块（板块库：收入类与旧拍板「钱不进日报」并存——默认不见钱，自愿添加才上首页） */
export const OPTIONAL_MODULE_IDS: readonly DashboardModuleId[] = DASHBOARD_MODULE_IDS.slice(10)

export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number]

/** 板块元信息：名称走 i18n 键；列表型板块支持「显示行数」；optional=板块库成员 */
export interface DashboardModuleMeta {
  id: DashboardModuleId
  nameKey: string
  hasDensity: boolean
  optional: boolean
}

export const DASHBOARD_MODULE_METAS: readonly DashboardModuleMeta[] = [
  { id: 'greet', nameKey: 'dashboardPrefs.moduleGreet', hasDensity: false, optional: false },
  { id: 'plaque', nameKey: 'dashboardPrefs.modulePlaque', hasDensity: false, optional: false },
  { id: 'stats', nameKey: 'dashboardPrefs.moduleStats', hasDensity: false, optional: false },
  { id: 'schedule', nameKey: 'dashboardPrefs.moduleSchedule', hasDensity: false, optional: false },
  { id: 'todo', nameKey: 'dashboardPrefs.moduleTodo', hasDensity: true, optional: false },
  { id: 'guestbook', nameKey: 'dashboardPrefs.moduleGuestbook', hasDensity: true, optional: false },
  { id: 'activity', nameKey: 'dashboardPrefs.moduleActivity', hasDensity: true, optional: false },
  { id: 'announcement', nameKey: 'dashboardPrefs.moduleAnnouncement', hasDensity: false, optional: false },
  { id: 'onboarding', nameKey: 'dashboardPrefs.moduleOnboarding', hasDensity: false, optional: false },
  { id: 'quick', nameKey: 'dashboardPrefs.moduleQuick', hasDensity: false, optional: false },
  { id: 'incomeChart', nameKey: 'dashboardPrefs.moduleIncomeChart', hasDensity: false, optional: true },
  { id: 'incomeMonth', nameKey: 'dashboardPrefs.moduleIncomeMonth', hasDensity: false, optional: true },
  { id: 'ddlSoon', nameKey: 'dashboardPrefs.moduleDdlSoon', hasDensity: true, optional: true }
]

const MODULE_META_MAP = new Map<string, DashboardModuleMeta>(
  DASHBOARD_MODULE_METAS.map(m => [m.id, m])
)

/** id → 元信息；服务端前瞻保留的未知 id 返回 undefined（抽屉跳过渲染但不从 order 丢弃） */
export function getDashboardModuleMeta(id: string): DashboardModuleMeta | undefined {
  return MODULE_META_MAP.get(id)
}

/** 支持「显示行数」的列表板块（与服务端 DENSITY_MODULES 同口径；ddlSoon 属批二） */
export const DENSITY_MODULE_IDS: readonly DashboardModuleId[] = ['todo', 'guestbook', 'activity', 'ddlSoon']

// ─── 板块款式选择器（批二定稿：仅排期块与问候卡有款式；v152 补回抽屉款式行） ───

export interface StyleOption {
  /** prefs.scheduleStyle / greetStyle 的合法取值 */
  value: string
  nameKey: string
}

/** 排期块四款（时间条/台账/纸签/运单，与 SchedulePanels variant 同口径） */
export const SCHEDULE_STYLE_OPTIONS: readonly StyleOption[] = [
  { value: 'bars', nameKey: 'dashboardPrefs.styleScheduleBars' },
  { value: 'ledger', nameKey: 'dashboardPrefs.styleScheduleLedger' },
  { value: 'ptags', nameKey: 'dashboardPrefs.styleSchedulePtags' },
  { value: 'waybill', nameKey: 'dashboardPrefs.styleScheduleWaybill' }
]

/** 问候卡四款（标准/印框/书签/分隔，与 GreetingNote greetStyle 同口径） */
export const GREET_STYLE_OPTIONS: readonly StyleOption[] = [
  { value: 'plain', nameKey: 'dashboardPrefs.styleGreetPlain' },
  { value: 'seal', nameKey: 'dashboardPrefs.styleGreetSeal' },
  { value: 'ribbon', nameKey: 'dashboardPrefs.styleGreetRibbon' },
  { value: 'rule', nameKey: 'dashboardPrefs.styleGreetRule' }
]

/** 模块 id → 款式选择器；未登记的模块抽屉不显款式行 */
export const MODULE_STYLE_PICKS: Readonly<Partial<Record<DashboardModuleId, { field: 'scheduleStyle' | 'greetStyle'; options: readonly StyleOption[] }>>> = {
  schedule: { field: 'scheduleStyle', options: SCHEDULE_STYLE_OPTIONS },
  greet: { field: 'greetStyle', options: GREET_STYLE_OPTIONS }
}

// ─── 页面宽度三档常量（与原型 820 / 服务端归一化口径一致） ───

export const PAGE_ALIGNS = ['left', 'center', 'full'] as const
export type PageAlign = (typeof PAGE_ALIGNS)[number]

export const PAGE_MAX_MIN = 1000
export const PAGE_MAX_MAX = 1680
export const PAGE_MAX_STEP = 20
export const PAGE_MAX_DEFAULT = 1350

/** 列表卡显示行数档位（0=全部） */
export const DENSITY_CHOICES = [3, 5, 0] as const
export type DensityChoice = (typeof DENSITY_CHOICES)[number]

// ─── 纯函数（无副作用，返回新对象/新数组） ───

/**
 * 拖动换位：从 order 摘出 dragId，插到 targetId 的前/后。
 * dragId/targetId 不存在或相同时原样返回副本，永不越界。
 */
export function reorderModules(
  order: readonly string[],
  dragId: string,
  targetId: string,
  insertBefore: boolean
): string[] {
  if (dragId === targetId || !order.includes(dragId) || !order.includes(targetId)) {
    return [...order]
  }
  const next = order.filter(id => id !== dragId)
  let idx = next.indexOf(targetId)
  if (!insertBefore) idx += 1
  next.splice(idx, 0, dragId)
  return next
}

/** 显隐切换：hidden 中有则移除，无则追加（返回新数组） */
export function toggleModuleHidden(hidden: readonly string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id]
}

/** 最大宽度钳制 + 吸附到 20px 档；非有限数落默认 1350 */
export function clampPageMax(value: number): number {
  if (!Number.isFinite(value)) return PAGE_MAX_DEFAULT
  const snapped = Math.round((value - PAGE_MAX_MIN) / PAGE_MAX_STEP) * PAGE_MAX_STEP + PAGE_MAX_MIN
  return Math.min(PAGE_MAX_MAX, Math.max(PAGE_MAX_MIN, snapped))
}

/** 列表卡行数档位归一：只认 3/5，其余一律 0（全部） */
export function normalizeDensity(value: unknown): DensityChoice {
  return value === 3 || value === 5 ? value : 0
}

/**
 * prefs 快照拷贝（order/hidden/width/density 各自独立副本）：
 * 用于改动前留回滚点、以及避免 PUT 载荷引用响应式活对象。
 */
export function clonePrefs(prefs: DashboardPrefs): DashboardPrefs {
  return {
    v: prefs.v,
    order: [...prefs.order],
    hidden: [...prefs.hidden],
    width: { ...prefs.width },
    density: { ...prefs.density },
    scheduleStyle: prefs.scheduleStyle,
    greetStyle: prefs.greetStyle,
    pageAlign: prefs.pageAlign,
    pageMax: prefs.pageMax
  }
}

// ─── 共享读写 composable（抽屉与偏好页宽度控件共用同一实例，provide/inject 传递） ───

export interface DashboardPrefsController {
  prefs: Ref<DashboardPrefs | null>
  loading: Ref<boolean>
  loadFailed: Ref<boolean>
  saving: Ref<boolean>
  /** 拉取服务端归一化 prefs（失败置 loadFailed，保留旧值供重试） */
  load: () => Promise<void>
  /** 本地 mutate + PUT 全量对象；失败回滚快照并 ElMessage 报错，返回是否成功 */
  mutate: (mutator: (draft: DashboardPrefs) => void) => Promise<boolean>
  /** 恢复默认：PUT {} 后重新拉取 */
  resetDefaults: () => Promise<boolean>
}

export const DASHBOARD_PREFS_KEY: InjectionKey<DashboardPrefsController> = Symbol('dashboard-prefs')

export function useDashboardPrefs(): DashboardPrefsController {
  const { t } = useI18n()
  const prefs = ref<DashboardPrefs | null>(null)
  const loading = ref(false)
  const loadFailed = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    loadFailed.value = false
    try {
      prefs.value = await artistApi.getDashboardPrefs()
    } catch {
      loadFailed.value = true
    } finally {
      loading.value = false
    }
  }

  async function mutate(mutator: (draft: DashboardPrefs) => void): Promise<boolean> {
    if (!prefs.value) return false
    const snapshot = clonePrefs(prefs.value)
    mutator(prefs.value)
    saving.value = true
    try {
      // 后写覆盖先写：以服务端归一化后的返回为新事实源
      prefs.value = await artistApi.putDashboardPrefs(clonePrefs(prefs.value))
      return true
    } catch {
      prefs.value = snapshot
      ElMessage.error(t('dashboardPrefs.saveFailed'))
      return false
    } finally {
      saving.value = false
    }
  }

  async function resetDefaults(): Promise<boolean> {
    saving.value = true
    try {
      await artistApi.putDashboardPrefs({})
      await load()
      return !loadFailed.value
    } catch {
      ElMessage.error(t('dashboardPrefs.saveFailed'))
      return false
    } finally {
      saving.value = false
    }
  }

  return { prefs, loading, loadFailed, saving, load, mutate, resetDefaults }
}
