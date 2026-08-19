// P2-F8: 交付前文件存在性校验
// 服务层：不存在路径 → MISSING_FILE，订单不被推 delivered，不落交付行
// 路由层：POST /deliver 不存在路径 → 400 MISSING_FILE；真实文件 → 200 delivered
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow } from './setup.js'
import { deliverOrder } from '../src/features/order/order-gallery.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

function ensureDeliverable(artistId: number, relName: string) {
  const absDir = join(process.env.UPLOAD_DIR as string, 'deliverables', String(artistId))
  mkdirSync(absDir, { recursive: true })
  writeFileSync(join(absDir, relName), 'p2-f8 file')
  return `deliverables/${artistId}/${relName}`
}

describe('P2-F8 交付文件存在性校验', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88120', subdomain: 'f8-deliver' })
  })

  it('服务层：不存在的路径抛 MISSING_FILE，订单状态不变、无交付行', () => {
    const order = seedOrder(artist.id, { status: 'wip' })

    expect(() => {
      deliverOrder(order.id, `deliverables/${artist.id}/ghost.png`, 'ghost.png', 1)
    }).toThrow('MISSING_FILE')

    const after = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id) as { status: string }
    expect(after.status).toBe('wip')
    const files = db.prepare('SELECT COUNT(*) AS c FROM deliverables WHERE order_id = ?').get(order.id) as { c: number }
    expect(files.c).toBe(0)
  })

  it('路由层：提交不存在路径 → 400 MISSING_FILE，不推 delivered', async () => {
    const app = await buildApp({ logger: false })
    const order = seedOrder(artist.id, { status: 'wip' })
    const token = createSession(artist.id, artist.token_version)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/deliver`,
      headers: { Authorization: 'Bearer ' + token },
      payload: {
        filePath: `deliverables/${artist.id}/not-there.png`,
        fileName: 'not-there.png',
        fileSize: 1
      }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MISSING_FILE')

    const after = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id) as { status: string }
    expect(after.status).toBe('wip')
    await app.close()
  })

  it('路由层：真实存在的文件交付成功', async () => {
    const app = await buildApp({ logger: false })
    const order = seedOrder(artist.id, { status: 'wip' })
    const token = createSession(artist.id, artist.token_version)
    const filePath = ensureDeliverable(artist.id, 'real.png')

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/deliver`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { filePath, fileName: 'real.png', fileSize: 13 }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('delivered')
    expect(res.json().statusChanged).toBe(true)
    await app.close()
  })
})
