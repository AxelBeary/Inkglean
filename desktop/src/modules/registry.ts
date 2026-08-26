// 模块注册表（档②波17 二件）：扫描结果 → 校验 → 目录名匹配 → 去重 → 注册条目（纯逻辑可测）。
// 规范依据：v0.3 §四加载行（校验与去重）+ §二审计 M2（目录名必须与 id 一致、同 id 后到者拒载）。
// 违规记账（拍板二）：10 次/24 小时滚动窗口达阈单独停用；手动启用清零（防死状态）。
import { parseManifest } from './manifest'
import { VIOLATION_LIMIT, VIOLATION_WINDOW_MS } from './manifest'
import type { ModuleManifest, ModuleState } from './types'

/** 扫描输入：目录名 + manifest 原文（读失败时 manifestText 为 null + 原因） */
export interface ScannedModule {
  dirName: string
  manifestText: string | null
  readError?: string
}

/** 注册条目：初始只有 ok/invalid 两态（disabled 为画师偏好、grey 为运行期态，后续件施加） */
export interface ModuleEntry {
  dirName: string
  manifest: ModuleManifest | null
  state: ModuleState
  reasons: string[]
}

/** 建注册表（纯函数）：校验 → 目录名匹配 → 同 id 去重（后到拒载，审计 M2） */
export function buildRegistry(scanned: ScannedModule[]): ModuleEntry[] {
  const out: ModuleEntry[] = []
  const seenIds = new Set<string>()
  for (const s of scanned) {
    if (s.manifestText === null) {
      out.push({ dirName: s.dirName, manifest: null, state: 'invalid', reasons: [s.readError ?? '读取 manifest 失败'] })
      continue
    }
    const r = parseManifest(s.manifestText)
    if (!r.ok || !r.manifest) {
      out.push({
        dirName: s.dirName,
        manifest: null,
        state: 'invalid',
        reasons: r.reasons.length > 0 ? r.reasons : ['manifest 非法']
      })
      continue
    }
    const m = r.manifest
    // 目录名必须与 manifest id 一致（规范 §二 审计 M2）
    if (m.id !== s.dirName) {
      out.push({
        dirName: s.dirName,
        manifest: m,
        state: 'invalid',
        reasons: [...r.reasons, `目录名须与 manifest id 一致（id=${m.id}）`]
      })
      continue
    }
    // 同 id 重复注册：后到者拒载并提示（审计 M2）
    if (seenIds.has(m.id)) {
      out.push({
        dirName: s.dirName,
        manifest: m,
        state: 'invalid',
        reasons: [...r.reasons, `同 id 模块已注册：${m.id}`]
      })
      continue
    }
    seenIds.add(m.id)
    out.push({ dirName: s.dirName, manifest: m, state: 'ok', reasons: r.reasons })
  }
  return out
}

// ─── 违规记账（拍板二：10 次/24h 滚动窗口；手动启用清零） ───

export interface ViolationRec {
  /** 当前窗口内累计次数 */
  count: number
  /** 窗口起点时间戳（毫秒） */
  firstAt: number
}

export interface RecordViolationResult {
  ledger: Record<string, ViolationRec>
  /** 记账后该模块窗口内总次数 */
  total: number
  /** 是否达阈（达阈 → 单独停用触发点） */
  tripped: boolean
}

/** 记一次违规（纯函数）：窗口外自动重开新窗口；达阈返 tripped */
export function recordViolation(
  ledger: Record<string, ViolationRec>,
  moduleId: string,
  now: number
): RecordViolationResult {
  let rec = ledger[moduleId]
  if (!rec || now - rec.firstAt >= VIOLATION_WINDOW_MS) {
    rec = { count: 0, firstAt: now }
  }
  rec = { count: rec.count + 1, firstAt: rec.firstAt }
  const next = { ...ledger, [moduleId]: rec }
  return { ledger: next, total: rec.count, tripped: rec.count >= VIOLATION_LIMIT }
}

/** 清零违规（纯函数）：手动重新启用即清零（防死状态，规范 §四）；24h 无违规由窗口滚动自然清零 */
export function clearViolations(
  ledger: Record<string, ViolationRec>,
  moduleId: string
): Record<string, ViolationRec> {
  const next = { ...ledger }
  delete next[moduleId]
  return next
}

/** 读某模块当前窗口内有效违规次数（窗口过期按 0） */
export function violationCount(
  ledger: Record<string, ViolationRec>,
  moduleId: string,
  now: number
): number {
  const rec = ledger[moduleId]
  if (!rec) return 0
  if (now - rec.firstAt >= VIOLATION_WINDOW_MS) return 0
  return rec.count
}
