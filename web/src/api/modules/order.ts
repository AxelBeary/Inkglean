// 端点方法 · 客户端订单（下单/追踪/交付/一次性下载）（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import type { AxiosRequestConfig } from 'axios'
import { getJson, postJson } from './http'
import type { OrderCreateResult, OrderTrackResult, OrderDeliveryResult, CreateOrderRequest } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── 客户端订单 ───
export const orderApi = {
  // D-2（R-9）: options 透传幂等键 header（同一次提交重试复用同 key）
  create: (data: CreateOrderRequest, options: AxiosRequestConfig = {}): Promise<OrderCreateResult> =>
    postJson('/orders', data, options),
  // F1 围剿：客户访问凭高熵令牌（QQ+订单号弱双因子已退役）
  track: (orderNo: string, token: string): Promise<OrderTrackResult> =>
    getJson(`/orders/track/${orderNo}`, { params: { token } }),
  delivery: (orderNo: string, token: string): Promise<OrderDeliveryResult> =>
    getJson(`/orders/delivery/${orderNo}`, { params: { token } }),
  /** 815 拍板 #4：一次性下载——开始（签发一次性 URL）与确认（完整接收后锁定） */
  deliveryDownloadStart: (orderNo: string, fileId: number, token: string): Promise<{ url: string }> =>
    postJson(`/orders/delivery/${orderNo}/file/${fileId}/download-start?token=${encodeURIComponent(token)}`),
  deliveryDownloadConfirm: (orderNo: string, fileId: number, token: string): Promise<{ locked: boolean }> =>
    postJson(`/orders/delivery/${orderNo}/file/${fileId}/download-confirm?token=${encodeURIComponent(token)}`)
}
