// 端点方法 · HTTP 层（原生 fetch 请求核 + 统一错误处理 + 类型化请求 helper）
// 本文件是请求核与错误归一化的唯一宿主；api/index.ts（barrel）再导出 default 与 ApiError，调用方 import 路径不变
// 注 1：本组类型化请求 helper（getJson/postJson/patchJson/putJson/deleteJson）已加 export 供 ./modules/* 复用，属 api 包内私有，不从 @/api 入口再导出
// 注 2：原 index.ts 里指向 api/ 之外的相对路径（'../router/index' 等）随文件下移一层补为 '../../'，目标模块与动态导入防环口径均不变
// 注 3（2026-10-12 拆 axios 批）：axios 实例 + 响应拦截器 → 浏览器原生 fetch，理由是 axios 一周内 12 个 GHSA 披露、7 条 Dependabot 警报，
//   而本项目只用到 params / headers / timeout / FormData 四项能力；桌面端（desktop/src/api）与本页两处 blob 下载早已走 fetch，两端 HTTP 口径就此统一。
//   迁移红线：**对外行为逐字不变**——URL 前缀与查询串格式、凭 cookie 发请求、成功解包为响应体、错误对象的 status/code/detail 与文案链路、
//   503 SETUP_REQUIRED 逃逸、401 登出与白名单码，全部按原实现搬移，不夹带语义调整。
//   唯一语义差（施工图已钉死）：2xx 空体与 204 返 undefined（axios 旧行为是 ''）；实测服务端无任何 204/空体端点（`code(204)` 全仓零命中），对调用点零影响。

import { safeRemoveItem, safeSessionSetItem } from '../../utils/storage'
import { TOTP_BIND_REQUIRED_NOTICE_KEY } from '../../constants/auth'

// ============================================
// API 请求封装
// ============================================

const API_BASE = '/api'
/** 全仓请求超时口径（导出供路由守卫等裸 fetch 场景复用，避免两处各写一个魔数） */
export const DEFAULT_TIMEOUT_MS = 15000

/** 后端错误响应体（AppError 统一形状 { code, error, detail }） */
interface ApiErrorBody {
  code?: string
  error?: string
  detail?: Record<string, unknown>
}

/** 错误处理抛出的错误对象（附加 status/code，调用方可特判 404 等场景） */
export interface ApiError extends Error {
  status?: number
  code?: string
  detail?: Record<string, unknown>
}

/** 请求选项（替掉原 AxiosRequestConfig，只保留本项目真正用到的四项） */
export interface RequestConfig {
  /**
   * 查询参数：键 → 标量的对象。不写 `Record<string, ...>` 是因为多个调用方传的是无索引签名的 interface
   *（如 AdminMessageFilters / AdminInviteCodeQuery），收窄成 Record 会直接编译不过。
   * 约法：数组型参数现有调用链不存在（已全仓核实），如将来需要请在此单点补序列化，不要在调用方各自拼 URL。
   */
  params?: object
  /** 额外请求头（调用方可覆盖，如 G-7 的 x-anon-token 与幂等键） */
  headers?: Record<string, string>
  /** 单次请求超时（毫秒），缺省 15s；上传类走 120s */
  timeout?: number
  /** 外部中止信号（调用方主动取消时一并中止内部计时器控制的请求） */
  signal?: AbortSignal
}

// ─── 请求核的三个纯函数：拼 URL、备请求体、读响应 ───

