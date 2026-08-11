import type { Migration } from './types.js'

export const migration: Migration = {
    version: 45,
    name: 'tracking_events_artist_index',
    up(database) {
      // 性能：画师/管理员统计按 artist_id 过滤事件（REQ-033 统计页），防全表扫描
      // 纯 CREATE INDEX，无 ALTER/DROP，事务内安全（对照 v44）；IF NOT EXISTS 幂等
      database.exec('CREATE INDEX IF NOT EXISTS idx_events_artist_ts ON events(artist_id, ts)')
    }
  }
