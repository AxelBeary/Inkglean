/**
 * v81: 过程稿（order_previews）+ 免费修改次数
 *
 * 需求：画师把画到一半的图放给客户看（订单级开关 + 单图开关），并按档位声明
 * 「含 N 次免费修改」；客户追踪页据订单开关与单图开关决定看得见什么。
 *
 * 语义（契约冻结，别改）：
 * - orders.preview_visible_to_client：0 = 客户看不到任何过程稿，1 = 开
 * - orders.free_revision_limit：0 = **不限**（不计数、客户不显示配额徽标），N>0 = 含 N 次免费修改。
 *   0 = 不限是故意的迁移安全选择——存量订单全部得 0，行为零变化；反过来实现成
 *   「0 = 不含免费次数」会让所有历史订单瞬间变成超限。
 * - style_sizes.free_revisions：档位默认值，下单时快照进 orders.free_revision_limit。
 * - 已用次数**不落列**：唯一真相是 getRevisionRecords()（activity-log.service），
 *   另立计数器必然与它漂。
 *
 * 幂等：三列一律先查 PRAGMA table_info 再 ALTER（与 v77/v80 同款守卫），重复执行不报错。
 * schema.ts 已声明 order_previews 表与 style_sizes.free_revisions（新建库走建表语句）；
 * 但 orders 的两列（preview_visible_to_client / free_revision_limit）故意不在 schema.ts 声明——
 * v50 的 orders 重建按「当前列清单」抄进固定定义 orders_new，提前带新列会在 v50 报
 * 「no column named ...」；这两列新老库都由本迁移幂等补齐（同 download_fail_total 口径），
 * 两条路径最终结构仍一致（audit-batch-f-ddl-consistency 锁死）。
 * 索引写在本迁移而非 schemaIndexes：查单过程稿是 v81 才出现的读法，
 * 与表同生同灭最省心（initDatabase 迁移先于 schemaIndexes 执行，新老库同样拿得到）。
 */
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 81,
  name: 'order_previews_free_revisions',
  up(database) {
    // 过程稿表：按订单平铺（不分组、不存 stage_id——契约「明确不做」）。
    // 删单级联删行；磁盘文件不在这里管（gcUploads 黑名单扫描兜底回收，同 deliverables）。
    database.exec(`
      CREATE TABLE IF NOT EXISTS order_previews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        caption TEXT DEFAULT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_order_previews_order ON order_previews(order_id);
    `)

    /** 幂等加列：列已存在则跳过（老库升级补齐；新库由 schema.ts 建表已含） */
    const addIfMissing = (table: string, column: string, ddl: string): void => {
      const cols = database.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
      if (!cols.some(c => c.name === column)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
      }
    }
    addIfMissing('orders', 'preview_visible_to_client', 'preview_visible_to_client INTEGER NOT NULL DEFAULT 0')
    addIfMissing('orders', 'free_revision_limit', 'free_revision_limit INTEGER NOT NULL DEFAULT 0')
    addIfMissing('style_sizes', 'free_revisions', 'free_revisions INTEGER NOT NULL DEFAULT 0')
  }
}
