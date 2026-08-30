import crypto from 'crypto'

// ============================================
// 安全：文件访问签名 — 替代 /uploads/ 全目录公开
// 仅 images/ 保持公开（画师作品集），references/ 和 deliverables/ 需签名
// 签名密钥策略与会话密钥对齐（P3-23，审计批E）：生产无密钥 fail-fast；开发随机化
// ============================================

// 260830 审计 H-4：15 分钟缩至 5 分钟——交付文件下载为即时行为（点「开始下载」即整取），
// 缩短签名窗口压缩 URL 被转发/盗链的利用面；慢网下载失败的兜底是「再点一次开始」
//（重新签发新链接），不靠长窗口苟活。参考图/备注附图等其余签名路径同步受益。
const FILE_TTL_MS = 5 * 60 * 1000 // 签名有效期 5 分钟

// P3-23（审计批E）：开发密钥策略对齐 auth.service 会话密钥（P1-3 同款）——
// 固定串 'dev-secret-change-in-production' 可被离线爆破伪造签名 URL；
// 开发环境（非 production）启动时随机生成 + console.warn 提示，生产 fail-fast 保持 M-6 语义。
// 注意：开发密钥每次启动变化，已签名 URL 重启后失效属预期（与测试环境上传钩子行为核对过，
// vitest 注入 SESSION_SECRET，测试不依赖固定开发密钥）。
function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // M-6 修复：生产环境必须显式设置密钥，否则 fail-fast（防止默认值上线）
      throw new Error('SESSION_SECRET 未设置 — 生产环境必须配置（长度 ≥ 32 字符）')
    }
    const devSecret = crypto.randomBytes(32).toString('hex')
    console.warn('⚠️  SESSION_SECRET 未设置，文件签名已生成随机开发密钥（每次启动变化，仅限开发环境）')
    return devSecret
  }
  // 815 审计拍板 #12：与 auth.service 同款弱值 fail-fast（dev 前缀/默认值/过短拒绝启动）
  if (process.env.NODE_ENV === 'production' && (secret.startsWith('dev-') || secret.length < 32)) {
    throw new Error('SESSION_SECRET 为弱值 — 生产环境拒绝启动，请更换为强随机值')
  }
  return secret
}

// 模块加载时固定密钥（与 auth.service 的 SECRET 同款），避免每次调用重复生成/重复读取
const SECRET = getSecret()

/**
 * 260830 审计 H-4：交付文件「一次性下载」结构化载荷。
 * 编入 token 载荷、HMAC 全覆盖——篡改任一字段即验签失败；
 * /uploads 钩子凭它与 deliverables 账本（download_nonce/download_locked）对账，
 * 令签名 URL 从「15 分钟内可无限转发」收紧为「只对本次签发有效」。
 */
export interface FileTokenClaims {
  /** deliverables 表行 id（访问层据此查账本） */
  deliverableId: number
  /**
   * 本次签发随机数。两种模式（260830 审计 H-4 收口）：
   * - 携带 nonce = 下载模式：每次 download-start 换新，钩子对账锁定与 nonce；
   * - 省略/空 = 预览模式：画师端预览自己的交付物（拼图选图/水印/详情页），
   *   钩子只查行存在，不查锁定（锁定只约束客户下载，画师始终可看自己的完稿）。
   */
  nonce?: string
}

/**
 * 为文件路径生成带时效的签名 token
 * 格式: base64url(payload).base64url(hmac)
 * claims 可选：不携带载荷的旧式调用（参考图/备注附图等）行为完全不变
 */
export function signFilePath(filePath: string, claims?: FileTokenClaims): string {
  const expires = Date.now() + FILE_TTL_MS
  const body = claims
    ? { p: filePath, e: expires, d: claims.deliverableId, ...(claims.nonce ? { n: claims.nonce } : {}) }
    : { p: filePath, e: expires }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** 验签结果（含结构化载荷；载荷缺失/畸形时 claims 为 null = 旧式链接） */
export interface VerifiedFileToken {
  path: string
  claims: FileTokenClaims | null
}

/**
 * 验证签名 token，返回文件路径 + 结构化载荷（或 null）
 * 使用 timing-safe 比较防止时序攻击。
 * 载荷校验从严：deliverableId 须正整数；nonce 非空字符串时为下载模式载荷，
 * 缺失/空时为预览模式载荷（仅 deliverableId）；其余畸形按「无载荷旧式链接」处理
 *（交付目录语义下即被钩子拒绝）。
 */
export function verifyFileTokenDetailed(token: string | null | undefined): VerifiedFileToken | null {
  if (!token) return null
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx === -1) return null

  const payload = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)
  if (!payload || !sig) return null

  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.e !== 'number' || Date.now() > data.e) return null
    if (typeof data.p !== 'string') return null
    let claims: FileTokenClaims | null = null
    if (Number.isInteger(data.d) && data.d > 0) {
      claims = (typeof data.n === 'string' && data.n.length > 0)
        ? { deliverableId: data.d, nonce: data.n }
        : { deliverableId: data.d }
    }
    return { path: data.p, claims }
  } catch (err) {
    console.warn('文件签名 token 解析失败（拒绝访问）', err)
    return null
  }
}

/**
 * 验证签名 token，返回文件路径或 null（向后兼容：不关心载荷的调用方行为不变）
 */
export function verifyFileToken(token: string | null | undefined): string | null {
  return verifyFileTokenDetailed(token)?.path ?? null
}

/**
 * 生成带签名的完整 URL（用于 API 响应）
 * claims 可选：交付文件一次性下载链接携带载荷，其余路径旧式签名不变
 */
export function signedUrl(filePath: string, claims?: FileTokenClaims): string {
  return `/uploads/${filePath}?sig=${signFilePath(filePath, claims)}`
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
