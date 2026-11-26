/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

/**
 * v71: 邀请码多次使用（用户拍板：每码可用次数 1-100，不设无限次）
 *
 * invite_codes 增加两列：
 * - max_uses：总额度（旧数据 DEFAULT 1 = 一次性，语义不变）
 * - use_count：已消费次数；额度用满时 status 置 'used'（与旧一次性语义对齐）
 *
 * 新增 invite_code_uses 明细表：每次注册消费记一行（谁在何时用了哪张码），
 * 供管理端「使用记录」名单展示；旧的 used_by_artist_id/used_at 保留为"最近一次使用者"。
 *
 * 对齐 v68~v70 的简单 ALTER 风格：
 * - **必须 noTransaction**：备份的 VACUUM INTO / wal_checkpoint 在事务内均不可用
 * - 幂等：PRAGMA table_info 命中 max_uses 即跳过
 */
export const migration: Migration = {
  version: 71,
  name: 'invite_codes_multi_use',
  // ⚠️ 事务外执行：backupDbBeforeMigration 依赖 VACUUM INTO（事务内不可用），与 v64~v70 同口径
  noTransaction: true,
  up(database) {
    // B1-F0096：原守卫只认 max_uses 一列——两条 ALTER + 建明细表 + 回填在同一迁移，
    // 崩溃可能只落地部分（如仅加 max_uses 未加 use_count / 未建明细表 / 未回填），
    // 重跑时旧守卫命中 max_uses 直接 return，建表与回填被永久跳过。
    // 改为检查「全部新列 + 明细表」完整性：缺什么补什么，回填做成幂等后总是执行。
    const cols = database.prepare('PRAGMA table_info(invite_codes)').all() as ColumnInfo[]
    const hasMaxUses = cols.some(c => c.name === 'max_uses')
    const hasUseCount = cols.some(c => c.name === 'use_count')
    const hasUsesTable = !!database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='invite_code_uses'"
    ).get()
    const complete = hasMaxUses && hasUseCount && hasUsesTable
    const partial = (hasMaxUses || hasUseCount || hasUsesTable) && !complete

    if (!complete) backupDbBeforeMigration(71, database)

    if (!hasMaxUses) {
      database.exec('ALTER TABLE invite_codes ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1')
    }
    if (!hasUseCount) {
      database.exec('ALTER TABLE invite_codes ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0')
    }

    // 使用明细：一码可被多人消费，逐次留痕（artist 建号 QQ 唯一，同码同人天然不会重复，
    // UNIQUE 仍作防御性约束）
    database.exec(`
      CREATE TABLE IF NOT EXISTS invite_code_uses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invite_code_id INTEGER NOT NULL REFERENCES invite_codes(id),
        artist_id INTEGER NOT NULL REFERENCES artists(id),
        used_at TEXT NOT NULL,
        UNIQUE(invite_code_id, artist_id)
      );
      CREATE INDEX IF NOT EXISTS idx_invite_code_uses_code ON invite_code_uses(invite_code_id);
    `)

    // 回填：存量已用码（一次性）→ use_count=1 + 明细表补一行（used_at 沿用原值）。
    // 幂等加固：UPDATE 限定 use_count=0（绝不重置已被多次消费的码 use_count>1）；
    // INSERT 改 INSERT OR IGNORE（明细表 UNIQUE 冲突时跳过，半态重跑不报错）。
    // PR114 MINOR-11：INSERT OR IGNORE 只忽略 UNIQUE/NOT NULL，不忽略 FK 违例；v58 的
    // used_by_artist_id 无 REFERENCES，可能悬空，而目标列 artist_id REFERENCES artists。
    // 本迁移 noTransaction，一条悬空行就会让整个迁移中断。回填前用 EXISTS 过滤悬空引用。
    // 隔离单测可能只造 invite_codes/明细表而无 artists 表，此时该 EXISTS 会撞「no such table」；
    // 按表存在性拼条件，真实库（artists 必在）始终带守卫，裸表 fixture 退回原行为。
    const artistsTableExists = !!database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='artists'"
    ).get()
    const danglingGuard = artistsTableExists
      ? ' AND EXISTS (SELECT 1 FROM artists WHERE artists.id = used_by_artist_id)'
      : ''
    database.exec(`
      UPDATE invite_codes SET use_count = 1 WHERE status = 'used' AND use_count = 0;
      INSERT OR IGNORE INTO invite_code_uses (invite_code_id, artist_id, used_at)
      SELECT id, used_by_artist_id, used_at FROM invite_codes
      WHERE status = 'used' AND used_by_artist_id IS NOT NULL AND used_at IS NOT NULL${danglingGuard};
    `)

    console.log('📦 迁移 v71: invite_codes 多次使用（max_uses/use_count + invite_code_uses 明细）已就绪' + (partial ? '（崩溃半态已修复）' : ''))
  }
}
