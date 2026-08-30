// ============================================
// 260830 审计 H-3：画师自助设备管理端点回归
// 背景：桌面设备账本（v73）此前只有管理员可读/可撕，画师本人无任何入口；
// 本组用例锁定「自治踢设备」契约：只看本人账目 / 敏感列剔除 / 未命中 404 同管理员口径
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { registerDesktopDevice } from '../src/features/auth/devices.service.js'
import { buildApp } from '../src/app.js'

/** 清单条目契约视图（字段以 DesktopDeviceRow 实际列为准，去掉敏感列） */
interface DeviceListItem {
  id: number
  device_name: string | null
  last_active_at: string
  expires_at: string
  created_at: string
  login_ip: string | null
}

describe('画师自助设备管理（260830 审计 H-3）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let token: string

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist()
    token = createSession(artist.id, artist.token_version)
  })

  it('TC-AD-01: 未登录访问两端点 → 401（门禁先行）', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/artist/devices' })
    expect(list.statusCode).toBe(401)
    const del = await app.inject({ method: 'DELETE', url: '/api/artist/devices/1' })
    expect(del.statusCode).toBe(401)
  })

  it('TC-AD-02: 清单只含本人设备 + 按最近活跃倒序 + 契约字段齐、敏感列剔除', async () => {
    // 本人两台设备（活跃时间错开，验证倒序）
    registerDesktopDevice(artist.id, 'aaaa-device-uuid', '旧电脑', '1.1.1.1')
    const newer = registerDesktopDevice(artist.id, 'bbbb-device-uuid', '画图机', '2.2.2.2')
    db.prepare('UPDATE desktop_devices SET last_active_at = ? WHERE id = ?')
      .run(new Date(Date.now() + 60_000).toISOString(), newer.id)
    // 他人设备——绝不可见（H-3 权限缺口的核心防线）
    const other = seedArtist({ qq_number: '54321', subdomain: 'bob' })
    registerDesktopDevice(other.id, 'cccc-device-uuid', '别人的设备', '3.3.3.3')

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/devices',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    const { devices } = res.json() as { devices: Array<Record<string, unknown>> }
    expect(devices).toHaveLength(2)
    // 最近活跃倒序
    expect(devices[0].device_name).toBe('画图机')
    expect(devices[1].device_name).toBe('旧电脑')
    // 契约字段逐一核对；敏感列（artist_id 冗余 / device_uuid 设备指纹）不下发
    for (const d of devices) {
      expect(typeof d.id).toBe('number')
      expect('device_name' in d).toBe(true)
      expect('last_active_at' in d).toBe(true)
      expect('expires_at' in d).toBe(true)
      expect('created_at' in d).toBe(true)
      expect('login_ip' in d).toBe(true)
      expect('artist_id' in d).toBe(false)
      expect('device_uuid' in d).toBe(false)
    }
    expect(devices[0].login_ip).toBe('2.2.2.2')
  })

  it('TC-AD-03: 踢出本人设备 → { success: true } 且账本撕账（被踢设备会话即失效）', async () => {
    const device = registerDesktopDevice(artist.id, 'aaaa-device-uuid', '画图机', '1.1.1.1')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/artist/devices/${device.id}`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })

    // 账本确实撕掉
    const rows = db.prepare('SELECT id FROM desktop_devices WHERE artist_id = ?').all(artist.id)
    expect(rows).toHaveLength(0)

    // 重复踢 = 未命中 → 404 同管理员口径
    const again = await app.inject({
      method: 'DELETE',
      url: `/api/artist/devices/${device.id}`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(again.statusCode).toBe(404)
    expect(again.json()).toEqual({ error: '设备不存在或已被移除' })
  })

  it('TC-AD-04: 踢他人设备 / 不存在的设备 → 404，且他人账本不受影响（无越权撕账）', async () => {
    const other = seedArtist({ qq_number: '54321', subdomain: 'bob' })
    const otherDevice = registerDesktopDevice(other.id, 'cccc-device-uuid', '别人的设备', '3.3.3.3')

    // 用本人身份踢他人设备：artistId 一律取 request.artist.id，跨画师不可命中
    const cross = await app.inject({
      method: 'DELETE',
      url: `/api/artist/devices/${otherDevice.id}`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(cross.statusCode).toBe(404)
    expect(cross.json()).toEqual({ error: '设备不存在或已被移除' })
    // 他人账本完好
    const rows = db.prepare('SELECT id FROM desktop_devices WHERE artist_id = ?').all(other.id)
    expect(rows).toHaveLength(1)

    // 不存在的 id 同样 404
    const ghost = await app.inject({
      method: 'DELETE',
      url: '/api/artist/devices/999999',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(ghost.statusCode).toBe(404)
  })

  it('TC-AD-05: deviceId 非整数 → 400 校验拒绝（schema 先行）', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/artist/devices/abc',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-AD-06: 空账本清单 → { devices: [] }（新画师无桌面登录记录）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/devices',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ devices: [] })
    // 契约形状保持（devices 恒为数组，前端无需判空）
    const body = res.json() as { devices: DeviceListItem[] }
    expect(Array.isArray(body.devices)).toBe(true)
  })
})
