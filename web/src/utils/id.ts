// WEB-14（审计修复波2收口）：crypto.randomUUID 统一封装。
// 背景：crypto.randomUUID() 仅在安全上下文（HTTPS / localhost）可用；非 HTTPS 部署（如内网 HTTP）
// 下裸调会抛 TypeError，导致手动录单提交 / 粘贴上传 / 收款撤销等关键路径直接不可用。
// 全仓原先 9 处裸调无降级，统一收敛到本函数：优先 crypto.randomUUID，不可用时降级到
// crypto.getRandomValues（CSPRNG，在 HTTP 非安全上下文下同样可用，不像 randomUUID 需安全上下文）。
// CodeQL #26-#30 跟进：降级不再使用 Math.random（js/insecure-randomness），极端环境兜底改为
// 「时间戳(36 进制) + 进程内自增序号」——仍满足幂等键 / 前端临时 uid 的唯一性要求（非密码学用途）。

let fallbackSeq = 0

/** 生成一个唯一 id（安全上下文用 crypto.randomUUID，否则降级到 crypto.getRandomValues） */
export function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // 非安全上下文下访问 crypto.randomUUID 可能抛错，走降级
  }
  // 降级用 CSPRNG：getRandomValues 在 HTTP 非安全上下文下也可用
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      let hex = ''
      for (const b of bytes) hex += b.toString(16).padStart(2, '0')
      return hex
    }
  } catch {
    // 极端环境降级到非随机兜底
  }
  // 极端兜底（现代浏览器 / Node 不会走到这里）：时间戳 + 进程内自增序号，无 Math.random
  return `${Date.now().toString(36)}-${(fallbackSeq++).toString(36)}`
}
