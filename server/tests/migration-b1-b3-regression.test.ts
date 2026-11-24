import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { db, seedArtist, cleanDb } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { migration as v13 } from '../src/db/migrations/v13-login-codes-expires-at-integer.js'
import { migration as v49 } from '../src/db/migrations/v49-req036-backend-core.js'
import { migration as v52 } from '../src/db/migrations/v52-retire-installment-paid-columns.js'
import { migration as v64 } from '../src/db/migrations/v64-greeting-special-days.js'
import { migration as v69 } from '../src/db/migrations/v69-artists-calendar-feed.js'
import { migration as v71 } from '../src/db/migrations/v71-invite-codes-multi-use.js'
import { migration as v66 } from '../src/db/migrations/v66-deliverables-one-time-download.js'
import { migration as v50 } from '../src/db/migrations/v50-price-model-unify-spec-price-2.js'
import { migration as v67 } from '../src/db/migrations/v67-greeting-slot-rework.js'
import { addForensicIpColumn } from '../src/db/migrations/v75-forensic-ip.js'

/**
 * B1+B3 DB 迁移专项批回归测试（2026-11-24）
 * F0075(v13 旧形重建 CAST) / F0086(v49 残留恢复) / F0087(v52 DROP 升级路径)
 * F0096(v71 全列守卫+半态回填) / F0097(v69 双列守卫) / F0094(v64 列存在性守卫)
 * F0079/F0080(v32 CHECK) / F0088(v58 冗余索引) / F0095(v66 幂等) / F0102(v75 标识符白名单)
 *
 * 手法：新建独立内存库构造「旧形库/崩溃半态」，直接调用对应 migration.up(mem) 后回读，
 * 不依赖 setup 的全局 db（那条已跑完全量迁移，末态回读断言见各 migration-vXX.test.ts）。
 */

const colNames = (database: Database.Database, table: string): string[] =>
  (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name)

const tableExists = (database: Database.Database, table: string): boolean => !!database.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
).get(table)

