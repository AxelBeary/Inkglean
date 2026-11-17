// 模块包（v0.4 吸纳 OFM 扩展模式的最小切片）：一个包 = 三件（manifest.json / panel.js / pack.json）。
// 主线来自 OFM Extensions 调研（AGENTS/artifacts/调研-ofm-extensions-20261117/CONCLUSION.md §二）：
//   ① 只对语义算摘要（稳定化 JSON：递归排序 key、去空白、丢 undefined），不对字节布局——格式化/换行/键序不影响同一性；
//   ② 条目内联 { path, size, sha256 }，安装前逐件重算比对（size 一律字节，不用字符数）；
//   ③ 静态扫描（剥字符串/注释后查禁用 API）只作安装提示，真闸仍是沙箱帧（CSP 断网 + opaque origin）；
//   ④ 来源由壳判定，不采信包内自报；没带包的本地模块一律标「本地文件」。
// 诚实边界：pack.json 只是「完整件清单」，没有签名私钥，所以它只防传输损坏与误改，**不防恶意作者**。
// 本文件是纯逻辑（无 IO / 无桥 / 无 Vue），zip 解包与落盘在 packIo.ts。
import { parseManifest } from './manifest'

export const PACK_FORMAT = 1
export const PACK_META_NAME = 'pack.json'
export const PACK_MANIFEST_NAME = 'manifest.json'
export const PACK_ENTRY_NAME = 'panel.js'
/** 三件白名单：包内出现任何其它条目一律拒装（不夹带） */
export const PACK_ALLOWED_NAMES: readonly string[] = [PACK_MANIFEST_NAME, PACK_ENTRY_NAME, PACK_META_NAME]

/** 与 Rust 读侧同口径的三道上限（desktop_read_module_manifest / _entry） */
export const PACK_MAX_MANIFEST_BYTES = 64 * 1024
export const PACK_MAX_ENTRY_BYTES = 512 * 1024
export const PACK_MAX_META_BYTES = 64 * 1024

export interface PackFileEntry {
  path: string
  /** 字节数（不是字符数——OFM 那处把 chars 写成 bytes，第三方按字节校验会全量装不上） */
  size: number
  sha256: string
}

export interface PackMeta {
  format: number
  generator: string
  generatedAt: string
  module: { id: string; name: string; version: string }
  /** 对稳定化后的 manifest 语义算的摘要（换行/格式化/键序不影响） */
  manifestDigest: string
  files: PackFileEntry[]
}

export interface ScanFinding {
  token: string
  line: number
  why: string
}

// ─── 字节与编码 ───

/** UTF-8 编码（手写：happy-dom / 旧 WebView 不保证有 TextEncoder） */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
        i++
      }
    }
    if (code < 0x80) out.push(code)
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return Uint8Array.from(out)
}

/** UTF-8 解码（fatal：解码失败返 null，坏字节不被悄悄替换成 U+FFFD） */
export function utf8Decode(bytes: Uint8Array): string | null {
  try {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  // 无 TextDecoder 的环境（极旧 WebView）：手写逐段解码
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b0 = bytes[i++]
    const lead = b0 < 0x80 ? 0
      : b0 >= 0xc2 && b0 <= 0xdf ? 1
        : b0 >= 0xe0 && b0 <= 0xef ? 2
          : b0 >= 0xf0 && b0 <= 0xf4 ? 3
            : -1
    if (lead < 0) return null
    if (lead === 0) { out += String.fromCharCode(b0); continue }
    let code = b0 & (lead === 1 ? 0x1f : lead === 2 ? 0x0f : 0x07)
    const need = lead
    if (i + need > bytes.length) return null
    for (let k = 0; k < need; k++) {
      const b = bytes[i++]
      if ((b & 0xc0) !== 0x80) return null
      code = (code << 6) | (b & 0x3f)
    }
    if (code > 0x10ffff) return null
    if (code > 0xffff) {
      code -= 0x10000
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff))
    } else out += String.fromCharCode(code)
  }
  return out
}

// ─── 稳定化 JSON（OFM 的 stableStringify 口径） ───

/** 递归排序 key、去空白、丢 undefined；数组保持顺序（顺序是语义） */
export function stableStringify(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map(normalize)
    const src = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(src).sort()) {
      if (src[key] === undefined) continue
      out[key] = normalize(src[key])
    }
    return out
  }
  const text = JSON.stringify(normalize(value))
  return text === undefined ? '' : text
}

