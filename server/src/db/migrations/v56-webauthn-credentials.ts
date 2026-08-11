import type { Migration } from './types.js'

export const migration: Migration = {
  version: 56,
  name: 'webauthn_credentials',
  up(database) {
    // REQ-040: WebAuthn Passkey 凭据表
    // 存储画师注册的设备公钥，用于无密码登录（FIDO2/Windows Hello/平台认证器）
    database.exec(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        device_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_artist_id ON webauthn_credentials(artist_id);
    `)
  }
}
