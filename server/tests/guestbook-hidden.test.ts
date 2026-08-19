import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'

describe('留言板公开路由 hidden 画师检查', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
  })

  it('TC-GB-HID-01: hidden 画师 POST 留言返回 404', async () => {
    seedArtist({ qq_number: '88030', subdomain: 'hiddenartist', name: '隐藏画师', status: 'hidden' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/public/artist/hiddenartist/messages',
      payload: { nickname: '小明', content: '想留言' }
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-GB-HID-02: hidden 画师 GET 留言返回 404', async () => {
    seedArtist({ qq_number: '88031', subdomain: 'hiddenartist2', name: '隐藏画师2', status: 'hidden' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/public/artist/hiddenartist2/messages'
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-GB-HID-03: open 画师 POST 留言正常 201', async () => {
    seedArtist({ qq_number: '88032', subdomain: 'openartist', name: '开放画师', status: 'open' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/public/artist/openartist/messages',
      payload: { nickname: '小明', content: '画得真好' }
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toBeDefined()
  })

  it('TC-GB-HID-04: open 画师 GET 留言正常 200', async () => {
    const artist = seedArtist({ qq_number: '88033', subdomain: 'openartist2', name: '开放画师2', status: 'open' })
    // 插入一条 approved 留言
    db.prepare(
      "INSERT INTO guestbook_messages (artist_id, nickname, content, status) VALUES (?, '小红', '赞', 'approved')"
    ).run(artist.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/public/artist/openartist2/messages'
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(1)
    expect(body.messages[0].nickname).toBe('小红')
  })
})
