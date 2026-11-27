// M-5 / F0179 / XVB-2：Sentry 上报脱敏——从 app.ts 拆出，导出面保持不变
// （app.ts 仍从这里取 sentryBeforeSend / requestLogUrl）。app.ts 已逼近 800 行防阀，
// 脱敏策略一律在本文件演进，不回写 app.ts。
import type * as Sentry from '@sentry/node'

/** 凭证既可能在路径白名单里，也可能藏在任意查询参数中（日历订阅、安装向导、签名文件等）。 */
const CREDENTIAL_PARAM_RE = /[?&](?:token|sig|code|key|password|secret)=/i

export function hasPrivateQuery(url: string): boolean {
  if (CREDENTIAL_PARAM_RE.test(url ?? '')) return true
  const path = url?.split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+/i, '') ?? ''
  return path.startsWith('/uploads/') || path.startsWith('/setup') ||
    /^\/artist\/[^/]+\/(?:track|delivery\/[^/]+)\/?$/i.test(path)
}

/** 文件签名和客户访问令牌都在查询参数中，访问日志只记录这些入口的路径。 */
export function requestLogUrl(url: string): string {
  return hasPrivateQuery(url) ? url.split('?', 1)[0] : url
}

// ─── 自由文本脱敏（XVB-2：消息类字段是 header 之外的漏面） ───

/** `Authorization: Bearer <token>` 形状——fetch/undici 失败时会把整段头拼进 message。 */
const AUTH_SCHEME_RE = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi

/**
 * `name=value` 形状的凭据：query（`?token=`）、日志串（`x-order-token=…`）、表单回显（`code=…`）。
 * 键名按「含凭据词」判定而非枚举固定名——带前缀/下划线的变体（`access_token` /
 * `x-anon-token` / `idempotency-key`）一并覆盖，这正是 `hasPrivateQuery` 那套固定名枚举
 * （XVB-4）漏掉的部分；故这里是比它更宽的兜底，只用于「不上第三方」的目的。
 */
