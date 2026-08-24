// REQ-014 安全口径一（方案 A 服务器记账式会话，v73）：
// 桌面 token 类型 + 设备账本（登录=记账 / 踢人=撕账 / 顺延=改账 / 设备清单=同账）
// 覆盖：桌面登录全链路 / 改账不重复记账 / 管理端读账撕账 / 过期拒绝 / 活跃自动顺延 /
//       记账节流 / 全端踢人撕账联动 / 防爆破语义对齐网页 / 契约护栏 / step-up 守卫
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession, verifySession } from '../src/features/auth/auth.service.js'
import { registerDesktopDevice, DESKTOP_SESSION_DAYS } from '../src/features/auth/devices.service.js'
import { bumpTokenVersion } from '../src/features/artist/artist.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { buildApp } from '../src/app.js'

/** 种子画师占位密钥（与 setup.ts ARTIST_DEFAULTS 同款，已绑定态） */
const SEED_SECRET = 'JBSWY3DPEHPK3PXP'
/** 测试用设备标识（符合路由 schema：8~64 位十六进制+连字符） */
const DEVICE_UUID = '11112222-3333-4444-5555-666677778888'

/** 桌面设备账本行（测试只取断言所需列） */
interface DeviceRow {
  id: number
  artist_id: number
  device_uuid: string
  expires_at: string
  last_active_at: string
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('桌面端记账式会话 (REQ-014 安全口径一, v73)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 管理员（step-up 升级会话，30 分钟窗口内）+ 行内画师 */
  function setupAdmin(qq: string = '10001') {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    const admin = seedArtist({ qq_number: qq, subdomain: 'admin-desktop' })
    return { admin, token: createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: new Date().toISOString() }) }
  }

  /** 桌面登录（默认：种子画师 12345 + 当前动态码 + 固定设备），返回响应 */
  function desktopLogin(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/desktop/login',
      payload: {
        qqNumber: '12345',
        code: computeTotp(SEED_SECRET, Date.now()),
        deviceUuid: DEVICE_UUID,
        deviceName: '测试画图机',
        ...overrides
      }
    })
  }

  /** 读画师全部桌面账目 */
  function deviceRows(artistId: number): DeviceRow[] {
    return db.prepare('SELECT id, artist_id, device_uuid, expires_at, last_active_at FROM desktop_devices WHERE artist_id = ?')
      .all(artistId) as DeviceRow[]
  }

  it('TC-DS-01: 全链路 — TOTP 登录→记账→下发 Bearer token→门禁放行→登录留痕', async () => {
    const artist = seedArtist()

    const res = await desktopLogin()
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.token).toBe('string')
    expect(body.artist.id).toBe(artist.id)
    // 过期时间 ≈ 90 天（登录一次管三个月）
    const expiresInDays = (new Date(body.expiresAt).getTime() - Date.now()) / DAY_MS
    expect(expiresInDays).toBeGreaterThan(DESKTOP_SESSION_DAYS - 1)
    expect(expiresInDays).toBeLessThanOrEqual(DESKTOP_SESSION_DAYS)
    // 桌面登录不下发 cookie（凭证只走 Bearer，客户端存系统保险箱）
    expect(res.headers['set-cookie']).toBeFalsy()

    // 记账：账本恰好一行
    const rows = deviceRows(artist.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].device_uuid).toBe(DEVICE_UUID)

    // token 是桌面类型且绑定账本行
    const session = verifySession(body.token)
    expect(session?.client).toBe('desktop')
    expect(session?.device_id).toBe(rows[0].id)

    // Bearer 过门禁
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${body.token}` } })
    expect(me.statusCode).toBe(200)

    // 登录留痕复用：桌面登录同样刷新上次登录时间（仅管理后台可见）
    const fresh = db.prepare('SELECT last_login_at FROM artists WHERE id = ?').get(artist.id) as { last_login_at: string | null }
    expect(fresh.last_login_at).toBeTruthy()
  })

  it('TC-DS-02: 同设备重登录 = 改账（刷新过期时间），不重复记账', () => {
    const artist = seedArtist()
    const first = registerDesktopDevice(artist.id, DEVICE_UUID, '画图机', '1.1.1.1')
    // 改账：把过期时间拨到 10 天后，模拟「账快到期时重登」
    db.prepare('UPDATE desktop_devices SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() + 10 * DAY_MS).toISOString(), first.id)

    const second = registerDesktopDevice(artist.id, DEVICE_UUID, '画图机-改名', '2.2.2.2')
    const rows = deviceRows(artist.id)
    expect(rows).toHaveLength(1) // 不重复记账
    expect(second.id).toBe(first.id) // 同一账目
    // 过期时间刷新回 90 天
    const expiresInDays = (new Date(second.expires_at).getTime() - Date.now()) / DAY_MS
    expect(expiresInDays).toBeGreaterThan(89)
  })

  it('TC-DS-03: 管理端读账 + 撕账踢人 — 被踢设备下次请求即被拒（DEVICE_REVOKED）', async () => {
    const { token } = setupAdmin()
    const artist = seedArtist()
    const loginRes = await desktopLogin()
    expect(loginRes.statusCode).toBe(200)
    const desktopToken = loginRes.json().token as string

    // 读账：清单含该设备
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${artist.id}/devices`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(listRes.statusCode).toBe(200)
    const list = listRes.json() as DeviceRow[]
    expect(list).toHaveLength(1)
    expect(list[0].device_uuid).toBe(DEVICE_UUID)

    // 撕账：单台踢出
    const kickRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${artist.id}/devices/${list[0].id}`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(kickRes.statusCode).toBe(200)
    expect(deviceRows(artist.id)).toHaveLength(0)

    // 被踢后：桌面 token 立即失效
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${desktopToken}` } })
    expect(me.statusCode).toBe(401)
    expect(me.json().code).toBe('DEVICE_REVOKED')

    // 重复踢 = 账已不存在 → 404
    const again = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${artist.id}/devices/${list[0].id}`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(again.statusCode).toBe(404)
  })

  it('TC-DS-04: 账目过期（停止活跃超 90 天）→ SESSION_EXPIRED', async () => {
    const artist = seedArtist()
    const loginRes = await desktopLogin()
    const desktopToken = loginRes.json().token as string

    // 拨账：过期时间改到昨天
    db.prepare('UPDATE desktop_devices SET expires_at = ? WHERE artist_id = ?')
      .run(new Date(Date.now() - DAY_MS).toISOString(), artist.id)

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${desktopToken}` } })
    expect(me.statusCode).toBe(401)
    expect(me.json().code).toBe('SESSION_EXPIRED')
  })

  it('TC-DS-05: 距过期不足 7 天且活跃 → 自动顺延至 90 天（每周活跃即自动顺延）', async () => {
    const artist = seedArtist()
    const loginRes = await desktopLogin()
    const desktopToken = loginRes.json().token as string

    // 拨账：3 天后过期 + 上次活跃在 2 小时前（越过记账节流窗口）
    db.prepare('UPDATE desktop_devices SET expires_at = ?, last_active_at = ? WHERE artist_id = ?')
      .run(
        new Date(Date.now() + 3 * DAY_MS).toISOString(),
        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        artist.id
      )

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${desktopToken}` } })
    expect(me.statusCode).toBe(200)

    const rows = deviceRows(artist.id)
    const expiresInDays = (new Date(rows[0].expires_at).getTime() - Date.now()) / DAY_MS
    expect(expiresInDays).toBeGreaterThan(89) // 顺延回 90 天
  })

  it('TC-DS-06: 活跃记账节流 — 距上次活跃不足 1 小时且无需顺延时不写库', async () => {
    const artist = seedArtist()
    const loginRes = await desktopLogin()
    const desktopToken = loginRes.json().token as string

    const before = deviceRows(artist.id)[0].last_active_at
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${desktopToken}` } })
    expect(me.statusCode).toBe(200)

    // 登录刚记账（<1 小时）且账目新鲜（无需顺延）→ last_active_at 原样
    expect(deviceRows(artist.id)[0].last_active_at).toBe(before)
  })

  it('TC-DS-07: 全端踢人（bumpTokenVersion）= 撕光桌面账本，桌面 token 立即失效', async () => {
    const artist = seedArtist()
    const loginRes = await desktopLogin()
    const desktopToken = loginRes.json().token as string
    expect(deviceRows(artist.id)).toHaveLength(1)

    bumpTokenVersion(artist.id)
    expect(deviceRows(artist.id)).toHaveLength(0) // 撕光，不留活账

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${desktopToken}` } })
    expect(me.statusCode).toBe(401)
  })

  it('TC-DS-08: 防爆破语义与网页登录一致 — 错误动态码被拒', async () => {
    seedArtist()
    const res = await desktopLogin({ code: '000000' })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('TOTP_INVALID')
    expect(deviceRows(1)).toHaveLength(0) // 失败不记账
  })

  it('TC-DS-09: 契约护栏 — client=desktop 必须携带账本行 id', () => {
    const artist = seedArtist()
    expect(() => createSession(artist.id, artist.token_version, { client: 'desktop' })).toThrow()
    // 网页会话不携带桌面字段（旧语义不变）
    const webToken = createSession(artist.id, artist.token_version)
    const session = verifySession(webToken)
    expect(session?.client).toBeUndefined()
    expect(session?.device_id).toBeUndefined()
  })

  it('TC-DS-10: 设备管理路由受 step-up 守卫（未升级管理员被拒）', async () => {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-desktop' })
    const plainToken = createSession(admin.id, admin.token_version) // 未 step-up
    const artist = seedArtist()

    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${artist.id}/devices`,
      headers: { Authorization: `Bearer ${plainToken}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('STEP_UP_REQUIRED')
  })
})
