import type { ColumnInfo, Migration } from './types.js'

/**
 * v76: 内容级下架（P4 后端批，2026-09-13 用户拍板）
 * 补 REQ-042 §三 C「内容级下架：管理员对具体内容下架（作品/留言/主页）」与
 * §三 B「违规阶梯：警告 → 内容下架 → 封禁」中间那格——实施时只做了作品/留言，
 * 「主页」一格缺失，导致处理主页类举报只能整户封禁（is_banned，连人踢出），处置过粗。
 *
 * - artists.home_takedown_at / _reason：平台独占写入的主页下架态。
 *   刻意不复用 status='hidden'：那是画师自助态（方案 A，2026-08-21 拍板，
 *   建号默认 hidden + 画师自己在「设置 → 主页展示」开业），画师可一键解除，
 *   拿它承载下架等于刚挂锁就把钥匙交给对方。独立列按构造免疫自助口。
 *   与 is_banned 的分工：只藏主页，不 bump token_version、不拒登录——
 *   画师必须能登进来看到「我被下架了、为什么」并整改。
 * - artworks.takedown_at / _reason：作品由「物理 DELETE」改为可恢复软下架。
 *   现状 removeContent('artwork') 走 artistService.deleteArtwork()，行连同标题/描述/
 *   点赞数/档位标注永久丢失（仅图片文件 72h 后进回收站），与「下架」语义不符。
 *   注意：画师自己删作品（artist.routes.ts）仍是物理删——那是用户意图，本次不改。
 *
 * 纯 ADD COLUMN、事务内安全；幂等守卫照 v72/v75 先例。
 */
export const migration: Migration = {
  version: 76,
  name: 'content_takedown',
  up(database) {
    const addIfMissing = (table: string, column: string): void => {
      const cols = database.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
      if (!cols.some(c => c.name === column)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`)
      }
    }
    addIfMissing('artists', 'home_takedown_at')
    addIfMissing('artists', 'home_takedown_reason')
    addIfMissing('artworks', 'takedown_at')
    addIfMissing('artworks', 'takedown_reason')
  }
}
