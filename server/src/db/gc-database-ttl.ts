import db from './connection.js'
import type { FastifyBaseLogger } from 'fastify'
import { pruneIdempotencyKeys } from '../shared/idempotency.js'
import { pruneAdminActions, ADMIN_ACTIONS_TTL_DAYS } from '../features/compliance/compliance.service.js'
import { gcActivityEvents } from '../features/activity/activity.ttl.js'

/**
 * 数据库侧 TTL 清理（2026-11-28 从 app.ts 抽出）
 *
 * 为什么抽件：app.ts 在 R-2（admin_actions 3 年留存）与 v86（activity_events 分级留存）
 * 两批合并后涨到 827 行，撞 `scripts/check-file-size.mjs` 的 800 行硬线。
 * 按纪律「新巨型文件先拆分再合入」，不得调高冻结值。
 *
 * 边界：本函数只管**不依赖文件系统**的表（events / anon_tokens / 幂等键 / 参考图登记行 /
 * 过程稿台账 / 管理留痕 / 事件流水）。文件类孤儿回收仍在 app.ts 的 gcUploads 里，
 * 两者的调用顺序（本函数在前）是防线，见 app.ts 的启动与定时器注释。
 *
 * 各表**独立 try/catch**：任一张表清理失败不得连坐其它表——这是 M-1 拆分时就定下的纪律。
 */
export interface DatabaseTtlWindows {
  events: number
  anonTokens: number
  referenceUpload: number
  previewUpload: number
  activityAdmin: number
  activityAuth: number
  activityOther: number
}

export function gcDatabaseTtl(log: FastifyBaseLogger, windows: DatabaseTtlWindows): void {
  const {
    events: EVENTS_TTL_DAYS,
    anonTokens: ANON_TOKENS_TTL_DAYS,
    referenceUpload: REFERENCE_UPLOAD_TTL_DAYS,
    previewUpload: PREVIEW_UPLOAD_TTL_DAYS,
    activityAdmin: ACTIVITY_ADMIN_TTL_DAYS,
    activityAuth: ACTIVITY_AUTH_TTL_DAYS,
    activityOther: ACTIVITY_OTHER_TTL_DAYS
  } = windows

  try {
    // created_at 与 tracking.service 写入/续期口径一致（SQLite datetime('now') 文本，UTC），
    // 用 datetime('now', ?) 同款表达式比较，避免 JS ISO 字符串与库内格式混比。
    const eventsDeleted = db.prepare("DELETE FROM events WHERE created_at < datetime('now', ?)").run(`-${EVENTS_TTL_DAYS} days`).changes
    const anonDeleted = db.prepare("DELETE FROM anon_tokens WHERE created_at < datetime('now', ?)").run(`-${ANON_TOKENS_TTL_DAYS} days`).changes
    if (eventsDeleted > 0 || anonDeleted > 0) {
      log.info(`埋点 TTL 清理: events 删除 ${eventsDeleted} 条, anon_tokens 删除 ${anonDeleted} 条`)
    }
  } catch (err) {
    log.warn(`埋点 TTL 清理失败: ${(err as Error).message}`)
  }

  try {
    // 幂等键 TTL（审计批 D-2 接线）：幂等缓存只为防短时窗重复提交，24h 足够；超期行累积无意义。
    const idemDeleted = pruneIdempotencyKeys(24)
    if (idemDeleted > 0) {
      log.info(`幂等键 TTL 清理: 删除 ${idemDeleted} 条`)
    }
  } catch (err) {
    log.warn(`幂等键 TTL 清理失败: ${(err as Error).message}`)
  }

  try {
    // GHSA-6pf3-g4xq-854w（Wave1·高）：未绑定参考图登记行 TTL。created_at 与埋点表同口径
    //（SQLite datetime 文本，UTC），故用同款 datetime('now', ?) 比较，不引入 JS ISO 串混比。
    // 只删未绑定行；已绑定行是订单归属凭据（F-10/v55），属业务数据不清。
    const refDeleted = db.prepare(
      "DELETE FROM reference_uploads WHERE order_id IS NULL AND created_at < datetime('now', ?)"
    ).run(`-${REFERENCE_UPLOAD_TTL_DAYS} days`).changes
    if (refDeleted > 0) {
      log.info(`参考图 TTL 清理: reference_uploads 删除 ${refDeleted} 条未绑定登记（窗 ${REFERENCE_UPLOAD_TTL_DAYS} 天）`)
    }
  } catch (err) {
    log.warn(`参考图 TTL 清理失败: ${(err as Error).message}`)
  }

  try {
    // A1（v82）：未挂单过程稿台账行 TTL。绑定事实以 order_previews.file_path 为准，
    // 已挂单行是业务凭据不清；删行后文件才失去 DB 引用，由孤儿回收按 72h 窗接手。
    const previewDeleted = db.prepare(
      `DELETE FROM preview_uploads
       WHERE created_at < datetime('now', ?)
         AND NOT EXISTS (SELECT 1 FROM order_previews p WHERE p.file_path = preview_uploads.file_path)`
    ).run(`-${PREVIEW_UPLOAD_TTL_DAYS} days`).changes
    if (previewDeleted > 0) {
      log.info(`过程稿 TTL 清理: preview_uploads 删除 ${previewDeleted} 条未挂单台账（窗 ${PREVIEW_UPLOAD_TTL_DAYS} 天）`)
    }
  } catch (err) {
    log.warn(`过程稿 TTL 清理失败: ${(err as Error).message}`)
  }

  try {
    // R-2（2026-11-28）：管理审计留痕 TTL。此前 admin_actions 只增不删（全仓零 DELETE），
    // 是全站唯一「永久增长且不可再生」的表——删掉的历史留痕没有第二个来源可还原。
    // 保留期见 compliance.service.ADMIN_ACTIONS_TTL_DAYS（1095 天 / 3 年，写死不做 env：
    // 这条 TTL 配错等于不可逆的数据丢失，取值权收归代码评审）。
    const actionsDeleted = pruneAdminActions()
    if (actionsDeleted > 0) {
      log.info(`管理留痕 TTL 清理: admin_actions 删除 ${actionsDeleted} 条（窗 ${ADMIN_ACTIONS_TTL_DAYS} 天）`)
    }
  } catch (err) {
    log.warn(`管理留痕 TTL 清理失败: ${(err as Error).message}`)
  }

  try {
    // v86（D4=B 分级保留）：activity_events 三档 TTL。分档逻辑与「为何用排除法」
    // 见 features/activity/activity.ttl.ts 的模块注释；本段只负责按 env 传参 + 日志。
    const activity = gcActivityEvents({
      admin: ACTIVITY_ADMIN_TTL_DAYS,
      auth: ACTIVITY_AUTH_TTL_DAYS,
      other: ACTIVITY_OTHER_TTL_DAYS
    })
    if (activity.deleted > 0) {
      log.info(
        `事件流水 TTL 清理: activity_events 删除 ${activity.deleted} 条（认证 ${activity.auth}/${ACTIVITY_AUTH_TTL_DAYS} 天, 交易上传 ${activity.trade}/${ACTIVITY_OTHER_TTL_DAYS} 天, 管理动作 ${activity.admin}/${ADMIN_ACTIONS_TTL_DAYS} 天）`
      )
    }
  } catch (err) {
    log.warn(`事件流水 TTL 清理失败: ${(err as Error).message}`)
  }
}