/** manifest 语义摘要：解析失败返 null（调用侧按「不合法」处理） */
export function manifestDigestOf(manifestText: string): string | null {
  let obj: unknown
  try {
    obj = JSON.parse(manifestText.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  return sha256Hex(stableStringify(obj))
}

/** 模块指纹：manifest 语义摘要 + 入口文件摘要（短指纹取前 8 位给界面） */
export function moduleFingerprint(manifestText: string, entryCode: string): {
  manifestDigest: string
  entryDigest: string
  short: string
} {
  const manifestDigest = manifestDigestOf(manifestText) ?? ''
  const entryDigest = sha256Hex(entryCode)
  return { manifestDigest, entryDigest, short: (manifestDigest || entryDigest).slice(0, 8) }
}

// ─── SHA-256（纯 TS，零依赖；单测里对 Node crypto 黄金向量核过） ───

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

/** SHA-256：字符串按 UTF-8 取字节，Uint8Array 按原样 */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? utf8Encode(input) : input
  const len = bytes.length
  const total = Math.ceil((len + 9) / 64) * 64
  const padded = new Uint8Array(total)
  padded.set(bytes)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  const bitsHigh = Math.floor((len * 8) / 0x100000000)
  const bitsLow = (len * 8) >>> 0
  view.setUint32(total - 8, bitsHigh)
  view.setUint32(total - 4, bitsLow)

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ])
  const w = new Uint32Array(64)
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4
      w[i] = ((padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3]) >>> 0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (let i = 0; i < 64; i++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const t1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const t2 = (s0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  let hex = ''
  for (let i = 0; i < 8; i++) hex += h[i].toString(16).padStart(8, '0')
  return hex
}

// ─── 静态扫描（OFM 的「扫描前先剥字符串与注释」口径） ───

const FORBIDDEN_TOKENS: readonly { token: string; why: string }[] = [
  { token: 'eval', why: '动态执行' },
  { token: 'Function', why: '动态执行' },
  { token: 'require', why: '加载外部模块' },
  { token: 'process', why: '摸宿主进程' },
  { token: 'fetch', why: '联网' },
  { token: 'XMLHttpRequest', why: '联网' },
  { token: 'WebSocket', why: '联网' },
  { token: 'EventSource', why: '联网' },
  { token: 'sendBeacon', why: '外发数据' },
  { token: 'importScripts', why: '拉外部脚本' },
  { token: '__TAURI__', why: '直摸原生 IPC' },
  { token: 'localStorage', why: '本地持久化' },
  { token: 'sessionStorage', why: '本地持久化' },
  { token: 'indexedDB', why: '本地持久化' }
]

/** 剥掉字符串字面量与注释（保留换行与位置，便于报行号）；模板 ${} 里的表达式按代码处理 */
export function stripStringsAndComments(code: string): string {
  const out: string[] = []
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  let templateExprDepth = 0
  let i = 0
  const n = code.length
  while (i < n) {
    const ch = code[i]
    const next = i + 1 < n ? code[i + 1] : ''
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; out.push('  '); i += 2; continue }
      if (ch === '/' && next === '*') { state = 'block'; out.push('  '); i += 2; continue }
      if (ch === "'") { state = 'single'; out.push(' '); i++; continue }
      if (ch === '"') { state = 'double'; out.push(' '); i++; continue }
      if (ch === '`') { state = 'template'; out.push(' '); i++; continue }
      if (templateExprDepth > 0) {
        if (ch === '{') templateExprDepth++
        else if (ch === '}') {
          templateExprDepth--
          if (templateExprDepth === 0) { state = 'template'; out.push(' '); i++; continue }
        }
      }
      out.push(ch)
      i++
      continue
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out.push('\n') } else out.push(' ')
      i++
      continue
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; out.push('  '); i += 2; continue }
      out.push(ch === '\n' ? '\n' : ' ')
      i++
      continue
    }
    if (state === 'single' || state === 'double') {
      if (ch === '\\') { out.push(' '); i += 2; continue }
      if ((state === 'single' && ch === "'") || (state === 'double' && ch === '"')) {
        state = 'code'
        out.push(' ')
        i++
        continue
      }
      out.push(ch === '\n' ? '\n' : ' ')
      i++
      continue
    }
    // template
    if (ch === '\\') { out.push(' '); i += 2; continue }
    if (ch === '`') { state = 'code'; out.push(' '); i++; continue }
    if (ch === '$' && next === '{') {
      templateExprDepth = 1
      state = 'code'
      out.push('  ')
      i += 2
      continue
    }
    out.push(ch === '\n' ? '\n' : ' ')
    i++
  }
  return out.join('')
}

