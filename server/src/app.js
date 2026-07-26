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
  // P0-3: trustProxy 收紧 — 仅信任 Caddy 反向代理（本地回环）
  const trustProxyEnv = process.env.TRUST_PROXY
  const trustProxy = trustProxyEnv === 'false' ? false : (trustProxyEnv || '127.0.0.1')
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy
  })

  // ─── 数据库初始化 ───
  initDatabase(db)

  // ─── 全局插件 ───
  // P1-6: CORS 收紧 — 生产环境设置 CORS_ORIGIN=https://yourdomain.com
  const corsOrigin = process.env.CORS_ORIGIN
  await app.register(fastifyCors, {
    origin: corsOrigin ? corsOrigin.split(',') : true,
    credentials: true
  })

  // ─── 静态文件服务（上传目录） ───
  const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (reply) => {
      // R2-7: 安全头 — 禁止 MIME 嗅探 + 强制下载
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Content-Disposition', 'attachment')
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

  // ─── 前端 SPA 静态文件 + fallback ───
  const WEB_DIST = resolve(process.env.WEB_DIST || join(import.meta.dirname, '../../web/dist'))
  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: '/',
      wildcard: false  // 不用通配，由 setNotFoundHandler 兜底
    })

    // P2-3: SPA fallback 仅限 GET 请求（阻止 POST/PUT 等返回 HTML）
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
