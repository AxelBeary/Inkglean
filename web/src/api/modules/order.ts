// 端点方法 · 客户端订单（下单/追踪/交付/一次性下载）（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson } from './http'
import type { RequestConfig } from './http'
import type { OrderCreateResult, OrderTrackResponse, OrderDeliveryResult, CreateOrderRequest, RefreshSignaturesResult, OrderDeliveryDownloadStartResult } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

/**
 * F0179：客户访问令牌承载位置——改走 x-order-token header，不再拼进 URL query 明文。
 * 服务端双读（header 优先、query 回退）保一个发版周期的兼容窗口。
 * 注意：用户粘贴的查单链接（?no=…&token=…）是另一回事，TrackOrder 的 parseLink 不动；
 * 本 helper 只管「页面→API」这一跳。4 个带令牌端点统一复用，避免散落。
 */
function tokenHeader(token: string): RequestConfig {
  return { headers: { 'x-order-token': token } }
}

// ─── 客户端订单 ───
export const orderApi = {
  // D-2（R-9）: options 透传幂等键 header（同一次提交重试复用同 key）
  create: (data: CreateOrderRequest, options: RequestConfig = {}): Promise<OrderCreateResult> =>
    postJson('/orders', data, options),
  // F1 围剿：客户访问凭高熵令牌（QQ+订单号弱双因子已退役）；F0179：令牌改走 header
  track: (orderNo: string, token: string): Promise<OrderTrackResponse> =>
    getJson(`/orders/track/${orderNo}`, tokenHeader(token)),
  /** 查单页停留续签（客户侧对应画师端 /artist/refresh-signatures）：令牌在 body，无 query 明文 */
  refreshTrackSignatures: (orderNo: string, token: string, paths: string[]): Promise<RefreshSignaturesResult> =>
    postJson(`/orders/track/${orderNo}/refresh-signatures`, { token, paths }),
  delivery: (orderNo: string, token: string): Promise<OrderDeliveryResult> =>
    getJson(`/orders/delivery/${orderNo}`, tokenHeader(token)),
  /** 815 拍板 #4：一次性下载——开始（签发一次性 URL）与确认（完整接收后锁定）；F0179：令牌走 header（buildBody(undefined) 为空体，安全） */
  deliveryDownloadStart: (orderNo: string, fileId: number, token: string): Promise<OrderDeliveryDownloadStartResult> =>
    postJson(`/orders/delivery/${orderNo}/file/${fileId}/download-start`, undefined, tokenHeader(token)),
  deliveryDownloadConfirm: (orderNo: string, fileId: number, token: string, confirmationToken: string): Promise<{ locked: boolean }> =>
    postJson(`/orders/delivery/${orderNo}/file/${fileId}/download-confirm`, { confirmationToken }, tokenHeader(token))
}
