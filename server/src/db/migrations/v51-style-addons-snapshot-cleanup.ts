/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import type { Migration } from './types.js'

export const migration: Migration = {
    version: 51,
    name: 'style_addons_snapshot_cleanup',
    up(database) {
      // v50 修复补丁：v50 转换把已绑定行（快照本应为 NULL）的 tpl_* 写入了错误的
      // 'fixed'/'add' 默认值，遮蔽了模板真实值（如系统种子「加急」被显示成普通加法项）。
      // 快照列语义：仅服务解绑行（addon_template_id IS NULL）；绑定行以模板为准 → 清空其快照
      const r = database.prepare(`
        UPDATE style_addons SET
          tpl_name = NULL, tpl_control_type = NULL, tpl_price_mode = NULL,
          tpl_default_price = NULL, tpl_unit_label = NULL, tpl_category = NULL, tpl_max_quantity = NULL
        WHERE addon_template_id IS NOT NULL
      `).run()
      console.log(`📦 迁移 v51: 已清理 ${r.changes} 行绑定行的脏快照（模板为唯一权威）`)
    }
  }
