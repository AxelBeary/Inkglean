import 'dotenv/config'
import { buildApp } from './app.js'
import db from './db/connection.js'

// ============================================
// 服务器启动入口
// ============================================

// d3 P2: 启动前显式校验 PORT（parseInt NaN/越界不再拖到 listen 才暴露）
const PORT = parseInt(process.env.PORT || '3000', 10)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`PORT 配置无效: ${JSON.stringify(process.env.PORT)}（须为 1-65535 整数）`)
  process.exit(1)
}

// d3 P2: buildApp（迁移/DB 锁/坏 env）失败输出结构化 fatal 后退出，不再顶层裸堆栈
let app: Awaited<ReturnType<typeof buildApp>>
try {
  app = await buildApp()
} catch (err) {
  console.error('应用启动失败（数据库迁移/初始化异常）', err)
  process.exit(1)
}

// ─── 全局异常兜底 ───
// 可靠性：未捕获异常 — 记录后强制退出（防止僵尸状态）
process.on('uncaughtException', (err) => {
  app.log.fatal(err, '未捕获异常，进程即将退出')
  // P2-7: 退出前关闭数据库连接
  try { db.close() } catch (err) { app.log.warn({ err }, '关闭数据库连接失败（进程即将退出）') }
  // 给日志刷盘留 500ms，然后强退
  setTimeout(() => process.exit(1), 500).unref()
})
// 可靠性：未处理的 Promise 拒绝 — 记录但不退出
process.on('unhandledRejection', (err) => {
  app.log.error(err, '未处理的 Promise 拒绝')
})

// ─── 优雅停机（超时强退）───
let shuttingDown = false
async function shutdown(signal: NodeJS.Signals) {
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
    // d3 P2: 优雅停机前 WAL checkpoint(TRUNCATE)，避免数据困在 WAL 文件
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (err) {
      app.log.warn({ err }, 'WAL checkpoint 失败（继续关闭）')
    }
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
