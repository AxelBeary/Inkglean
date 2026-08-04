import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import * as Sentry from '@sentry/node'
import { resolve, join, relative, sep } from 'path'
import { existsSync, readdirSync, statSync, renameSync, rmdirSync, createReadStream, mkdirSync, readFileSync } from 'fs'
import { initDatabase } from './db/init.js'
import db from './db/connection.js'
import { verifyFileToken, isPublicUploadPath } from './shared/file-sign.js'
import { ERROR_MESSAGES } from './shared/errors.js'

// ============================================
// 应用工厂 - 构建 Fastify 实例
// ============================================

export async function buildApp(opts = {}) {
  // trustProxy：Docker 部署时 Caddy 和 web 在不同容器，需信任 Docker 网段
  // 安全：默认只信任私有网段，防止攻击者伪造 X-Forwarded-For 绕过限流
  // 生产环境 Caddy 为唯一入口时可设 TRUST_PROXY=true
  const trustProxyEnv = process.env.TRUST_PROXY
  const trustProxy = trustProxyEnv === 'true'
    ? true
    : trustProxyEnv === 'false'
      ? false
      : (trustProxyEnv || ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'])
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy
  })

  // ─── 数据库初始化 ───
  initDatabase(db)

  // ─── 孤儿文件回收（内联执行 + 启动时立即跑一次）───
  // 事故修复：删除→移入回收站（.recycle-bin/YYYY-MM-DD/），画师表空时跳过
  const RECYCLE_BIN = '.recycle-bin'
  const gcUploads = () => {
    try {
      const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')
      if (!existsSync(UPLOAD_ROOT)) return

      // 安全检查：画师表为空 = 数据库异常（测试/损坏），跳过回收
      const artistCount = db.prepare('SELECT COUNT(*) as c FROM artists').get().c
      if (artistCount === 0) {
        app.log.warn('孤儿回收跳过：画师表为空（数据库可能异常）')
        return
      }

      const refs = new Set()
      const collect = (rows, field) => { for (const r of rows) if (r[field]) refs.add(r[field]) }
      collect(db.prepare('SELECT image_path FROM artworks').all(), 'image_path')
      collect(db.prepare('SELECT example_image FROM price_tiers').all(), 'example_image')
      collect(db.prepare('SELECT file_path FROM order_references').all(), 'file_path')
      collect(db.prepare('SELECT file_path FROM deliverables').all(), 'file_path')
      collect(db.prepare('SELECT avatar FROM artists').all(), 'avatar')
      // R19: 备注附图 — 不收集 = 在用备注附图被 GC 误删（数据丢失）
      collect(db.prepare('SELECT image_path FROM order_notes').all(), 'image_path')
      // v0.35 波1: 画风封面（v0.36 遗留漏收集，封面图上传 24h 后会被 GC 误删——数据丢失）
      collect(db.prepare('SELECT cover_image FROM art_styles').all(), 'cover_image')
      // v0.35 波1: 尺寸独立上传图（F1）
      collect(db.prepare('SELECT image FROM style_sizes').all(), 'image')

      const MIN_AGE_MS = 24 * 60 * 60 * 1000
      const now = Date.now()
      let recycled = 0, freed = 0

      const walk = (dir) => {
        const files = []
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

      for (const absPath of walk(UPLOAD_ROOT)) {
        const rel = relative(UPLOAD_ROOT, absPath).replace(/\\/g, '/')
        if (refs.has(rel)) continue
        if (now - statSync(absPath).mtimeMs < MIN_AGE_MS) continue
        const size = statSync(absPath).size
        try {
          // 移入回收站，保留原始相对路径结构
          const dest = join(recycleBinDay, rel)
          mkdirSync(join(dest, '..'), { recursive: true })
          renameSync(absPath, dest)
          freed += size; recycled++
        } catch { /* ignore */ }
      }

      const removeEmptyDirs = (dir) => {
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
      app.log.warn(`孤儿文件回收失败: ${err.message}`)
    }
  }
  gcUploads() // 启动时立即执行一次
  const _gcTimer = setInterval(gcUploads, 24 * 60 * 60 * 1000)
  _gcTimer.unref()

  // ─── 全局插件 ───
  // Cookie 支持（httpOnly token 存储）
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || process.env.SESSION_SECRET || 'dev-cookie-secret-change-in-production',
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
  const cspSentryDsn = process.env.SENTRY_DSN
  let cspConnectSrc = "connect-src 'self'"
  if (cspSentryDsn) {
    try { cspConnectSrc += ` ${new URL(cspSentryDsn).origin}` } catch { /* DSN 无效，忽略 */ }
  }
  const cspHeader = `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; ${cspConnectSrc}; font-src 'self'`

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    // P2-#21: embed 已删除（v0.24 审计），统一 CSP
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Content-Security-Policy', cspHeader)
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
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

    const sig = request.query?.sig
    const filePath = decodeURIComponent(request.url.slice('/uploads/'.length).split('?')[0])
    const verified = verifyFileToken(sig)
    if (verified !== filePath) {
      return reply.code(403).send({ error: '文件链接无效或已过期' })
    }
  })

  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res) => {
      // 安全头 — 禁止 MIME 嗅探 + 强制下载
      // @fastify/static v10: setHeaders 回调参数是 Fastify Reply 对象，用 .header()
      res.header('X-Content-Type-Options', 'nosniff')
      res.header('Content-Disposition', 'attachment')
    }
  })

  // ─── Sentry 错误监控（S-AC3: DSN 空/不设 = 完全禁用，零网络请求）───
  const sentryDsn = process.env.SENTRY_DSN_BACKEND
  if (sentryDsn && process.env.NODE_ENV !== 'development') {
    let release = 'unknown'
    try {
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
      release = pkg.version || release
    } catch { /* 读不到版本号不影响启动 */ }
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
  app.setErrorHandler((error, request, reply) => {
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
    if (error.detail && typeof error.detail === 'object' && typeof message === 'string') {
      message = message.replace(/\{([^}]+)\}/g, (raw, key) =>
        Object.prototype.hasOwnProperty.call(error.detail, key) ? String(error.detail[key]) : raw
      )
    }
    reply.status(status).send({
      code,
      error: message,
      detail: error.detail || undefined
    })
  })

  // ─── 注册功能路由 ───
  await app.register(import('./features/auth/auth.routes.js'))
  await app.register(import('./features/artist/artist.routes.js'))
  await app.register(import('./features/order/order.routes.js'))
  await app.register(import('./features/upload/upload.routes.js'), { uploadDir: UPLOAD_DIR })
  await app.register(import('./features/admin/admin.routes.js'))
  await app.register(import('./features/admin/health.routes.js'))
  await app.register(import('./features/pricing/pricing.routes.js'))
  await app.register(import('./features/pricing/style.routes.js'))
  await app.register(import('./features/guestbook/guestbook.routes.js'))

  // ─── 健康检查 ───
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }))

  // ─── 前端 SPA 静态文件 + fallback（手动路由，不依赖 @fastify/static wildcard）───
  const WEB_DIST = resolve(process.env.WEB_DIST || join(import.meta.dirname, '../../web/dist'))
  const hasWebDist = existsSync(WEB_DIST)

  if (hasWebDist) {
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
        reply.header('Content-Type', MIME[ext] || 'application/octet-stream')
        return reply.send(createReadStream(filePath))
      }
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(createReadStream(resolve(WEB_DIST, 'index.html')))
    })
  }

  // 非 GET 请求的 404 兜底
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: 'Not found' })
  })

  return app
}
