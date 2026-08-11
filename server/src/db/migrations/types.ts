import type Database from 'better-sqlite3'

/**
 * 单个迁移定义：唯一 version 号，按顺序执行，已执行的自动跳过
 */
export interface Migration {
  version: number
  name: string
  /**
   * 重建表类迁移（DROP/RENAME 父表）必须事务外执行，
   * 由迁移自己管理 PRAGMA + 事务（v0.35 事故教训，见各迁移注释）
   */
  noTransaction?: boolean
  up(db: Database.Database): void
}

/** PRAGMA table_info(...) 行结构 */
export interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

/** SELECT COUNT(*) AS c 行 */
export interface CountRow {
  c: number
}

/** SELECT id 行（artists / addon_templates 等） */
export interface IdRow {
  id: number
}

/** sqlite_master 抓取建表/索引 SQL 的行 */
export interface MasterSqlRow {
  sql: string
}

/** PRAGMA foreign_key_check 返回的悬空引用行 */
export interface FkViolation {
  table: string
  rowid: number
  parent: string
  fk_rowid: number
}

/** default_workflow_template 行（SELECT * 用到的列） */
export interface DefaultWorkflowTemplateRow {
  name: string
  description: string | null
  sort_order: number
  takes_payment: number
  basis_points: number | null
}

/** 旧模型 price_tiers 行（v36 搬运用到的列） */
export interface LegacyPriceTierRow {
  name: string
  price: number
  sort_order: number | null
}

/** 旧模型 price_addons 行（v36 搬运用到的列） */
export interface LegacyPriceAddonRow {
  name: string
  select_mode: 'toggle' | 'quantity' | 'inquiry'
  price_value: number
  sort_order: number | null
}
