// 桌面端布局偏好（拍板 γ：只存本地不同步云端，不写 dashboard_prefs、不传服务端；网页端 prefs 机制原样不动）
// 拍板事实源：docs/comms/插件化研判-板块契约-20260825-已拍板.md §4.4
// 归一化纪律（与网页 prefs 同款）：非法/陈旧值一律落默认，永不抛错。
// 定制收敛为三件（825 拍板）：显隐 + 装裱纸式 + 模块开关（模块开关归档②，本批不实现）；拖排已退役。
import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import type { MountStyle, PanelId, TearableId } from '../panels/contract'
import { PANEL_REGISTRY } from '../panels/contract'

const STORAGE_KEY = 'shihui-desktop-prefs-v1'
const MOUNTS: MountStyle[] = ['plain', 'grid', 'indigo']
const TEARABLES: TearableId[] = ['timer', 'today-todo', 'deadline']
/** 主题偏好（波13）：auto=跟随系统 */
export type ThemePref = 'auto' | 'light' | 'dark'
const THEMES: ThemePref[] = ['auto', 'light', 'dark']

/** 首页卷心主位显示哪个（9/4 主页重设计拍板：今日要办 ⇄ 排期月历 共享卷心主位，记住上次选择＝画师自定义默认） */
export type HomeMainView = 'todo' | 'cal'
const MAIN_VIEWS: HomeMainView[] = ['todo', 'cal']

export interface DesktopPrefs {
  /** 隐藏的板块（today 不可隐，归一化时强制剔除） */
  hidden: PanelId[]
  /** 装裱纸式（全局单选防混搭） */
  mount: MountStyle
  /** 已撕出悬浮件 */
  torn: TearableId[]
  /** 专注画画模式 */
  focus: boolean
  /** 字号（14~20 整数，默认 16；同网页端滑块口径，经 zoom 施加于全局） */
  fontSize: number
  /** 外观主题（auto/light/dark，默认 auto 跟随系统） */
  theme: ThemePref
  /** 卷心主位（todo=今日要办 / cal=排期月历，默认 todo） */
  mainView: HomeMainView
}

const FONT_MIN = 14
const FONT_MAX = 20
const FONT_DEFAULT = 16

function defaultPrefs(): DesktopPrefs {
  return { hidden: [], mount: 'plain', torn: [], focus: false, fontSize: FONT_DEFAULT, theme: 'auto', mainView: 'todo' }
}

function normalize(raw: unknown): DesktopPrefs {
  const d = defaultPrefs()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<DesktopPrefs>
  const knownIds = new Set(PANEL_REGISTRY.filter(p => p.hideable).map(p => p.id))
  if (Array.isArray(o.hidden)) d.hidden = o.hidden.filter((k): k is PanelId => knownIds.has(k as PanelId))
  if (MOUNTS.includes(o.mount as MountStyle)) d.mount = o.mount as MountStyle
  if (Array.isArray(o.torn)) d.torn = o.torn.filter((k): k is TearableId => TEARABLES.includes(k as TearableId))
  if (typeof o.focus === 'boolean') d.focus = o.focus
  if (typeof o.fontSize === 'number' && Number.isFinite(o.fontSize)) {
    d.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(o.fontSize)))
  }
  if (THEMES.includes(o.theme as ThemePref)) d.theme = o.theme as ThemePref
  if (MAIN_VIEWS.includes(o.mainView as HomeMainView)) d.mainView = o.mainView as HomeMainView
  return d
}

function load(): DesktopPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalize(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultPrefs()
  }
}

export const usePrefsStore = defineStore('desktop-prefs', () => {
  const prefs = reactive<DesktopPrefs>(load())

  watch(prefs, v => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* 写失败静默，偏好非关键路径 */ }
  }, { deep: true })

  function toggleHidden(id: PanelId) {
    const panel = PANEL_REGISTRY.find(p => p.id === id)
    if (!panel?.hideable) return // 系统控制优先：不可隐板块拒绝隐藏
    const set = new Set(prefs.hidden)
    if (set.has(id)) set.delete(id); else set.add(id)
    prefs.hidden = [...set]
  }

  function setMount(m: MountStyle) { prefs.mount = m }
  function setFocus(f: boolean) { prefs.focus = f }

  /** 主题（波13）：非法值落 auto 由 normalize 保证，此处直写 */
  function setTheme(t: ThemePref) { prefs.theme = t }

  /** 卷心主位（9/4）：切页签即落偏好，下次开应用仍是这一面（画师自定义默认显示哪个） */
  function setMainView(v: HomeMainView) { prefs.mainView = v }

  /** 字号：钳在 14~20（同网页端），越界调用自动吸到边界 */
  function setFontSize(n: number) {
    prefs.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)))
  }

  /** 撕出/贴回：撕出状态随偏好持久化（重开应用仍是撕出态，悬浮窗由壳层按此状态拉起） */
  function setTorn(id: TearableId, torn: boolean) {
    const set = new Set(prefs.torn)
    if (torn) set.add(id); else set.delete(id)
    prefs.torn = [...set]
  }

  function isTorn(id: TearableId): boolean { return prefs.torn.includes(id) }

  return { prefs, toggleHidden, setMount, setFocus, setTorn, isTorn, setFontSize, setTheme, setMainView }
})
