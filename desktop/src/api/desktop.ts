// 桌面端 API 层（825 波0 地基批）：首发仅登录链两接口，fetch 直连不引额外依赖。
// Bearer 鉴权口径（v73）：桌面 token 下发 token 不下发 cookie，过期权威在服务器设备账本。
import { requireApiBase } from '../config'

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

export interface ApiError {
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
    const data = await res.json().catch(() => null) as ApiError | null
    const err = new Error(data?.error ?? `请求失败（${res.status}）`) as Error & { api?: ApiError; status?: number }
    err.api = data ?? { code: 'NETWORK', error: err.message }
    err.status = res.status
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