/** 静态扫描：命中项带行号与原因；扫描只是提示（真闸是沙箱帧） */
export function scanModuleCode(code: string): ScanFinding[] {
  const stripped = stripStringsAndComments(code)
  const findings: ScanFinding[] = []
  for (const { token, why } of FORBIDDEN_TOKENS) {
    const re = new RegExp('\\b' + token + '\\b', 'g')
    let match: RegExpExecArray | null
    while ((match = re.exec(stripped)) !== null) {
      const line = stripped.slice(0, match.index).split('\n').length
      findings.push({ token, line, why })
    }
  }
  findings.sort((a, b) => a.line - b.line || a.token.localeCompare(b.token))
  return findings
}

// ─── 打包 ───

/** 组包清单：只读三件；manifest 解析不了返 null（调用侧给「不合法」） */
export function buildPack(
  manifestText: string,
  entryCode: string,
  now: Date = new Date(),
  generator = '拾绘桌面版'
): PackMeta | null {
  let obj: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(manifestText.replace(/^\uFEFF/, ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    obj = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const manifestBytes = utf8Encode(manifestText)
  const entryBytes = utf8Encode(entryCode)
  const manifestDigest = sha256Hex(stableStringify(obj))
  return {
    format: PACK_FORMAT,
    generator,
    generatedAt: now.toISOString(),
    module: {
      id: typeof obj.id === 'string' ? obj.id : '',
      name: typeof obj.name === 'string' ? obj.name : '',
      version: typeof obj.version === 'string' ? obj.version : ''
    },
    manifestDigest,
    files: [
      { path: PACK_MANIFEST_NAME, size: manifestBytes.length, sha256: sha256Hex(manifestBytes) },
      { path: PACK_ENTRY_NAME, size: entryBytes.length, sha256: sha256Hex(entryBytes) }
    ]
  }
}

// ─── 验包 ───

export interface PackVerdict {
  /** 结构 / 摘要 / manifest 全过才为 true（静态扫描命中不拦装，进 warnings） */
  ok: boolean
  /** 目标模块 id（目录名口径；来自 manifest，且与 pack.json 自报一致才认） */
  id: string
  /** 拒装原因（人话） */
  reasons: string[]
  /** 可装但画师该知道的事（静态扫描命中、容量接近上限等） */
  warnings: string[]
  findings: ScanFinding[]
  manifestText: string
  entryCode: string
  packText: string
  meta: PackMeta | null
  digests: { manifest: string; entry: string }
}

/** 目录名白名单（与 Rust is_safe_dir_name 对齐：ASCII 字母数字/-/_ + 中文，1~64，不以 . 开头） */
export function isSafeModuleDirName(name: string): boolean {
  return /^[A-Za-z0-9_\-\u4e00-\u9fff]{1,64}$/.test(name)
}

function emptyVerdict(reasons: string[], id = ''): PackVerdict {
  return {
    ok: false,
    id,
    reasons,
    warnings: [],
    findings: [],
    manifestText: '',
    entryCode: '',
    packText: '',
    meta: null,
    digests: { manifest: '', entry: '' }
  }
}

/** 验包：只认三件白名单 → 上限 → UTF-8 严格解码 → pack.json 形状 → 逐件 size/sha256 → manifest 语义摘要 → manifest 校验 → 静态扫描
 *  dirName 传 null 表示「按包内 manifest 的 id 定目录名」（安装流程）；传具体值则额外核对目录名与 id 一致（重扫校验用）。 */
export function verifyPack(dirName: string | null, files: Record<string, Uint8Array>): PackVerdict {
  const reasons: string[] = []
  const warnings: string[] = []
  if (dirName !== null && !isSafeModuleDirName(dirName)) {
    return emptyVerdict([`模块 id 不合法（只允许字母数字/中划线/下划线/中文，1~64 字符）：${dirName}`])
  }

  const names = Object.keys(files)
  for (const name of names) {
    if (!PACK_ALLOWED_NAMES.includes(name)) reasons.push(`包内含多余条目：${name}（只允许 ${PACK_ALLOWED_NAMES.join(' / ')}）`)
  }
  for (const required of PACK_ALLOWED_NAMES) {
    if (!(required in files)) reasons.push(`包内缺少 ${required}`)
  }
  if (reasons.length > 0) return emptyVerdict(reasons)

  const caps: Record<string, number> = {
    [PACK_MANIFEST_NAME]: PACK_MAX_MANIFEST_BYTES,
    [PACK_ENTRY_NAME]: PACK_MAX_ENTRY_BYTES,
    [PACK_META_NAME]: PACK_MAX_META_BYTES
  }
  for (const name of PACK_ALLOWED_NAMES) {
    const limit = caps[name]
    if (files[name].length > limit) reasons.push(`${name} 超过上限（${files[name].length} > ${limit} 字节）`)
  }
  if (reasons.length > 0) return emptyVerdict(reasons)

  const manifestText = utf8Decode(files[PACK_MANIFEST_NAME])
  const entryCode = utf8Decode(files[PACK_ENTRY_NAME])
  const packText = utf8Decode(files[PACK_META_NAME])
  if (manifestText === null) return emptyVerdict(['manifest.json 不是合法 UTF-8'])
  if (entryCode === null) return emptyVerdict(['panel.js 不是合法 UTF-8'])
  if (packText === null) return emptyVerdict(['pack.json 不是合法 UTF-8'])

  let meta: PackMeta
  try {
    const parsed: unknown = JSON.parse(packText)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyVerdict(['pack.json 不是对象'])
    meta = parsed as PackMeta
  } catch {
    return emptyVerdict(['pack.json 不是标准 JSON'])
  }
  if (meta.format !== PACK_FORMAT) reasons.push(`包格式不支持：format=${String(meta.format)}（本机只认 ${PACK_FORMAT}）`)
  if (!Array.isArray(meta.files) || meta.files.length !== 2) {
    reasons.push('pack.json 的 files 必须恰好列出 manifest.json 与 panel.js 两件')
    return emptyVerdict(reasons)
  }

  const byPath = new Map<string, PackFileEntry>()
  for (const item of meta.files) {
    if (!item || typeof item !== 'object' || typeof item.path !== 'string') {
      reasons.push('pack.json 的 files 条目缺 path')
      continue
    }
    if (item.path !== PACK_MANIFEST_NAME && item.path !== PACK_ENTRY_NAME) {
      reasons.push(`pack.json 列了白名单外的文件：${item.path}`)
      continue
    }
    byPath.set(item.path, item)
  }
  for (const required of [PACK_MANIFEST_NAME, PACK_ENTRY_NAME]) {
    if (!byPath.has(required)) reasons.push(`pack.json 缺少 ${required} 的摘要`)
  }

  const actual: Record<string, Uint8Array> = {
    [PACK_MANIFEST_NAME]: files[PACK_MANIFEST_NAME],
    [PACK_ENTRY_NAME]: files[PACK_ENTRY_NAME]
  }
  for (const name of [PACK_MANIFEST_NAME, PACK_ENTRY_NAME]) {
    const declared = byPath.get(name)
    if (!declared) continue
    const bytes = actual[name]
    if (typeof declared.size !== 'number' || declared.size !== bytes.length) {
      reasons.push(`${name} 大小不符（包内声明 ${String(declared.size)}，实际 ${bytes.length} 字节）`)
    }
    if (typeof declared.sha256 !== 'string' || declared.sha256.toLowerCase() !== sha256Hex(bytes)) {
      reasons.push(`${name} 摘要不符（文件被改过或包损坏）`)
    }
  }

  const manifestDigest = manifestDigestOf(manifestText)
  if (manifestDigest === null) {
    reasons.push('manifest.json 不是合法 JSON 对象')
  } else if (typeof meta.manifestDigest !== 'string' || meta.manifestDigest !== manifestDigest) {
    reasons.push('manifest 语义摘要不符（声明与文件对不上）')
  }

  const parsedManifest = parseManifest(manifestText)
  let id = dirName ?? ''
  if (!parsedManifest.ok || !parsedManifest.manifest) {
    reasons.push(`manifest 校验不通过：${parsedManifest.reasons.join('；') || '未知原因'}`)
  } else {
    id = parsedManifest.manifest.id
    if (!isSafeModuleDirName(id)) {
      reasons.push(`模块 id 不能当目录名用（只允许字母数字/中划线/下划线/中文，1~64 字符）：${id}`)
    }
    if (dirName !== null && id !== dirName) {
      reasons.push(`目录名须与 manifest id 一致（id=${id}，目标目录=${dirName}）`)
    }
    if (meta.module && typeof meta.module.id === 'string' && meta.module.id && meta.module.id !== id) {
      reasons.push(`pack.json 自报的模块 id 与 manifest 不一致（pack=${meta.module.id} / manifest=${id}）`)
    }
  }

  const findings = scanModuleCode(entryCode)
  for (const f of findings) warnings.push(`第 ${f.line} 行用到 ${f.token}（${f.why}）——沙箱帧会拦住，但值得先看一眼`)

  return {
    ok: reasons.length === 0,
    id,
    reasons,
    warnings,
    findings,
    manifestText,
    entryCode,
    packText,
    meta,
    digests: { manifest: manifestDigest ?? '', entry: sha256Hex(actual[PACK_ENTRY_NAME]) }
  }
}
