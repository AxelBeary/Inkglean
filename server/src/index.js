import 'dotenv/config'
import { buildApp } from './app.js'

// ============================================
// 服务器启动入口
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10)

const app = await buildApp()

// ─── 全局异常兜底 ───
// 未捕获异常：记录日志后退出（Docker restart 会拉起新实例）
process.on('uncaughtException', (err) => {
  app.log.fatal(err, '未捕获异常，进程即将退出')
  process.exit(1)
})
// 未处理的 Promise 拒绝：记录但不退出（避免瞬时异步错误导致服务中断）
process.on('unhandledRejection', (err) => {
  app.log.error(err, '未处理的 Promise 拒绝')
})

// ─── 优雅停机 ───
async function shutdown(signal) {
  app.log.info(`收到 ${signal}，正在优雅关闭…`)
  try {
    await app.close()
    const { default: db } = await import('./db/connection.js')
    db.close()
  } catch (err) {
    app.log.error(err, '关闭时出错')
  }
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`🎨 画师约稿平台已启动: http://localhost:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
