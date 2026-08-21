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
    // 幂等守卫：列已存在 = 已迁移过（含失败残留），直接跳过
    const cols = database.prepare('PRAGMA table_info(invite_codes)').all() as ColumnInfo[]
    if (cols.some(c => c.name === 'max_uses')) {
      return
    }

    backupDbBeforeMigration(71, database)

    database.exec(`
      ALTER TABLE invite_codes ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE invite_codes ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
    `)

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

    // 回填：存量已用码（一次性）→ use_count=1 + 明细表补一行（used_at 沿用原值）
    database.exec(`
      UPDATE invite_codes SET use_count = 1 WHERE status = 'used';
      INSERT INTO invite_code_uses (invite_code_id, artist_id, used_at)
      SELECT id, used_by_artist_id, used_at FROM invite_codes
      WHERE status = 'used' AND used_by_artist_id IS NOT NULL AND used_at IS NOT NULL;
    `)

    console.log('📦 迁移 v71: invite_codes 多次使用（max_uses/use_count + invite_code_uses 明细）已就绪')
  }
}
