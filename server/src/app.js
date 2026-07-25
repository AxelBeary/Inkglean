import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { resolve } from 'path'
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

  return app
}
