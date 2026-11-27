import type Database from 'better-sqlite3'
import type { ColumnInfo, IdRow, LegacyPriceAddonRow } from './migrations/types.js'

/** 一次历史修复的结果：命中画师数与实际新插入的模板数（幂等重跑为 0） */
export interface LegacyAddonBackfillResult {
  artists: number
  templates: number
}

/**
 * DB-1 历史修复：把旧模型 `price_addons` 搬进 `addon_templates`。
 *
 * 为什么需要独立于迁移链存在：M-1 的受害者是「旧增项没进新表」的画师。修 v36 本体对这批库无效——
 * `migrate.ts` 按 `schema_migrations.version` 跳过，v36 早已记录且永不重放；即便没记录，v36 的
 * 形状守卫（`!columns.includes('pricing_mode')`）在「基线 schema 先建出当前形状表」的升级路径上
 * 也必然 return。因此修复只能落在「迁移链之外、链之前」：`price_addons` 还在即 version<43 的
 * 可回收窗口（v43 已按用户拍板 DROP），≥43 的库本函数立即返回（数据确实已随 v43 删除，只能人工重录）。
 *
 * 覆盖的两类人群：
 * - **pre-v36 老库（v35 及更早）**：基线 schema 在这里先把 `addon_templates` 建成当前形状、
 *   `art_styles` 还是空表（v36 的数据搬运不会跑），旧增项只有本函数能搬；画风/尺寸随后由
 *   v37 的 F5 补齐，链尾 v85 再把模板挂到 F5 建出的画风上。
 *   因此**不能**拿「已有画风」当前置条件——pre-v36 库此刻 `art_styles` 没有任何行。
 * - **v37 态及部分迁移的库**：有画风、缺（部分）模板的画师（v36 旧全局守卫/F5 补画风的组合）。
 *
 * 复用点：`initDatabase()` 启动前修复（主路径）与迁移 `v85`（兜底，v43 之后通常 0 条）。
 * v36 历史迁移保持冻结不动——「历史迁移不得原地改写」是本批自己的纪律（MINOR-2）。
 *
 * 幂等：按 `(artist_id, name)` 查重后再插（同 v36 的 M-2 修法），不依赖 UNIQUE 约束；
 * 外层只粗筛「存在还没搬过的旧增项名」的画师，重复启动不会产生重复模板。
 *
 * 已知边界（复审 A2 判定可接受）：判据按旧表逐名比对，因此「画师在新体系里已删掉、但旧表仍留着
 * 同名行」的增项会在**同一次启动**被补回一次。窗口极窄——`price_addons` 尚存的那次 init 里
 * v43 随即 DROP 该表，之后再无来源；补回取旧表原价、方向是修复而非覆盖人工改动（同名已存在的
 * 模板一律不覆盖）。要更严就得有「人工删过什么」的历史表，本仓没有，故不加判据。
 *
 * 字段映射与 v36 一致：toggle→switch、quantity→quantity（带单位「个」）、inquiry→radio、
 * 百分比一律折算 fixed。表形状决定插入列：v36~v49 的 `addon_templates` 用 `pricing_mode`
 * 且 CHECK 允许 radio；v50 重建后（以及基线 schema 新建的）是 `price_mode` 且 radio 已退役
 * （v50 迁移里就映射成 switch），本函数按实际列名选形状，保证各条历史路径的语义各自成立。
 */
export function backfillLegacyAddons(database: Database.Database): LegacyAddonBackfillResult {
  const tableExists = (name: string): boolean => !!database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  ).get(name)

  // 旧表不在（≥43 新库）或目标表还没建（迁移链未跑到 v36 且没走基线 schema 的裸库）→ 无操作
  if (!tableExists('price_addons') || !tableExists('addon_templates')) {
    return { artists: 0, templates: 0 }
  }

  const addonTemplateCols = (database.prepare('PRAGMA table_info(addon_templates)').all() as ColumnInfo[]).map(c => c.name)
  const legacyShape = addonTemplateCols.includes('pricing_mode')
  const priceColumn = legacyShape ? 'pricing_mode' : 'price_mode'

  // 只锁「还有至少一个旧增项名没进新表」的画师：不依赖 art_styles（pre-v36 库此时无画风行），
  // 也不要求整表零模板（部分迁移的画师同样要补齐）；逐名是否已存在由内层 INSERT 再判一次。
  const artists = database.prepare(`
    SELECT DISTINCT artists.id FROM artists
    JOIN price_addons ON price_addons.artist_id = artists.id
    WHERE NOT EXISTS (
      SELECT 1 FROM addon_templates
      WHERE addon_templates.artist_id = artists.id AND addon_templates.name = price_addons.name
    )
  `).all() as IdRow[]

  if (artists.length === 0) return { artists: 0, templates: 0 }

  const selectAddons = database.prepare(`
    SELECT name, select_mode, price_value, sort_order FROM price_addons
    WHERE artist_id = ? ORDER BY sort_order ASC, id ASC
  `)
  const insertTemplate = database.prepare(`
    INSERT INTO addon_templates (artist_id, name, control_type, ${priceColumn}, default_price, unit_label, sort_order)
    SELECT ?, ?, ?, 'fixed', ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM addon_templates WHERE artist_id = ? AND name = ?)
  `)
  const controlTypeMap: Record<string, string> = {
    toggle: 'switch',
    quantity: 'quantity',
    inquiry: legacyShape ? 'radio' : 'switch'
  }

  let movedArtists = 0
  let movedTemplates = 0
  for (const artist of artists) {
    const addons = selectAddons.all(artist.id) as LegacyPriceAddonRow[]
    let movedForArtist = 0
    for (const addon of addons) {
      const controlType = controlTypeMap[addon.select_mode] || 'switch'
      const result = insertTemplate.run(
        artist.id,
        addon.name,
        controlType,
        addon.price_value,
        controlType === 'quantity' ? '个' : null,
        addon.sort_order ?? 0,
        artist.id,
        addon.name
      )
      movedForArtist += result.changes
    }
    if (movedForArtist > 0) {
      movedArtists += 1
      movedTemplates += movedForArtist
    }
  }

  return { artists: movedArtists, templates: movedTemplates }
}
