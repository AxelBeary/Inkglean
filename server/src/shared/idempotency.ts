import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import db from '../db/connection.js'
import { AppError, E } from './errors.js'
import { isWeakSessionSecret } from './secrets.js'

// ============================================
// D-2（R-9）: 下单/收款幂等键
// 背景：绕过 DOM disabled（双标签页/脚本/慢渲染双击）可产生两笔收款/两个订单，
// UNIQUE order_no 只兜单号不兜业务重复。scope+key 复合主键兜业务幂等。
// F0134：response_json 存 AES-256-GCM `enc:v1` 信封（SESSION_SECRET 域分离 + AAD 绑 scope/key），
// 明文 customerToken/trackUrl 不落库；仍用原 TEXT 列（零 migration），解封后与首响逐字节一致；
// 解密失败 409，绝不删行重执行（重跑下单会多一单）。
// ============================================

const IDEMPOTENCY_KEY_MAX_LENGTH = 64
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]+$/
const ENVELOPE_PREFIX = 'enc:v1:'
let devEnvelopeKey: Buffer | undefined

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

/** 信封密钥：SESSION_SECRET 域分离派生；生产缺密钥/弱密钥直接抛错——绝不静默降级成明文缓存 */
function envelopeKey(): Buffer {
  const secret = process.env.SESSION_SECRET
  if (!secret || (process.env.NODE_ENV === 'production' && isWeakSessionSecret(secret))) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET 不可用 — 幂等响应信封加密拒绝明文降级')
    if (!devEnvelopeKey) devEnvelopeKey = randomBytes(32)
    return devEnvelopeKey
  }
  return createHash('sha256').update('idempotency-envelope:v1\0').update(secret, 'utf8').digest()
}

/** AAD 绑定 scope+key：密文被搬到别的缓存行解不开 */
function envelopeAad(scope: string, key: string): Buffer {
  return Buffer.from(`${scope}\0${key}`, 'utf8')
}

function corruptedEnvelope(): AppError {
  // 独立错误码：前端据此保留原 key（复用载荷冲突码会被前端判为「换意图」而换 key → 重复下单）
  return new AppError(E.IDEMPOTENCY_ENVELOPE_INVALID, 409, { message: '该提交可能已受理，请勿重复提交' })
}

function sealIdempotencyResponse(json: string, scope: string, key: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', envelopeKey(), iv)
  cipher.setAAD(envelopeAad(scope, key))
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return ENVELOPE_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

/** 读取侧：信封 → 明文 JSON；无前缀的存量明文行原样返回（24h 自然过期） */
export function unsealIdempotencyResponse(payload: string, scope: string, key: string): string {
  if (!payload.startsWith(ENVELOPE_PREFIX)) return payload
  const raw = Buffer.from(payload.slice(ENVELOPE_PREFIX.length), 'base64')
  try {
    const decipher = createDecipheriv('aes-256-gcm', envelopeKey(), raw.subarray(0, 12))
    decipher.setAAD(envelopeAad(scope, key))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    throw corruptedEnvelope()
  }
}

/**
 * 载荷规范化 + 指纹（审计 #21 条目 3）
 * 键序无关：递归按对象键升序输出，避免同一意图因 JS 对象字面量键序差异被误判成冲突。
 * undefined 与 null 同形（JSON 序列化时本就会丢 undefined 键，路由体里两者语义一致）。
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** 计算请求载荷指纹（sha256 hex） */
export function hashIdempotencyPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex')
}

