import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import { initDatabase } from './db/init.js'
import db from './db/connection.js'

// ============================================
// 应用工厂 - 构建 Fastify 实例
// ============================================

export async function buildApp(opts = {}) {
  // trustProxy：Docker 部署时 Caddy 和 web 在不同容器，需信任 Docker 网段
  // 生产环境建议设置 TRUST_PROXY=true（Caddy 为唯一入口时）或 TRUST_PROXY=172.16.0.0/12
  const trustProxyEnv = process.env.TRUST_PROXY
  const trustProxy = trustProxyEnv === 'false' ? false : (trustProxyEnv || true)
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy
  })

  // ─── 数据库初始化 ───
  initDatabase(db)

  // ─── 定时清理过期登录码（P2-12）───
  const cleanupCodes = () => {
    try {
      const result = db.prepare("DELETE FROM login_codes WHERE expires_at < datetime('now')").run()
      if (result.changes > 0) app.log.info(`清理了 ${result.changes} 条过期登录码`)
    } catch { /* 静默失败，不影响服务 */ }
  }
  cleanupCodes() // 启动时立即清理一次
  const _codeCleanup = setInterval(cleanupCodes, 60 * 60 * 1000) // 每小时
  _codeCleanup.unref()

  // ─── 孤儿文件回收（P2-9）───
  // 每天凌晨 3 点执行一次，删除超过 24h 未被数据库引用的上传文件
  const gcUploads = async () => {
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)
      const scriptPath = resolve(import.meta.dirname, '../scripts/gc-uploads.js')
      const { stdout } = await execFileAsync('node', [scriptPath], { timeout: 120_000 })
      app.log.info(`孤儿文件回收完成: ${stdout.trim().split('\n').pop()}`)
    } catch (err) {
      app.log.warn(`孤儿文件回收失败: ${err.message}`)
    }
  }
  const _gcTimer = setInterval(gcUploads, 24 * 60 * 60 * 1000)
  _gcTimer.unref()

  // ─── 全局插件 ───
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

  // ─── 静态文件服务（上传目录） ───
  const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res) => {
      // 安全头 — 禁止 MIME 嗅探 + 强制下载
      // 注意：@fastify/static 的 setHeaders 回调参数是原生 Node http.ServerResponse，
      // 不是 Fastify reply，必须用 setHeader() 而非 header()
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Disposition', 'attachment')
    }
  })

  // ─── 注册功能路由 ───
  await app.register(import('./features/auth/auth.routes.js'))
  await app.register(import('./features/artist/artist.routes.js'))
  await app.register(import('./features/order/order.routes.js'))
  await app.register(import('./features/upload/upload.routes.js'), { uploadDir: UPLOAD_DIR })
  await app.register(import('./features/admin/admin.routes.js'))

  // ─── 健康检查 ───
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }))

  // ─── 全局错误处理：将 Schema 校验失败转为中文友好提示 ───
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      // Fastify JSON Schema 校验失败
      const field = error.validation[0]?.instancePath?.replace(/^\//, '') || '参数'
      return reply.code(400).send({ error: `请求参数格式不正确（${field}）` })
    }
    // 其它错误走默认处理
    reply.status(error.statusCode || 500).send({ error: error.message || '服务器内部错误' })
  })

  // ─── 前端 SPA 静态文件 + fallback ───
  const WEB_DIST = resolve(process.env.WEB_DIST || join(import.meta.dirname, '../../web/dist'))
  const hasWebDist = existsSync(WEB_DIST)

  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: '/',
      wildcard: false
    })
  }

  // P2-E: 404 处理器无条件注册 — API 路径始终返回 JSON
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/') || request.method !== 'GET' || !hasWebDist) {
      return reply.code(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })

  return app
}
