// B1 缺陷④回归：verify-current 成功分支曾不清 artists.totp_failed_attempts —— DB 计数只增不减，
// 历史错码 4 次后即使正确码通过，下一次错码也会直接把账号锁 15 分钟。
// 断言面：成功即清零（计数 0 / locked_until NULL），成功后仅错一次仍在计数态（401 而非 429）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession, bindTotpInit, confirmTotpBind, TOTP_MAX_ATTEMPTS } from '../src/features/auth/auth.service.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

/** 账号级防爆破计数面 */
interface TotpCounterRow {
  totp_failed_attempts: number
  totp_locked_until: number | null
}

describe('B1: verify-current 成功清零 TOTP 失败计数', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let secret: string
  let headers: { Authorization: string }

  function counter(): TotpCounterRow {
    return db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?')
      .get(artist.id) as TotpCounterRow
  }

  function verifyCurrent(code: string) {
    return app.inject({ method: 'POST', url: '/api/auth/totp/verify-current', headers, payload: { code } })
  }

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    artist = seedArtist({ qq_number: '88060', subdomain: 'b1-totp' })
    secret = generateSecret()
    bindTotpInit(artist.id, secret)
    confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    headers = { Authorization: 'Bearer ' + createSession(artist.id, artist.token_version) }
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => { await app.close() })

  it('TC-B1-03: 已错 4 次后成功 → 计数清零，随后再错一次只计数不锁', async () => {
    // 造「已达阈值前一步」的账号级计数（历史错码累计）
    db.prepare('UPDATE artists SET totp_failed_attempts = ? WHERE id = ?').run(TOTP_MAX_ATTEMPTS - 1, artist.id)

    const right = computeTotp(secret, Date.now())
    const ok = await verifyCurrent(right)
    expect(ok.statusCode).toBe(200)
    expect(counter().totp_failed_attempts).toBe(0)
    expect(counter().totp_locked_until).toBeNull()

    // 修前：计数仍停在 4，再错一次即达阈值 → 429 TOTP_LOCKED
    const wrong = String((parseInt(right, 10) + 1) % 1000000).padStart(6, '0')
    const bad = await verifyCurrent(wrong)
    expect(bad.statusCode).toBe(401)
    expect(bad.json().code).toBe('TOTP_INVALID')
    expect(counter().totp_failed_attempts).toBe(1)
    expect(counter().totp_locked_until).toBeNull()
  })
})
