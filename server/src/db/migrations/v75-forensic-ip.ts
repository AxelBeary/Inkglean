import type Database from 'better-sqlite3'
import type { ColumnInfo, Migration } from './types.js'

/** B3-F0102：标识符白名单——仅允许裸 SQL 标识符字符集，拒绝一切注入载荷 */
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 幂等加列 + 标识符校验（导出供防注入单测直接调用）。
 * table/column 必须过白名单，否则抛错；合法时列不存在才 ALTER ADD COLUMN。
 */
export function addForensicIpColumn(database: Database.Database, table: string, column: string): void {
  if (!SAFE_IDENT.test(table) || !SAFE_IDENT.test(column)) {
    throw new Error(`迁移 v75: 非法标识符（table=${table} column=${column}），中止以防 SQL 注入`)
  }
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  if (!cols.some(c => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`)
  }
}

/**
 * v75: 取证类 IP（P4 后端批，2026-09-13 用户拍板）
 * 三表各加一列可空 IP，取法一律 request.ip（CF→Caddy 已在反代层换算真实用户 IP，
 * 见 docs/OPS.md §12.1 与 tests/cf-real-ip.test.ts；后端不得自行读裸 CF 头，防伪造）。
 * - admin_actions.admin_ip：REQ-042 §七 验收 4「留痕记录（时间/IP/原因）」的欠账补齐
 * - reports.report_ip：举报来源追溯与防恶意举报（此前只有即丢的限流计数）
 * - guestbook_messages.ip：公开留言的纠纷取证（仅管理端可读，见 guestbook.service 列清单）
 * 纯 ADD COLUMN、事务内安全；幂等守卫照 v72 先例（PRAGMA table_info 检查列不存在才加）。
 */
export const migration: Migration = {
  version: 75,
  name: 'forensic_ip',
  up(database) {
    // B3-F0102：helper 原样拼接 table/column 进 PRAGMA/ALTER。虽当前调用点全为硬编码常量，
    // 仍加标识符白名单（见 addForensicIpColumn），防未来误传外部输入形成 SQL 注入面。
    addForensicIpColumn(database, 'admin_actions', 'admin_ip')
    addForensicIpColumn(database, 'reports', 'report_ip')
    addForensicIpColumn(database, 'guestbook_messages', 'ip')
  }
}
