import type { Artist } from '../../types/entities.js'

// ============================================
// 内容可见性判定唯一事实源（v76 内容级下架批）
// ============================================
// 为什么要单独收口：hidden / is_banned 的判定此前散落在 10+ 个读路径里各写各的
// （`status === 'hidden' || is_banned`），已经出现两处不一致——
//   · 公开主页对 hidden 返回 200 最小载荷（UI-8），其余端点一律 404；
//   · 日历订阅（calendar-feed.service）只过 is_banned，hidden 画师仍能订到数据。
// 散写模式下再加一个下架态必漏，故先收口成三个函数，再挂新态。
// 语义分层（对齐 REQ-042 §三 B 阶梯「警告 → 内容下架 → 封禁」）：
//   isArtistHomeHidden    → 主页对客户不可见（画师自助隐身 ∪ 平台下架）；账号功能不受影响
//   isArtistHomeInvisible → 彻底隐身，与「画师不存在」同响应（已删除 ∪ 封禁 ∪ 上式）
//   isArtworkVisible      → 单作品级：未被平台下架
// 注：平台下架在公开端与自助隐身**同表现**（同一个最小载荷），不在响应体里区分原因——
// 对小平台而言「因违规被下架」等同公开挂牌示众，会把纠纷引到社交平台；
// 下架原因只经 /api/artist/profile 回给权利人本人。
// ============================================

/** 判定所需最小列集（各处取行方式不同，按结构收窄避免多余 SELECT） */
type HomeVisibilityRow = Pick<Artist, 'status'> & Partial<Pick<Artist, 'deleted_at' | 'is_banned' | 'home_takedown_at'>>

/**
 * 主页对客户不可见 = 画师自己在「设置 → 主页展示」关店（status='hidden'）
 * ∪ 平台内容级下架（home_takedown_at 非空，v76）
 */
export function isArtistHomeHidden(a: HomeVisibilityRow | undefined | null): boolean {
  if (!a) return true
  return a.status === 'hidden' || a.home_takedown_at != null
}

/**
 * 彻底隐身（对外一律「画师不存在」404）：已软删 ∪ 已封禁 ∪ isArtistHomeHidden
 * 用于目录、工作流、价格、画廊、留言、公开作品、OG、点赞守卫等读路径
 */
export function isArtistHomeInvisible(a: HomeVisibilityRow | undefined | null): boolean {
  if (!a) return true
  if (a.deleted_at) return true
  if (a.is_banned) return true
  return isArtistHomeHidden(a)
}

/** 单作品对客户可见 = 行存在且未被平台下架（v76；行保留可恢复，区别于物理删除） */
export function isArtworkVisible(a: { takedown_at?: string | null } | undefined | null): boolean {
  if (!a) return false
  return a.takedown_at == null
}
