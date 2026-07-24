import 'dotenv/config'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { join, resolve } from 'path'
import { existsSync } from 'fs'

// 路由
import authRoutes from './routes/auth.js'
import artistRoutes from './routes/artists.js'
import orderRoutes from './routes/orders.js'
import uploadRoutes from './routes/upload.js'
import adminRoutes from './routes/admin.js'

// ============================================
// 服务器主入口
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10)
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')

const isDev = process.env.NODE_ENV !== 'production'

const app = Fastify({
  logger: isDev
    ? {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
        }
      }
    : { level: 'info' }
})

// ─── 全局插件 ───

// CORS（生产环境限制来源，开发环境放开）
await app.register(fastifyCors, {
  origin: isDev ? true : process.env.CORS_ORIGIN || false,
  credentials: true
})

// 静态文件服务（上传的图片）
if (existsSync(UPLOAD_DIR)) {
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false
  })
}

// 前端构建产物（生产环境）
const webDist = resolve('../web/dist')
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: false,
    wildcard: false // 让 SPA 路由接管
  })

  // SPA fallback：所有非 API 路由返回 index.html
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    return reply.sendFile('index.html', webDist)
  })
}

// ─── 注册路由 ───

await app.register(authRoutes)
await app.register(artistRoutes)
await app.register(orderRoutes)
await app.register(uploadRoutes)
await app.register(adminRoutes)

// ─── 健康检查 ───

app.get('/api/health', async () => {
  return { status: 'ok', time: new Date().toISOString() }
})

// ─── 启动 ───

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`🎨 画师约稿平台已启动: http://localhost:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
