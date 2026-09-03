// 「能否接单」纯函数（9/4 主页重设计落码波1 · 契约层）。
// 复刻后端 artist.service.computeSlotDisplay 的能否接单语义，但**只用结构化字段不匹配中文文案**
// （防后端改词即崩）——与网页端 F11 拍板 C（web/src/views/artist/QueueBoard.vue canAccept）逐条同源。
// 消费点：月历空日「可接单」绿点 + 卷尾摘要签空日色调。

export interface AcceptInput {
  /** 画师挂牌状态；null＝资料未取到 */
  status: string | null
  /** 同批席位数（未启用名额制为 null） */
  batchLimit?: number | null
  /** 候补席位数 */
  bufferLimit?: number | null
  /** 本月额度剩余（未启用月度额度为 null） */
  quotaRemaining?: number | null
  /** 当前正式区在途数（队列长度） */
  formalCount: number
  /** 当前缓冲区在途数 */
  bufferCount: number
}

/** 能否接单。input 为 null（资料未加载）→ true：保守不约束，不误伤既有按天空闲口径。 */
export function computeCanAccept(input: AcceptInput | null): boolean {
  if (!input) return true
  const st = input.status
  // 休息中 / 隐藏 / 接满：一律不能接
  if (st === 'break' || st === 'hidden' || st === 'full') return false
  // 月度额度耗尽（本月已约满）
  const remaining = input.quotaRemaining
  if (remaining != null && remaining <= 0) return false
  // 席位 + 候补均满才算真满（可候补时 buffer < bufferLimit 仍能接）
  const batch = input.batchLimit
  if (batch != null) {
    const buffer = input.bufferLimit ?? 0
    if (input.formalCount >= batch && input.bufferCount >= buffer) return false
  }
  return true
}
