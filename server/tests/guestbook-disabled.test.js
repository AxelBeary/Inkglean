import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'

// 820-L 需求一：留言功能画师手动关闭（关闭=客户主页隐藏+暂停接收，历史留言不删）
describe('留言功能开关 (Guestbook Enabled)', () => {
  let app
  let artist
  let token
  let approvedId

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist({ qq_number: '89001', subdomain: 'gb-switch', name: '留言开关画师' })
    token = createSession(artist.id, artist.token_version)
    const msg = guestbookService.createMessage(artist.id, '路人', '历史留言')
    approvedId = guestbookService.approveMessage(artist.id, msg.id).id
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function profileGet() {
    return app.inject({
      method: 'GET',
      url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${token}` }
    })
  }

  function profilePut(payload) {
    return app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${token}` },
      payload
    })
  }

  function publicMessages() {
    return app.inject({ method: 'GET', url: '/api/public/artist/gb-switch/messages' })
  }

  function publicPost() {
    return app.inject({
      method: 'POST',
      url: '/api/public/artist/gb-switch/messages',
      payload: { nickname: '新人', content: '还能留言吗' }
    })
  }

  it('TC-GBD-01: profile GET/PUT 回显 guestbookEnabled（默认 true，PUT false 生效）', async () => {
    const before = await profileGet()
    expect(before.statusCode).toBe(200)
    expect(before.json().guestbookEnabled).toBe(true)

    const put = await profilePut({ guestbookEnabled: false })
    expect(put.statusCode).toBe(200)
    expect(put.json().guestbook_enabled).toBe(0)

    const after = await profileGet()
    expect(after.json().guestbookEnabled).toBe(false)
  })

  it('TC-GBD-02: 关闭后公开主页隐藏（guestbookEnabled=false），重新打开恢复', async () => {
    await profilePut({ guestbookEnabled: false })
    const hidden = await app.inject({ method: 'GET', url: '/api/artists/gb-switch' })
    expect(hidden.statusCode).toBe(200)
    expect(hidden.json().guestbookEnabled).toBe(false)

    await profilePut({ guestbookEnabled: true })
    const shown = await app.inject({ method: 'GET', url: '/api/artists/gb-switch' })
    expect(shown.json().guestbookEnabled).toBe(true)
  })

  it('TC-GBD-03: 关闭后公开读接口返回空（历史留言不暴露），画师端仍可读历史', async () => {
    await profilePut({ guestbookEnabled: false })
    const res = await publicMessages()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ messages: [], total: 0, page: 1, pageSize: 20 })

    // 画师后台数据不受影响（重开后能继续管理）
    const mine = await app.inject({
      method: 'GET',
      url: '/api/artist/messages',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(mine.statusCode).toBe(200)
    expect(mine.json().total).toBe(1)
    expect(mine.json().items[0].id).toBe(approvedId)
  })

  it('TC-GBD-04: 关闭后客户无法提交留言（403 GUESTBOOK_DISABLED）', async () => {
    await profilePut({ guestbookEnabled: false })
    const res = await publicPost()
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('GUESTBOOK_DISABLED')
    expect(guestbookService.getArtistMessages(artist.id).total).toBe(1)
  })

  it('TC-GBD-05: 重新打开后读接口恢复且可正常提交', async () => {
    await profilePut({ guestbookEnabled: false })
    await profilePut({ guestbookEnabled: true })

    const read = await publicMessages()
    expect(read.json().total).toBe(1)
    expect(read.json().messages[0].id).toBe(approvedId)

    const post = await publicPost()
    expect(post.statusCode).toBe(201)
    expect(guestbookService.getArtistMessages(artist.id).total).toBe(2)
  })

  it('TC-GBD-06: 非法 guestbookEnabled 类型被 schema 拒（400）', async () => {
    const res = await profilePut({ guestbookEnabled: 'yes' })
    expect(res.statusCode).toBe(400)
  })
})