const CREDENTIAL_ASSIGN_RE =
  /([?&;\s"'(:,])([A-Za-z0-9_.-]*(?:token|secret|password|passwd|key|sig|signature|code|auth)[A-Za-z0-9_.-]*)=([^&\s"',;)]+)/gi

/**
 * 只对**保留下来的**文本字段做脱敏：消息/异常值/面包屑消息里可能拼进 URL 或 header 片段，
 * 但整段丢弃等于放弃 5xx 排障的主信号（错误消息），因此按凭据形状替换为 *** 后照常上报。
 */
function scrubText(text: string): string {
  return text
    .replace(AUTH_SCHEME_RE, (_match, scheme: string) => `${scheme} ***`)
    .replace(CREDENTIAL_ASSIGN_RE, (_match, lead: string, name: string) => `${lead}${name}=***`)
}

/**
 * event 顶层白名单：只保留「定位 / 分组 / 版本追溯」必需字段，其余一律不带走。
 *
 * 为什么白名单而不是逐字段 delete：@sentry/node 每次升级都可能往 event/request 加新字段
 * （v10 就给 request 加了 `data` 与 `query_string`），黑名单永远慢一步；白名单下未知字段
 * 默认丢弃。刻意**不**保留的自由容器与用户载荷：`extra` / `tags` / `contexts` / `user` /
 * `modules` / `logentry` / `spans` / `threads`——本仓无一处往里写非敏感诊断，全是「未来某天
 * 有人把令牌塞进去」的候选面。
 */
const EVENT_KEPT_KEYS: ReadonlyArray<keyof Sentry.ErrorEvent> = [
  'event_id', // 去重、与前端事件/日志关联
  'timestamp', // 发生时刻
  'level', // fatal/error，决定告警路由
  'platform', // node，定位运行时
  'logger', // 记录来源
  'transaction', // 路由模板（如 /api/orders/:orderNo），定位出错端点
  'release', // 版本号，定位「哪次发布引入」
  'environment', // 环境
  'server_name', // 多实例时定位是哪台机器
  'sdk', // SDK 版本，排障用（不含业务数据）
  'fingerprint', // 自定义分组键
  'message', // 经 scrubText
  'exception', // 经字段白名单 + scrubText
  'breadcrumbs', // 经字段白名单 + scrubText
  'request' // 只留 method + url（掩码后再 scrubText）
]

/**
 * M-5 / F0179 / XVB-2：Sentry beforeSend 统一脱敏（可导出供回归测试直接钉死）。
 *
 * 背景（@sentry/node 10.78.0）：
 * - RequestData 集成默认把 normalizedRequest.headers **全量**写进 `event.request.headers`；
 * - `sendDefaultPii:false` 只管 IP/用户信息，**不**过滤 headers、也不管 console 面包屑；
 * - consoleIntegration / localVariablesIntegration 都在默认集成表里：前者把原始 console 参数
 *   写进 `breadcrumb.data.arguments`，后者把**栈帧局部变量快照**写进 `frame.vars`——
 *   处理令牌的函数一出错，令牌就随 local 变量出网。
 * 故本函数按白名单重建 event 的每个载荷段（口径：只留定位必需字段，凭据形状的文本先脱敏）。
 */
export function sentryBeforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // ① 顶层白名单：不在表内的键（含 SDK 未来新增字段）直接删除
  const topLevel = event as unknown as Record<string, unknown>
  for (const key of Object.keys(topLevel)) {
    if (!EVENT_KEPT_KEYS.includes(key as keyof Sentry.ErrorEvent)) delete topLevel[key]
  }

  // ② request 白名单：只留 method + url。headers（x-order-token / x-anon-token /
  //    authorization / idempotency-key / cookie）、cookies、data（登录码/TOTP/订单体）、
  //    query_string 都是令牌载体，一律不重建。url 先走既有 hasPrivateQuery 掩码，
  //    再 scrubText 兜住固定名枚举漏掉的参数变体。
  if (event.request) {
    const { method, url } = event.request
    event.request = {
      method,
      url: url === undefined ? undefined : scrubText(hasPrivateQuery(url) ? requestLogUrl(url) : url)
    }
  }

  // ③ 事件消息：保留（否则 5xx 只剩栈，排障成本极高），按凭据形状脱敏
  if (typeof event.message === 'string') event.message = scrubText(event.message)

  for (const exception of event.exception?.values ?? []) {
    // ④ 异常消息：同 ③ 的理由
    if (typeof exception.value === 'string') exception.value = scrubText(exception.value)
    // ⑤ 栈帧白名单：`vars` 是局部变量快照（见文件头背景），`context_line`/`pre_context`/
    //    `post_context` 是源码行——都超出「定位到哪一行」的必需面，一并丢弃；
    //    filename/function/lineno/colno/in_app 足以在 Sentry 里定位。
    if (exception.stacktrace?.frames) {
      exception.stacktrace.frames = exception.stacktrace.frames.map(frame => ({
        filename: frame.filename,
        function: frame.function,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app
      }))
    }
  }

  // ⑥ 面包屑白名单：category/level/timestamp/message + （仅 http 面包屑的）method/status_code。
  //    data 必须整段重建：console 面包屑把原始参数放在 data.arguments（可能是整条 URL 或
  //    含 token 的对象），http 面包屑把带查询串的 url 放在 data.url——自由容器无法逐键枚举。
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(crumb => {
      const data = (crumb.data ?? {}) as Record<string, unknown>
      const safeData: Record<string, unknown> = {}
      if (typeof data.method === 'string') safeData.method = data.method
      if (typeof data.status_code === 'number') safeData.status_code = data.status_code
      return {
        category: crumb.category,
        level: crumb.level,
        timestamp: crumb.timestamp,
        message: typeof crumb.message === 'string' ? scrubText(crumb.message) : crumb.message,
        ...(Object.keys(safeData).length > 0 ? { data: safeData } : {})
      }
    })
  }

  return event
}
