// WEB-14（审计修复波2收口）：crypto.randomUUID 统一封装。
// 背景：crypto.randomUUID() 仅在安全上下文（HTTPS / localhost）可用；非 HTTPS 部署（如内网 HTTP）
// 下裸调会抛 TypeError，导致手动录单提交 / 粘贴上传 / 收款撤销等关键路径直接不可用。
// 全仓原先 9 处裸调无降级，统一收敛到本函数：优先 crypto.randomUUID，不可用时降级到
// 「时间戳(36 进制) + 双段随机」——对幂等键 / 前端临时 uid 的唯一性要求足够（非密码学用途）。

/** 生成一个唯一 id（安全上下文用 crypto.randomUUID，否则降级） */
export function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // 非安全上下文下访问 crypto.randomUUID 可能抛错，走降级
  }
  const rand = (): string => Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${rand()}${rand()}`
}
