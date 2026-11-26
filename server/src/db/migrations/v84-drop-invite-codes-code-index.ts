import type { Migration } from './types.js'

/**
 * v84: 删除历史冗余索引 idx_invite_codes_code（PR114 MINOR-2）
 *
 * 背景：v58 原文曾建 idx_invite_codes_code，但 code 列已 UNIQUE（SQLite 自动建
 * sqlite_autoindex），普通索引纯属重复占空间。此前在 v58 里原地删掉 CREATE INDEX，
 * 对已应用 v58 的老实例无效——迁移框架按 version 跳过，冗余索引永久留存。
 *
 * 处置：恢复 v58 原文不动，另起新迁移统一 DROP INDEX IF EXISTS；
 * 老实例升到 v84 即清理，新装库（v58 建、v84 删）终态一致。IF NOT EXISTS 语义的
 * DROP INDEX IF EXISTS 保证重复执行/半态重跑幂等，纯索引操作事务内安全。
 */
export const migration: Migration = {
  version: 84,
  name: 'drop_invite_codes_code_index',
  up(database) {
    database.exec('DROP INDEX IF EXISTS idx_invite_codes_code')
  }
}
