// ============================================
// 密钥强度判定（815 审计拍板 #12）
// 生产环境弱会话密钥 fail-fast 的共享口径：
// auth.service（JWT 签发）/ file-sign（签名 URL）/ app.ts（cookie secret）三处复用
// ============================================

const KNOWN_DEFAULTS = ['dev-cookie-secret-change-in-production', 'dev-secret', '']

/** 弱会话密钥判定：dev- 前缀 / 已知默认值 / 长度不足 32（与 admin 健康检查 checkSecret 口径对齐） */
export function isWeakSessionSecret(secret: string): boolean {
  return secret.startsWith('dev-') || KNOWN_DEFAULTS.includes(secret) || secret.length < 32
}
