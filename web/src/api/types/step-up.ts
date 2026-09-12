// API 边界 DTO · REQ-041 管理后台二次验证（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── REQ-041: 管理后台二次验证（会话升级） ───

/** POST /api/auth/step-up 请求体 — TOTP 分支 */
export interface StepUpTotpRequest {
  method: 'totp'
  code: string
}

/** POST /api/auth/step-up 请求体 — Passkey 分支（flat 字段，后端组回 credential 校验） */
export interface StepUpPasskeyRequest {
  method: 'passkey'
  credentialId: string
  authenticatorData: string
  signature: string
  clientDataJSON: string
}

export type StepUpRequest = StepUpTotpRequest | StepUpPasskeyRequest

/** POST /api/auth/step-up 响应（成功即重签升级 token 覆盖 cookie） */
export interface StepUpResult {
  success: true
  verifiedAt: string
}

/** GET /api/admin/stepup-status 响应（200 = 已升级且在 30 分钟窗口内；401 STEP_UP_REQUIRED = 需验证） */
export interface StepUpStatusResult {
  verified: true
}
