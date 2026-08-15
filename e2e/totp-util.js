import crypto from 'crypto'

// ─── TOTP 工具（REQ-027）：E2E 真实动态口令登录链路共用，无开发后门 ───
// 固定测试密钥（RFC 6238 文档示例密钥）——仅注入 e2e 独立测试库，与生产/开发数据完全隔离
export const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'

/** Base32 解码（与 server/src/features/auth/totp.ts 的 base32Decode 一致） */
export function base32Decode(input) {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = String(input).toUpperCase().replace(/[\s-]/g, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of cleaned) {
    if (ch === '=') break
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) return null
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** 计算指定时间步的 6 位动态码（RFC 6238：30s 步长 / HMAC-SHA1 / 动态截断，与 totp.ts 一致） */
export function totpForCounter(secretBase32, counter) {
  const key = base32Decode(secretBase32)
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  msg.writeUInt32BE(counter >>> 0, 4)
  const hash = crypto.createHmac('sha1', key).update(msg).digest()
  const offset = hash[19] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3]
  return String(binary % 10 ** 6).padStart(6, '0')
}

/** 计算当前时刻的 6 位动态码 */
export function currentTotp(secretBase32) {
  return totpForCounter(secretBase32, Math.floor(Date.now() / 1000 / 30))
}

/**
 * REQ-041：计算下一时间步的动态码——预登录已消费当前步的码（重放防护），
 * step-up 必须用下一个步的码（校验窗口 ±1 恒可命中，且不与登录码哈希冲突）
 */
export function nextStepTotp(secretBase32) {
  return totpForCounter(secretBase32, Math.floor(Date.now() / 1000 / 30) + 1)
}

// E8 登出后需补登写回共享 token；服务端对同一 (画师, 时间步, 码) 有重放防护，
// 这里记录本进程已成功消费的时间步，重试时自动避开，避免“补登成功→用例失败→重试补登被拒”。
const usedLoginCounters = new Map()

/**
 * 生成一次“刷新登录”可用的 TOTP 候选（±1 窗口，跳过本进程已消费的时间步）。
 * 返回 [{ counter, code }]，调用方逐个尝试，命中后须调用 noteTotpLogin 记录。
 */
export function nextLoginTotp(qqNumber) {
  const now = Math.floor(Date.now() / 1000 / 30)
  const used = usedLoginCounters.get(qqNumber) ?? new Set()
  const candidates = []
  for (const offset of [-1, 0, 1]) {
    const counter = now + offset
    if (used.has(counter)) continue
    candidates.push({ counter, code: totpForCounter(E2E_TOTP_SECRET, counter) })
  }
  return candidates
}

/** 记录某个 QQ 已成功消费的 TOTP 时间步，供后续重试避开 */
export function noteTotpLogin(qqNumber, counter) {
  const used = usedLoginCounters.get(qqNumber) ?? new Set()
  used.add(counter)
  usedLoginCounters.set(qqNumber, used)
}
