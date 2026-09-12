// 端点方法 · 认证 · Passkey/TOTP 重绑/二次验证/开箱向导/邀请注册（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson, patchJson, deleteJson } from './http'
import type { AuthVerifyResult, AuthMeResult, LogoutResult, OnboardingMode, SetOnboardingModeResult, InviteStatusResult, InviteRegisterRequest, InviteRegisterResult, InviteTotpConfirmRequest, InviteTotpConfirmResult } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── REQ-040: WebAuthn Passkey + TOTP 重绑 ───
export const webauthnApi = {
  registerOptions: (): Promise<import('../types').WebAuthnRegisterOptions> =>
    postJson('/auth/webauthn/register-options'),
  registerVerify: (credential: unknown): Promise<import('../types').WebAuthnRegisterVerifyResult> =>
    postJson('/auth/webauthn/register-verify', credential),
  loginOptions: (qqNumber: string): Promise<import('../types').WebAuthnLoginOptions> =>
    postJson('/auth/webauthn/login-options', { qqNumber }),
  loginVerify: (credential: unknown): Promise<import('../types').WebAuthnLoginVerifyResult> =>
    postJson('/auth/webauthn/login-verify', credential),
  getCredentials: (): Promise<import('../types').WebAuthnCredentialsResult> =>
    getJson('/auth/webauthn/credentials'),
  updateCredential: (id: number, deviceName: string): Promise<import('../types').WebAuthnUpdateCredentialResult> =>
    patchJson(`/auth/webauthn/credentials/${id}`, { deviceName }),
  deleteCredential: (id: number): Promise<{ success: boolean }> =>
    deleteJson(`/auth/webauthn/credentials/${id}`)
}

export const totpRebindApi = {
  /** 战役审计修复：Step1 验证当前码（轻量校验，不发放凭据） */
  verifyCurrent: (code: string): Promise<{ ok: boolean }> =>
    postJson('/auth/totp/verify-current', { code }),
  rebindInit: (): Promise<import('../types').RebindInitResult> =>
    postJson('/auth/totp/rebind-init'),
  rebindConfirm: (data: Record<string, unknown>): Promise<import('../types').RebindConfirmResult> =>
    postJson('/auth/totp/rebind-confirm', data)
}

// ─── REQ-041: 管理后台二次验证（会话升级） ───
export const stepUpApi = {
  /** 入口级探测：200=已升级且在 30 分钟窗口内；401 STEP_UP_REQUIRED=需弹验证对话框 */
  status: (): Promise<import('../types').StepUpStatusResult> => getJson('/admin/stepup-status'),
  /** 验证并升级会话（TOTP 或 Passkey 二选一），成功重签 token 覆盖 cookie */
  verify: (data: import('../types').StepUpRequest): Promise<import('../types').StepUpResult> =>
    postJson('/auth/step-up', data)
}

// ─── REQ-038/039: 开箱向导（仅未初始化阶段可用） ───
export const setupApi = {
  /** 写入画师入驻方式（9/12 余批补的部署期写入通道；初始化完成后服务端永久 410，届时本向导路由也已销毁） */
  setOnboardingMode: (mode: OnboardingMode): Promise<SetOnboardingModeResult> =>
    postJson('/setup/onboarding-mode', { mode })
}

// ─── REQ-039: 邀请码注册（公开） ───
export const inviteApi = {
  status: (): Promise<InviteStatusResult> => getJson('/invite/status'),
  register: (data: InviteRegisterRequest): Promise<InviteRegisterResult> => postJson('/invite/register', data),
  totpConfirm: (data: InviteTotpConfirmRequest): Promise<InviteTotpConfirmResult> => postJson('/invite/totp-confirm', data)
}

// ─── 认证 ───
export const authApi = {
  // REQ-027: QQ 号 + TOTP 动态口令登录（替代旧登录码）
  verify: (qqNumber: string, code: string): Promise<AuthVerifyResult> =>
    postJson('/auth/verify', { qqNumber, code }),
  me: (): Promise<AuthMeResult> => getJson('/auth/me'),
  // H-2 修复：补全登出接口，清除 httpOnly cookie
  logout: (): Promise<LogoutResult> => postJson('/auth/logout')
}
