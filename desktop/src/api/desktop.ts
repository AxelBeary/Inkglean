// 桌面端 API 层（825 波0 地基批）：首发仅登录链两接口，fetch 直连不引额外依赖。
// Bearer 鉴权口径（v73）：桌面 token 下发 token 不下发 cookie，过期权威在服务器设备账本。
import { requireApiBase } from '../config'
// F0002: 复用统一 ApiError 类，认证错误才能被 isSessionExpired/isOrderConflict 识别
import { ApiError } from './errors'

export interface DesktopArtist {
  id: number
  name: string
  subdomain: string | null
  qqNumber: string
}

export interface DesktopLoginResult {
  token: string
  expiresAt: string
  artist: DesktopArtist
}

/** F0002: 响应体形状（与 errors.ts 的 ApiError 类区分：此处只是 JSON body，不是抛出的错误对象） */
export interface ApiErrorBody {
  code: string
  error: string
  detail?: { remainingLockMs?: number }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(requireApiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    // 401/500 均带 { code, error } 结构；网络层错误另行抛出
    // F0002: 抛统一的 ApiError 类（带 status/code/error），认证/冲突错误才能被 isSessionExpired/isOrderConflict 识别；
    // 保留 err.api 兼容 Login.vue 既有文案读取口径
    const data = await res.json().catch(() => null) as ApiErrorBody | null
    const message = data?.error ?? `请求失败（${res.status}）`
    const err = new ApiError(res.status, data?.code ?? null, message, data?.detail) as ApiError & { api?: ApiErrorBody }
    err.api = data ?? { code: 'NETWORK', error: message }
    throw err
  }
  return await res.json() as T
}

/** 桌面登录（首发仅 TOTP）：记账式会话，同设备重登改账不重复记账 */
export function desktopLogin(params: {
  qqNumber: string
  code: string
  deviceUuid: string
  deviceName?: string
}): Promise<DesktopLoginResult> {
  return postJson<DesktopLoginResult>('/api/auth/desktop/login', params)
}

/**
 * 桌面登出（260830 审计 H-2）：服务端 bumpTokenVersion → 撕光桌面设备账本，
 * 旧 token 下次请求即被门禁拒绝。不在此做本地清理（归 auth store 收尾），
 * 网络失败由调用方降级为纯本地清理。
 */
export async function desktopLogout(tokenValue: string): Promise<void> {
  const res = await fetch(requireApiBase() + '/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenValue}` }
  })
  if (!res.ok) throw new Error(`登出请求失败（${res.status}）`)
}
