import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { db, seedArtist, cleanDb } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { addForensicIpColumn } from '../src/db/migrations/v75-forensic-ip.js'
import {
  preTargetDb,
  buildPreTarget,
  replayVersion,
  isApplied,
  columnNames,
  tableExists,
  dropColumnIfExists
} from './migration-real-entry.js'

/**
 * B1+B3 DB 迁移专项批回归测试（2026-11-24）
 * F0075(v13 旧形重建 CAST) / F0086(v49 残留恢复) / F0087(v52 DROP 升级路径)
 * F0096(v71 全列守卫+半态回填) / F0097(v69 双列守卫) / F0094(v64 列存在性守卫)
 * F0079/F0080(v32 CHECK) / F0088(v58 冗余索引) / F0095(v66 幂等) / F0102(v75 标识符白名单)
 *
 * 【真实入口改造 · issue #117 判据】原文件 23 处直调 `migration.up(mem)`，全部绕开
 * initDatabase 的版本调度语义 —— #117 的教训正是「直调 up() 的用例绿、生产路径零效果」。
 * 现统一改走 `preTargetDb(版本号, revert)`（要断言抛错的场景用 `buildPreTarget` +
 * 自己调 initDatabase）。断言逐条对应改造前，未削弱。
 *
 * 不依赖 setup 的全局 db 做末态回读（那条已跑完全量迁移），各用例仍在独立内存库上验证。
 */

/** 某表列名清单（本文件多用） */
const colNames = (database: Database.Database, table: string): string[] => columnNames(database, table)

