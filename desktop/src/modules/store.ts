// 模块 store（档②波17 三件）：扫描编排 + 画师偏好（停用）+ 违规账 + 模块设置值。
// 规范依据：v0.3 §四（四态状态机与展示）+ 拍板二（违规窗口）+ §二（设置项壳统一渲染）。
// v0.4 追加：扫描时算模块指纹与静态扫描命中，并记「包安装账」——来源由壳判定（官方/导入包/导入后已改/本地文件）。
// 偏好与违规账存 localStorage（前缀键 shihui- 随导出包迁移口径）；扫描数据不落盘（每次启动重扫，§3.7 不热更）。
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { listModuleDirs, readModuleManifest, readModuleEntry } from '../bridge/modules'
import { isDesktop } from '../bridge'
import { buildRegistry, recordViolation, clearViolations, violationCount } from './registry'
import { VIOLATION_LIMIT } from './manifest'
import { moduleFingerprint, scanModuleCode } from './pack'
import type { ModuleEntry, ViolationRec } from './registry'
import type { ModuleState } from './types'
import type { ScanFinding } from './pack'

const PREFS_KEY = 'shihui-module-prefs-v1'
const PACKS_KEY = 'shihui-module-packs-v1'

interface ModulePrefs {
  /** 画师手动停用的模块 id */
  disabled: string[]
  /** 模块设置值：moduleId → settingName → value */
  settings: Record<string, Record<string, string>>
  /** 违规账：moduleId → 窗口记录 */
  violations: Record<string, ViolationRec>
}

/** 包安装账：装过包的模块才有；指纹对不上 → 包内的件被改过（来源降级为「导入后已改」） */
export interface PackRecord {
  manifestDigest: string
  entryDigest: string
  installedAt: string
  /** 装包时静态扫描的命中条数（只作展示线索，运行期以桥层违规账为准） */
  findings: number
}

function defaultPrefs(): ModulePrefs {
  return { disabled: [], settings: {}, violations: {} }
}

function loadPrefs(): ModulePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs()
    const p = JSON.parse(raw) as Partial<ModulePrefs>
    const d = defaultPrefs()
    if (Array.isArray(p.disabled)) d.disabled = p.disabled.filter(x => typeof x === 'string')
    if (p.settings && typeof p.settings === 'object') {
      for (const [k, v] of Object.entries(p.settings)) {
        if (v && typeof v === 'object') d.settings[k] = v as Record<string, string>
      }
    }
    if (p.violations && typeof p.violations === 'object') {
      for (const [k, v] of Object.entries(p.violations)) {
        if (v && typeof v === 'object' && typeof v.count === 'number' && typeof v.firstAt === 'number') {
          d.violations[k] = { count: v.count, firstAt: v.firstAt }
        }
      }
    }
    return d
  } catch {
    return defaultPrefs() // 归一化纪律：坏数据落默认永不抛错
  }
}

function loadPackRecords(): Record<string, PackRecord> {
  try {
    const raw = localStorage.getItem(PACKS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, PackRecord> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const rec = v as Record<string, unknown>
      if (typeof rec.manifestDigest !== 'string' || typeof rec.entryDigest !== 'string') continue
      out[k] = {
        manifestDigest: rec.manifestDigest,
        entryDigest: rec.entryDigest,
        installedAt: typeof rec.installedAt === 'string' ? rec.installedAt : '',
        findings: typeof rec.findings === 'number' ? rec.findings : 0
      }
    }
    return out
  } catch {
    return {} // 归一化纪律：坏账落空表，不拖垮模块页
  }
}

/** 条目展示态合成：注册态 × 停用偏好 × 违规达阈（四态口径，规范 §四） */
export function composeState(
  entry: ModuleEntry,
  disabled: Set<string>,
  violations: Record<string, ViolationRec>,
  now: number
): ModuleState {
  if (entry.state === 'invalid') return 'invalid' // 失效不自动恢复（待更新/移除）
  const id = entry.manifest?.id ?? entry.dirName
  if (disabled.has(id)) return 'disabled'
  if (violationCount(violations, id, now) >= VIOLATION_LIMIT) return 'disabled' // DSK-13e 修复：引用常量
  return 'ok'
}

/** 来源（壳判定，不采信模块自报）：官方 → 导入包 → 导入后已改 → 本地文件 */
export type ModuleSource = 'official' | 'pack' | 'edited' | 'local'

export function composeSource(
  entry: ModuleEntry,
  record: PackRecord | undefined,
  fingerprint: { manifest: string; entry: string } | undefined
): ModuleSource {
  if (entry.manifest?.source === 'official') return 'official'
  if (!record) return 'local'
  if (!fingerprint) return 'edited'
  return fingerprint.manifest === record.manifestDigest && fingerprint.entry === record.entryDigest
    ? 'pack'
    : 'edited'
}

