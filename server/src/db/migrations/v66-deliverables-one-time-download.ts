/**
 * v66: 交付文件一次性下载（815 拍板 #4，用户亲裁 2026-08-15）
 * deliverables 增加下载状态列：
 * - download_locked：0=可下载 1=已锁定（一次性下载完成 / 半途下载 3 次防护锁定）
 * - downloaded_at / download_ip：完成下载留痕（纠纷取证，隐私政策已披露 IP 收集）
 * - download_attempts：未完整下载的尝试次数（防恶意半途下载，3 次锁定）
 * - last_started_at：最近一次下载开始（unix ms，下载器 60 秒兜底判定）
 * - cooldown_until：防护锁定冷却截止（unix ms，5 分钟）
 * 画师"再许可"= 清零 locked/attempts/cooldown（留痕走 order_notes 系统备注）。
 */
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 66,
  name: 'deliverables_one_time_download',
  up(database) {
    // B3-F0095：原 6 条裸 ALTER 无幂等守卫，破坏全仓惯例——崩溃发生在中途列只加了一半时，
    // 重跑会撞「duplicate column name」失败。改为逐列 PRAGMA table_info 守卫（同 v59~v63/v75/v77 先例）。
    const cols = database.prepare('PRAGMA table_info(deliverables)').all() as ColumnInfo[]
    const addIfMissing = (column: string, ddl: string): void => {
      if (!cols.some(c => c.name === column)) {
        database.exec(`ALTER TABLE deliverables ADD COLUMN ${ddl}`)
      }
    }
    addIfMissing('download_locked', 'download_locked INTEGER NOT NULL DEFAULT 0')
    addIfMissing('downloaded_at', 'downloaded_at DATETIME')
    addIfMissing('download_ip', 'download_ip TEXT')
    addIfMissing('download_attempts', 'download_attempts INTEGER NOT NULL DEFAULT 0')
    addIfMissing('last_started_at', 'last_started_at INTEGER')
    addIfMissing('cooldown_until', 'cooldown_until INTEGER')
  }
}