describe('B1-F0075: v13 旧形库（expires_at DATETIME）重建 + CAST 搬运', () => {
  /**
   * 把基线库手术回 v13 前夜（v12 形态）：login_codes.expires_at 回 DATETIME 类型
   * （CHECK/类型无法 ALTER，只能重建）+ 塞两条 unix 秒文本行。
   */
  function revertToV12(d: Database.Database): void {
    d.exec('DROP TABLE IF EXISTS login_codes')
    d.exec(`
      CREATE TABLE login_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '13001', 'a', 'v13-a')")
    // expires_at 存 unix 秒数值（DATETIME 列亲和性下以文本形态落库），CAST 应还原为整数
    d.exec(`
      INSERT INTO login_codes (artist_id, code, expires_at, attempts)
      VALUES (1, 'CODE1', '1735689600', 3), (1, 'CODE2', '1735776000', 0)
    `)
    // 前置自检：夹具确实是 v12 形态（DATETIME 而非 INTEGER），否则断言假绿
    const col = (d.prepare('PRAGMA table_info(login_codes)').all() as Array<{ name: string; type: string }>)
      .find(c => c.name === 'expires_at')
    if (!col || col.type.toUpperCase() !== 'DATETIME') {
      throw new Error('夹具未退回 v12 形态：login_codes.expires_at 不是 DATETIME')
    }
  }

  it('TC-B1-F0075-01: 旧形 DATETIME 列重建为 INTEGER 且数据经 CAST 搬运', () => {
    const mem = preTargetDb(13, revertToV12)
    try {
      expect(isApplied(mem, 13), 'v13 版本行应由调度器写入').toBe(true)
      const expiresCol = (mem.prepare('PRAGMA table_info(login_codes)').all() as Array<{ name: string; type: string }>)
        .find(c => c.name === 'expires_at')
      expect(expiresCol?.type.toUpperCase()).toBe('INTEGER')
      const rows = mem.prepare('SELECT code, expires_at, attempts FROM login_codes ORDER BY code').all() as Array<{ code: string; expires_at: number; attempts: number }>
      expect(rows).toHaveLength(2)
      expect(rows[0].expires_at).toBe(1735689600)
      expect(rows[0].attempts).toBe(3)
      expect(tableExists(mem, 'login_codes_new')).toBe(false)
    } finally {
      mem.close()
    }
  })

  it('TC-B1-F0075-02: 幂等——已是 INTEGER 再跑不报错不改数据', () => {
    const mem = preTargetDb(13, revertToV12)
    try {
      // 真实入口重放：版本行删掉后由调度器再跑一次 v13
      expect(replayVersion(mem, 13), '调度器应重放 v13 并写回版本行').toBe(true)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM login_codes').get() as { n: number }).n).toBe(2)
      expect((mem.prepare('PRAGMA table_info(login_codes)').all() as Array<{ name: string; type: string }>)
        .find(c => c.name === 'expires_at')?.type.toUpperCase()).toBe('INTEGER')
    } finally {
      mem.close()
    }
  })
})

describe('B1-F0086: v49 崩溃残留半态恢复', () => {
  /** 构造：主表缺失、_new 持数据（DROP 主表后 RENAME 前崩溃） */
  function buildHalfState(d: Database.Database): void {
    for (const t of ['addon_templates', 'style_addons', 'size_addon_overrides']) d.exec(`DROP TABLE IF EXISTS ${t}`)
    d.exec(`
      CREATE TABLE addon_templates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER, name TEXT NOT NULL, control_type TEXT,
        pricing_mode TEXT, default_price REAL, sort_order INTEGER, kind TEXT, max_quantity INTEGER,
        created_at DATETIME
      );
      INSERT INTO addon_templates_new (artist_id, name, control_type, pricing_mode, default_price, sort_order, kind)
      VALUES (1, '孤儿增项', 'switch', 'fixed', 10, 0, 'add');
      CREATE TABLE style_addons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        art_style_id INTEGER NOT NULL, addon_template_id INTEGER,
        tpl_name TEXT, tpl_price_mode TEXT,
        UNIQUE(art_style_id, addon_template_id)
      );
      INSERT INTO style_addons (art_style_id, addon_template_id, tpl_name, tpl_price_mode)
      VALUES (1, NULL, '快照名', 'fixed');
    `)
  }

  it('TC-B1-F0086-01 (缺陷实录 · issue #117 发现): 半态恢复分支在生产入口下不可达，孤儿数据丢失', () => {
    // ⚠️ 本条记录**实测到的真实行为**。原用例直调 v49.up(mem) 时绿（up() 的 for 循环看到
    // hasMain=false → 走「续 RENAME 恢复」，孤儿增项得以保留），但生产入口 initDatabase 的
    // 第一步是 exec(schema)：schema.ts 把 addon_templates 定义成当前基线（price_mode/category），
    // CREATE TABLE IF NOT EXISTS 于是把被 DROP 的主表按新形重建 → hasMain 变 true →
    // 走「主表完好 → 丢弃 _new」分支，把唯一数据副本删掉，孤儿增项永久丢失。
    //
    // 与 migration-v49.test.ts 的 TC-V49-02b 是同一缺陷的两个入口（这里用裸夹具、
    // 那边用 schema 基线夹具，结论一致）。issue #117 判据的标准样本。
    const mem = buildPreTarget(49, buildHalfState)
    try {
      // 迁移前：_new 持唯一数据副本
      expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates_new').get() as { c: number }).c).toBe(1)

      initDatabase(mem)

      // 调度器虽然没抛错，但孤儿增项已被丢弃（只有 v49 的四个系统种子）
      const names = (mem.prepare('SELECT name FROM addon_templates ORDER BY id').all() as Array<{ name: string }>).map(r => r.name)
      expect(names).not.toContain('孤儿增项')
      expect(names).toEqual(['个人用途', '商业用途', '标准', '加急'])
      // 唯一副本已被删
      expect(tableExists(mem, 'addon_templates_new')).toBe(false)
      expect(isApplied(mem, 49)).toBe(true)
    } finally {
      mem.close()
    }
  })

  it('TC-B1-F0086-02: v50 三表（breakdown/addon_templates/style_addons）空壳主表 + _new 持数据 → 真实迁移恢复', () => {
    // v50 已有 orders 恢复测试（migration-v50.test.ts TC-P14-01/02）；此处补其余三表。
    // 关键：v50 的恢复分支在「幂等守卫判定已迁移（主表列已是新形）」的 else 路径里，
    // 因此主表须带新形标记列（breakdown 含 addon_fixed / addon_templates 含 category /
    // style_addons 含 tpl_price_mode）且 0 行，_new 持数据，由调度器跑真实 v50 应恢复。
    const mem = preTargetDb(50, d => {
      // orders 已是新形（含 style_size_id、无 tier_id）→ 跳过 orders 重建，走 else 恢复分支
      dropColumnIfExists(d, 'orders', 'tier_id')
      // breakdown 新形空壳（DDL 文本须含 addon_fixed 才会走 else 恢复分支）+ _new 持数据
      d.exec('DROP TABLE IF EXISTS order_price_breakdown')
      d.exec("CREATE TABLE order_price_breakdown (id INTEGER PRIMARY KEY, item_type TEXT CHECK(item_type IN ('base','addon_fixed')))")
      d.exec('CREATE TABLE order_price_breakdown_new (id INTEGER PRIMARY KEY, order_id INTEGER, item_type TEXT, item_name TEXT, amount_cents INTEGER, multiplier REAL, quantity INTEGER, sort_order INTEGER)')
      d.exec("INSERT INTO order_price_breakdown_new (id, order_id, item_type, item_name, amount_cents) VALUES (42, 1, 'base', '基础价', 10000)")
      d.exec('DROP TABLE IF EXISTS addon_templates')
      d.exec('CREATE TABLE addon_templates (id INTEGER PRIMARY KEY, category TEXT, price_mode TEXT)')
      d.exec('CREATE TABLE addon_templates_new (id INTEGER PRIMARY KEY, artist_id INTEGER, name TEXT, control_type TEXT, price_mode TEXT, default_price REAL, unit_label TEXT, sort_order INTEGER, category TEXT, max_quantity INTEGER, created_at DATETIME)')
      d.exec("INSERT INTO addon_templates_new (id, name, category) VALUES (43, '孤儿增项', 'add')")
      d.exec('DROP TABLE IF EXISTS style_addons')
      d.exec('CREATE TABLE style_addons (id INTEGER PRIMARY KEY, tpl_price_mode TEXT, tpl_category TEXT)')
      d.exec('CREATE TABLE style_addons_new (id INTEGER PRIMARY KEY, art_style_id INTEGER, addon_template_id INTEGER, is_enabled INTEGER, price_override REAL, tpl_name TEXT, tpl_control_type TEXT, tpl_price_mode TEXT, tpl_default_price REAL, tpl_unit_label TEXT, tpl_category TEXT, tpl_max_quantity INTEGER)')
      d.exec("INSERT INTO style_addons_new (id, art_style_id, tpl_name, tpl_price_mode) VALUES (44, 1, '快照', 'fixed')")
    })
    try {
      expect(isApplied(mem, 50), 'v50 版本行应由调度器写入').toBe(true)
      for (const c of [
        { table: 'order_price_breakdown', id: 42 },
        { table: 'addon_templates', id: 43 },
        { table: 'style_addons', id: 44 }
      ]) {
        expect(tableExists(mem, c.table + '_new'), `${c.table}_new 应已被 RENAME 消化`).toBe(false)
        expect((mem.prepare(`SELECT id FROM ${c.table}`).get() as { id: number }).id).toBe(c.id)
      }
    } finally {
      mem.close()
    }
  })
})

describe('B1-F0087: v52 老库带四列升级路径（DROP COLUMN 分支零覆盖补齐）', () => {
  /** 把基线库手术回 v52 前夜（v51 形态）：四个僵尸列都在 + 一行脏数据 */
  function revertToV51(d: Database.Database): void {
    for (const col of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
      dropColumnIfExists(d, 'order_payment_installments', col)
    }
    d.exec("ALTER TABLE order_payment_installments ADD COLUMN status TEXT DEFAULT 'pending'")
    d.exec('ALTER TABLE order_payment_installments ADD COLUMN requested_at DATETIME')
    d.exec('ALTER TABLE order_payment_installments ADD COLUMN paid_at DATETIME')
    d.exec('ALTER TABLE order_payment_installments ADD COLUMN paid_cents INTEGER')
    d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '52001', 'a', 'v52-a')")
    d.exec("INSERT INTO orders (id, order_no, artist_id, client_qq) VALUES (1, 'V52-001', 1, '5200')")
    d.exec(`
      INSERT INTO order_payment_installments (order_id, label, basis_points, status, requested_at, paid_at, paid_cents)
      VALUES (1, '定金', 3000, 'paid', '2026-01-01', '2026-01-02', 5000)
    `)
    // 前置自检：四列确实都在（v51 形态），否则 DROP 分支不会被覆盖
    const cols = colNames(d, 'order_payment_installments')
    for (const col of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
      if (!cols.includes(col)) throw new Error(`夹具未退回 v51 形态：缺 ${col}`)
    }
  }

  it('TC-B1-F0087-01: 老库含 paid_cents/status/paid_at/requested_at → 清零后逐列 DROP', () => {
    const mem = preTargetDb(52, revertToV51)
    try {
      expect(isApplied(mem, 52), 'v52 版本行应由调度器写入').toBe(true)
      const cols = colNames(mem, 'order_payment_installments')
      for (const dropped of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
        expect(cols).not.toContain(dropped)
      }
      // 行本身保留（只删僵尸列，不删数据行）
      expect((mem.prepare('SELECT COUNT(*) AS n FROM order_payment_installments').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-B1-F0087-02: 幂等——无四列的新形态库重跑不报错（真实入口：调度器重放 v52）', () => {
    const mem = preTargetDb(52, revertToV51)
    try {
      expect(replayVersion(mem, 52), '调度器应重放 v52 并写回版本行').toBe(true)
      expect(colNames(mem, 'order_payment_installments')).not.toContain('paid_cents')
      expect((mem.prepare('SELECT COUNT(*) AS n FROM order_payment_installments').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })
})

describe('B1-F0096/F0097: noTransaction 全列守卫 + 半态修复', () => {
  it('TC-B1-F0097-01: v69 只有第一列 → 补第二列 calendar_feed_token', () => {
    const mem = preTargetDb(69, d => {
      dropColumnIfExists(d, 'artists', 'calendar_feed_token')
      dropColumnIfExists(d, 'artists', 'calendar_feed_enabled')
      d.exec('ALTER TABLE artists ADD COLUMN calendar_feed_enabled INTEGER NOT NULL DEFAULT 0')
      d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '69001', 'a', 'v69-a')")
      // 前置自检：只有第一列（半态），否则补列分支不被覆盖
      const cols = colNames(d, 'artists')
      if (!cols.includes('calendar_feed_enabled')) throw new Error('夹具缺 calendar_feed_enabled')
      if (cols.includes('calendar_feed_token')) throw new Error('夹具未退回 v68 形态：已有 calendar_feed_token')
    })
    try {
      expect(isApplied(mem, 69), 'v69 版本行应由调度器写入').toBe(true)
      const cols = colNames(mem, 'artists')
      expect(cols).toContain('calendar_feed_enabled')
      expect(cols).toContain('calendar_feed_token')
      // 已有列的值不被破坏
      expect((mem.prepare('SELECT calendar_feed_enabled FROM artists WHERE id=1').get() as { calendar_feed_enabled: number }).calendar_feed_enabled).toBe(0)
    } finally {
      mem.close()
    }
  })

  /** v71 半态：有 max_uses、无 use_count、无明细表 */
  function revertToV70Half(d: Database.Database): void {
    d.exec('DROP TABLE IF EXISTS invite_code_uses')
    d.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'unused',
        expires_at TEXT NOT NULL,
        used_by_artist_id INTEGER NULL,
        used_at TEXT NULL,
        max_uses INTEGER NOT NULL DEFAULT 1
      )
    `)
    d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '71001', 'a', 'v71-a')")
    d.exec("INSERT INTO invite_codes (code, status, used_by_artist_id, used_at, expires_at) VALUES ('USED1', 'used', 1, '2026-01-01', '2030-01-01')")
    const cols = colNames(d, 'invite_codes')
    if (cols.includes('use_count')) throw new Error('夹具未退回半态：已有 use_count')
    if (!cols.includes('max_uses')) throw new Error('夹具未退回半态：缺 max_uses')
  }

  it('TC-B1-F0096-01: v71 半态（有 max_uses 无 use_count/明细表）→ 补齐且回填幂等', () => {
    const mem = preTargetDb(71, revertToV70Half)
    try {
      expect(isApplied(mem, 71), 'v71 版本行应由调度器写入').toBe(true)
      expect(colNames(mem, 'invite_codes')).toContain('use_count')
      expect(tableExists(mem, 'invite_code_uses')).toBe(true)
      expect((mem.prepare("SELECT use_count FROM invite_codes WHERE code='USED1'").get() as { use_count: number }).use_count).toBe(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM invite_code_uses').get() as { n: number }).n).toBe(1)

      // 幂等重跑：不重复插明细、不重置 use_count（真实入口：调度器重放 v71）
      expect(replayVersion(mem, 71), '第一次重放应写回版本行').toBe(true)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM invite_code_uses').get() as { n: number }).n).toBe(1)
      mem.exec("UPDATE invite_codes SET use_count=3 WHERE code='USED1'")
      expect(replayVersion(mem, 71), '第二次重放仍幂等').toBe(true)
      expect((mem.prepare("SELECT use_count FROM invite_codes WHERE code='USED1'").get() as { use_count: number }).use_count).toBe(3)
    } finally {
      mem.close()
    }
  })

  it('TC-B1-F0096-02: 结构完整时 v71 不重复备份/回填（use_count 与明细行原样保留）', () => {
    const mem = preTargetDb(71, d => {
      d.exec('DROP TABLE IF EXISTS invite_code_uses')
      d.exec(`
        CREATE TABLE IF NOT EXISTS invite_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'unused',
          expires_at TEXT NOT NULL,
          used_by_artist_id INTEGER NULL,
          used_at TEXT NULL,
          max_uses INTEGER NOT NULL DEFAULT 1,
          use_count INTEGER NOT NULL DEFAULT 0
        )
      `)
      d.exec(`
        CREATE TABLE invite_code_uses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invite_code_id INTEGER NOT NULL REFERENCES invite_codes(id),
          artist_id INTEGER NOT NULL REFERENCES artists(id),
          used_at TEXT NOT NULL,
          UNIQUE(invite_code_id, artist_id)
        )
      `)
      d.exec('CREATE INDEX idx_invite_code_uses_code ON invite_code_uses(invite_code_id)')
      // 真实入口下 FK 是 ON 的（基线 artists 表在），明细行引用的画师必须先存在。
      // 原用例是裸夹具（无 FK 约束）才不需要这一步。
      d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (42, '71420', '邀请码画师', 'invite-42')")
      // 完整形态下预置一条「已被多次消费」的码（use_count=5）及其唯一明细行：
      // 若 up() 误走回填（UPDATE use_count=1 / INSERT 明细），use_count 会被重置、明细会重复。
      d.exec("INSERT INTO invite_codes (id, code, status, used_by_artist_id, used_at, expires_at, max_uses, use_count) VALUES (1, 'USED5', 'used', 42, '2026-01-01T00:00:00Z', '2030-01-01', 10, 5)")
      d.exec("INSERT INTO invite_code_uses (id, invite_code_id, artist_id, used_at) VALUES (1, 1, 42, '2026-01-01T00:00:00Z')")
      // 完整性前提：三要素齐备（max_uses / use_count 列 + 明细表），确保 up() 走「完整态跳过」分支
      expect(colNames(d, 'invite_codes')).toContain('max_uses')
      expect(colNames(d, 'invite_codes')).toContain('use_count')
      expect(tableExists(d, 'invite_code_uses')).toBe(true)
    })
    try {
      expect(isApplied(mem, 71), 'v71 版本行应由调度器写入').toBe(true)

      // (a) 已被多次消费的码 use_count=5 不得被回填重置为 1
      expect((mem.prepare("SELECT use_count FROM invite_codes WHERE code='USED5'").get() as { use_count: number }).use_count).toBe(5)
      // (b) 明细行不重复插入（INSERT OR IGNORE 遇 UNIQUE 跳过），仍恰好 1 行且内容不变
      expect((mem.prepare('SELECT COUNT(*) AS n FROM invite_code_uses').get() as { n: number }).n).toBe(1)
      expect((mem.prepare('SELECT used_at FROM invite_code_uses WHERE invite_code_id=1').get() as { used_at: string }).used_at).toBe('2026-01-01T00:00:00Z')

      // (c) 幂等：再跑一次 use_count/明细行数完全不变（重复回填/重复备份若发生即在此暴露）
      expect(replayVersion(mem, 71), '重放应写回版本行').toBe(true)
      expect((mem.prepare("SELECT use_count FROM invite_codes WHERE code='USED5'").get() as { use_count: number }).use_count).toBe(5)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM invite_code_uses').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })
})

describe('B1-F0094: v64 幂等守卫改列存在性（不依赖 DDL 文本字面量）', () => {
  it('TC-B1-F0094-01: 表已含 special_day_id（CHECK 无 latenight 字面量也行）→ 跳过重建', () => {
    const mem = preTargetDb(64, d => {
      d.exec('DROP TABLE IF EXISTS greeting_templates')
      // 故意让 CHECK 只含 'night' 不含 'latenight'/'midnight'：旧守卫会误判为未迁移而触发重建
      d.exec(`
        CREATE TABLE greeting_templates (
          id INTEGER PRIMARY KEY, artist_id INTEGER, text TEXT NOT NULL,
          time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','night','any')),
          is_enabled INTEGER DEFAULT 1, special_day_id INTEGER, created_at DATETIME
        )
      `)
      d.exec("INSERT INTO greeting_templates (text, time_slot) VALUES ('自定义文案', 'night')")
    })
    try {
      expect(isApplied(mem, 64), 'v64 版本行应由调度器写入').toBe(true)
      // 守卫命中列存在性 → 跳过重建，自定义 CHECK 与数据原样保留
      const sql = (mem.prepare("SELECT sql FROM sqlite_master WHERE name='greeting_templates'").get() as { sql: string }).sql
      expect(sql).toContain("'night'")
      expect((mem.prepare('SELECT text FROM greeting_templates').get() as { text: string }).text).toBe('自定义文案')
      expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
    } finally {
      mem.close()
    }
  })
})

describe('B3-F0090/F0099: 重建事务内 foreign_key_check（失败即回滚 + 定向校验）', () => {
  /**
   * 构造 v64 重建前置：旧形 greeting_templates（无 special_day_id，CHECK 无 latenight），
   * 且存在一条 artist_id 指向不存在父行的悬空引用（FK 关闭下可写入）。
   * v64 重建时把悬空 artist_id 拷入新表 → 事务内 foreign_key_check('greeting_templates')
   * 应抛错；因检查在 database.transaction() 回调内，整批 ROLLBACK，旧表结构与数据完整保留。
   */
  function buildV64Dangling(d: Database.Database): void {
    d.exec('DROP TABLE IF EXISTS greeting_templates')
    d.exec(`
      CREATE TABLE greeting_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER,
        text TEXT NOT NULL,
        time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','afternoon','evening','night','any')),
        is_enabled INTEGER DEFAULT 1,
        created_at DATETIME
      )
    `)
    // 悬空 artist_id=999（父表 artists 无该行），FK 默认 OFF 可写入
    d.exec("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (999, '悬空引用行', 'night')")
  }

  it('TC-B3-F0090-01: 悬空引用 → 事务内 FK 检查抛错，旧表数据零丢失（回滚）', () => {
    // 断言「迁移必须抛错」→ 用 buildPreTarget（不跑调度器），自己调 initDatabase
    const mem = buildPreTarget(64, buildV64Dangling)
    try {
      expect(() => initDatabase(mem)).toThrow(/foreign_key_check/)
      // 整批回滚：残留 _new 表不存在，旧表数据原样（不同于旧实现「带病提交+版本号缺失」）
      expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
      const rows = mem.prepare('SELECT text FROM greeting_templates').all() as Array<{ text: string }>
      expect(rows).toHaveLength(1)
      expect(rows[0].text).toBe('悬空引用行')
      // FK 在 finally 恢复为 ON（连接不留 OFF 态）
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
      // 调度器失败后不得把 v64 记成已应用
      expect(isApplied(mem, 64)).toBe(false)
    } finally {
      mem.close()
    }
  })

  it('TC-B3-F0099-01: v67 定向校验只查被重建表——无关表历史悬空引用不阻断升级', () => {
    const mem = preTargetDb(67, d => {
      d.exec('DROP TABLE IF EXISTS greeting_templates')
      // 旧形 greeting_templates（CHECK 无 midnight）含合法数据
      d.exec(`
        CREATE TABLE greeting_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER,
          text TEXT NOT NULL,
          time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
          is_enabled INTEGER DEFAULT 1,
          special_day_id INTEGER,
          created_at DATETIME
        )
      `)
      d.exec("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '合法文案', 'night')")
      // 无关表 reports 的悬空引用（不得阻断 greeting_templates 重建）
      d.pragma('foreign_keys = OFF')
      d.exec("INSERT INTO reports (target_type, target_id, description) VALUES ('artist_home', 888, '老举报')")
      d.pragma('foreign_keys = ON')
    })
    try {
      expect(isApplied(mem, 67), 'v67 版本行应由调度器写入').toBe(true)
      const rows = mem.prepare('SELECT text, time_slot FROM greeting_templates').all() as Array<{ text: string; time_slot: string }>
      expect(rows).toHaveLength(1)
      expect(rows[0].time_slot).toBe('midnight') // night → midnight 搬家
      // reports 的悬空引用仍在（未被误伤/误删）
      expect((mem.prepare('SELECT target_id FROM reports WHERE id=1').get() as { target_id: number }).target_id).toBe(888)
    } finally {
      mem.close()
    }
  })
})

describe('B3-F0079/F0080: v32 折扣表 CHECK 约束（口径不变）', () => {
  it('TC-B3-F0079-01: CHECK 拒绝 discount_value<=0，合法值可写', () => {
    cleanDb()
    const artistId = seedArtist().id
    expect(() => db.prepare(
      "INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'BAD0', 'percent', 0)"
    ).run(artistId)).toThrow()
    expect(() => db.prepare(
      "INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'BADNEG', 'fixed', -1)"
    ).run(artistId)).toThrow()
    // percent 合法小数仍可写（证明未转 INTEGER cents）
    expect(() => db.prepare(
      "INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'GOOD', 'percent', 12.5)"
    ).run(artistId)).not.toThrow()
    db.prepare("DELETE FROM discount_codes WHERE code IN ('GOOD')").run()
  })

  it('TC-B3-F0079-02: DDL 双事实源——schema 与 v32 均含 CHECK 且 discount_value 仍是 REAL', () => {
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name='discount_codes'").get() as { sql: string }).sql
    expect(sql).toMatch(/discount_value REAL NOT NULL CHECK\(discount_value > 0\)/)
    expect(sql).toMatch(/max_uses INTEGER DEFAULT NULL CHECK\(max_uses IS NULL OR max_uses >= 0\)/)
    expect(sql).toMatch(/used_count INTEGER DEFAULT 0 CHECK\(used_count >= 0\)/)
    // 重跑 initDatabase 幂等
    expect(() => initDatabase(db)).not.toThrow()
  })

  it('TC-B3-F0080-01: CHECK 拒绝 max_uses/used_count 负值', () => {
    cleanDb()
    const artistId = seedArtist().id
    expect(() => db.prepare(
      "INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, max_uses) VALUES (?, 'BADMU', 'percent', 10, -1)"
    ).run(artistId)).toThrow()
    expect(() => db.prepare(
      "INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, used_count) VALUES (?, 'BADUC', 'percent', 10, -5)"
    ).run(artistId)).toThrow()
  })
})

describe('B3-F0088/F0095/F0102: 冗余索引、幂等守卫、标识符白名单', () => {
  it('TC-B3-F0088-01: 冗余 idx_invite_codes_code 不存在，status 索引保留', () => {
    const codeIdx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_invite_codes_code'").get()
    expect(codeIdx).toBeUndefined()
    const statusIdx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_invite_codes_status'").get()
    expect(statusIdx).toBeDefined()
  })

  it('TC-B3-F0095-01: v66 六列幂等守卫——重放不报错（真实入口：调度器重放 v66）', () => {
    // 全局 db 已跑过 v66（六列齐全），重放验证幂等
    const six = ['download_locked', 'downloaded_at', 'download_ip', 'download_attempts', 'last_started_at', 'cooldown_until']
    for (const c of six) expect(colNames(db, 'deliverables')).toContain(c)
    expect(replayVersion(db, 66), '调度器应重放 v66 并写回版本行').toBe(true)
    // 六列各只有一份（不重复 ADD COLUMN）
    for (const c of six) expect(colNames(db, 'deliverables').filter(x => x === c)).toHaveLength(1)
  })

  it('TC-B3-F0102-01: 非法标识符（注入载荷）被白名单拒绝', () => {
    // 这是 addForensicIpColumn 这个**纯函数**的白名单单测（不走迁移调度），直调此处恰当
    const mem = new Database(':memory:')
    mem.exec('CREATE TABLE t (id INTEGER)')
    expect(() => addForensicIpColumn(mem, 't; DROP TABLE t; --', 'ip')).toThrow(/非法标识符/)
    expect(() => addForensicIpColumn(mem, 't', 'ip) ; --')).toThrow(/非法标识符/)
    // 合法标识符正常加列，且表未被破坏
    expect(() => addForensicIpColumn(mem, 't', 'ip')).not.toThrow()
    expect(colNames(mem, 't')).toContain('ip')
    expect(tableExists(mem, 't')).toBe(true)
    mem.close()
  })
})

describe('R3-②: v83 幂等守卫改列+索引双判据（半态崩溃补索引）', () => {
  /** 把基线库手术回 v83 前夜，按 withColumn/withIndex 摆出三种半态 */
  function revertToV82(withColumn: boolean, withIndex: boolean): (d: Database.Database) => void {
    return (d: Database.Database): void => {
      d.exec('DROP TABLE IF EXISTS invite_codes')
      d.exec(`
        CREATE TABLE invite_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'unused',
          expires_at TEXT NOT NULL,
          created_by INTEGER,
          max_uses INTEGER NOT NULL DEFAULT 1,
          use_count INTEGER NOT NULL DEFAULT 0
          ${withColumn ? ', qq_number TEXT NULL' : ''}
        )
      `)
      if (withIndex) d.exec('CREATE INDEX idx_invite_codes_qq ON invite_codes(qq_number)')
    }
  }

  const indexExists = (mem: Database.Database): boolean => !!mem.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_invite_codes_qq'"
  ).get()

  it('TC-R3-V83-01: 列已存在但索引缺失（半态）→ 重跑补建索引', () => {
    const mem = preTargetDb(83, revertToV82(true, false))
    try {
      expect(isApplied(mem, 83), 'v83 版本行应由调度器写入').toBe(true)
      expect(colNames(mem, 'invite_codes')).toContain('qq_number')
      expect(indexExists(mem)).toBe(true) // 索引补齐
    } finally {
      mem.close()
    }
  })

  it('TC-R3-V83-02: 列与索引齐全 → 重跑幂等、不重复备份（真实入口：调度器重放 v83）', () => {
    const mem = preTargetDb(83, revertToV82(true, true))
    try {
      expect(replayVersion(mem, 83), '调度器应重放 v83 并写回版本行').toBe(true)
      expect(indexExists(mem)).toBe(true)
      // qq_number 列只应有一份（PRAGMA 不重复追加）
      expect(colNames(mem, 'invite_codes').filter(c => c === 'qq_number')).toHaveLength(1)
    } finally {
      mem.close()
    }
  })

  it('TC-R3-V83-03: 全新形态（无列无索引）→ 一次补齐列+索引', () => {
    const mem = preTargetDb(83, revertToV82(false, false))
    try {
      expect(isApplied(mem, 83), 'v83 版本行应由调度器写入').toBe(true)
      expect(colNames(mem, 'invite_codes')).toContain('qq_number')
      expect(indexExists(mem)).toBe(true)
    } finally {
      mem.close()
    }
  })
})
