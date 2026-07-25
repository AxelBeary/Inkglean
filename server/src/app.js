import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { resolve, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

// 基于文件位置解析路径，不依赖 CWD（entrypoint 不再 cd）
const __dirname = dirname(fileURLToPath(import.meta.url))

// Feature 路由
import authRoutes from './features/auth/auth.routes.js'
import artistRoutes from './features/artist/artist.routes.js'
import orderRoutes from './features/order/order.routes.js'
import uploadRoutes from './features/upload/upload.routes.js'
import adminRoutes from './features/admin/admin.routes.js'

// ============================================
// Fastify 应用工厂（可被测试复用）
// ============================================

export async function buildApp({ uploadDir, webDist } = {}) {
  const UPLOAD_DIR = resolve(uploadDir || process.env.UPLOAD_DIR || './uploads')
  const isDev = process.env.NODE_ENV !== 'production'

  // pino-pretty 是 devDependency，Docker 生产构建不含它，缺失时降级为 JSON 日志
  let loggerConfig = { level: 'info' }
  if (isDev) {
    try {
      await import('pino-pretty')
      loggerConfig = {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
        }
      }
    } catch { /* 未安装 pino-pretty，使用默认 JSON 日志 */ }
  }

  const app = Fastify({ logger: loggerConfig })

  // ─── 全局插件 ───

  await app.register(fastifyCors, {
    origin: isDev ? true : process.env.CORS_ORIGIN || false,
    credentials: true
  })

  // 静态文件服务（上传的图片）——确保目录存在，避免首次启动时跳过注册
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false
  })

  // 前端构建产物（SPA fallback 依赖 reply.sendFile，此注册不能设 decorateReply: false）
  // 路径基于文件位置解析：server/src/ → ../../web/dist
  const dist = resolve(webDist || resolve(__dirname, '../../web/dist'))
  if (existsSync(dist)) {
    await app.register(fastifyStatic, {
      root: dist,
      prefix: '/',
      wildcard: false
    })

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      return reply.sendFile('index.html', dist)
    })
  }

  // ─── 注册路由 ───

  await app.register(authRoutes)
  await app.register(artistRoutes)
  await app.register(orderRoutes)
  await app.register(uploadRoutes, { uploadDir: UPLOAD_DIR })
  await app.register(adminRoutes)

  // ─── 健康检查 ───

  app.get('/api/health', async () => {
    return { status: 'ok', time: new Date().toISOString() }
  })

  return app
}
