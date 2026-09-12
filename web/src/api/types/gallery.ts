// API 边界 DTO · 公开画廊与点赞（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 公开画廊（style.service.ts F6） ───

export interface PublicGalleryTag {
  style_size_id: number
  size_name: string
  style_id: number
  style_name: string
}

export interface PublicGalleryArtwork {
  id: number
  image_path: string
  title: string | null
  description: string | null
  like_count: number
  is_cover: number
  width: number | null
  height: number | null
  size_tags: PublicGalleryTag[]
}

export interface PublicGallerySize {
  id: number
  name: string
  style_id: number
  style_name: string
  sort_order: number
}

/** GET /public/gallery/:subdomain 响应 */
export interface PublicGalleryResult {
  artworks: PublicGalleryArtwork[]
  filterSizes: PublicGallerySize[]
}

/** 作品点赞/取消点赞响应（F1） */
export interface LikeArtworkResult {
  likeCount: number
}
