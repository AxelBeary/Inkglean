// 模块 store（档②波17 三件）：扫描编排 + 画师偏好（停用）+ 违规账 + 模块设置值。
// 规范依据：v0.3 §四（四态状态机与展示）+ 拍板二（违规窗口）+ §二（设置项壳统一渲染）。
// 偏好与违规账存 localStorage（前缀键 shihui- 随导出包迁移口径）；扫描数据不落盘（每次启动重扫，§3.7 不热更）。
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { listModuleDirs, readModuleManifest } from '../bridge/modules'
import { isDesktop } from '../bridge'
import { buildRegistry, recordViolation, clearViolations, violationCount } from './registry'
import type { ModuleEntry, ViolationRec } from './registry'
import type { ModuleState } from './types'

const PREFS_KEY = 'shihui-module-prefs-v1'

interface ModulePrefs {
  /** 画师手动停用的模块 id */
  disabled: string[]
  /** 模块设置值：moduleId → settingName → value */
  settings: Record<string, Record<string, string>>
  /** 违规账：moduleId → 窗口记录 */
  violations: Record<string, ViolationRec>
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
  if (violationCount(violations, id, now) >= 10) return 'disabled' // 违规达阈＝单独停用
  return 'ok'
}

export const useModulesStore = defineStore('desktop-modules', () => {
  const entries = ref<ModuleEntry[]>([])
  const scanned = ref(false)
  const unavailable = ref(false)
  const prefs = reactive<ModulePrefs>(loadPrefs())

  function persist() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* 偏好非关键路径 */ }
  }

  /** 扫描：列目录 → 逐个读 manifest → buildRegistry（§3.7：不热更，启动/手动重扫触发） */
  async function scan(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; scanned.value = true; return }
    try {
      const dirs = await listModuleDirs()
      const scannedMods = await Promise.all(
        dirs.map(async dirName => {
          try {
            const text = await readModuleManifest(dirName)
            return { dirName, manifestText: text }
          } catch (e) {
            return { dirName, manifestText: null, readError: e instanceof Error ? e.message : String(e) }
          }
        })
      )
      entries.value = buildRegistry(scannedMods)
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
    entries, scanned, unavailable, prefs,
    scan, stateOf, setEnabled, reportViolation, setSetting, getSetting, openModulesDirHint
  }
})
