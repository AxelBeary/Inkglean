import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// REQ-038: ADMIN_QQ 环境变量自举已移除，fail-fast 不再存在
// initDatabase 在无管理员时不再抛错，进入 setup 模式由运行时守卫决定
const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_ADMIN_QQ = process.env.ADMIN_QQ

describe('REQ-038: 管理员自举已退役（不再 fail-fast）', () => {
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

  it('TC-FF-01: 生产环境缺 ADMIN_QQ 且无管理员 → 不抛错（进入 setup 模式）', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ADMIN_QQ
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'admin_qq'").run()

    // REQ-038: 不再抛错，setup 模式由运行时守卫处理
    expect(() => initDatabase(db)).not.toThrow()
  })

  it('TC-FF-02: 生产环境缺 ADMIN_QQ 但已有管理员账号 → 不抛错（重启场景）', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ADMIN_QQ
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
