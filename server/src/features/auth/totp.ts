// ============================================
// TOTP 核心（RFC 6238 / RFC 4226 / RFC 4648）
// 零依赖纯函数：Node 内置 crypto 实现
// 用于画师登录动态口令（REQ-027）
// ============================================
import crypto from 'crypto'

// 时间步长（秒）— RFC 6238 标准 30 秒
export const TOTP_STEP_SECONDS = 30
// 动态码位数
export const TOTP_DIGITS = 6
// 默认校验窗口（±1 个时间步，容忍手机时钟漂移）
export const TOTP_DEFAULT_WINDOW = 1
// 密钥字节长度（160 bit = 20 字节，标准 TOTP 推荐长度）
const SECRET_BYTES = 20

// RFC 4648 Base32 字母表（无 padding，大写）
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// ============================================
// Base32 编码 / 解码（RFC 4648）
// ============================================

/** 字节数组 → Base32 字符串（无 padding） */
export function base32Encode(buf: Buffer | Uint8Array): string {
  const bytes = Buffer.from(buf)
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

/**
 * Base32 字符串 → 字节数组
 * 容错：忽略空格/连字符，小写转大写，自动补 padding
 * 非法字符返回 null（调用方按格式错误处理）
 */
export function base32Decode(input: string): Buffer | null {
  const cleaned = String(input).toUpperCase().replace(/[\s-]/g, '')
  if (!cleaned) return null

  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of cleaned) {
    if (ch === '=') break // 遇 padding 结束
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) return null // 非法字符
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// ============================================
// 密钥生成
// ============================================

/** 生成随机 TOTP 密钥（160 bit 随机 → Base32，32 字符） */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(SECRET_BYTES))
}

// ============================================
// HOTP 计算（RFC 4226 动态截断）
// ============================================

/**
 * 计算单个时间步的动态码
 * @param secretBase32 密钥（Base32）
 * @param counter 时间步计数（Unix 秒 / 30）
 * @param digits 输出位数（默认 6）
 */
export function computeTotpAtCounter(secretBase32: string, counter: number, digits = TOTP_DIGITS): string {
  const key = base32Decode(secretBase32)
  if (!key) throw new Error('TOTP 密钥格式无效（非法 Base32）')

  // 计数器 8 字节大端序
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  msg.writeUInt32BE(counter >>> 0, 4)

  // HMAC-SHA1（RFC 6238 默认算法）
  const hash = crypto.createHmac('sha1', key).update(msg).digest()

  // 动态截断（RFC 4226）
  const offset = hash[19] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3]

  const otp = binary % 10 ** digits
  return String(otp).padStart(digits, '0')
}

/**
 * 计算指定时刻（Unix 毫秒）的动态码
 */
export function computeTotp(secretBase32: string, timestampMs: number, digits = TOTP_DIGITS): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS)
  return computeTotpAtCounter(secretBase32, counter, digits)
}

// ============================================
// 校验（±N 窗口）
// ============================================

/**
 * 校验动态码（默认 ±1 窗口：当前 + 前后各 1 个时间步）
 * 校验输入前先做长度检查，避免 timingSafeEqual 崩溃
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  timestampMs: number,
  window = TOTP_DEFAULT_WINDOW
): boolean {
  if (!/^\d{6}$/.test(String(code))) return false
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS)
  for (let offset = -window; offset <= window; offset++) {
    const candidate = computeTotpAtCounter(secretBase32, counter + offset)
    const a = Buffer.from(candidate)
    const b = Buffer.from(String(code))
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

// ============================================
// otpauth URI（二维码内容）
// ============================================

/** 构建 otpauth:// URI（Authenticator App 扫码格式） */
export function buildOtpAuthUri(secretBase32: string, account: string, issuer = '绘约'): string {
  // RFC 3986 编码 label 中的特殊字符（account 通常是 QQ 号，仍防御性编码）
  const encodedAccount = encodeURIComponent(account)
  const encodedIssuer = encodeURIComponent(issuer)
  const params = [
    'secret=' + secretBase32,
    'issuer=' + encodedIssuer,
    'algorithm=SHA1',
    'digits=6',
    'period=30'
  ]
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?${params.join('&')}`
}
