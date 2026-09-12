// 端点方法 · HTTP 层（axios 实例 + 响应拦截器 + 类型化请求 helper）（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 本文件是 axios 单例与响应拦截器的唯一宿主；api/index.ts（barrel）再导出 default 与 ApiError，调用方 import 路径不变
// 注 1：本组类型化请求 helper（getJson/postJson/patchJson/putJson/deleteJson）已加 export 供 ./modules/* 复用，属 api 包内私有，不从 @/api 入口再导出
// 注 2：原 index.ts 里指向 api/ 之外的相对路径（'../router/index' 等）随文件下移一层补为 '../../'，目标模块与动态导入防环口径均不变

import axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { safeRemoveItem, safeSessionSetItem } from '../../utils/storage'
import { TOTP_BIND_REQUIRED_NOTICE_KEY } from '../../constants/auth'

// ============================================
// API 请求封装
// ============================================

const API_TIMEOUT_MS = 15000

const api = axios.create({
  baseURL: '/api',
  timeout: API_TIMEOUT_MS,
  withCredentials: true // 发送 httpOnly cookie
})

/** 后端错误响应体（AppError 统一形状 { code, error, detail }） */
interface ApiErrorBody {
  code?: string
  error?: string
  detail?: Record<string, unknown>
}

/** 错误拦截器抛出的错误对象（附加 status/code，调用方可特判 404 等场景） */
export interface ApiError extends Error {
  status?: number
  code?: string
  detail?: Record<string, unknown>
}

