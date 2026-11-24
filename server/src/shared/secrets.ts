// ============================================
// 密钥强度判定（815 审计拍板 #12）
// 生产环境弱会话密钥 fail-fast 的共享口径：
// auth.service（JWT 签发）/ file-sign（签名 URL）/ app.ts（cookie secret）三处复用
// ============================================

const KNOWN_DEFAULTS = ['dev-cookie-secret-change-in-production', 'dev-secret', '']

/**
 * F0156（B6）: 低熵形态检测——只看长度/前缀会放行 'aaaa…' 这类可预测长串。
 * 判弱口径：去重字符不足 4，或整串由 ≤16 字符的短周期重复拼成（如 'abcd'.repeat(16)）。
 * install.mjs 生成的 64 位随机 hex（≥16 种字符、无短周期）不受影响。
 */
function isLowEntropySecret(secret: string): boolean {
  if (new Set(secret).size < 4) return true
  for (let period = 2; period <= Math.min(16, secret.length - 1); period++) {
    if (secret.length % period === 0 && secret === secret.slice(0, period).repeat(secret.length / period)) {
      return true
    }
  }
  return false
}

/**
 * 弱会话密钥判定：dev- 前缀 / 已知默认值 / 长度不足 32 / 低熵重复形态。
 * F0156（B6）在原口径（与 admin 健康检查 checkSecret 对齐）上加低熵检测；
 * health.service.ts checkSecret 仍是旧三口径（admin 域不在本批允许改动内，仅在此留注）。
 */
export function isWeakSessionSecret(secret: string): boolean {
  return secret.startsWith('dev-') || KNOWN_DEFAULTS.includes(secret) || secret.length < 32 || isLowEntropySecret(secret)
}
