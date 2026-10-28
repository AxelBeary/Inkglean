import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as orderService from '../src/features/order/order.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import type { FastifyInstance } from 'fastify'

// 队列行必须带当前流程节点名：看板/时间条用它渲染状态标签，
// 此前只下发 currentStageId，标签渲染成空白胶囊（issue #69）

interface QueueRow {
  id: number
  currentStageId: number | null
  currentStageName: string | null
}

describe('GET /api/artist/queue 流程节点名', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let token: string
  let firstStage: { id: number; name: string }

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
    seedArtistStages(artist.id)
    firstStage = db.prepare(
      'SELECT id, name FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
    ).get(artist.id) as { id: number; name: string }
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  async function getQueue(zone?: string): Promise<QueueRow[]> {
    const res = await app.inject({
      method: 'GET',
      url: zone ? `/api/artist/queue?zone=${zone}` : '/api/artist/queue',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    return res.json() as QueueRow[]
  }

  it('正式区：行内下发 currentStageName', async () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const rows = await getQueue()
    const row = rows.find(r => r.id === order.id)
    expect(row).toBeTruthy()
    expect(row!.currentStageId).toBe(firstStage.id)
    expect(row!.currentStageName).toBe(firstStage.name)
  })

  it('缓冲区：行内下发 currentStageName', async () => {
    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source,
                          queue_position, queue_zone, current_stage_id)
      VALUES ('ALICE-BUF', ?, '222', 'medium', 'pending', 'self', 1, 'buffer', ?)
    `).run(artist.id, firstStage.id)
    const rows = await getQueue('buffer')
    const row = rows.find(r => r.id === Number(result.lastInsertRowid))
    expect(row).toBeTruthy()
    expect(row!.currentStageName).toBe(firstStage.name)
  })

  it('完成区：行内下发 currentStageName', async () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '333' })
    for (const status of ['confirmed', 'wip', 'done', 'delivered'] as const) {
      orderService.updateOrderStatus(order.id, status)
    }
    const rows = await getQueue('completed')
    const row = rows.find(r => r.id === order.id)
    expect(row).toBeTruthy()
    expect(row!.currentStageName).toBe(firstStage.name)
  })
})