// 响应拦截器：统一错误处理 + i18n 翻译
api.interceptors.response.use(
  res => res.data,
  async (err: AxiosError<ApiErrorBody>) => {
    const data = err.response?.data
    const code = data?.code
    let msg = data?.error || ''

    // REQ-038 补牢（812 用户实测报障）：服务端判未初始化（如 DB 重置/全新部署）而本地缓存仍 setup_initialized=1 时，
    // 路由守卫会信任缓存不跳转，用户卡死在裸 503 报错页。逃逸口：清陈旧缓存并跳开箱向导
    if (err.response?.status === 503 && code === 'SETUP_REQUIRED') {
      safeRemoveItem('setup_initialized')
      try {
        // 动态导入避免循环依赖（router 链依赖本模块）
        const routerMod = await import('../../router/index')
        // 815 拍板 #6：向导路由可能已被物理销毁（已初始化后启动移除），逃逸口重新注册回来
        if (!routerMod.default.hasRoute('SetupWizard')) {
          routerMod.default.addRoute(routerMod.SETUP_ROUTE)
        }
        if (routerMod.default.currentRoute.value.name !== 'SetupWizard') {
          routerMod.default.push({ name: 'SetupWizard' })
        }
      } catch { /* 跳转失败不吞错误，继续走下方错误提示链路 */ }
    }

    // 尝试用 i18n 翻译错误码
    if (code) {
      try {
        const { i18n } = await import('../../i18n/index')
        const t = i18n.global.t
        const key = `errors.${code}`
        // detail 作为 i18n 命名插值参数（如 STAGES_RESET_BLOCKED 的 {count}）
        const params = data.detail && typeof data.detail === 'object' ? data.detail : undefined
        // 无参数时走单参重载（vue-i18n 类型不接受 undefined 参数；运行语义不变）
        const translated = params ? t(key, params) : t(key)
        // 如果翻译成功（不是返回 key 本身），使用翻译后的消息
        if (translated !== key) {
          msg = translated
          // 如果有 detail，附加上下文
          if (data.detail?.name) msg = `${data.detail.name}：${msg}`
          if (data.detail?.code) msg = `${msg}（${data.detail.code}）`
        }
      } catch (err) {
        // L1: i18n 加载失败，使用原始消息（补 console.warn，避免静默吞错）
        // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 i18n 翻译失败静默吞错
        console.warn('[api] i18n error translation failed, using raw message', err)
      }
    }

    // D3: 无错误码/无 error 字段（网络错误等）时，兜底文案走 i18n 键
    if (!msg) {
      try {
        const { i18n } = await import('../../i18n/index')
        msg = i18n.global.t('common.networkError')
      } catch {
        // i18n 加载失败（极端兜底）：退回简单英文文案，避免空白提示
        msg = 'Network error, please try again later'
      }
    }

    // 401 时清除本地认证状态并跳转登录页
    // P1-3 修复：登录相关错误码不触发登出，只提示
    // G-6（衔接批 F-9）: 退役三码 CODE_INVALID/CODE_EXPIRED/CODE_TOO_MANY_ATTEMPTS 已从白名单移除；
    // 保留/新增码与 server/src/shared/errors.ts 现状核对一致（REQ-027 TOTP 登录返回 TOTP_*）
    const LOGIN_CODES = ['QQ_NOT_REGISTERED', 'TOTP_NOT_BOUND', 'TOTP_INVALID', 'TOTP_LOCKED', 'MISSING_CREDENTIALS']
    // REQ-041: STEP_UP_REQUIRED（入口/动作级需二次验证）与 Passkey 认证失败不应踢出登录态——
    // 验证对话框内失败只提示，用户仍可重试；其余 401 维持既有登出语义
    const NO_LOGOUT_CODES = new Set([...LOGIN_CODES, 'STEP_UP_REQUIRED', 'WEBAUTHN_AUTHENTICATION_FAILED', 'WEBAUTHN_CHALLENGE_INVALID'])
    if (err.response?.status === 401 && !(code !== undefined && NO_LOGOUT_CODES.has(code))) {
      // P3-10: 存储禁用时 401 清标记也不得抛错（否则登出软跳转被吞）
      safeRemoveItem('artist_logged_in')
      safeRemoveItem('artist_is_admin')
      // 824: TOTP_BIND_REQUIRED（绑定失效/未完成）必须触发登出，但提示文案要带到登录页——
      // 跳登录页前写非敏感会话旗标，Login.vue 挂载时消费并以醒目样式展示后清除；
      // 已在登录页（如 Passkey 入口）时不写旗标，由调用方就地展示同一文案，避免重复噪音。
      const bindRequired = code === 'TOTP_BIND_REQUIRED'
      // 动态导入以避免循环依赖（store/router 依赖本模块）
      try {
        const { useArtistStore } = await import('../../stores/artist')
        const { default: router } = await import('../../router/index')
        const store = useArtistStore()
        store.$reset()
        if (router.currentRoute.value.name !== 'ArtistLogin') {
          if (bindRequired) safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
          router.push({ name: 'ArtistLogin' })
        }
      } catch (err) {
        // L1: 兜底硬跳转（保留原行为，补 console.warn 避免静默吞错）
        if (bindRequired) safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
        // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 401 软跳转失败静默吞错
        console.warn('[api] 401 soft-redirect failed, falling back to hard redirect', err)
        window.location.href = '/login'
      }
    }
    // 05D-I1/E1: 错误对象附加 status/code（调用方可特判 404 等场景），不改变既有错误消息行为
    const wrapped: ApiError = new Error(msg)
    if (err.response?.status) wrapped.status = err.response.status
    if (code) wrapped.code = code
    // 登录页重构（2026-08-10）：附带 detail（如 TOTP_LOCKED 的 remainingLockMs），
    // 调用方可做字段级呈现；纯增量，不影响既有 msg/status/code 行为
    if (data?.detail && typeof data.detail === 'object') wrapped.detail = data.detail
    return Promise.reject(wrapped)
  }
)

// ─── 类型化请求 helper（模块私有） ───
// 响应拦截器已把返回解包为 res.data，axios 默认泛型返回 AxiosResponse<T> 与运行时不符；
// 此处用第二个泛型参数 R=T 在类型层面一次性对齐（本模块唯一的类型处理点，零运行时改动）
export function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return api.get<T, T>(url, config)
}
export function postJson<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.post<T, T>(url, data, config)
}
export function patchJson<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.patch<T, T>(url, data, config)
}
export function putJson<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.put<T, T>(url, data, config)
}
export function deleteJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return api.delete<T, T>(url, config)
}

export default api
