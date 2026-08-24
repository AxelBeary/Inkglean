import type { Migration } from './types.js'

export const migration: Migration = {
  version: 73,
  name: 'desktop_devices',
  up(database) {
    // REQ-014 安全口径一（方案 A 服务器记账式会话）：桌面端设备账本表
    // 一张账本记全部：登录=记账 / 踢人=撕账 / 顺延=改账 / 设备清单=同账。
    // - (artist_id, device_uuid) 唯一：同设备重登录改账不重复记账（客户端首次启动生成 UUID 存系统保险箱）
    // - expires_at 为过期权威（90 天，活跃顺延；token 自身不做 t 基 TTL，见 auth.service 桌面分支）
    // - 纯 CREATE + INDEX，事务内安全（对照 v44）
    database.exec(`
      CREATE TABLE IF NOT EXISTS desktop_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
        device_uuid TEXT NOT NULL,
        device_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_ip TEXT,
        UNIQUE(artist_id, device_uuid)
      );
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_desktop_devices_artist_id ON desktop_devices(artist_id)')
  }
}