describe('B1-F0075: v13 旧形库（expires_at DATETIME）重建 + CAST 搬运', () => {
  function buildOldShape(): Database.Database {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (id INTEGER PRIMARY KEY);
      CREATE TABLE login_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      );
      INSERT INTO artists (id) VALUES (1);
      -- expires_at 存 unix 秒数值（DATETIME 列亲和性下以文本形态落库），CAST 应还原为整数
      INSERT INTO login_codes (artist_id, code, expires_at, attempts)
      VALUES (1, 'CODE1', '1735689600', 3), (1, 'CODE2', '1735776000', 0);
    `)
    return mem
  }

  it('TC-B1-F0075-01: 旧形 DATETIME 列重建为 INTEGER 且数据经 CAST 搬运', () => {
    const mem = buildOldShape()
    expect(() => v13.up(mem)).not.toThrow()
    const expiresCol = (mem.prepare('PRAGMA table_info(login_codes)').all() as Array<{ name: string; type: string }>)
      .find(c => c.name === 'expires_at')
    expect(expiresCol?.type.toUpperCase()).toBe('INTEGER')
    const rows = mem.prepare('SELECT code, expires_at, attempts FROM login_codes ORDER BY code').all() as Array<{ code: string; expires_at: number; attempts: number }>
    expect(rows).toHaveLength(2)
    expect(rows[0].expires_at).toBe(1735689600)
    expect(rows[0].attempts).toBe(3)
    expect(tableExists(mem, 'login_codes_new')).toBe(false)
    mem.close()
  })

  it('TC-B1-F0075-02: 幂等——已是 INTEGER 再跑不报错不改数据', () => {
    const mem = buildOldShape()
    v13.up(mem)
    expect(() => v13.up(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS n FROM login_codes').get() as { n: number }).n).toBe(2)
    mem.close()
  })
})

describe('B1-F0086: v49 崩溃残留半态恢复', () => {
  /** 构造：主表缺失、_new 持数据（DROP 主表后 RENAME 前崩溃） */
  function buildHalfState(): Database.Database {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (id INTEGER PRIMARY KEY);
      CREATE TABLE style_sizes (id INTEGER PRIMARY KEY AUTOINCREMENT, display_status TEXT);
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
    return mem
  }

  it('TC-B1-F0086-01: 主表缺失+_new 持数据 → 续 RENAME 恢复，数据不丢', () => {
    const mem = buildHalfState()
    // FK 需在事务外关闭；内存库默认 foreign_keys=OFF，满足迁移的回读校验
    expect(() => v49.up(mem)).not.toThrow()
    expect(tableExists(mem, 'addon_templates')).toBe(true)
    expect(tableExists(mem, 'addon_templates_new')).toBe(false)
    const name = (mem.prepare('SELECT name FROM addon_templates').get() as { name: string }).name
    expect(name).toBe('孤儿增项')
    mem.close()
  })

  it('TC-B1-F0086-02: v50 三表（breakdown/addon_templates/style_addons）空壳主表 + _new 持数据 → 真实迁移恢复', () => {
    // v50 已有 orders 恢复测试（migration-v50.test.ts TC-P14-01/02）；此处补其余三表。
    // 关键：v50 的恢复分支在「幂等守卫判定已迁移（主表列已是新形）」的 else 路径里，
    // 因此主表须带新形标记列（breakdown 含 addon_fixed / addon_templates 含 category /
    // style_addons 含 tpl_price_mode）且 0 行，_new 持数据，调用真实 v50.up() 应恢复。
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (id INTEGER PRIMARY KEY);
      CREATE TABLE style_sizes (id INTEGER PRIMARY KEY);
      CREATE TABLE art_styles (id INTEGER PRIMARY KEY);
      -- orders 已是新形（含 style_size_id、无 tier_id）→ 跳过 orders 重建，走 else 恢复分支
      CREATE TABLE orders (id INTEGER PRIMARY KEY, style_size_id INTEGER, order_no TEXT);
      -- breakdown 新形空壳（DDL 文本须含 addon_fixed 才会走 else 恢复分支）+ _new 持数据
      CREATE TABLE order_price_breakdown (id INTEGER PRIMARY KEY, item_type TEXT CHECK(item_type IN ('base','addon_fixed')));
      CREATE TABLE order_price_breakdown_new (id INTEGER PRIMARY KEY, order_id INTEGER, item_type TEXT, item_name TEXT, amount_cents INTEGER, multiplier REAL, quantity INTEGER, sort_order INTEGER);
      INSERT INTO order_price_breakdown_new (id, order_id, item_type, item_name, amount_cents) VALUES (42, 1, 'base', '基础价', 10000);
      CREATE TABLE addon_templates (id INTEGER PRIMARY KEY, category TEXT, price_mode TEXT);
      CREATE TABLE addon_templates_new (id INTEGER PRIMARY KEY, artist_id INTEGER, name TEXT, control_type TEXT, price_mode TEXT, default_price REAL, unit_label TEXT, sort_order INTEGER, category TEXT, max_quantity INTEGER, created_at DATETIME);
      INSERT INTO addon_templates_new (id, name, category) VALUES (43, '孤儿增项', 'add');
      CREATE TABLE style_addons (id INTEGER PRIMARY KEY, tpl_price_mode TEXT, tpl_category TEXT);
      CREATE TABLE style_addons_new (id INTEGER PRIMARY KEY, art_style_id INTEGER, addon_template_id INTEGER, is_enabled INTEGER, price_override REAL, tpl_name TEXT, tpl_control_type TEXT, tpl_price_mode TEXT, tpl_default_price REAL, tpl_unit_label TEXT, tpl_category TEXT, tpl_max_quantity INTEGER);
      INSERT INTO style_addons_new (id, art_style_id, tpl_name, tpl_price_mode) VALUES (44, 1, '快照', 'fixed');
    `)
    expect(() => v50.up(mem)).not.toThrow()
    for (const c of [
      { table: 'order_price_breakdown', id: 42 },
      { table: 'addon_templates', id: 43 },
      { table: 'style_addons', id: 44 },
    ]) {
      expect(tableExists(mem, c.table + '_new')).toBe(false)
      expect((mem.prepare(`SELECT id FROM ${c.table}`).get() as { id: number }).id).toBe(c.id)
    }
    mem.close()
  })
})

