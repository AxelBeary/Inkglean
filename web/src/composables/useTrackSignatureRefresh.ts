/**
 * useTrackSignatureRefresh — 客户查单页（TrackOrder）的签名续签接线
 *
 * 为什么单独成文件：查单页只在 onMounted 取一次数据，而签名 URL 有效期 5 分钟
 * （事实源 server/src/shared/file-sign.ts 的 FILE_TTL_MS），客户停留超过 5 分钟后
 * 参考图与过程稿全部 403。定时/回前台/防重入/分片这套逻辑已在 useSignatureRefresh 里，
 * 本文件只负责「查单页特有的三件事」：从订单数据收集裸路径、把新 URL 原地写回、
 * 以及把换签端点换成客户侧（身份是订单令牌，画师端点要登录态用不了）。
 *
 * 原地写回而不整体替换 order 对象：TrackOrder 的查询有 seq 竞态守卫，
 * 整体替换会让在途查询的守卫误判。
 */
import type { Ref } from 'vue'
import { uploadedPathFromUrl, useSignatureRefresh } from './useSignatureRefresh'

/** 查单页里可续签的最小结构（只取本 composable 关心的两个数组） */
interface RefreshableOrder {
  /** 旧版字符串行（历史存档链接）与对象行并存，与模板 `r.url || r` 同口径 */
  references?: Array<{ url?: string } | string>
  previews?: Array<{ url?: string }>
}


/** 参考图 URL：对象行取 .url，字符串行取自身 */
function referenceUrl(row: { url?: string } | string): string {
  if (typeof row === 'string') return row
  const url = row?.url
  return typeof url === 'string' ? url : ''
}

export function useTrackSignatureRefresh<T extends RefreshableOrder>({
  order,
  orderNo,
  token,
  request,
}: {
  order: Ref<T | null>
  orderNo: Ref<string>
  token: Ref<string>
  /** 换签请求（注入而非在此 import api，便于单测替换）；响应与画师端同形 { urls, skipped? } */
  request: (orderNo: string, token: string, paths: string[]) => Promise<{ urls: Record<string, string>; skipped?: string[] }>
}): { refreshNow: (path?: unknown) => void } {
  /** 当前已渲染图片的路径（参考图 + 过程稿，去重）；空数组 = 本次无需续签 */
  const collect = (): string[] => {
    const current = order.value
    if (!current) return []
    const paths = new Set<string>()
    for (const ref of current.references || []) {
      const path = uploadedPathFromUrl(referenceUrl(ref))
      if (path) paths.add(path)
    }
    for (const preview of current.previews || []) {
      const path = uploadedPathFromUrl(preview.url ?? '')
      if (path) paths.add(path)
    }
    return [...paths]
  }

  /** 新 URL 原地写回（字符串行没有可写字段，只更新对象行） */
  const apply = (urls: Record<string, string>): void => {
    const current = order.value
    if (!current) return
    for (const ref of current.references || []) {
      if (typeof ref === 'string') continue
      const next = urls[uploadedPathFromUrl(referenceUrl(ref)) || '']
      if (next) ref.url = next
    }
    for (const preview of current.previews || []) {
      const next = urls[uploadedPathFromUrl(preview.url ?? '') || '']
      if (next) preview.url = next
    }
  }

  /** 失效路径：把对应过程稿从列表摘掉（客户页不再显示一张永远 403 的裂图）。
   *  参考图不清：那是客户自己给的输入，宁可留占位也不擅自删客户数据。 */
  const dropSkipped = (paths: string[]): void => {
    const current = order.value
    if (!current?.previews?.length) return
    const gone = new Set(paths)
    current.previews = current.previews.filter(p => !gone.has(uploadedPathFromUrl(p.url ?? '') || ''))
  }

  // F0253: 透传 refreshNow——原包装层丢弃它，客户查单页失去单图 @error 兜底（超时 403 只能等下一轮定时刷新）
  const { refreshNow } = useSignatureRefresh({
    collect,
    apply,
    onSkipped: dropSkipped,
    request: (paths) => request(orderNo.value, token.value, paths),
  })
  return { refreshNow }
}
