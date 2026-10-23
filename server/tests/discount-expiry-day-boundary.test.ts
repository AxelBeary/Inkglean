// 审计 #21 条目 9：折扣码过期按 UTC 零点比较，本地时区最后一天上午即失效
// 画师端日期选择器 value-format="YYYY-MM-DD" 只传日期串；new Date('YYYY-MM-DD') 走 UTC 解析，
// 在 UTC+8 下等于本地当天 08:00 失效。修复后纯日期串按「本地当天 23:59:59.999」判定
// （对齐公告过期 #8 拍板：到期日当天仍有效），完整时间戳维持精确比较，脏数据仍 fail-closed。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createDiscountCode, validateDiscountCode } from '../src/features/pricing/discount.service.js'

/** 本地日历日 + offset 天 → 'YYYY-MM-DD'（与选择器 value-format 同形） */
function localDateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

let codeSeq = 0
function makeCode(artist: ArtistRow, expiresAt: string | null): string {
  const code = `EXP${++codeSeq}`
  createDiscountCode(artist.id, { code, discountType: 'percent', discountValue: 10, expiresAt })
  return code
}

describe('折扣码过期按本地日判定（#21-9）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89660', subdomain: 'disc-expiry' })
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 假时钟固定在「到期日当天本地正午」——
  // 真时钟下若本机正好跑在凌晨，旧代码的 UTC 零点判定也不会过期，用例就失去鉴别力
  const EXPIRY_DAY = '2026-10-24'
  const NOON_ON_EXPIRY_DAY = new Date(2026, 9, 24, 12, 0, 0).getTime()

  it('TC-DEX-01: 到期日=今天且已过当地正午 → 当天仍然可用（改前 UTC 零点判定会在此时报过期）', () => {
    vi.useFakeTimers({ now: NOON_ON_EXPIRY_DAY })
    const code = makeCode(artist, EXPIRY_DAY)

    expect(validateDiscountCode(artist.id, code).expires_at).toBe(EXPIRY_DAY)
  })

  it('TC-DEX-02: 到期日当天的最后一分钟仍可用，跨到次日 00:30 即过期（不延后一天）', () => {
    // 用本地时刻构造，避免「UTC  instant 在 +8 已跨日」这类时区自溺
    vi.useFakeTimers({ now: new Date(2026, 9, 24, 23, 59, 0).getTime() })
    const code = makeCode(artist, EXPIRY_DAY)
    expect(validateDiscountCode(artist.id, code)).toBeTruthy()

    vi.setSystemTime(new Date(new Date(2026, 9, 25, 0, 30, 0).getTime()))
    expect(() => validateDiscountCode(artist.id, code)).toThrow('DISCOUNT_CODE_EXPIRED')
  })

  it('TC-DEX-03: 到期日=明天 → 可用', () => {
    const code = makeCode(artist, localDateStr(1))
    expect(validateDiscountCode(artist.id, code)).toBeTruthy()
  })

  it('TC-DEX-04: 到期日=昨天 → 已过期（不被放宽成「再过一天」）', () => {
    const code = makeCode(artist, localDateStr(-1))
    expect(() => validateDiscountCode(artist.id, code)).toThrow('DISCOUNT_CODE_EXPIRED')
  })

  it('TC-DEX-05: 完整时间戳维持精确比较（不受日期串归一影响）', () => {
    const past = makeCode(artist, '2020-01-01T00:00:00Z')
    expect(() => validateDiscountCode(artist.id, past)).toThrow('DISCOUNT_CODE_EXPIRED')

    const future = makeCode(artist, '2099-01-01T00:00:00Z')
    expect(validateDiscountCode(artist.id, future)).toBeTruthy()

    // 同一天内更早时刻的完整串照旧立即过期——「按日豁免」只给纯日期串
    vi.useFakeTimers({ now: NOON_ON_EXPIRY_DAY })
    const earlierToday = makeCode(artist, `${EXPIRY_DAY}T08:00:00`)
    expect(() => validateDiscountCode(artist.id, earlierToday)).toThrow('DISCOUNT_CODE_EXPIRED')
  })

  it('TC-DEX-06: 存量脏数据不可解析仍 fail-closed（P2-4 语义不变）', () => {
    db.prepare(`
      INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, expires_at, enabled)
      VALUES (?, 'DIRTYEXP', 'percent', 10, 'not-a-date', 1)
    `).run(artist.id)

    expect(() => validateDiscountCode(artist.id, 'DIRTYEXP')).toThrow('DISCOUNT_CODE_EXPIRED')
  })

  it('TC-DEX-07: 未设置过期日的折扣码不受影响（长期有效）', () => {
    const code = makeCode(artist, null)
    expect(validateDiscountCode(artist.id, code).expires_at).toBeNull()
  })
})
