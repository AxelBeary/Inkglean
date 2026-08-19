import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'

describe('U1 track 接口透出需求描述与参考图', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function makeArtist(qq: string = '88001', sub: string = 'track-refs') {
    return seedArtist({ qq_number: qq, subdomain: sub })
  }

  function addReference(orderId: number, filePath: string, source: string, originalName: string) {
    db.prepare(
      'INSERT INTO order_references (order_id, file_path, original_name, source) VALUES (?, ?, ?, ?)'
    ).run(orderId, filePath, originalName || null, source)
  }

  // ─── 1. 带需求 + 参考图 ───

  it('TC-TR-01: track 响应含 description + references 仅 client 参考图', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'TEST-TR01',
      client_qq: '99001',
      description: '想要一张星空主题的立绘'
    })

    // 1 条客户参考图 + 1 条画师参考图
    addReference(order.id, 'references/client-star.png', 'client', '客户参考图.png')
    addReference(order.id, 'references/artist-sheet.png', 'artist', '画师草图.png')

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/TEST-TR01?token=${order.customerToken}`
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.description).toBe('想要一张星空主题的立绘')
    expect(body.references).toHaveLength(1)
    expect(body.references[0].url).toMatch(/^\/uploads\/references\/client-star\.png\?sig=/)
    expect(body.references[0].originalName).toBe('客户参考图.png')

    // 画师参考图不出现
    expect(JSON.stringify(body)).not.toContain('artist-sheet')
    expect(JSON.stringify(body)).not.toContain('画师草图')
  })

  // ─── 2. 无需求订单 ───

  it('TC-TR-02: 无需求订单 → description null + references 空数组', async () => {
    const artist = makeArtist('88002', 'track-refs2')
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'TEST-TR02',
      client_qq: '99002'
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/TEST-TR02?token=${order.customerToken}`
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.description).toBeNull()
    expect(body.references).toEqual([])
  })
})
