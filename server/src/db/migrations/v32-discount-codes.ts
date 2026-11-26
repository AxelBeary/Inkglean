import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 32,
    name: 'discount_codes',
    up(database) {
      // v0.31 F3: 折扣码（画师可开关，默认关；全局码，v0.32 多画风后再扩展）
      database.exec(`
        CREATE TABLE IF NOT EXISTS discount_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          discount_type TEXT NOT NULL DEFAULT 'percent' CHECK(discount_type IN ('percent', 'fixed')),
          -- B3-F0079（2026-11-24 队长裁定）：保留 REAL 双语义（percent 1-100 / fixed 元），
          -- 只补 CHECK 拦非法值。禁止转 INTEGER cents——discount.service.ts 的 percent=discount_value/100、
          -- fixed=discount_value*100 双语义计价依赖浮点，转 cents 会同时破坏两种口径（详见台账裁定依据）。
          -- R3-① 收敛裁定（2026-11-24，见 STATUS「已拍板规则」）：三条 CHECK 属本轮新增 DDL 防御约束。
          -- 本迁移只对「首次建表的升级库」生效；存量库 version=32 已被 migrate.ts 跳过且
          -- CREATE TABLE IF NOT EXISTS 不重建 → 保持原样无 CHECK。不新增迁移号、不重建存量表：
          -- 服务层 discount.service.ts 已校验兜底，重建（关 FK + 12 步搬运）风险高于收益。
          discount_value REAL NOT NULL CHECK(discount_value > 0),
          -- B3-F0080：max_uses 默认 NULL=不限；used_count 默认 0。补 CHECK 拦负值/零额度，
          -- 服务层「校验+自增原子化」由 B4 批（money-worker）在同文件协同落地，本迁移只管 DDL 约束。
          -- 存量口径见上 R3-① 裁定。
          max_uses INTEGER DEFAULT NULL CHECK(max_uses IS NULL OR max_uses >= 0),
          used_count INTEGER DEFAULT 0 CHECK(used_count >= 0),
          expires_at DATETIME DEFAULT NULL,
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
          UNIQUE(artist_id, code)
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_discount_codes_artist ON discount_codes(artist_id, enabled)')

      // 画师级开关（默认关）
      const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!artistCols.some(c => c.name === 'discount_enabled')) {
        database.exec('ALTER TABLE artists ADD COLUMN discount_enabled INTEGER DEFAULT 0')
      }

      // 订单记录折扣信息（审计追溯）
      const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!orderCols.some(c => c.name === 'discount_code_id')) {
        database.exec('ALTER TABLE orders ADD COLUMN discount_code_id INTEGER DEFAULT NULL')
      }
      if (!orderCols.some(c => c.name === 'discount_amount_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN discount_amount_cents INTEGER DEFAULT 0')
      }
    }
  }
