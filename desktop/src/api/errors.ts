// 云端请求错误（波2 拖拽改期批新增）：把 HTTP status 与后端业务码 **原样带上来**。
// 为什么必须有这个文件：桌面 api 层原先一律 `throw new Error(message)`，status/code/detail 全丢，
// 于是 409「排期已被别人改过」（ORDER_CONFLICT）在桌面端**根本无法判定**——波2 的乐观锁回滚重拉
// 也就无从触发。网页端靠 axios 拦截器给错误挂 code（web/src/api/modules/http.ts），
// 桌面用 fetch，故在此手工组装同款形状，两端错误语义对齐。
// 纪律：本文件只描述"错在哪"，不做任何跳转/登出/提示决策（那是 store 与页面层的事）。

/** 后端业务冲突码：版本对不上（乐观锁失败）。值钉死在 server/src/shared/errors.ts 的 E.ORDER_CONFLICT */
export const ORDER_CONFLICT = 'ORDER_CONFLICT'

export class ApiError extends Error {
  /** HTTP 状态码（401/403 会话失效、409 冲突、4xx 校验、5xx 服务端） */
  readonly status: number
  /** 后端业务码；响应体没带或解析失败时为 null */
  readonly code: string | null
  /** 后端 detail（可选附加信息，原样保留不强解析） */
  readonly detail?: unknown

  constructor(status: number, code: string | null, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

/** 会话是否已失效（被踢/过期）：401 未认证、403 无权限（设备账本被撕也落这俩）。
 *  口径：只判定，不处置——处置一律交调用方（波2 拍板：不打断编辑、不自动跳登录页）。 */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403)
}

/** 乐观锁冲突：版本对不上，须回滚到服务端真相（重拉），不许静默吞 */
export function isOrderConflict(err: unknown): boolean {
  return err instanceof ApiError && err.code === ORDER_CONFLICT
}

/** 给既有 catch 分支用的安全取值：非 ApiError（网络断、未登录抛的普通 Error）一律 null */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}
