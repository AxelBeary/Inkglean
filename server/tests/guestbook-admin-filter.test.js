import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'
import { buildApp } from '../src/app.js'

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

describe('REQ-022 F5: GET /api/admin/messages 筛选参数', () => {
  let app
  let admin
  let artist
  let otherArtist

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
    admin = setAdmin('10001')
    artist = seedArtist({ qq_number: '88040', subdomain: 'gbf-a', name: '画师甲' })
    otherArtist = seedArtist({ qq_number: '88041', subdomain: 'gbf-b', name: '画师乙' })
    // 造数：artist 两条（approved+已回复 / pending 未回复），otherArtist 一条 rejected
    const m1 = guestbookService.createMessage(artist.id, '甲客', '好画')
    guestbookService.approveMessage(artist.id, m1.id)
    guestbookService.replyMessage(artist.id, m1.id, '多谢')
    guestbookService.createMessage(artist.id, '乙客', '排队中')
    const m3 = guestbookService.createMessage(otherArtist.id, '丙客', '广告')
    guestbookService.rejectMessage(otherArtist.id, m3.id)
  })

  function get(url) {
    return app.inject({
      method: 'GET',
      url,
      headers: { Authorization: `Bearer ${createSession(admin.id, admin.token_version)}` }
    })
  }

  it('TC-GBF-01: 无参数返回全部三条', async () => {
    const res = await get('/api/admin/messages')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(3)
  })

  it('TC-GBF-02: artistId 过滤只返回该画师留言', async () => {
    const res = await get(`/api/admin/messages?artistId=${artist.id}`)
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(2)
    expect(list.every(m => m.artist_id === artist.id)).toBe(true)
  })

  it('TC-GBF-03: 合法 status 过滤', async () => {
    const res = await get('/api/admin/messages?status=approved')
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].nickname).toBe('甲客')
  })

  it('TC-GBF-04: 非法 status 忽略（与全站惯例一致，返回全部）', async () => {
    const res = await get('/api/admin/messages?status=hacked')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(3)
  })

  it('TC-GBF-05: replied=1 只返回已回复 / replied=0 只返回未回复', async () => {
    const yes = await get('/api/admin/messages?replied=1')
    expect(yes.statusCode).toBe(200)
    const yesList = yes.json()
    expect(yesList).toHaveLength(1)
    expect(yesList[0].artist_reply).toBe('多谢')

    const no = await get('/api/admin/messages?replied=0')
    expect(no.json()).toHaveLength(2)
  })

  it('TC-GBF-06: 非数字 artistId 忽略（返回全部）', async () => {
    const res = await get('/api/admin/messages?artistId=abc')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(3)
  })

  it('TC-GBF-07: 组合参数 artistId + status + replied', async () => {
    const res = await get(`/api/admin/messages?artistId=${artist.id}&status=approved&replied=1`)
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].nickname).toBe('甲客')
  })

  it('TC-GBF-08: 非管理员访问返回 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/messages',
      headers: { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
    })
    expect(res.statusCode).toBe(403)
  })
})