describe('B1-F0087: v52 老库带四列升级路径（DROP COLUMN 分支零覆盖补齐）', () => {
  it('TC-B1-F0087-01: 老库含 paid_cents/status/paid_at/requested_at → 清零后逐列 DROP', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE order_payment_installments (
        id INTEGER PRIMARY KEY,
        order_id INTEGER,
        label TEXT,
        basis_points INTEGER,
        amount_cents INTEGER,
        status TEXT DEFAULT 'pending',
        sort_order INTEGER,
        requested_at DATETIME,
        paid_at DATETIME,
        paid_cents INTEGER,
        created_at DATETIME
      );
      INSERT INTO order_payment_installments (order_id, label, basis_points, status, requested_at, paid_at, paid_cents)
      VALUES (1, '定金', 3000, 'paid', '2026-01-01', '2026-01-02', 5000);
    `)
    expect(() => v52.up(mem)).not.toThrow()
    const cols = colNames(mem, 'order_payment_installments')
    for (const dropped of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
      expect(cols).not.toContain(dropped)
    }
    // 行本身保留（只删僵尸列，不删数据行）
    expect((mem.prepare('SELECT COUNT(*) AS n FROM order_payment_installments').get() as { n: number }).n).toBe(1)
    mem.close()
  })

  it('TC-B1-F0087-02: 幂等——无四列的新形态库重跑不报错', () => {
    const mem = new Database(':memory:')
    mem.exec(`CREATE TABLE order_payment_installments (id INTEGER PRIMARY KEY, order_id INTEGER, label TEXT, basis_points INTEGER, amount_cents INTEGER, sort_order INTEGER, created_at DATETIME)`)
    expect(() => v52.up(mem)).not.toThrow()
    expect(colNames(mem, 'order_payment_installments')).not.toContain('paid_cents')
    mem.close()
  })
})

describe('B1-F0096/F0097: noTransaction 全列守卫 + 半态修复', () => {
  it('TC-B1-F0097-01: v69 只有第一列 → 补第二列 calendar_feed_token', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (id INTEGER PRIMARY KEY, calendar_feed_enabled INTEGER NOT NULL DEFAULT 0);
      INSERT INTO artists (id) VALUES (1);
    `)
    expect(colNames(mem, 'artists')).not.toContain('calendar_feed_token')
    expect(() => v69.up(mem)).not.toThrow()
    expect(colNames(mem, 'artists')).toContain('calendar_feed_enabled')
    expect(colNames(mem, 'artists')).toContain('calendar_feed_token')
    // 已有列的值不被破坏
    expect((mem.prepare('SELECT calendar_feed_enabled FROM artists WHERE id=1').get() as { calendar_feed_enabled: number }).calendar_feed_enabled).toBe(0)
    mem.close()
  })

  it('TC-B1-F0096-01: v71 半态（有 max_uses 无 use_count/明细表）→ 补齐且回填幂等', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE invite_codes (
        id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, status TEXT,
        used_by_artist_id INTEGER, used_at TEXT, max_uses INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE artists (id INTEGER PRIMARY KEY);
      INSERT INTO artists (id) VALUES (1);
      INSERT INTO invite_codes (code, status, used_by_artist_id, used_at)
      VALUES ('USED1', 'used', 1, '2026-01-01T00:00:00Z');
    `)
    expect(() => v71.up(mem)).not.toThrow()
    expect(colNames(mem, 'invite_codes')).toContain('use_count')
    expect(tableExists(mem, 'invite_code_uses')).toBe(true)
    expect((mem.prepare("SELECT use_count FROM invite_codes WHERE code='USED1'").get() as { use_count: number }).use_count).toBe(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM invite_code_uses').get() as { n: number }).n).toBe(1)
    // 幂等重跑：不重复插明细、不重置 use_count
    expect(() => v71.up(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS n FROM invite_code_uses').get() as { n: number }).n).toBe(1)
    mem.exec("UPDATE invite_codes SET use_count=3 WHERE code='USED1'")
    expect(() => v71.up(mem)).not.toThrow()
    expect((mem.prepare("SELECT use_count FROM invite_codes WHERE code='USED1'").get() as { use_count: number }).use_count).toBe(3)
    mem.close()
  })

  it('TC-B1-F0096-02: 结构完整时 v71 直接跳过（不重复备份/回填）', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE invite_codes (id INTEGER PRIMARY KEY, code TEXT, status TEXT, used_by_artist_id INTEGER, used_at TEXT, max_uses INTEGER, use_count INTEGER);
      CREATE TABLE invite_code_uses (id INTEGER PRIMARY KEY, invite_code_id INTEGER, artist_id INTEGER, used_at TEXT, UNIQUE(invite_code_id, artist_id));
      CREATE INDEX idx_invite_code_uses_code ON invite_code_uses(invite_code_id);
    `)
    expect(() => v71.up(mem)).not.toThrow()
    mem.close()
  })
})

