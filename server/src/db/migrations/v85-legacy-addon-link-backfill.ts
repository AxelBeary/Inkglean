/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
/**
 * v85: 历史补链——把「有增项模板、却一条 style_addons 都没有」的画师的模板挂回首个画风
 *
 * 背景（交叉审计 DB-4）：v36 的搬运循环取的是「无画风 OR 无模板」的画师并集，于是
 * 「画风与模板都有、但关联行缺失」的形态被整体跳过——`links == templates` 不变量在该象限
 * 不成立，画师侧/客户端看不到任何增项、报价少算且零告警。v36 本身已冻结（历史迁移不得
 * 原地改写，本批纪律 MINOR-2/DB-2），因此用新迁移补齐历史库。
 *
 * 判据刻意取「该画师名下**一条** style_addons 都没有」而非「某个画风没有」：只要有任何
 * 关联行就说明该画师的增项体系已被使用/维护过，不能拿迁移去覆盖人的选择。
 * 已知边界：画师若把所有增项从所有画风显式移除过（`style.service.ts` 的 delete 分支），
 * 本迁移会重新挂回——判据无法区分「迁移漏链」与「用户主动清空」，而该形态在 v36 迁移
 * 路径上不会产生（v36 单事务内建表→搬→关联），故按低风险接受，登记在审计报告 DB-4 条下。
 *
 * 幂等：INSERT OR IGNORE + 依赖 style_addons 的 UNIQUE(art_style_id, addon_template_id)；
 * 二跑时该画师已有 link → 不再命中判据。首个画风按 (sort_order, id) 取，与展示顺序一致。
 *
 * 另复用 DB-1 的旧增项搬运（`backfillLegacyAddons`）：正常链路上 v43 已 DROP price_addons，
 * 这里必然 0 条；保留调用是为了「启动期修复被绕过（如单测直调迁移）」时也能收敛，
 * 两条路径共用同一份映射实现，避免第二套半成品。
 */
import { backfillLegacyAddons } from '../legacy-addon-backfill.js'
import type { IdRow, Migration } from './types.js'

export const migration: Migration = {
  version: 85,
  name: 'legacy_addon_link_backfill',
  up(database) {
    // ─── 1. DB-1 兜底：旧增项搬运（v43 之后 0 条）───
    const moved = backfillLegacyAddons(database)
    if (moved.templates > 0) {
      console.log(`📦 迁移 v85: 启动外兜底搬运旧增项 ${moved.templates} 条（${moved.artists} 个画师）`)
    }

    // ─── 2. DB-4：有模板但整库无关联的画师 → 补链到首个画风 ───
    const unlinkedArtists = database.prepare(`
      SELECT id FROM artists
      WHERE EXISTS (SELECT 1 FROM addon_templates WHERE addon_templates.artist_id = artists.id)
        AND NOT EXISTS (
          SELECT 1 FROM style_addons
          JOIN art_styles ON art_styles.id = style_addons.art_style_id
          WHERE art_styles.artist_id = artists.id
        )
    `).all() as IdRow[]

    if (unlinkedArtists.length === 0) return

    const selectFirstStyle = database.prepare(
      'SELECT id FROM art_styles WHERE artist_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1'
    )
    const selectTemplates = database.prepare(
      'SELECT id FROM addon_templates WHERE artist_id = ? ORDER BY sort_order ASC, id ASC'
    )
    const insertLink = database.prepare(
      'INSERT OR IGNORE INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, 1, NULL)'
    )

    let linkedArtists = 0
    let linkedRows = 0
    for (const artist of unlinkedArtists) {
      const style = selectFirstStyle.get(artist.id) as IdRow | undefined
      if (!style) continue // 只有模板、没有画风：无可挂载目标，留给人工处理
      let linkedForArtist = 0
      for (const template of selectTemplates.all(artist.id) as IdRow[]) {
        linkedForArtist += insertLink.run(style.id, template.id).changes
      }
      if (linkedForArtist > 0) {
        linkedArtists += 1
        linkedRows += linkedForArtist
      }
    }

    if (linkedRows > 0) {
      console.log(`📦 迁移 v85: 为 ${linkedArtists} 个画师补建 style_addons 关联 ${linkedRows} 条`)
    }
  }
}
