// API 边界 DTO · 作品（画师端 + 发布 + 请求体）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { SensitiveWarning } from './compliance'

// ─── 作品（artist.service.ts） ───

export interface Artwork {
  id: number
  artist_id: number
  image_path: string
  title: string | null
  sort_order: number
  like_count: number
  is_cover: number
  description: string | null
  width: number | null
  height: number | null
}

/** 画师端作品行（附带档位标注 ID） */
export type ArtworkWithTags = Artwork & { size_tag_ids: number[] }

/** REQ-042: 作品写路径回显（创建/编辑命中敏感词时附 warning） */
export type ArtworkWithWarning = Artwork & { warning?: SensitiveWarning }

/** POST /artist/orders/:id/publish-artwork 响应（201） */
export interface PublishArtworkResult {
  artworks: Artwork[]
  /** REQ-042: 敏感词命中提示（不硬拦，先发后审） */
  warning?: SensitiveWarning
}

/** PUT /artist/artworks/:id/tags 响应 */
export interface SetArtworkTagsResult {
  sizeIds: number[]
}

/** DELETE /artist/artworks/:id 响应 */
export interface DeleteArtworkResult {
  success: true
}

/** POST /artist/orders/:id/publish-artwork 请求体 */
export interface PublishArtworkRequest {
  deliverableIds: number[]
  title: string
  description?: string | null
}
