/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

/**
 * v83: 邀请码签发绑定目标 QQ（ab263dd1 空壳 QQ 归属根因·方案 A）
 *
 * 背景（ROOTCAUSE-LEDGER §3 / DECISIONS 拍板项④）：
 *   邀请码签发时不绑定 QQ（INSERT 只写 code/status/expires_at/created_by/max_uses），
 *   注册只「查重不校验归属」——持新邀请码 + 他人 QQ 即可覆盖邀请流程自产的空壳行、
 *   重生成自己控制的 TOTP。归属证明无法从现有字段推导，须在签发期落绑定关系。
 *
 * 处置：
 * - invite_codes 增加 qq_number（可空）：NULL=存量码/通用码（任意 QQ 可注册，行为不变）；
 *   非 NULL=签发时绑定的目标 QQ，注册入口须校验「码绑定 QQ == 申领 QQ」，否则 INVITE_INVALID。
 * - 可空列保证存量库零回填、旧码零行为变化（向后兼容）；方案 C（空壳禁覆盖）在 service 层落地。
 *
 * 对齐 v71 的 ALTER 风格：
 * - **必须 noTransaction**：备份的 VACUUM INTO 在事务内不可用（v68 生产实测）。
 * - 幂等：PRAGMA table_info 命中 qq_number 即跳过（含失败残留）。
 */
export const migration: Migration = {
  version: 83,
  name: 'invite_codes_bound_qq',
  // ⚠️ 事务外执行：backupDbBeforeMigration 依赖 VACUUM INTO（事务内不可用），与 v64~v71 同口径
  noTransaction: true,
  up(database) {
    // 幂等守卫：列已存在 = 已迁移过（含失败残留），直接跳过
    const cols = database.prepare('PRAGMA table_info(invite_codes)').all() as ColumnInfo[]
    if (cols.some(c => c.name === 'qq_number')) {
      return
    }

    backupDbBeforeMigration(83, database)

    database.exec(`
      ALTER TABLE invite_codes ADD COLUMN qq_number TEXT NULL;
      CREATE INDEX IF NOT EXISTS idx_invite_codes_qq ON invite_codes(qq_number);
    `)

    console.log('📦 迁移 v83: invite_codes.qq_number（方案 A 签发绑定 QQ）已就绪')
  }
}
