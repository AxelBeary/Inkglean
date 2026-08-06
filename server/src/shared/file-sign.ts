import crypto from 'crypto'

// ============================================
// 安全：文件访问签名 — 替代 /uploads/ 全目录公开
// 仅 images/ 保持公开（画师作品集），references/ 和 deliverables/ 需签名
// ============================================

const FILE_TTL_MS = 15 * 60 * 1000 // 签名有效期 15 分钟

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  // M-6 修复：生产环境必须显式设置密钥，否则 fail-fast（防止默认值上线）
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET 未设置 — 生产环境必须配置（长度 ≥ 32 字符）')
  }
  return secret || 'dev-secret-change-in-production'
}

/**
 * 为文件路径生成带时效的签名 token
 * 格式: base64url(payload).base64url(hmac)
 */
export function signFilePath(filePath: string): string {
  const expires = Date.now() + FILE_TTL_MS
  const payload = Buffer.from(JSON.stringify({ p: filePath, e: expires })).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/**
 * 验证签名 token，返回文件路径或 null
 * 使用 timing-safe 比较防止时序攻击
 */
export function verifyFileToken(token: string | null | undefined): string | null {
  if (!token) return null
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx === -1) return null

  const payload = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)
  if (!payload || !sig) return null

  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (Date.now() > data.e) return null
    return data.p as string
  } catch (err) {
    console.warn('文件签名 token 解析失败（拒绝访问）', err)
    return null
  }
}

/**
 * 生成带签名的完整 URL（用于 API 响应）
 */
export function signedUrl(filePath: string): string {
  return `/uploads/${filePath}?sig=${signFilePath(filePath)}`
}

/**
 * 判断路径是否为公开目录（无需签名）
 */
export function isPublicUploadPath(urlPath: string): boolean {
  // C-1 修复：先解码再判断，防止 %2E%2E 等编码绕过前缀匹配
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch (err) {
    console.warn('上传路径解码失败（按非公开处理，走签名校验）', err)
    return false // 解码失败 → 视为非公开，走签名校验
  }
  // 安全：解码后含 .. 一律拒绝（路径穿越）
  if (decoded.includes('..')) return false
  return decoded.startsWith('/uploads/images/')
}