/**
 * 幂等执行器：key 为空 → 直接执行（向后兼容）；命中缓存 → 原样返回 {statusCode, body}；
 * 未命中 → 执行 exec 并写缓存；exec 抛错（AppError/其他）→ 不写缓存（错误不幂等，允许重试）。
 * 单进程 better-sqlite3 同步驱动：检查-执行-写缓存之间无 await，天然原子，无并发窗口。
 *
 * SRV-13 修复：写入侧改 ON CONFLICT DO UPDATE，消除「读不中过期行但写撞主键」缝隙。
 * 此前行龄超 24h 后读侧带时效不命中、但行仍物理存在，窗口内同 key 重放先 exec()
 * 重复执行业务、随后裸 INSERT 撞 PRIMARY KEY 500 → 双重伤害。
 * 现在 upsert 语义：无论旧行是否物理残留，写入一律成功覆盖。
 *
 * payload（v78，审计 #21 条目 3）：绑定请求内容指纹。
 * 此前只按 scope+key 命中，同 key 换载荷会被静默回放旧响应——客户端失败时保留 key，
 * 用户改完金额/改编排再点一次，新内容根本没执行。现在同 key 不同载荷 → 409，
 * 调用方换 key 重试；不带 payload 或存量行无指纹时维持旧的重放语义。
 * F0134：写前封 enc:v1 密文、读后解封；解密失败直接 409，不走下方「坏行删行重执行」分支。
 */
export function withIdempotency(
  scope: string,
  key: string | null,
  exec: () => IdempotencyExecResult,
  payload?: unknown
): IdempotencyExecResult {
  if (!key) return exec()

  const requestHash = payload === undefined ? null : hashIdempotencyPayload(payload)

  // 260830 审计 M-1：查询补时效条件，与清理周期（24h）同口径——双保险：
  // 即便 GC 清理暂未跑（首轮启动/定时器未到期），超过 24h 的旧缓存也不再命中，
  // 语义上与「缓存只为防短时窗重复提交」一致。
  // created_at 为 TEXT 'YYYY-MM-DD HH:MM:SS'（UTC，DEFAULT CURRENT_TIMESTAMP，v54 迁移），
  // 与 datetime('now', ...) 表达式同格式同口径，可直接字符串比较。
  const cached = db.prepare(
    "SELECT status_code, response_json, request_hash FROM idempotency_keys WHERE scope = ? AND key = ? AND created_at > datetime('now', '-24 hours')"
  ).get(scope, key) as { status_code: number; response_json: string; request_hash: string | null } | undefined
  if (cached) {
    // 同 key 不同载荷：不是重放，是两次不同的提交意图，显式冲突让调用方换新 key，
    // 绝不静默回放旧响应（审计 #21 条目 3）
    if (requestHash !== null && cached.request_hash !== null && cached.request_hash !== requestHash) {
      throw new AppError(E.IDEMPOTENCY_CONFLICT, 409, { scope, message: '同一幂等键已用于不同的请求内容' })
    }
    // enc:v1 信封解密失败 → 409；不落到下方「删行重执行」分支（F0134：下单 scope 重跑会多一单）
    const responseJson = unsealIdempotencyResponse(cached.response_json, scope, key)
    // d3 P2: 存量明文缓存行损坏/被手工篡改 → 删掉坏行按未命中重执行，避免同 key 永久 500
    try {
      return { statusCode: cached.status_code, body: JSON.parse(responseJson) }
    } catch {
      db.prepare('DELETE FROM idempotency_keys WHERE scope = ? AND key = ?').run(scope, key)
    }
  }

  const result = exec()
  // SRV-13: ON CONFLICT DO UPDATE 替代裸 INSERT——过期残留行不再导致主键冲突 500，
  // 同时刷新 created_at 使新缓存行重新获得 24h 时效窗口。
  const sealed = sealIdempotencyResponse(JSON.stringify(result.body), scope, key)
  db.prepare(
    `INSERT INTO idempotency_keys (scope, key, status_code, response_json, request_hash) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET status_code = excluded.status_code, response_json = excluded.response_json, request_hash = excluded.request_hash, created_at = CURRENT_TIMESTAMP`
  ).run(scope, key, result.statusCode, sealed, requestHash)
  return result
}

/**
 * 清理超期幂等行（默认保留 24h）
 * 已由 app.ts 的 GC 定时器接线（审计批 D-2 验收时接入，与 R-20 埋点 TTL 同批执行；
 * 260830 审计 M-1 起改由独立的 gcDatabaseTtl 调用，不再受文件类早退连坐）。
 */
export function pruneIdempotencyKeys(keepHours = 24): number {
  const r = db.prepare(
    "DELETE FROM idempotency_keys WHERE created_at < datetime('now', ?)"
  ).run(`-${keepHours} hours`)
  return r.changes
}
