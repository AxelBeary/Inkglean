import type { ArtistStatus } from '../../../api/types'

/** F0222/F0226: 记住隐藏前的营业状态——页面以 hidden 重新加载后不把满单/休息中重置为 open */
export const VALID_VISIBLE: ArtistStatus[] = ['open', 'full', 'break']

/** F0226: 可单测的恢复口径——缓存合法则取缓存，否则 open；当前为可见态时以当前态为准 */
export function resolveLastVisibleStatus(cached: string | null, current: string | undefined): string {
  const validCached = cached && VALID_VISIBLE.includes(cached as ArtistStatus) ? cached : 'open'
  return current && current !== 'hidden' ? current : validCached
}
