// 战役留账清收：画师公开资料请求去重
// 背景：同一画师的客户端 4 个页面（主页/下单/查单/交付）各自调 getProfile(subdomain)，无共享。
// 方案：只做 in-flight 去重——同一 subdomain 并发期间共享同一个 Promise，请求完成即移出；
//       不做长期缓存（无失效/陈旧问题），各页仍独立 await 同一 Promise，paletteId 等消费时序不变。
import { artistPublicApi } from '../api/index.js'
import type { ArtistPublicProfile } from '../api/types.js'

const inflight = new Map<string, Promise<ArtistPublicProfile>>()

export function fetchArtistPublicProfile(subdomain: string): Promise<ArtistPublicProfile> {
  const key = String(subdomain).toLowerCase()
  const existing = inflight.get(key)
  if (existing) return existing
  const p = artistPublicApi.getProfile(subdomain).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, p)
  return p
}
