// manifest 解析与校验（档②波17）：规范 v0.3 §四「加载」强制点的纯逻辑实现。
// 纪律：永不抛错拖垮壳（归一化同款）；非法不加载给原因（模块管理页展示）；
// 未声明字段一律落最保守默认值（最小够用）；一切字符串按不可信输入处理（限长）。
import type { ModuleManifest, ModuleZone, ModuleHeightRule, ModuleFocusPolicy, SharedWriteLevel, NetworkScope, ModuleLifecycle, ModuleIdlePolicy } from './types'

// ─── 拍板二数字钉成常量（826 拍板：10次·24h·5MB·5s×3） ───
export const VIOLATION_LIMIT = 10
export const VIOLATION_WINDOW_MS = 24 * 60 * 60 * 1000
export const MODULE_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024
export const HEARTBEAT_INTERVAL_MS = 5000
export const HEARTBEAT_MISS_LIMIT = 3
/** 拍板三采纳：模块初始化超时置灰牌 */
export const LOAD_TIMEOUT_MS = 5000

// ─── 壳的版本与规范区间（规范 §3.1/七） ───
export const HOST_VERSION = '0.1.0'
export const SUPPORTED_SPECS = ['1.0']
/** 首发可订阅视图（826 拍板一）：来源标签随壳层模式过滤 */
export const KNOWN_VIEWS: Record<string, 'cloud' | 'local'> = {
  orders: 'cloud',
  ledger: 'local',
  time: 'local',
  messages: 'cloud'
}

/** 字符串限长（审计 M9：不可信输入转义前置——先限长，渲染时再转义） */
const LEN_ID = 64
const LEN_NAME = 40
const LEN_DESC = 140
const LEN_VERSION = 24

/** 语义化版本比较（纯函数）：a<b 返负，a==b 返 0，a>b 返正；非法版本按 0.0.0 */
export function semverCompare(a: string, b: string): number {
  const parse = (v: string): number[] => {
    const parts = String(v ?? '').trim().split('.').map(n => {
      const x = Number.parseInt(n, 10)
      return Number.isFinite(x) && x >= 0 ? x : 0
    })
    while (parts.length < 3) parts.push(0)
    return parts.slice(0, 3)
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

export interface ParseResult {
  ok: boolean
  manifest: ModuleManifest | null
  /** 拒载原因（模块管理页展示，文案已限长） */
  reasons: string[]
}

/** 视图名合法性：只认拍板一的四视图；未知视图剔除并记原因（不拒载整个模块，保守降级） */
function filterViews(views: unknown, reasons: string[]): string[] {
  if (!Array.isArray(views)) return []
  const out: string[] = []
  for (const v of views) {
    if (typeof v === 'string' && v in KNOWN_VIEWS) out.push(v)
    else reasons.push(`未知视图已剔除：${String(v).slice(0, 32)}`)
  }
  return [...new Set(out)]
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function pickStr(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback
}

function pickStrArray(v: unknown, max = 64): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, max))
}