export const useModulesStore = defineStore('desktop-modules', () => {
  const entries = ref<ModuleEntry[]>([]);
  /** 模块入口代码（moduleId/dirName → panel.js 原文）；读不到的不渲染 */
  const entryCodes = ref<Record<string, string>>({})
  /** 模块指纹（dirName → 语义摘要 + 入口摘要）；扫描时现算，不落盘 */
  const fingerprints = ref<Record<string, { manifest: string; entry: string; short: string }>>({})
  /** 静态扫描命中（dirName → 命中项）；只是提示，真闸是沙箱帧 */
  const findings = ref<Record<string, ScanFinding[]>>({})
  const scanned = ref(false);
  const unavailable = ref(false);
  const prefs = reactive<ModulePrefs>(loadPrefs());
  const packRecords = reactive<Record<string, PackRecord>>(loadPackRecords());

  function persist() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* 偏好非关键路径 */ }
  }

  function persistPacks() {
    try { localStorage.setItem(PACKS_KEY, JSON.stringify(packRecords)) } catch { /* 账本非关键路径 */ }
  }

  /** 扫描：列目录 → 逐个读 manifest → buildRegistry（§3.7：不热更，启动/手动重扫触发）；
   *  ok 条目再读 panel.js 入口代码（读不到归因拒载），并算指纹与静态扫描命中 */
  async function scan(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; scanned.value = true; return }
    try {
      const dirs = await listModuleDirs()
      const manifestTexts: Record<string, string> = {}
      const scannedMods = await Promise.all(
        dirs.map(async dirName => {
          try {
            const text = await readModuleManifest(dirName)
            manifestTexts[dirName] = text
            return { dirName, manifestText: text }
          } catch (e) {
            return { dirName, manifestText: null, readError: e instanceof Error ? e.message : String(e) }
          }
        })
      )
      const built = buildRegistry(scannedMods)
      // ok 条目读入口代码；读不到归因拒载（规范：缺 panel.js = 非法）
      const codes: Record<string, string> = {}
      const fps: Record<string, { manifest: string; entry: string; short: string }> = {}
      const hits: Record<string, ScanFinding[]> = {}
      for (const e of built) {
        if (e.state !== 'ok') continue
        try {
          const code = await readModuleEntry(e.dirName)
          codes[e.dirName] = code
          const fp = moduleFingerprint(manifestTexts[e.dirName] ?? '', code)
          fps[e.dirName] = { manifest: fp.manifestDigest, entry: fp.entryDigest, short: fp.short }
          hits[e.dirName] = scanModuleCode(code)
        } catch (err) {
          e.state = 'invalid'
          e.reasons = [...e.reasons, err instanceof Error ? err.message : String(err)]
        }
      }
      entries.value = built
      entryCodes.value = codes
      fingerprints.value = fps
      findings.value = hits
    } catch {
      unavailable.value = true
    } finally {
      scanned.value = true
    }
  }

  /** 条目展示态（四态合成） */
  function stateOf(entry: ModuleEntry): ModuleState {
    return composeState(entry, new Set(prefs.disabled), prefs.violations, Date.now())
  }

  /** 条目来源（壳判定）：官方 / 导入包 / 导入后已改 / 本地文件 */
  function sourceOf(entry: ModuleEntry): ModuleSource {
    const id = entry.manifest?.id ?? entry.dirName
    return composeSource(entry, packRecords[id], fingerprints.value[entry.dirName])
  }

  /** 装包成功记账：记下当时的指纹，之后文件被动过就降级成「导入后已改」 */
  function markPackInstalled(dirName: string, digests: { manifest: string; entry: string }, findingCount: number) {
    const id = dirName
    packRecords[id] = {
      manifestDigest: digests.manifest,
      entryDigest: digests.entry,
      installedAt: new Date().toISOString(),
      findings: findingCount
    }
    persistPacks()
  }

  /** 停用/启用：手动启用即清零违规账（防死状态，规范 §四） */
  function setEnabled(moduleId: string, enabled: boolean) {
    const set = new Set(prefs.disabled)
    if (enabled) {
      set.delete(moduleId)
      prefs.violations = clearViolations(prefs.violations, moduleId)
    } else {
      set.add(moduleId)
    }
    prefs.disabled = [...set]
    persist()
  }

  /** 记一次违规（运行期桥层调用；达阈返 true 触发单独停用） */
  function reportViolation(moduleId: string): boolean {
    const r = recordViolation(prefs.violations, moduleId, Date.now())
    prefs.violations = r.ledger
    persist()
    return r.tripped
  }

  /** 模块设置值（壳统一渲染的设置项回写） */
  function setSetting(moduleId: string, name: string, value: string) {
    prefs.settings[moduleId] = { ...(prefs.settings[moduleId] ?? {}), [name]: value }
    persist()
  }
  function getSetting(moduleId: string, name: string, fallback: string): string {
    return prefs.settings[moduleId]?.[name] ?? fallback
  }

  /** 移除模块（目录即本体：给画师开文件夹，壳不删文件——F1 哲学） */
  function openModulesDirHint(): string {
    return '模块目录即插件本体：请到「我的文档\\拾绘\\modules」直接删除对应文件夹，再回本页重新扫描'
  }

  return {
    entries, entryCodes, fingerprints, findings, scanned, unavailable, prefs, packRecords,
    scan, stateOf, sourceOf, markPackInstalled, setEnabled, reportViolation, setSetting, getSetting, openModulesDirHint
  }
})
