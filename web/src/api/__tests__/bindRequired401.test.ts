// api 拦截器 401 分流测试（824：TOTP_BIND_REQUIRED 登出 + 旗标带到登录页）
// 覆盖：绑定失效码触发登出并写旗标；已在登录页不写旗标；白名单码不登出；普通 401 登出不写旗标
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AxiosError } from 'axios'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { TOTP_BIND_REQUIRED_NOTICE_KEY } from '../../constants/auth'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  reset: vi.fn(),
  routeName: 'ArtistDashboard'
}))

// 拦截器内动态 import 的三个模块全部 mock，避免拉起真实 i18n/store/router 依赖链
vi.mock('../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } }
}))

vi.mock('../../stores/artist.js', () => ({
  useArtistStore: () => ({ $reset: h.reset })
}))

vi.mock('../../router/index.js', () => ({
  default: {
    currentRoute: {
      get value() {
        return { name: h.routeName }
      }
    },
    push: (...args: unknown[]) => h.push(...args)
  },
  SETUP_ROUTE: { path: '/setup', name: 'SetupWizard' }
}))

import api from '../index'

/** 构造带业务错误码的 401 AxiosError（与后端 AppError 形状 { code, error } 对齐） */
function make401(code?: string): AxiosError {
  const config = {} as InternalAxiosRequestConfig
  const response = {
    data: code ? { code, error: 'raw-server-message' } : {},
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config
  } as AxiosResponse
  return new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
}

/** 用自定义 adapter 直发拒绝，驱动响应拦截器错误分支 */
function fire401(code?: string): Promise<unknown> {
  return api
    .get('/probe', { adapter: () => Promise.reject(make401(code)) })
    .catch((err: unknown) => err)
}

beforeEach(() => {
  h.push.mockClear()
  h.reset.mockClear()
  h.routeName = 'ArtistDashboard'
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('artist_logged_in', '1')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api 拦截器 401 分流（824）', () => {
  it('TOTP_BIND_REQUIRED（非登录页）：触发登出 + 写旗标 + 跳登录页，错误对象带 code', async () => {
    const err = (await fire401('TOTP_BIND_REQUIRED')) as { code?: string }

    expect(err.code).toBe('TOTP_BIND_REQUIRED')
    expect(h.reset).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
    expect(localStorage.getItem('artist_logged_in')).toBeNull()
    expect(localStorage.getItem('artist_is_admin')).toBeNull()
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBe('1')
  })

  it('TOTP_BIND_REQUIRED（已在登录页）：清标记但不写旗标不跳转（调用方就地展示）', async () => {
    h.routeName = 'ArtistLogin'

    await fire401('TOTP_BIND_REQUIRED')

    expect(h.push).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
    expect(localStorage.getItem('artist_logged_in')).toBeNull()
  })

  it('白名单码（TOTP_NOT_BOUND）：只抛错不登出、不写旗标', async () => {
    const err = (await fire401('TOTP_NOT_BOUND')) as { code?: string }

    expect(err.code).toBe('TOTP_NOT_BOUND')
    expect(h.push).not.toHaveBeenCalled()
    expect(h.reset).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
    expect(localStorage.getItem('artist_logged_in')).toBe('1')
  })

  it('普通 401（SESSION_EXPIRED）：登出 + 跳登录页，但不写绑定失效旗标', async () => {
    const err = (await fire401('SESSION_EXPIRED')) as { code?: string }

    expect(err.code).toBe('SESSION_EXPIRED')
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
    expect(localStorage.getItem('artist_logged_in')).toBeNull()
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
  })
})