describe('B1-F0094: v64 幂等守卫改列存在性（不依赖 DDL 文本字面量）', () => {
  it('TC-B1-F0094-01: 表已含 special_day_id（CHECK 无 latenight 字面量也行）→ 跳过重建', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE greeting_special_days (id INTEGER PRIMARY KEY, date_key TEXT, artist_id INTEGER, is_enabled INTEGER, created_at DATETIME);
      -- 故意让 CHECK 只含 'night' 不含 'latenight'/'midnight'：旧守卫会误判为未迁移而触发重建
      CREATE TABLE greeting_templates (
        id INTEGER PRIMARY KEY, artist_id INTEGER, text TEXT NOT NULL,
        time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','night','any')),
        is_enabled INTEGER DEFAULT 1, special_day_id INTEGER, created_at DATETIME
      );
      INSERT INTO greeting_templates (text, time_slot) VALUES ('自定义文案', 'night');
    `)
    expect(() => v64.up(mem)).not.toThrow()
    // 守卫命中列存在性 → 跳过重建，自定义 CHECK 与数据原样保留
    const sql = (mem.prepare("SELECT sql FROM sqlite_master WHERE name='greeting_templates'").get() as { sql: string }).sql
    expect(sql).toContain("'night'")
    expect((mem.prepare('SELECT text FROM greeting_templates').get() as { text: string }).text).toBe('自定义文案')
    expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
    mem.close()
  })
})

describe('B3-F0090/F0099: 重建事务内 foreign_key_check（失败即回滚 + 定向校验）', () => {
  /**
   * 构造 v64 重建前置：旧形 greeting_templates（无 special_day_id，CHECK 无 latenight），
   * 且存在一条 artist_id 指向不存在父行的悬空引用（FK 关闭下可写入）。
   * v64.up() 重建时把悬空 artist_id 拷入新表 → 事务内 foreign_key_check('greeting_templates')
   * 应抛错；因检查在 database.transaction() 回调内，整批 ROLLBACK，旧表结构与数据完整保留。
   */
  function buildV64Dangling(): Database.Database {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (id INTEGER PRIMARY KEY);
      CREATE TABLE greeting_special_days (id INTEGER PRIMARY KEY, date_key TEXT, artist_id INTEGER, is_enabled INTEGER, created_at DATETIME);
      CREATE TABLE greeting_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER,
        text TEXT NOT NULL,
        time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','afternoon','evening','night','any')),
        is_enabled INTEGER DEFAULT 1,
        created_at DATETIME
      );
      -- 悬空 artist_id=999（父表 artists 无该行），FK 默认 OFF 可写入
      INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (999, '悬空引用行', 'night');
    `)
    return mem
  }

  it('TC-B3-F0090-01: 悬空引用 → 事务内 FK 检查抛错，旧表数据零丢失（回滚）', () => {
    const mem = buildV64Dangling()
    let threw = false
    try { v64.up(mem) } catch (e) { threw = true; expect(String(e)).toMatch(/foreign_key_check/) }
    expect(threw).toBe(true)
    // 整批回滚：残留 _new 表不存在，旧表数据原样（不同于旧实现「带病提交+版本号缺失」）
    expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
    const rows = mem.prepare('SELECT text FROM greeting_templates').all() as Array<{ text: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('悬空引用行')
    // FK 在 finally 恢复为 ON（连接不留 OFF 态）
    expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
    mem.close()
  })

  it('TC-B3-F0099-01: v67 定向校验只查被重建表——无关表历史悬空引用不阻断升级', () => {
    const mem = new Database(':memory:')
    // FK 关闭下构造无关表的历史悬空引用（v67.up() 自身也会 pragma foreign_keys=OFF）
    mem.pragma('foreign_keys = OFF')
    mem.exec(`
      CREATE TABLE artists (id INTEGER PRIMARY KEY);
      CREATE TABLE greeting_special_days (id INTEGER PRIMARY KEY, date_key TEXT, artist_id INTEGER, is_enabled INTEGER, created_at DATETIME);
      -- 旧形 greeting_templates（CHECK 无 midnight）含合法数据
      CREATE TABLE greeting_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER,
        text TEXT NOT NULL,
        time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
        is_enabled INTEGER DEFAULT 1,
        special_day_id INTEGER,
        created_at DATETIME
      );
      INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '合法文案', 'night');
      -- 无关表 reports 的悬空引用（不得阻断 greeting_templates 重建）
      CREATE TABLE reports (id INTEGER PRIMARY KEY, artist_id INTEGER, FOREIGN KEY(artist_id) REFERENCES artists(id));
      INSERT INTO reports (id, artist_id) VALUES (1, 888);
    `)
    expect(() => v67.up(mem)).not.toThrow()
    const rows = mem.prepare('SELECT text, time_slot FROM greeting_templates').all() as Array<{ text: string; time_slot: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].time_slot).toBe('midnight') // night → midnight 搬家
    // reports 的悬空引用仍在（未被误伤/误删）
    expect((mem.prepare('SELECT artist_id FROM reports WHERE id=1').get() as { artist_id: number }).artist_id).toBe(888)
    mem.close()
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

  it('TC-B3-F0095-01: v66 六列幂等守卫——重复 up 不报错', () => {
    // 全局 db 已跑过 v66（六列齐全），直接重跑验证幂等
    const six = ['download_locked', 'downloaded_at', 'download_ip', 'download_attempts', 'last_started_at', 'cooldown_until']
    for (const c of six) expect(colNames(db, 'deliverables')).toContain(c)
    expect(() => v66.up(db)).not.toThrow()
  })

  it('TC-B3-F0102-01: 非法标识符（注入载荷）被白名单拒绝', () => {
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
