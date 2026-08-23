import Fastify from 'fastify'
import type { FastifyInstance, FastifyError, FastifyRequest } from 'fastify'
import type { LoggerOptions } from 'pino'
import type { Writable } from 'stream'
import Ajv from 'ajv'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import * as Sentry from '@sentry/node'
import crypto from 'crypto'
import { resolve, join, relative, sep } from 'path'
import { existsSync, readdirSync, statSync, renameSync, rmdirSync, createReadStream, mkdirSync, readFileSync, rmSync } from 'fs'
import { initDatabase } from './db/init.js'
import db from './db/connection.js'
import { verifyFileToken, isPublicUploadPath } from './shared/file-sign.js'
import { pruneIdempotencyKeys } from './shared/idempotency.js'
import { isWeakSessionSecret } from './shared/secrets.js'
import { ERROR_MESSAGES } from './shared/errors.js'
import type { AppError } from './shared/errors.js'
import { isSetupMode } from './features/setup/setup.service.js'  // REQ-038: 开箱设置守卫
import { buildOgMeta, injectOgMeta } from './features/og/og-meta.service.js'  // REQ-043 I1: OG 分享卡片

// ============================================
// 应用工厂 - 构建 Fastify 实例
// ============================================

/** logger 入参：省略/布尔 = 默认控制台；stream = 写入指定流（测试捕获用）；对象 = pino 选项透传 */
export async function buildApp(opts: { logger?: boolean | Writable | LoggerOptions } = {}): Promise<FastifyInstance> {
  // trustProxy：Docker 部署时 Caddy 和 web 在不同容器，需信任 Docker 网段
  // 安全：默认只信任私有网段，防止攻击者伪造 X-Forwarded-For 绕过限流
  // 生产环境 Caddy 为唯一入口时可设 TRUST_PROXY=true
  const trustProxyEnv = process.env.TRUST_PROXY
  const trustProxy = trustProxyEnv === 'true'
    ? true
    : trustProxyEnv === 'false'
      ? false
      : (trustProxyEnv || ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'])
  // 815-P2 金额#7（清扫批实测坐实）：ajv 的 multipleOf: 0.01 因浮点误差误拒合法金额
  //（8.21/0.01 = 821.0000000000001 → 判非整倍数拒收）。显式传入与 fastify 默认同配置的
  // ajv 实例并注册浮点安全关键字 moneyPrecision 替代（四舍五入后整数比对，语义不变）。
  // Fastify 5 无 app.ajv 属性，必须在工厂入参处传入。
  const ajv = new Ajv({
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    allErrors: false
  })
  ajv.addKeyword({
    keyword: 'moneyPrecision',
    type: 'number',
    validate: (_schema: unknown, data: number): boolean => {
      if (!Number.isFinite(data)) return false
      const scaled = data * 100
      return Math.abs(scaled - Math.round(scaled)) < 1e-6
    }
  })

  // logger：测试可传 Writable 捕获日志（如 origin 推断类只落日志的安全错误）
  const loggerOpt = typeof opts.logger === 'object' && opts.logger !== null && 'write' in opts.logger
    ? { level: 'info', stream: opts.logger }
    : (opts.logger ?? true)

  const app = Fastify({
    logger: loggerOpt,
    trustProxy
  })
  // 自定义校验编译器：用带 moneyPrecision 关键字的独立 ajv 实例（配置与 fastify 默认同款；
  // 仓库 schema 零 format 使用，无需 ajv-formats）
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema))

  // ─── 数据库初始化 ───
  initDatabase(db)

  // ─── 孤儿文件回收（内联执行 + 启动时立即跑一次）───
  // 事故修复：删除→移入回收站（.recycle-bin/YYYY-MM-DD/），画师表空时跳过
  const RECYCLE_BIN = '.recycle-bin'
  // R-20（审计批E）：埋点表 TTL——events/anon_tokens 只进不出，生产代码零清理，慢性膨胀。
  // events 保留 180 天：管理端统计窗口最宽 90 天（tracking.routes 钳制），留一倍余量；
  // anon_tokens 保留 30 天：与凭证 TTL 对齐（tracking.service ANON_TOKEN_TTL_DAYS=30，到期即失效）。
  // 其余表不动：guestbook_messages / order_activity_logs / order_notes / artworks
  // 为业务与审计数据，永久保留（v35 操作日志注释明确「永久保留，不清理」）。
  const EVENTS_TTL_DAYS = 180
  const ANON_TOKENS_TTL_DAYS = 30
  const gcUploads = () => {
    try {
      const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')
      if (!existsSync(UPLOAD_ROOT)) return

      // 安全检查：画师表为空 = 数据库异常（测试/损坏），跳过回收
      const artistCount = (db.prepare('SELECT COUNT(*) as c FROM artists').get() as { c: number }).c
      if (artistCount === 0) {
        app.log.warn('孤儿回收跳过：画师表为空（数据库可能异常）')
        return
      }

      const refs = new Set<string>()
      // ── 黑名单动态扫描（P0-2 修复；P3-24 审计批E收敛）──
      // 历史：早期是「显式 collect 清单 + 动态全表扫描」双轨。R19 备注附图、v0.35 画风封面
      // 都是显式清单漏登记导致的误删事故；动态扫描已覆盖全部 TEXT 列，双轨功能重叠，
      // 显式清单成为纯维护负担（新增引用字段漏登记有误导风险）。审计 P3-24 拍板二选一，
      // 只保留覆盖更全的动态扫描——后续新增引用字段无需再登记。
      // 从「白名单允许删」反转为「黑名单禁止删」：遍历所有表所有 TEXT 列，
      // 凡是非空且带路径分隔符（/ 或 \\）的值都视为「DB 仍引用」——被引用则文件绝不回收。
      // 漏登记新表/新字段最多多留垃圾，绝不丢数据（两次事故教训：R19 备注附图、v0.35 画风封面）。
      // 黑名单判定需查的表：不维护清单，动态遍历 sqlite_master 全部业务表（排除 sqlite_% 系统表）。
      const tableRows = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as Array<{ name: string }>
      for (const t of tableRows) {
        const tableName = t.name.replace(/"/g, '""')
        const colRows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string; type: string }>
        for (const c of colRows) {
          // 只扫文本类列（路径值必然 TEXT/CLOB；跳过 INTEGER/REAL 等）
          if (!/TEXT|CLOB/i.test(c.type)) continue
          const colName = c.name.replace(/"/g, '""')
          // 路径一般较短；>512 字符的值（如长 JSON/正文）不可能是文件相对路径，跳过省内存
          const pathRows = db.prepare(
            `SELECT DISTINCT "${colName}" AS v FROM "${tableName}" WHERE "${colName}" IS NOT NULL AND "${colName}" != '' AND length("${colName}") <= 512`
          ).all() as Array<{ v: unknown }>
          for (const r of pathRows) {
            const v = r.v
            if (typeof v === 'string' && (v.includes('/') || v.includes('\\'))) {
              refs.add(v.replace(/\\/g, '/'))
            }
          }
        }
      }

      // R-6（审计批E）：孤儿回收窗口 24h → 72h。
      // 复合炸弹：手工恢复旧 DB 备份后，备份时点之后新上传且已关联订单的文件在新 DB 里「无引用」，
      // 24h 窗口会把它们移入回收站。72h 给运维留出恢复后的关联核对窗口；超 72h 仍未引用的才是真孤儿。
      const MIN_AGE_MS = 72 * 60 * 60 * 1000
      const now = Date.now()
      let recycled = 0, freed = 0

      const walk = (dir: string) => {
        const files: string[] = []
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          // 跳过回收站目录，不参与 GC 扫描
          if (e.name === RECYCLE_BIN) continue
          const full = join(dir, e.name)
          if (e.isDirectory()) files.push(...walk(full))
          else files.push(full)
        }
        return files
      }

      // 回收站日期子目录：.recycle-bin/YYYY-MM-DD/
      const dateStr = new Date().toISOString().slice(0, 10)
      const recycleBinDay = join(UPLOAD_ROOT, RECYCLE_BIN, dateStr)

      // 回收站 TTL（P2-4 验收「回收站超期删」）：超过 30 天的日期子目录整体物理删除，
      // 防回收站无限膨胀。30 天保留期 = 软删除后的恢复窗口（admin 清空接口仍可立即清）。
      const RECYCLE_TTL_MS = 30 * 24 * 60 * 60 * 1000
      const recycleRoot = join(UPLOAD_ROOT, RECYCLE_BIN)
      if (existsSync(recycleRoot)) {
        for (const e of readdirSync(recycleRoot, { withFileTypes: true })) {
          if (!e.isDirectory()) continue
          if (!/^\d{4}-\d{2}-\d{2}$/.test(e.name)) continue // 只认日期目录名，防误删
          const dirDate = new Date(e.name + 'T00:00:00')
          if (isNaN(dirDate.getTime())) continue
          if (Date.now() - dirDate.getTime() > RECYCLE_TTL_MS) {
            try {
              rmSync(join(recycleRoot, e.name), { recursive: true, force: true })
              app.log.info(`孤儿回收: 清理超期回收站目录 ${e.name}`)
            } catch (err) {
              app.log.warn({ err }, '孤儿回收: 清理超期回收站目录失败')
            }
          }
        }
      }

      // ── 埋点表 TTL（R-20）──
      // created_at 与 tracking.service 写入/续期口径一致（SQLite datetime('now') 文本，UTC），
      // 用 datetime('now', ?) 同款表达式比较，避免 JS ISO 字符串与库内格式混比。
      const eventsDeleted = db.prepare("DELETE FROM events WHERE created_at < datetime('now', ?)").run(`-${EVENTS_TTL_DAYS} days`).changes
      const anonDeleted = db.prepare("DELETE FROM anon_tokens WHERE created_at < datetime('now', ?)").run(`-${ANON_TOKENS_TTL_DAYS} days`).changes
      if (eventsDeleted > 0 || anonDeleted > 0) {
        app.log.info(`埋点 TTL 清理: events 删除 ${eventsDeleted} 条, anon_tokens 删除 ${anonDeleted} 条`)
      }

      // ── 幂等键 TTL（审计批 D-2 接线）──
      // 幂等缓存只为防短时窗重复提交，24h 足够；超期行累积无意义。
      const idemDeleted = pruneIdempotencyKeys(24)
      if (idemDeleted > 0) {
        app.log.info(`幂等键 TTL 清理: 删除 ${idemDeleted} 条`)
      }

      let skippedFiles = 0
      for (const absPath of walk(UPLOAD_ROOT)) {
        const rel = relative(UPLOAD_ROOT, absPath).replace(/\\/g, '/')
        if (refs.has(rel)) continue
        try {
          // d3 P2: 单文件瞬时错误（walk 期间被外部删除/权限）跳过并计数，不中止整轮回收
          const st = statSync(absPath)
          if (now - st.mtimeMs < MIN_AGE_MS) continue
          const size = st.size
          // 移入回收站，保留原始相对路径结构
          const dest = join(recycleBinDay, rel)
          mkdirSync(join(dest, '..'), { recursive: true })
          renameSync(absPath, dest)
          freed += size; recycled++
        } catch (err) {
          skippedFiles++
          app.log.warn({ err }, '孤儿文件回收: 单文件跳过（stat/迁移失败）')
        }
      }
      if (skippedFiles > 0) {
        app.log.warn(`孤儿文件回收: ${skippedFiles} 个文件因瞬时错误跳过，下轮重试`)
      }

      const removeEmptyDirs = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory() && e.name !== RECYCLE_BIN) {
            const full = join(dir, e.name)
            removeEmptyDirs(full)
            try { rmdirSync(full) } catch { /* not empty */ }
          }
        }
      }
      removeEmptyDirs(UPLOAD_ROOT)

      if (recycled > 0) app.log.info(`孤儿文件回收: 移入回收站 ${recycled} 个，释放 ${(freed / 1024 / 1024).toFixed(1)} MB`)
    } catch (err) {
      app.log.warn(`孤儿文件回收失败: ${(err as Error).message}`)
    }
  }
  gcUploads() // 启动时立即执行一次
  const _gcTimer = setInterval(gcUploads, 24 * 60 * 60 * 1000)
  _gcTimer.unref()

  // 815 拍板 #1⑥：启动时扫描已过期的取消撤销窗口并补执行队列重排/递补
  //（复用迁移崩溃恢复思路：宕机/重启期间过期的窗口不丢结算）
  try {
    const { settleExpiredUndoWindows } = await import('./features/order/order-status.js')
    settleExpiredUndoWindows()
  } catch (err) {
    app.log.warn({ err }, '启动扫描撤销窗口失败（不阻断启动）')
  }

  // ─── 全局插件 ───
  // Cookie 支持（httpOnly token 存储）
  // L-9（审计 五#8）: 删除弱默认字符串——COOKIE_SECRET 未设时回落 SESSION_SECRET；
  // 两者都无：生产环境抛错（fail-fast），开发环境生成随机密钥并 warn（与 auth.service 同款口径）
  const cookieSecret = process.env.COOKIE_SECRET || process.env.SESSION_SECRET
  let resolvedCookieSecret: string
  if (!cookieSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('COOKIE_SECRET/SESSION_SECRET 未设置——生产环境拒绝启动，请配置强随机值')
    }
    resolvedCookieSecret = crypto.randomBytes(32).toString('hex')
    console.warn('⚠️  COOKIE_SECRET/SESSION_SECRET 未设置，已生成随机开发密钥（每次启动变化，仅限开发环境）')
  } else {
    resolvedCookieSecret = cookieSecret
  }
  // 815 审计拍板 #12：生产环境 cookie 密钥同样拒绝弱值（兜底链末端已无 dev 默认值，同款强校验）
  if (process.env.NODE_ENV === 'production' && isWeakSessionSecret(resolvedCookieSecret)) {
    throw new Error('COOKIE_SECRET/SESSION_SECRET 为弱值——生产环境拒绝启动，请配置强随机值')
  }
  await app.register(fastifyCookie, {
    secret: resolvedCookieSecret,
    parseOptions: {}
  })

  // CORS：生产环境必须设置 CORS_ORIGIN，否则默认 same-origin（不注册 CORS 插件）
  const corsOrigin = process.env.CORS_ORIGIN
  if (corsOrigin) {
    await app.register(fastifyCors, {
      origin: corsOrigin.split(','),
      credentials: true
    })
  } else if (process.env.NODE_ENV !== 'production') {
    // 开发环境：允许任意来源（方便本地调试）
    await app.register(fastifyCors, { origin: true, credentials: true })
  }
  // 生产环境未设置 CORS_ORIGIN → 不注册 CORS → 浏览器默认 same-origin 策略

  // ─── 安全响应头（轻量替代 helmet）───
  // #43a: CSP connect-src 动态拼接 Sentry DSN 域名（未配置则不加）
  // 批4b: .env 实际变量名是 SENTRY_DSN_BACKEND（docker-compose env_file 全量注入），向后兼容 SENTRY_DSN
  const cspSentryDsn = process.env.SENTRY_DSN_BACKEND || process.env.SENTRY_DSN
  let cspConnectSrc = "connect-src 'self'"
  if (cspSentryDsn) {
    try { cspConnectSrc += ` ${new URL(cspSentryDsn).origin}` } catch (err) { app.log.warn({ err }, 'SENTRY DSN 无效，CSP 不拼接 Sentry 域名') }
  }
  // 安全加固批 F3: 移除 script-src 'unsafe-eval'（Vue 3 生产构建模板预编译不需要 eval，
  // 删除可显著缩小 XSS 利用面；实测隔离实例无 CSP violation 后合入）
  // 812-B4: 首帧主题防闪白——index.html 头部内联脚本（纯原生 JS）需要精确哈希白名单；
  // 不放宽 'unsafe-inline'，脚本内容变更时需同步更新哈希（web/index.html 注释标有 CSP 锚点）
  const cspHeader = `default-src 'self'; script-src 'self' 'sha256-jzYB8Dl3+AO/QlkS+Ln5a1NtuFOA9TBqLqSHu06N+p8='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; ${cspConnectSrc}; font-src 'self'`

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    // P2-#21: embed 已删除（v0.24 审计），统一 CSP
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Content-Security-Policy', cspHeader)
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    // 安全加固批 F9: 补充安全头（纵深防御；图片/API 均同源，CORP same-origin 无副作用）
    reply.header('Cross-Origin-Opener-Policy', 'same-origin')
    reply.header('Cross-Origin-Resource-Policy', 'same-origin')
    reply.header('X-Permitted-Cross-Domain-Policies', 'none')
  })

  // ─── REQ-038: 开箱设置守卫 — 未初始化时除健康检查/setup/静态资源外返回 503 ───
  app.addHook('onRequest', async (request, reply) => {
    // REQ-038: 开箱设置守卡 — 仅生产环境生效
    if (process.env.NODE_ENV !== 'production') return
    // 只拦截 /api/ 路径，放行静态资源、健康检查、setup 路径
    if (!request.url.startsWith('/api/')) return
    if (request.url === '/api/health' || request.url.startsWith('/api/setup/')) return
    if (isSetupMode()) {
      return reply.code(503).send({ code: 'SETUP_REQUIRED', error: '系统尚未初始化，请先完成开箱设置' })
    }
  })

  // ─── 静态文件服务（上传目录） ───
  const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
  // ENV-1 修复：确保上传目录存在（全新部署时不存在，首次上传会失败）
  mkdirSync(UPLOAD_DIR, { recursive: true })

  // 安全：签名校验 — references/ 和 deliverables/ 需要有效签名才能访问
  // images/ 保持公开（画师作品集/头像/档位示例图）
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/uploads/')) return
    if (isPublicUploadPath(request.url)) return

    const sig = (request.query as { sig?: string } | undefined)?.sig
    const filePath = decodeURIComponent(request.url.slice('/uploads/'.length).split('?')[0])
    // 815 拍板 #4：交付文件不支持分段下载（防多线程下载器乱序绕过一次性下载）；
    // 下载器场景由服务层 60 秒兜底锁定兼顾
    if (filePath.startsWith('deliverables/') && request.headers.range) {
      return reply.code(416).send({ error: '交付文件不支持分段下载' })
    }
    const verified = verifyFileToken(sig)
    if (verified !== filePath) {
      return reply.code(403).send({ error: '文件链接无效或已过期' })
    }
  })

  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res, filePath) => {
      // 安全头 — 禁止 MIME 嗅探
      // @fastify/static v10: setHeaders 回调参数是 Fastify Reply 对象，用 .header()
      res.header('X-Content-Type-Options', 'nosniff')
      // 环境批 B2: 区分公开与签名路径的响应头语义
      // 公开路径（images/）→ inline（浏览器直接预览，去掉强制下载头）+ 适度缓存
      // 签名路径（references/deliverables/notes）→ attachment（强制下载）+ no-store（签名 URL 不应被缓存）
      const rel = relative(UPLOAD_DIR, filePath).split(sep).join('/')
      const isPublic = isPublicUploadPath('/uploads/' + rel)
      if (isPublic) {
        res.header('Content-Disposition', 'inline')
        res.header('Cache-Control', 'public, max-age=86400')
      } else {
        res.header('Content-Disposition', 'attachment')
        res.header('Cache-Control', 'no-store')
      }
    }
  })

  // ─── Sentry 错误监控（S-AC3: DSN 空/不设 = 完全禁用，零网络请求）───
  const sentryDsn = process.env.SENTRY_DSN_BACKEND
  if (sentryDsn && process.env.NODE_ENV !== 'development') {
    let release = 'unknown'
    try {
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
      release = pkg.version || release
    } catch (err) { app.log.warn({ err }, '读取 package.json 版本号失败（不影响启动）') }
    Sentry.init({
      dsn: sentryDsn,
      release,
      environment: process.env.NODE_ENV || 'production',
      sendDefaultPii: false, // S-AC6: 不上传用户 IP
      tracesSampleRate: 0 // 不做性能追踪，只捕获错误
    })
    app.log.info(`Sentry 已启用（release=${release}）`)
  }

  // ─── 全局错误处理：结构化错误码 + 中文友好提示 ───
  // C-2 修复：必须在所有 app.register() 之前设置
  // Fastify 插件封装机制下，子作用域只继承注册时已存在的 error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      // Fastify JSON Schema 校验失败
      const field = error.validation[0]?.instancePath?.replace(/^\//, '') || '参数'
      return reply.code(400).send({ code: 'VALIDATION', error: `请求参数格式不正确（${field}）` })
    }
    const status = error.statusCode || 500
    // 安全：500 级别错误不透传 message（可能泄露表名/列名/路径），仅记日志
    if (status >= 500) {
      request.log.error({ err: error, url: request.url }, '未处理的服务端错误')
      Sentry.captureException(error) // S2: 上报 Sentry（未 init 时为 no-op）
      return reply.status(500).send({ code: 'INTERNAL', error: '服务器内部错误' })
    }
    // 4xx 业务错误：返回结构化错误码 + 中文友好消息
    const code = error.code || 'UNKNOWN'
    let message = ERROR_MESSAGES[code] || error.message || '请求错误'
    // 插值消息模板中的 {key} 占位符（detail 提供值，如 STAGES_RESET_BLOCKED 的 {count}）
    // detail 为 AppError 扩展属性（FastifyError 未声明），断言访问
    const detail = (error as AppError).detail
    if (detail && typeof detail === 'object' && typeof message === 'string') {
      message = message.replace(/\{([^}]+)\}/g, (raw, key) =>
        Object.prototype.hasOwnProperty.call(detail, key) ? String((detail as Record<string, unknown>)[key]) : raw
      )
    }
    reply.status(status).send({
      code,
      error: message,
      detail: detail || undefined
    })
  })

  // ─── 注册功能路由 ───
  await app.register(import('./features/setup/setup.routes.js'))  // REQ-038: 开箱设置
  await app.register(import('./features/invite/invite.routes.js'))  // REQ-039: 邀请码注册
  await app.register(import('./features/auth/auth.routes.js'))
  await app.register(import('./features/artist/artist.routes.js'))
  await app.register(import('./features/artist/calendar-feed.routes.js'))  // oimimo 吸纳批一：日历订阅（ICS）
  await app.register(import('./features/order/order.routes.js'))
  await app.register(import('./features/upload/upload.routes.js'), { uploadDir: UPLOAD_DIR })
  await app.register(import('./features/admin/admin.routes.js'))
  await app.register(import('./features/admin/health.routes.js'))
  await app.register(import('./features/pricing/pricing.routes.js'))
  await app.register(import('./features/pricing/style.routes.js'))
  await app.register(import('./features/guestbook/guestbook.routes.js'))
  await app.register(import('./features/tracking/tracking.routes.js'))
  await app.register(import('./features/compliance/compliance.routes.js'))  // REQ-042: 合规与内容安全

  // ─── 健康检查 ───
  app.get('/api/health', async (_request, reply) => {
    // P2-运维：health 查库——DB 挂了返回 503（容器 healthcheck / 负载均衡能感知），而非 200 假健康
    try {
      db.prepare('SELECT 1').get()
    } catch {
      return reply.code(503).send({ status: 'error', error: 'database unavailable' })
    }
    return { status: 'ok', time: new Date().toISOString() }
  })

  // ─── 前端 SPA 静态文件 + fallback（手动路由，不依赖 @fastify/static wildcard）───
  const WEB_DIST = resolve(process.env.WEB_DIST || join(import.meta.dirname, '../../web/dist'))
  const hasWebDist = existsSync(WEB_DIST)

  if (hasWebDist) {
    // REQ-043 I1: 仅命中 /artist/:subdomain 的 HTML 请求（Accept 含 text/html 且非 XHR）时注入 OG meta；
    // 其余 SPA 路由保持 index.html 静态默认，不整页替换
    const OG_ARTIST_ROUTE_RE = /^\/artist\/[^/]+$/
    const wantsHtml = (request: FastifyRequest): boolean => {
      const accept = String(request.headers.accept || '').toLowerCase()
      if (!accept.includes('text/html')) return false
      return String(request.headers['x-requested-with'] || '').toLowerCase() !== 'xmlhttprequest'
    }
    const MIME = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.json': 'application/json',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
      '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ttf': 'font/ttf', '.map': 'application/json'
    }
    // 通配路由：提供 dist/ 下真实文件，不存在则 SPA fallback
    // Fastify 路由优先级：静态路由 > 参数路由 > 通配路由，不会抢占 /api/* 和 /uploads/*
    app.get('/*', (request, reply) => {
      const urlPath = request.url.split('?')[0]
      if (urlPath.startsWith('/api/') || urlPath.startsWith('/uploads/')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      const filePath = resolve(WEB_DIST, '.' + urlPath)
      // P2-#22: 路径穿越防护加分隔符（防 /app/web/dist2/secret 前缀匹配）
      // v0.28 D: Windows 下 resolve() 产生反斜杠，用 path.sep 兼容（五号发现：本地 E2E 全挂）
      if ((filePath === WEB_DIST || filePath.startsWith(WEB_DIST + sep)) && existsSync(filePath) && statSync(filePath).isFile()) {
        const ext = filePath.slice(filePath.lastIndexOf('.'))
        reply.header('Content-Type', MIME[ext as keyof typeof MIME] || 'application/octet-stream')
        // 环境批 B1: 静态资源缓存头
        // /assets/*（vite hash 文件名产物）→ 长缓存 immutable（内容指纹变更即换文件名，永不失效）
        // 其余真实文件（如 favicon）→ 短缓存，避免与 index.html 同策略
        if (urlPath.startsWith('/assets/')) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          reply.header('Cache-Control', 'public, max-age=300')
        }
        return reply.send(createReadStream(filePath))
      }
      reply.header('Content-Type', 'text/html; charset=utf-8')
      // 环境批 B1: index.html / SPA fallback → no-cache（保证发版即生效）
      reply.header('Cache-Control', 'no-cache')
      // REQ-043 I1: 画师主页 HTML 请求注入 OG（未找到画师返回默认 OG，不报错）
      if (OG_ARTIST_ROUTE_RE.test(urlPath) && wantsHtml(request)) {
        const subdomain = urlPath.slice('/artist/'.length)
        const html = readFileSync(resolve(WEB_DIST, 'index.html'), 'utf8')
        return reply.send(injectOgMeta(html, buildOgMeta(subdomain)))
      }
      return reply.send(createReadStream(resolve(WEB_DIST, 'index.html')))
    })
  }

  // 非 GET 请求的 404 兜底
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: 'Not found' })
  })

  return app
}
