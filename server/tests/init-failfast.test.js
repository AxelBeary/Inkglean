import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// P1-4 (2026-08-05): 生产环境 ADMIN_QQ fail-fast
// vitest 注入 NODE_ENV=test（见 vitest.config.js），fail-fast 只对 production 生效，
// 测试手动切 production 验证，afterEach 恢复。
const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_ADMIN_QQ = process.env.ADMIN_QQ

describe('生产环境 ADMIN_QQ fail-fast (P1-4)', () => {
  beforeEach(() => {
    cleanDb()
  })

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV
    if (ORIGINAL_ADMIN_QQ === undefined) {
      delete process.env.ADMIN_QQ
    } else {
      process.env.ADMIN_QQ = ORIGINAL_ADMIN_QQ
    }
  })

  it('TC-FF-01: 生产环境缺 ADMIN_QQ 且无管理员账号 → initDatabase 抛错', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ADMIN_QQ
    // admin_qq 配置为空（首次部署状态，cleanDb 不清 platform_config 需显式置空）
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'admin_qq'").run()

    expect(() => initDatabase(db)).toThrow(/ADMIN_QQ/)
  })

  it('TC-FF-02: 生产环境缺 ADMIN_QQ 但已有管理员账号 → 不抛错（重启场景）', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ADMIN_QQ
    // 模拟已持久化的管理员账号（配置 + 画师行）
    const adminQq = '10003'
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(adminQq)
    db.prepare(
      "INSERT INTO artists (qq_number, name, subdomain, artist_code, status) VALUES (?, 'Admin', 'admin', 'ADMIN', 'open')"
    ).run(adminQq)

    expect(() => initDatabase(db)).not.toThrow()
  })

  it('TC-FF-03: 开发环境缺 ADMIN_QQ 且无管理员 → 不抛错（保持原静默行为）', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.ADMIN_QQ
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'admin_qq'").run()

    expect(() => initDatabase(db)).not.toThrow()
  })
})
