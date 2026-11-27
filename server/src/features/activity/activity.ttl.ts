import db from '../../db/connection.js'

// ============================================
// activity_events 分级 TTL 清理（D4=B 拍板：管理动作 365 / 认证 180 / 交易上传 90 天）
//
// 为什么抽成独立模块而不是内联在 app.ts 的 gcDatabaseTtl 里：
//   ① app.ts 已被 scripts/check-file-size.mjs 的 800 行硬线卡住（内联后 813 行，
//      触发「新巨型文件先拆分再合入」判红）；
//   ② 抽出来才能被单测直接覆盖——「造三条不同 age 的行，跑一次 GC，断言到期删/
//      未到期留」这种验收口径内联在 buildApp 闭包里无法单独触发。
//   语义仍与既有 5 段清理同窗：app.ts 的 gcDatabaseTtl 内调本函数，一段 try/catch 包住，
//   与 events / anon_tokens / 幂等键 / 参考图 / 过程稿互不连坐。
// ============================================

/** 认证线三动作（180 天档） */
export const AUTH_TTL_ACTIONS = ['login_success', 'login_fail', 'stepup_fail'] as const
/** 交易与上传四动作（90 天档） */
export const TRADE_TTL_ACTIONS = ['order_create', 'reference_upload', 'report_submit', 'guestbook_post'] as const

/** 三档保留天数（app.ts 按 env 覆盖后传入） */
export interface ActivityTtlDays {
  admin: number
  auth: number
  other: number
}

/** 默认窗口（与 app.ts 的 env 缺省值一致） */
export const ACTIVITY_TTL_DEFAULTS: ActivityTtlDays = { admin: 365, auth: 180, other: 90 }

export interface ActivityTtlResult {
  /** 本次共删除多少条 */
  deleted: number
  auth: number
  trade: number
  admin: number
}

/**
 * 按分级窗口清 activity_events。
 *
 * at 是 INTEGER 毫秒（服务端单点写入），故直接用 JS 算边界毫秒与整数比较，
 * 不与全仓 datetime('now') 文本混比——本表的 at 格式假设只有「毫秒整数」一种。
 *
 * 三档用「动作白名单 + 排除法」切分：
 *   认证三动作 → auth 档；交易四动作 → other 档；**其余全部**（12 类管理动作）→ admin 长档。
 * 用排除法而不是「管理动作白名单」：管理动作名沿用 admin_actions.action 原名且将来可能扩充，
 * 漏登记会把它误判进短档（证据提前消失）；排除法把默认值放在最长那一档，出错时偏向保守。
 *
 * @param days  三档天数（app.ts 传 env 覆盖后的值）
 * @param nowMs 当前时间（测试注入固定值用，缺省 Date.now()）
 */
export function gcActivityEvents(
  days: ActivityTtlDays = ACTIVITY_TTL_DEFAULTS,
  nowMs: number = Date.now()
): ActivityTtlResult {
  const dayMs = 86_400_000
  const authCut = nowMs - days.auth * dayMs
  const tradeCut = nowMs - days.other * dayMs
  const adminCut = nowMs - days.admin * dayMs

  const deleteByActions = (cut: number, actions: readonly string[]): number => {
    const holes = actions.map(() => '?').join(', ')
    return db.prepare(`DELETE FROM activity_events WHERE at < ? AND action IN (${holes})`)
      .run(cut, ...actions).changes
  }

  const auth = deleteByActions(authCut, AUTH_TTL_ACTIONS)
  const trade = deleteByActions(tradeCut, TRADE_TTL_ACTIONS)
  const adminHoles = [...AUTH_TTL_ACTIONS, ...TRADE_TTL_ACTIONS].map(() => '?').join(', ')
  const admin = db.prepare(`DELETE FROM activity_events WHERE at < ? AND action NOT IN (${adminHoles})`)
    .run(adminCut, ...AUTH_TTL_ACTIONS, ...TRADE_TTL_ACTIONS).changes

  return { deleted: auth + trade + admin, auth, trade, admin }
}
