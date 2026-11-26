// ============================================
// 密钥强度判定（815 审计拍板 #12）
// 生产环境弱会话密钥 fail-fast 的共享口径：
// auth.service（JWT 签发）/ file-sign（签名 URL）/ app.ts（cookie secret）三处复用
// ============================================

const KNOWN_DEFAULTS = ['dev-cookie-secret-change-in-production', 'dev-secret', '']

/**
 * F0156（B6 / PR114 MINOR-8）: 低熵形态检测——只看长度/前缀会放行 'aaaa…' 这类可预测长串。
 * 判弱口径：
 *   1. 去重字符不足 4（'a'.repeat(64)、'ab'.repeat(32) 等）；
 *   2. ≤16 字符的短前缀在整串中重复覆盖率 ≥80%——不再要求长度整除周期。
 *      原判据只在 `secret.length % period === 0` 时比对整串，'A'.repeat(40)+'bcd'
 *      （长度 43、4 种字符）不满足任何整除周期而漏判强；覆盖率口径按重复主体捕获它。
 * install.mjs 生成的 64 位随机 hex（无短周期重复）不受影响；'6949ef'+'0'.repeat(58)
 * 这类合成 hex 的最大覆盖率 <80%，维持既有强判口径。
 */
function isLowEntropySecret(secret: string): boolean {
  if (new Set(secret).size < 4) return true
  const maxPeriod = Math.min(16, Math.floor(secret.length / 2))
  for (let period = 2; period <= maxPeriod; period++) {
    const unit = secret.slice(0, period)
    let matched = 0
    for (let i = 0; i < secret.length; i++) {
      if (secret[i] === unit[i % period]) matched++
    }
    if (matched / secret.length >= 0.8) return true
  }
  return false
}

/**
 * 弱会话密钥判定：dev- 前缀 / 已知默认值 / 长度不足 32 / 低熵重复形态。
 * 四处共用同一判据：auth.service.ts(getSecret) / app.ts(cookie) /
 * shared/idempotency.ts(envelopeKey) 三处生产 fail-fast + admin health.service.ts(checkSecret) 诊断。
 */
export function isWeakSessionSecret(secret: string): boolean {
  return secret.startsWith('dev-') || KNOWN_DEFAULTS.includes(secret) || secret.length < 32 || isLowEntropySecret(secret)
}
