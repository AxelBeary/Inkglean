import type { ColumnInfo, Migration } from './types.js'

/**
 * v77: 参考图未绑定配额列（GHSA-6pf3-g4xq-854w Wave1「磁盘耗尽」修复批，S4 后端席）
 *
 * 背景：/api/upload/reference 是公开接口（只需匿名凭证 + 10 次/10 分/IP 的次数限流，
 * 单文件 10MB），而 reference_uploads 登记表此前只有 file_path，没有任何尺寸与来源列：
 * - 配额无法用一条 SQL 求和核算 → 只能逐行 stat 磁盘文件，把文件系统扫描成本
 *   挂在公开无鉴权接口上（换个姿势继续被耗尽）；
 * - 次数限流按 IP，但「同一 IP 名下累计囤了多少未绑定字节」在库里根本查不出来。
 *
 * 处置：两列都做成可空、无默认值的纯 ADD COLUMN（照 v72/v75/v76 幂等守卫先例），
 * 不回填、不重建表、不动既有列语义：
 * - ip TEXT：上传当时的 request.ip（口径同 v75 取证 IP——真实 IP 已由反代换算，后端不读裸 CF 头）
 * - file_size INTEGER：落盘后的真实字节数（与响应体 size 同源，不用客户端声明值）
 * 存量行（v77 之前登记）两列皆 NULL：per-IP 维度自然不计入，per-anon 维度按单文件上限
 * 保守计入（见 upload.routes unboundBytesByAnon），最迟 3 天被 TTL 清扫出局。
 *
 * 配套（不在本迁移内，故在此点名以免被当成漏改）：
 * - 未绑定行 TTL 清理：app.ts gcDatabaseTtl（默认 3 天，env REFERENCE_UPLOAD_TTL_DAYS）
 * - 查询索引：schema.ts 的 schemaIndexes（initDatabase 每次启动在迁移后 exec，新老库同径）
 */
export const migration: Migration = {
  version: 77,
  name: 'reference_uploads_quota_columns',
  up(database) {
    const addIfMissing = (column: string, ddl: string): void => {
      const cols = database.prepare('PRAGMA table_info(reference_uploads)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === column)) {
        database.exec(`ALTER TABLE reference_uploads ADD COLUMN ${ddl}`)
      }
    }
    addIfMissing('ip', 'ip TEXT')
    addIfMissing('file_size', 'file_size INTEGER')
  }
}
