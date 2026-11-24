/**
 * 前端幂等键生命周期契约（TASK2-01）
 *
 * - `IDEMPOTENCY_CONFLICT`：同 key 换载荷 = 新的提交意图 → 允许换新 key 重提。
 * - `IDEMPOTENCY_ENVELOPE_INVALID`：服务端信封解密失败/密钥轮换，该提交**可能已受理** →
 *   必须保留原 key、不自动重试、不自动生成新 key；否则会以新 key 再落一单并重复扣款。
 *   不可重试提示由服务端文案给出（「该提交可能已受理，请勿重复提交；如未确认请联系客服」）。
 *
 * 其余错误（网络/校验/业务拒绝）一律保留原 key，维持「同一次意图重试复用同 key」的 D-2 语义。
 */
export const IDEMPOTENCY_ENVELOPE_INVALID = 'IDEMPOTENCY_ENVELOPE_INVALID'

export function shouldRotateIdempotencyKey(code: unknown): boolean {
  return code === 'IDEMPOTENCY_CONFLICT'
}
