// 同步确定性短摘要（sha256 hex 截断）——为什么不能用 crypto.subtle：
// 1) `crypto.subtle.digest()` 是**异步**的（返回 Promise），而本函数用在组件提交路径的
//    同步表达式里（幂等键派生要在发请求前算好），改成异步会把整条提交链改成 async 编排；
// 2) `crypto.subtle` 仅在**安全上下文**（HTTPS / localhost）可用，非 HTTPS 部署（内网 HTTP）
//    下取到的 `crypto.subtle` 是 undefined，裸调直接崩——与 `utils/id.ts` 里 randomUUID
//    的同一类坑（WEB-14 已踩过一次）；
// 3) 本函数只做「同输入恒同输出 + 不同输入不碰撞」的短摘要，**非密码学用途**，
//    也不拿它做任何安全判据（幂等键的信任边界在服务端 scope+key 主键）。
// 实现沿用桌面端 `desktop/src/modules/pack.ts` 的纯 TS SHA-256（同一算法、同一黄金向量口径），
// 前端侧独立一份是因为 desktop/ 与 web/ 是两个包，不跨端 import 源码。

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

/** UTF-8 编码（手写：happy-dom / 旧 WebView 不保证有 TextEncoder） */
function utf8Encode(text: string): Uint8Array {
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

/** SHA-256 → 小写 hex（64 字符，纯 [0-9a-f]） */
export function sha256Hex(input: string): string {
  const bytes = utf8Encode(input)
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

/** 服务端幂等键上限（server/src/shared/idempotency.ts 的 IDEMPOTENCY_KEY_MAX_LENGTH 同值） */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 64
/** 服务端幂等键字符集（同 IDEMPOTENCY_KEY_PATTERN） */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]+$/

/**
 * 由一组分段派生一个**服务端合规**的幂等键。
 *
 * 解决的就是 PR #116 的 B-1：直接拼 `${idemKey}:extra:${uid}` 会拼出
 * 「36+7+38=82 字符且含冒号」的串，撞 `readIdempotencyKey` 的 ≤64 与
 * `[A-Za-z0-9-]` 双重限制 → 端点恒 400，增项永远写不进、重试永远失败。
 *
 * 口径：`sha256Hex(parts.join('\u0000'))` 取前 48 位 hex
 * - ① 纯 [0-9a-f]（服务端字符集是 [A-Za-z0-9-] 的超集，合规）
 * - ② 48 ≤ 64，留 16 字符余量给将来加前缀
 * - ③ 同 (idemKey, uid) 恒同值：纯函数、无随机、无时间
 * - ④ 不同 uid 不碰撞：sha256 抗碰撞，48 hex = 192 bit，远超「同一画师一单的增项条数」
 *   的生日界（该端点本身还限制上限 20 条）
 *
 * 用 `\u0000` 分隔而不是 `:`：NUL 不会出现在这些 id 里，分段边界不会被拼串歧义吞掉
 * （`a|b` + `c` 与 `a` + `b|c` 必须得到不同摘要）。
 */
export function deriveIdempotencyKey(...parts: string[]): string {
  return sha256Hex(parts.join('\u0000')).slice(0, 48)
}
