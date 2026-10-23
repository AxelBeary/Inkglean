/**
 * v78: idempotency_keys 增加 request_hash（审计 #21 条目 3，PR #27；原稿编号 v77，合入时因 master 已有 v77 顺延重编号）
 *
 * 背景：D-2（R-9）幂等键只按 scope+key 命中缓存，不校验请求内容。
 * 客户端（web 收款/下单 composable）失败时保留同一个 key，
 * 「首次请求已在服务端成功但响应丢失 → 用户改金额/改编排后带同一 key 重试」时，
 * 服务端把旧响应原样回放，新内容静默不执行——用户以为改成功了。
 * 标准幂等语义应当是：同 key 不同载荷 = 409 冲突，让调用方显式换 key 重试。
 *
 * 幂等：PRAGMA 守卫对齐 v72/v74（列已存在则跳过；完整 schema 建表处已含本列，
 * 新库走 CREATE 即有、存量库走本迁移补齐，schema 一致性测试锁定双轨收敛）。
 * 回滚思路：单列纯追加无数据搬迁，回滚 = 重建表剔除该列（与 v74 同级别）。
 * 存量行 request_hash 为 NULL：读侧按「未记录指纹」处理，维持旧的重放语义，
 * 24h TTL 内不做追溯性收紧（避免升级当天把在途重试判成冲突）。
 */
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 78,
  name: 'idempotency_request_hash',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(idempotency_keys)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'request_hash')) {
      database.exec('ALTER TABLE idempotency_keys ADD COLUMN request_hash TEXT')
    }
  }
}
