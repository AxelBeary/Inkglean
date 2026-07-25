import 'dotenv/config'
import { buildApp } from './app.js'

// ============================================
// 服务器启动入口
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10)

const app = await buildApp()

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`🎨 画师约稿平台已启动: http://localhost:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
