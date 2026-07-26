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
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: true
  })

  // ─── 数据库初始化 ───
  initDatabase(db)

  // ─── 全局插件 ───
  await app.register(fastifyCors, {
    origin: true,
    credentials: true
  })

  // ─── 静态文件服务（上传目录） ───
  const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false
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

    // SPA fallback：非 /api、非 /uploads 路由全部返回 index.html
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
