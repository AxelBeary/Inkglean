import 'dotenv/config'
import { buildApp } from './app.js'
import db from './db/connection.js'

// ============================================
// 服务器启动入口
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10)

const app = await buildApp()

// ─── 全局异常兜底 ───
// 可靠性：未捕获异常 — 记录后强制退出（防止僵尸状态）
process.on('uncaughtException', (err) => {
  app.log.fatal(err, '未捕获异常，进程即将退出')
  // P2-7: 退出前关闭数据库连接
  try { db.close() } catch (err) { app.log.warn('关闭数据库连接失败（进程即将退出）', err) }
  // 给日志刷盘留 500ms，然后强退
  setTimeout(() => process.exit(1), 500).unref()
})
// 可靠性：未处理的 Promise 拒绝 — 记录但不退出
process.on('unhandledRejection', (err) => {
  app.log.error(err, '未处理的 Promise 拒绝')
})

// ─── 优雅停机（超时强退）───
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return // 防止重复触发
  shuttingDown = true
  app.log.info(`收到 ${signal}，正在优雅关闭…`)

  // 10 秒超时强退
  const forceTimer = setTimeout(() => {
    app.log.error('优雅关闭超时（10s），强制退出')
    process.exit(1)
  }, 10_000)
  forceTimer.unref()

  try {
    await app.close()
    const { default: db } = await import('./db/connection.js')
    db.close()
    clearTimeout(forceTimer)
    process.exit(0)
  } catch (err) {
    app.log.error(err, '关闭时出错')
    process.exit(1)
  }
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
