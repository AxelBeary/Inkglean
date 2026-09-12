// 端点方法 · 画师公开主页与公开价目/画廊/留言/点赞端点（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson, deleteJson } from './http'
import type { HasMoreResult, ArtistListItem, ArtistPublicProfile, Artwork, PublicMessagesResult, PostMessageRequest, PostMessageResult, PlatformDTO, WorkflowResult, ValidateDiscountRequest, ValidateDiscountResult, PublicArtStyle, PublicPricingResult, StylePriceResult, PublicGalleryResult, LikeArtworkResult } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── 画师公开主页 ───
export const artistPublicApi = {
  getAll: (): Promise<ArtistListItem[]> => getJson('/artists'),
  getProfile: (subdomain: string): Promise<ArtistPublicProfile> => getJson(`/artists/${subdomain}`),
  getWorkflow: (subdomain: string): Promise<WorkflowResult> => getJson(`/artists/${subdomain}/workflow`),
  // 价格计算器
  getPricing: (subdomain: string): Promise<PublicPricingResult> => getJson(`/public/pricing/${subdomain}`),
  // v0.31 F3: 折扣码验证（公开，限流 20次/5分钟）
  validateDiscount: (data: ValidateDiscountRequest): Promise<ValidateDiscountResult> =>
    postJson('/public/validate-discount', data),
  // v0.32 REQ-023 Phase2: 多画风公开配置 + 价格计算
  getPublicStyles: (subdomain: string): Promise<PublicArtStyle[]> => getJson(`/public/styles/${subdomain}`),
  calculateStylePrice: (data: import('../types').CalculateStylePriceRequest): Promise<StylePriceResult> =>
    postJson('/public/calculate-style-price', data),
  // v0.35 F6: 画廊专用端点（作品 size_tags/描述 + filterSizes 筛选档位）
  getPublicGallery: (subdomain: string): Promise<PublicGalleryResult> => getJson(`/public/gallery/${subdomain}`),
  // v0.42 Step 6: 公开作品分页（10/页 + 加载更多；封面置顶）
  getPublicArtworksPaged: (artistId: number, { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {}): Promise<HasMoreResult<Artwork>> =>
    getJson(`/public/artworks/${artistId}`, { params: { page, pageSize } }),
  // F1: 作品点赞（匿名公开）
  likeArtwork: (id: number): Promise<LikeArtworkResult> => postJson(`/public/artworks/${id}/like`),
  unlikeArtwork: (id: number): Promise<LikeArtworkResult> => deleteJson(`/public/artworks/${id}/like`),
  // F4: 留言板（公开）
  getMessages: (subdomain: string, page = 1, pageSize = 20): Promise<PublicMessagesResult> =>
    getJson(`/public/artist/${subdomain}/messages`, { params: { page, pageSize } }),
  postMessage: (subdomain: string, data: PostMessageRequest): Promise<PostMessageResult> =>
    postJson(`/public/artist/${subdomain}/messages`, data),
  // REQ-022 F2: 社交平台列表（公开，仅启用）
  getPlatforms: (): Promise<PlatformDTO[]> => getJson('/platforms')
}
