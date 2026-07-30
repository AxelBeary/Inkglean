import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { bumpTokenVersion } from '../src/features/artist/artist.service.js'
import { createSession, verifySession } from '../src/features/auth/auth.service.js'

describe('bumpTokenVersion 令牌版本递增', () => {
  beforeEach(() => {
    cleanDb()
  })

  // TC-T-01: 版本号递增（1→2→3）
  it('TC-T-01: 连续调用递增 token_version', () => {
    const artist = seedArtist()
    expect(artist.token_version).toBe(1)

    bumpTokenVersion(artist.id)
    let row = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id)
    expect(row.token_version).toBe(2)

    bumpTokenVersion(artist.id)
    row = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id)
    expect(row.token_version).toBe(3)
  })

  // TC-T-02: bump 后旧 token 的 v 与 DB 不匹配（模拟中间件校验逻辑）
  it('TC-T-02: bump 后旧 token 版本号不匹配', () => {
    const artist = seedArtist()
    // 登录时签发 token，v = 当前 token_version
    const token = createSession(artist.id, artist.token_version)
    const session = verifySession(token)
    expect(session.v).toBe(1)

    // 递增
    bumpTokenVersion(artist.id)
    const fresh = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id)

    // 中间件逻辑：session.v !== artist.token_version → TOKEN_REVOKED
    expect(session.v).not.toBe(fresh.token_version)
  })

  // TC-T-03: bump 后用新 version 签发的 token 匹配
  it('TC-T-03: bump 后新 token 版本号匹配', () => {
    const artist = seedArtist()
    bumpTokenVersion(artist.id)

    const fresh = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id)
    const token = createSession(artist.id, fresh.token_version)
    const session = verifySession(token)

    expect(session.v).toBe(fresh.token_version)
  })

  // TC-T-04: token_version 为 NULL 时 COALESCE 兜底
  it('TC-T-04: NULL token_version 兜底为 1 再递增到 2', () => {
    const artist = seedArtist()
    db.prepare('UPDATE artists SET token_version = NULL WHERE id = ?').run(artist.id)

    bumpTokenVersion(artist.id)

    const row = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id)
    // COALESCE(NULL, 1) + 1 = 2
    expect(row.token_version).toBe(2)
  })

  // TC-T-05: 对不存在的 id 不报错
  it('TC-T-05: 不存在的 artistId 静默通过', () => {
    expect(() => bumpTokenVersion(99999)).not.toThrow()
  })

  // TC-T-06: 并发安全（SQLite 串行写，连续 10 次递增结果正确）
  it('TC-T-06: 连续 10 次递增结果正确', () => {
    const artist = seedArtist()

    for (let i = 0; i < 10; i++) {
      bumpTokenVersion(artist.id)
    }

    const row = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id)
    expect(row.token_version).toBe(11) // 1 + 10
  })

  // TC-T-07: 只影响目标画师，不影响其他画师
  it('TC-T-07: 不影响其他画师的 token_version', () => {
    const a1 = seedArtist({ qq_number: '111', subdomain: 'aaa' })
    const a2 = seedArtist({ qq_number: '222', subdomain: 'bbb' })

    bumpTokenVersion(a1.id)

    const row1 = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(a1.id)
    const row2 = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(a2.id)
    expect(row1.token_version).toBe(2)
    expect(row2.token_version).toBe(1) // 未变
  })
})
