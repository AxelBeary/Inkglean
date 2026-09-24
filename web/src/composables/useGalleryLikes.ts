// useGalleryLikes.ts — TplGallery 点赞状态收敛（F-44 门禁消红批：自 TplGallery.vue 拆出，恢复 800 行以下）
// 逻辑逐字搬移，行为零变更；背景见 WEB-07 波2审计注释。
import { computed, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { safeGetItem } from '../utils/storage'

/** 作品行最小形状（TplGallery 的 GalleryArtwork 宽松形状结构兼容） */
interface LikeableArtwork {
  id: number
  like_count?: number | null
}

/** F1: 初始已赞集合（localStorage，按画师隔离） */
function readLikedIds(subdomain: string): number[] {
  // G-5: 裸读换 safeGetItem（存储禁用/损坏 JSON 均按未点赞降级）
  const raw = safeGetItem(`huiyue_liked_${subdomain}`)
  if (!raw) return []
  try {
    const ids: unknown = JSON.parse(raw)
    return Array.isArray(ids) ? (ids as number[]) : []
  } catch { return [] }
}

export function useGalleryLikes<T extends LikeableArtwork>(
  subdomain: () => string,
  filteredArtworks: ComputedRef<T[]>,
) {
  /**
   * WEB-07（波2审计 W2#1）：likedIds 改响应式——原为 setup 时一次性普通 Set，
   * 用户点赞后按钮内部状态更新，但父级快照不变；album 翻页/灯箱关闭再开时按钮重建，
   * 按陈旧快照回显导致「红心变空心、再点多加一次」。
   * 现改 ref<number[]>，按钮 toggle 成功后 emit `update:liked` 触发父级同步。
   * 用数组（非 Set）以确保整体替换必触发响应式，无需依赖 collection handlers 的 track 精度。
   */
  const likedIds = ref<number[]>(readLikedIds(subdomain()))
  function isLiked(id: number) { return likedIds.value.includes(id) }

  /**
   * WEB-07：like_count 本地覆盖表——按钮 toggle 后 emit `update:count` 触发写入，
   * 派生 enrichedArtworks 时把覆盖值填回作品行，供灯箱与 album/masonry 重建按钮时读取。
   * 不用 Map 是为了保持浅响应式简单可预测（Record + 整体替换）。
   */
  const likeCountOverrides = ref<Record<number, number>>({})
  function displayLikeCount(art: T): number {
    const override = likeCountOverrides.value[art.id]
    if (typeof override === 'number') return override
    return art.like_count || 0
  }

  /** 按钮 toggle 回调：liked 变化 → 更新 likedIds 数组（整体替换触发响应式） */
  function onLikeToggle(artworkId: number, liked: boolean) {
    const cur = likedIds.value
    if (liked) {
      if (!cur.includes(artworkId)) likedIds.value = [...cur, artworkId]
    } else {
      if (cur.includes(artworkId)) likedIds.value = cur.filter(id => id !== artworkId)
    }
  }
  /** 按钮 toggle 回调：like_count 变化 → 更新覆盖表（整体替换触发响应式） */
  function onLikeCount(artworkId: number, count: number) {
    likeCountOverrides.value = { ...likeCountOverrides.value, [artworkId]: count }
  }

  /**
   * 灯箱消费的作品列表：把 likeCountOverrides 覆盖到 like_count，
   * 让灯箱内 ArtworkLikeButton 重建时（destroy-on-close）读到父级最新计数。
   */
  const enrichedArtworks = computed<T[]>(() =>
    filteredArtworks.value.map(a => {
      const override = likeCountOverrides.value[a.id]
      return typeof override === 'number' ? { ...a, like_count: override } : a
    })
  )

  return { isLiked, displayLikeCount, onLikeToggle, onLikeCount, enrichedArtworks }
}
