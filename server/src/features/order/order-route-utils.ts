import { existsSync, statSync } from 'fs'
import { resolve, sep } from 'path'
import { AppError, E } from '../../shared/errors.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { signedUrl } from '../../shared/file-sign.js'
import * as orderService from './order.service.js'
import * as orderWorkflowService from './order-workflow.service.js'
import { getRevisionRecords } from './activity-log.service.js'
import type { OrderDetail } from '../../types/entities.js'
import type { FastifyRequest } from 'fastify'

// ============================================
// 订单路由共享工具（从 order.routes.ts 拆出，各子路由插件共用）
// ============================================

export const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')

/**
 * P2-12: 参考图路径存在性校验（客户下单/手动录单/画师追加共用）
 * 存在性校验是当前归属校验的最小替代——客户 A 拿不到客户 B 上传文件的随机文件名
 * （uploads 不列目录），挂不存在的路径没有意义；真正的归属凭据体系（上传即绑定
 * 上传者）另立。与上传钩子一致：resolve 到 uploads 根下 + 拒绝穿越。
 */
export function assertReferenceFileExists(ref: string): void {
  if (ref.includes('..') || !ref.startsWith('references/')) {
    throw new AppError(E.ILLEGAL_PATH)
  }
  const abs = resolve(UPLOAD_ROOT, ref)
  if (!abs.startsWith(resolve(UPLOAD_ROOT) + sep) || !existsSync(abs) || !statSync(abs).isFile()) {
    throw new AppError(E.ILLEGAL_PATH)
  }
}

/** 为订单的 references + deliverables + notes 补签名 URL（H-1 修复抽取，多路由共用） */
function signOrderUrls(order: OrderDetail): OrderDetail {
  if (order.references) {
    order.references = order.references.map((r) => ({ ...r, url: signedUrl(r.file_path) }))
  }
  if (order.deliverables) {
    // 260830 审计 H-4：交付文件一律带载荷签名——画师端预览走预览载荷（仅 deliverableId），
    // 客户下载走 download-start 的 nonce 载荷；裸签名在访问层会被 403。
    order.deliverables = order.deliverables.map((d) => ({ ...d, url: signedUrl(d.file_path, { deliverableId: d.id }) }))
  }
  // R19: 备注附图签名 — 漏做 = 前端拿裸路径 → 403（焦点图 Bug 翻版）
  if (order.notes) {
    order.notes = order.notes.map((n) =>
      n.image_path ? { ...n, imageUrl: signedUrl(n.image_path) } : n
    )
  }
  return order
}

/**
 * 画师端订单响应统一增强（B1 修复：变更端点与 GET /:id 对齐）
 * 签名 URL → 流程进度 → 话术 → 收款/分期/开工日 camelCase 字段。
 * 语义严格照抄原 GET /:id（paid_total_cents ?? 0、final ?? total、remaining 不为负）。
 * 所有返回单个订单的画师端点必须走本函数，否则前端 order.value 覆盖后
 * paidTotalCents 变 undefined → 收款区归零、installments 丢失。
 */
export function enrichOrderForArtist(order: OrderDetail, artistId?: number): OrderDetail {
  // H-1 修复：画师端也返回签名 URL（references + deliverables 非公开目录）
  const signed = signOrderUrls(order)
  // R30d: 附加流程进度信息
  // L-4（审计 三#10）: 路由层显式透传画师归属，服务层按归属过滤节点
  const stageInfo = orderWorkflowService.getStageInfo(signed, artistId)
  if (stageInfo) Object.assign(signed, stageInfo)
  // plan-node-speech: 话术 + 客户沟通数据
  const speechInfo = orderWorkflowService.getSpeechInfo(signed, artistId)
  Object.assign(signed, speechInfo)
  // B7: 额度池 — 已付/待收 + 分期推算状态
  const finalCents = signed.final_price_cents ?? signed.total_price_cents ?? null
  Object.assign(signed, {
    paidTotalCents: signed.paid_total_cents ?? 0,
    remainingCents: finalCents != null ? Math.max(0, finalCents - (signed.paid_total_cents ?? 0)) : null,
    installments: orderService.getOrderInstallments(signed.id),
    // v0.26 B: snake_case → camelCase 映射（对照 currentStageId 模式）
    startDate: signed.start_date ?? null,
    // v128: 修改记录（手动修改+打回均计一次，口径用户拍板）——随所有单订单端点下发，前端覆盖不丢
    revisionRecords: getRevisionRecords(signed.id)
  })
  return signed
}

/** 限流守卫：不通过则抛 429 */
export function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/**
 * 订单归属校验 preHandler
 * 解析 :id → 查订单 → 校验 artist_id → 挂载 request.order
 */
export async function requireOwnOrder(request: FastifyRequest): Promise<void> {
  const id = parseInt((request.params as { id: string }).id, 10)
  if (isNaN(id)) throw new AppError(E.ORDER_INVALID_ID)
  const order = orderService.getOrder(id)
  if (!order || order.artist_id !== request.artist.id) {
    throw new AppError(E.ORDER_NOT_FOUND, 404)
  }
  request.order = order
}

/**
 * D-1（R-5）: 无 body schema 的写路由（deliver-no-file/track-on/promote）手动解析可选 version。
 * 不给这三个路由加 body schema 的原因：既有调用方/测试无 body 直发（Fastify 会先于
 * preHandler 校验并 400，破坏 401/409/404 语义），手动解析只拦非法 version、放行空 body。
 */
export function parseOptionalVersion(body: unknown): number | undefined {
  if (body == null) return undefined
  const v = (body as { version?: unknown }).version
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new AppError(E.VALIDATION, 400, { field: 'version', message: 'version 须为正整数' })
  }
  return v
}
