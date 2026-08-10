import db from '../db/connection.js'
import { AppError, E } from './errors.js'

// ============================================
// D-2（R-9）: 下单/收款幂等键
// 背景：绕过 DOM disabled（双标签页/脚本/慢渲染双击）可产生两笔收款/两个订单，
// UNIQUE order_no 只兜单号不兜业务重复。scope+key 复合主键兜业务幂等。
// ============================================

const IDEMPOTENCY_KEY_MAX_LENGTH = 64
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]+$/

/**
 * 解析 idempotency-key header
 * 缺失/空 → null（兼容不带 header 的旧调用，直接执行）；非法 → 400 VALIDATION
 */
export function readIdempotencyKey(header: unknown): string | null {
  if (header == null || header === '') return null
  if (
    typeof header !== 'string'
    || header.length > IDEMPOTENCY_KEY_MAX_LENGTH
    || !IDEMPOTENCY_KEY_PATTERN.test(header)
  ) {
    throw new AppError(E.VALIDATION, 400, { field: 'idempotency-key', message: '幂等键仅允许字母/数字/连字符，长度 ≤64' })
  }
  return header
}

/** 幂等执行结果（与 Fastify reply.code().send() 同构，缓存时原样回放） */
export interface IdempotencyExecResult {
  statusCode: number
  body: unknown
}

/**
 * 幂等执行器：key 为空 → 直接执行（向后兼容）；命中缓存 → 原样返回 {statusCode, body}；
 * 未命中 → 执行 exec 并写缓存；exec 抛错（AppError/其他）→ 不写缓存（错误不幂等，允许重试）。
 * 单进程 better-sqlite3 同步驱动：检查-执行-写缓存之间无 await，天然原子，无并发窗口。
 */
export function withIdempotency(
  scope: string,
  key: string | null,
  exec: () => IdempotencyExecResult
): IdempotencyExecResult {
  if (!key) return exec()

  const cached = db.prepare(
    'SELECT status_code, response_json FROM idempotency_keys WHERE scope = ? AND key = ?'
  ).get(scope, key) as { status_code: number; response_json: string } | undefined
  if (cached) {
    return { statusCode: cached.status_code, body: JSON.parse(cached.response_json) }
  }

  const result = exec()
  db.prepare(
    'INSERT INTO idempotency_keys (scope, key, status_code, response_json) VALUES (?, ?, ?, ?)'
  ).run(scope, key, result.statusCode, JSON.stringify(result.body))
  return result
}

/**
 * 清理超期幂等行（默认保留 24h）
 * TODO（审计批 D-2）：由 app.ts 既有 GC 定时器调用接线——审计批 E 已在同一 GC 函数落地
 * TTL 清理，两批改动存在合并冲突风险，故本批不硬改 app.ts，交由验收方在合并后接线。
 */
export function pruneIdempotencyKeys(keepHours = 24): number {
  const r = db.prepare(
    "DELETE FROM idempotency_keys WHERE created_at < datetime('now', ?)"
  ).run(`-${keepHours} hours`)
  return r.changes
}
