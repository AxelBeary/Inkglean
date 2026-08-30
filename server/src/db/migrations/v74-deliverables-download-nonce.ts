/**
 * v74: deliverables 增加 download_nonce（260830 审计 H-4「一次性下载」访问层落地）
 *
 * 背景：v66 的一次性下载只在服务层记账（start/confirm 改 download_locked），
 * 签名 URL 本身 15 分钟内可无限转发——访问层（/uploads 钩子）从不查账。
 * 修法：每次 download-start 签发时生成随机 nonce 写入本列并编入签名载荷，
 * /uploads 钩子验签后凭载荷与本列对账（行不存在/已锁定/nonce 不符 → 403）；
 * 画师再许可时清空本列，令旧链接彻底失效（新链接须重新 start 签发）。
 *
 * 幂等：PRAGMA 守卫对齐 v72（列已存在则跳过；完整 schema 建表处已含本列，
 * 新库走 CREATE 即有、存量库走本迁移补齐，F-6 一致性测试锁定双轨收敛）。
 * 回滚思路：单列纯追加无数据搬迁，回滚 = 重建表剔除该列（与 v66 各列同级别）。
 */
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 74,
  name: 'deliverables_download_nonce',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(deliverables)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'download_nonce')) {
      database.exec('ALTER TABLE deliverables ADD COLUMN download_nonce TEXT')
    }
  }
}
