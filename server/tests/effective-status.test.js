import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { buildApp } from '../src/app.js'

describe('#54 公开 API effectiveStatus 字段', () => {
  let app

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
  })

  it('TC-54-01: open + 额度耗尽 → effectiveStatus=full', async () => {
    const artist = seedArtist({ subdomain: 'quota-full', status: 'open' })
    db.prepare('UPDATE artists SET monthly_quota = 1 WHERE id = ?').run(artist.id)
    seedOrder(artist.id, { status: 'pending', queue_zone: 'formal' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/artists/quota-full'
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('open')
    expect(body.effectiveStatus).toBe('full')
    expect(body.slotDisplay).toBe('本月已约满')
  })

  it('TC-54-02: open + 额度充足 → effectiveStatus=open', async () => {
    const artist = seedArtist({ subdomain: 'quota-ok', status: 'open' })
    db.prepare('UPDATE artists SET monthly_quota = 5 WHERE id = ?').run(artist.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artists/quota-ok'
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.effectiveStatus).toBe('open')
  })

  it('TC-54-03: full 状态 → effectiveStatus=full（原样透传）', async () => {
    seedArtist({ subdomain: 'manual-full', status: 'full' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/artists/manual-full'
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().effectiveStatus).toBe('full')
  })

  it('TC-54-04: break 状态 → effectiveStatus=break', async () => {
    seedArtist({ subdomain: 'on-break', status: 'break' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/artists/on-break'
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().effectiveStatus).toBe('break')
  })

  it('TC-54-05: 无额度配置 → effectiveStatus=status 原样', async () => {
    seedArtist({ subdomain: 'no-quota', status: 'open' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/artists/no-quota'
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().effectiveStatus).toBe('open')
  })
})
