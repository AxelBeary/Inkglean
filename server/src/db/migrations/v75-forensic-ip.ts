import type { ColumnInfo, Migration } from './types.js'

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
    const addIpIfMissing = (table: string, column: string): void => {
      const cols = database.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
      if (!cols.some(c => c.name === column)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`)
      }
    }
    addIpIfMissing('admin_actions', 'admin_ip')
    addIpIfMissing('reports', 'report_ip')
    addIpIfMissing('guestbook_messages', 'ip')
  }
}