/** 查询串编码：与 axios buildURL 同形（跳过 null/undefined，键与值分别 encodeURIComponent，空格编成 %20 而非 +） */
function buildUrl(url: string, params?: object): string {
  const path = `${API_BASE}${url}`
  if (!params) return path
  const qs = Object.entries(params as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/**
 * 请求体与 Content-Type：
 * FormData 与 Blob 原样交给浏览器，**这两种 body 一律不手设 Content-Type**（WEB-11 教训：缺 boundary 的 multipart 头是危险反模式；
 * Blob 手设会顶掉它自带的类型），其余非空数据序列化 JSON 并显式声明 application/json（fastify 按 content-type 选解析器，缺头会被判成无 body）。
 */
function buildBody(data: unknown): { body?: BodyInit; contentType?: string } {
  if (data === undefined || data === null) return {}
  if (data instanceof FormData || data instanceof Blob) return { body: data }
  return { body: JSON.stringify(data), contentType: 'application/json' }
}

/** 成功响应解包：204 或空体返 undefined，JSON 解析成对象，非 JSON 原样回文本 */
async function readSuccess<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T
  const text = await res.text()
  if (!text) return undefined as unknown as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

/** 错误响应体尽力解析：非 JSON（如反代返回的 HTML 错误页）按无结构化错误处理，文案走下方兜底 */
async function readErrorBody(res: Response): Promise<ApiErrorBody | undefined> {
  try {
    const text = await res.text()
    if (!text) return undefined
    return JSON.parse(text) as ApiErrorBody
  } catch {
    return undefined
  }
}

// ─── 错误归一化（原 axios 响应拦截器的错误分支，逐字搬移） ───

/** 统一抛出带 status/code/detail 的 ApiError；网络错误与超时（status 未知）走 i18n 兜底文案 */
async function fail(status?: number, data?: ApiErrorBody): Promise<never> {
  const code = data?.code
  let msg = data?.error || ''

  // REQ-038 补牢（812 用户实测报障）：服务端判未初始化（如 DB 重置/全新部署）而本地缓存仍 setup_initialized=1 时，
  // 路由守卫会信任缓存不跳转，用户卡死在裸 503 报错页。逃逸口：清陈旧缓存并跳开箱向导
  if (status === 503 && code === 'SETUP_REQUIRED') {
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
      const params = data?.detail && typeof data.detail === 'object' ? data.detail : undefined
      // 无参数时走单参重载（vue-i18n 类型不接受 undefined 参数；运行语义不变）
      const translated = params ? t(key, params) : t(key)
      // 如果翻译成功（不是返回 key 本身），使用翻译后的消息
      if (translated !== key) {
        msg = translated
        // 如果有 detail，附加上下文
        if (data?.detail?.name) msg = `${data.detail.name}：${msg}`
        if (data?.detail?.code) msg = `${msg}（${data.detail.code}）`
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
  if (status === 401 && !(code !== undefined && NO_LOGOUT_CODES.has(code))) {
    // 824: TOTP_BIND_REQUIRED（绑定失效/未完成）必须触发登出，但提示文案要带到登录页——
    // 跳登录页前写非敏感会话旗标，Login.vue 挂载时消费并以醒目样式展示后清除；
    // 已在登录页（如 Passkey 入口）时不写旗标，由调用方就地展示同一文案，避免重复噪音。
    const bindRequired = code === 'TOTP_BIND_REQUIRED'
    // 动态导入以避免循环依赖（store/router 依赖本模块）
    try {
      const { useArtistStore } = await import('../../stores/artist')
      const { default: router } = await import('../../router/index')
      const store = useArtistStore()
      // #52-2: 走会话清理动作而非 $reset——resetSession 递增 sessionSeq，在途 fetchProfile 才拦得住回写
      store.resetSession()
      if (router.currentRoute.value.name !== 'ArtistLogin') {
        if (bindRequired) safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
        router.push({ name: 'ArtistLogin' })
      }
    } catch (err) {
      // L1: 兜底硬跳转（保留原行为，补 console.warn 避免静默吞错）
      // 清理动作本身失败（如 store 模块加载失败）时兜底清标记，防旧标记残留过守卫
      safeRemoveItem('artist_logged_in')
      safeRemoveItem('artist_is_admin')
      if (bindRequired) safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
      // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 401 软跳转失败静默吞错
      console.warn('[api] 401 soft-redirect failed, falling back to hard redirect', err)
      window.location.href = '/login'
    }
  }
  // 05D-I1/E1: 错误对象附加 status/code（调用方可特判 404 等场景），不改变既有错误消息行为
  const wrapped: ApiError = new Error(msg)
  if (status) wrapped.status = status
  if (code) wrapped.code = code
  // 登录页重构（2026-08-10）：附带 detail（如 TOTP_LOCKED 的 remainingLockMs），
  // 调用方可做字段级呈现；纯增量，不影响既有 msg/status/code 行为
  if (data?.detail && typeof data.detail === 'object') wrapped.detail = data.detail
  throw wrapped
}

// ─── 请求核 ───

/** 发一次请求：成功解包响应体，失败（非 2xx / 网络错误 / 超时）一律经 fail 抛出 ApiError */
async function request<T>(method: string, url: string, data?: unknown, config: RequestConfig = {}): Promise<T> {
  const { body, contentType } = buildBody(data)
  // 超时用 AbortController + setTimeout 自持（不用 AbortSignal.timeout：测试环境的 happy-dom 不保证有该静态方法，
  // 且 finally 清计时器可避免遗留定时器）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeout ?? DEFAULT_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (config.signal) {
    if (config.signal.aborted) controller.abort()
    else config.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const headers: Record<string, string> = {
    // Accept 与 axios 默认值同形，避免服务端内容协商侧感知差异
    Accept: 'application/json, text/plain, */*',
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...(config.headers || {})
  }

  // 计时器覆盖到响应体读完：fetch 一 resolve（收到响应头）就清计时器的话，
  // 服务端发完头后卡住 body 会让 res.text() 永不 settle（loading 永久转圈、无错误可报）。
  let res: Response | undefined
  try {
    res = await fetch(buildUrl(url, config.params), {
      method,
      headers,
      // 等价原 withCredentials: true —— httpOnly cookie 必须随请求发出
      credentials: 'include',
      body,
      signal: controller.signal
    })
    if (!res.ok) return await fail(res.status, await readErrorBody(res))
    return await readSuccess<T>(res)
  } catch (err) {
    // fail() 抛出的 ApiError 原样上抛，避免被当成网络错误二次包装
    if ((err as ApiError)?.status !== undefined) throw err
    // 网络不可达 / 请求被中止（超时或外部 signal）/ 读体中断
    return await fail()
  } finally {
    clearTimeout(timer)
    config.signal?.removeEventListener('abort', onExternalAbort)
  }
}

// ─── 类型化请求 helper（模块私有，供 ./modules/* 复用） ───

export function getJson<T>(url: string, config?: RequestConfig): Promise<T> {
  return request<T>('GET', url, undefined, config)
}
export function postJson<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
  return request<T>('POST', url, data, config)
}
export function patchJson<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
  return request<T>('PATCH', url, data, config)
}
export function putJson<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
  return request<T>('PUT', url, data, config)
}
export function deleteJson<T>(url: string, config?: RequestConfig): Promise<T> {
  return request<T>('DELETE', url, undefined, config)
}

// 默认导出保留原 axios 实例的调用形状（api/index.ts barrel 再导出不变，下游 import 不动）
const api = {
  request,
  get: <T>(url: string, config?: RequestConfig) => request<T>('GET', url, undefined, config),
  post: <T>(url: string, data?: unknown, config?: RequestConfig) => request<T>('POST', url, data, config),
  patch: <T>(url: string, data?: unknown, config?: RequestConfig) => request<T>('PATCH', url, data, config),
  put: <T>(url: string, data?: unknown, config?: RequestConfig) => request<T>('PUT', url, data, config),
  delete: <T>(url: string, config?: RequestConfig) => request<T>('DELETE', url, undefined, config)
}

export default api