/** 解析 + 校验 + 归一入口：标准 JSON（允许 BOM），认不出结构才拒载，能识别的归一到最保守值 */
export function parseManifest(raw: string): ParseResult {
  const reasons: string[] = []
  let obj: unknown
  try {
    obj = JSON.parse(raw.replace(/^\uFEFF/, '')) // 容忍 BOM；尾逗号/注释 JSON.parse 天然不容忍
  } catch {
    return { ok: false, manifest: null, reasons: ['manifest 不是标准 JSON'] }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, manifest: null, reasons: ['manifest 不是对象'] }
  }
  const o = obj as Record<string, unknown>

  // ── 必填件：缺一即拒载（规范 §四 加载行） ──
  const missing: string[] = []
  for (const key of ['spec', 'api', 'minHost', 'id', 'name', 'version']) {
    if (typeof o[key] !== 'string' || !(o[key] as string).trim()) missing.push(key)
  }
  if (missing.length > 0) return { ok: false, manifest: null, reasons: [`缺少必填字段：${missing.join(', ')}`] }

  const spec = pickStr(o.spec, LEN_VERSION)
  const api = pickStr(o.api, LEN_VERSION)
  const minHost = pickStr(o.minHost, LEN_VERSION)
  const id = pickStr(o.id, LEN_ID)
  const name = pickStr(o.name, LEN_NAME)
  const version = pickStr(o.version, LEN_VERSION)

  // ── 枚举/区间校验：不符即拒载（单独失效触发点） ──
  if (!SUPPORTED_SPECS.includes(spec)) {
    return { ok: false, manifest: null, reasons: [`spec ${spec} 不在支持区间（${SUPPORTED_SPECS.join('/') }）`] }
  }
  if (!api.startsWith('panel@')) {
    return { ok: false, manifest: null, reasons: [`api ${api} 非法（须为 panel@N）`] }
  }
  if (semverCompare(HOST_VERSION, minHost) < 0) {
    return { ok: false, manifest: null, reasons: [`宿主版本 ${HOST_VERSION} 低于模块要求 ${minHost}`] }
  }

  // ── entry 首发钉死 panel.js（规范 §二） ──
  const entry = pickStr(o.entry, 64)
  if (entry !== 'panel.js') {
    return { ok: false, manifest: null, reasons: [`entry 须为 panel.js（实际：${entry || '未声明'}）`] }
  }

  // ── 归一：未声明/非法一律最保守默认值 ──
  const ui = (o.ui ?? {}) as Record<string, unknown>
  const data = (o.data ?? {}) as Record<string, unknown>
  const write = (data.write ?? {}) as Record<string, unknown>
  const network = (o.network ?? {}) as Record<string, unknown>
  const linkage = (o.linkage ?? {}) as Record<string, unknown>
  const runtime = (o.runtime ?? {}) as Record<string, unknown>

  // write.shared 首发只开 none/ro；rw 留门拒发归一为 ro 以下最保守＝none
  const shared = pickEnum<SharedWriteLevel>(write.shared, ['none', 'ro', 'rw'], 'none')

  // network 首发声明了也拒发：归一照单全收（管理页展示），运行时一律按 none 发放
  // runtime.resident 首发按 on-view 降级（留门口径：认字段不拒载）
  const lifecycle = pickEnum<ModuleLifecycle>(runtime.lifecycle, ['on-view', 'resident'], 'on-view')
  const wakeInterval = typeof runtime.wakeInterval === 'string' ? runtime.wakeInterval.slice(0, 16) : null

  // settings：声明式，形状非法的条目剔除并记原因
  const settings = Array.isArray(o.settings)
    ? o.settings
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .filter(s => typeof s.name === 'string' && typeof s.type === 'string' && typeof s.title === 'string')
        .map(s => ({
          name: pickStr(s.name, LEN_ID),
          type: pickStr(s.type, 16),
          title: pickStr(s.title, LEN_NAME),
          description: typeof s.description === 'string' ? s.description.slice(0, LEN_DESC) : undefined,
          options: Array.isArray(s.options) ? s.options.filter((x): x is string => typeof x === 'string').slice(0, 12) : undefined,
          default: typeof s.default === 'string' ? s.default.slice(0, 64) : undefined
        }))
    : []

  const manifest: ModuleManifest = {
    spec, api, minHost, id, name,
    description: pickStr(o.description, LEN_DESC),
    version,
    source: 'external', // 壳判定（§3.1）：首发无官方通道，一律外部；模块自报忽略
    entry,
    ui: {
      zone: pickEnum<ModuleZone>(ui.zone, ['core', 'aside', 'tail'], 'aside'),
      heightRule: pickEnum<ModuleHeightRule>(ui.heightRule, ['fixed-rows', 'stretch'], 'fixed-rows'),
      hideable: pickBool(ui.hideable, true),
      tearable: false, // 首发壳侧强制压 false（审计 M4），模块自报无效
      focusPolicy: pickEnum<ModuleFocusPolicy>(ui.focusPolicy, ['keep', 'fold'], 'fold'),
      styles: pickStrArray(ui.styles, 24)
    },
    data: {
      views: filterViews(data.views, reasons),
      write: {
        own: pickBool(write.own, false),
        shared: shared === 'rw' ? 'none' : shared, // rw 留门拒发→归一 none
        reason: pickStr(write.reason, LEN_DESC)
      }
    },
    settings,
    network: {
      scope: pickEnum<NetworkScope>(network.scope, ['none', 'lan', 'internet'], 'none'),
      hosts: pickStrArray(network.hosts, 128),
      reason: pickStr(network.reason, LEN_DESC)
    },
    linkage: {
      subscribes: pickStrArray(linkage.subscribes),
      emits: pickStrArray(linkage.emits)
    },
    runtime: {
      lifecycle,
      wakeInterval,
      idlePolicy: pickEnum<ModuleIdlePolicy>(runtime.idlePolicy, ['afk-aware', 'always'], 'afk-aware')
    },
    diagnostics: pickBool(o.diagnostics, false)
  }
  return { ok: true, manifest, reasons }
}
