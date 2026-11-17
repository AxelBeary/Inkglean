import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import { addPreview, updatePreview, updatePreviewSettings } from '../src/features/order/order-gallery.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

// ============================================
// 客户侧签名续签（POST /api/orders/track/:orderNo/refresh-signatures）
// 修「查单页停留 5 分钟后参考图/过程稿全部 403」：签名 TTL 见 shared/file-sign.ts FILE_TTL_MS，
// 查单页只在 onMounted 取一次数据 → 长停留必然裂图（画师侧早有 refresh-signatures，客户侧补齐）。
// 核心断言是「路径归属」：别单的图、画师隐藏的过程稿、画师私有参考图都不得续签。
// ============================================

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')

/** 落一张真实存在的过程稿图（addPreview 的路径校验要求文件真实存在） */
function ensurePreviewFile(artistId: number, name: string): string {
  const dir = join(UPLOAD_ROOT, 'previews', String(artistId))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), 'refresh-sig preview file')
  return `previews/${artistId}/${name}`
}

describe('客户侧签名续签（track refresh-signatures）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let order: SeededOrder

  beforeEach(async () => {
    cleanDb()
    // 同一 IP 的限流桶跨用例累计（20 次/5 分钟），不清会串味到后面的用例
    resetRateLimitBuckets()
    artist = seedArtist({ qq_number: '88077', subdomain: 'track-refresh' })
    order = seedOrder(artist.id, { order_no: 'TEST-RS01', status: 'wip' })
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function addReference(filePath: string, source = 'client') {
    db.prepare('INSERT INTO order_references (order_id, file_path, original_name, source) VALUES (?, ?, ?, ?)')
      .run(order.id, filePath, 'ref.png', source)
  }

  /** 调续签端点（默认用本单令牌/订单号） */
  function refresh(paths: string[], token: string = order.customerToken, orderNo: string = order.order_no) {
    return app.inject({
      method: 'POST',
      url: `/api/orders/track/${orderNo}/refresh-signatures`,
      payload: { token, paths }
    })
  }

  it('TC-RS-01: 本单参考图 + 已开启的过程稿 → 200 且逐条回签名 URL', async () => {
    addReference('references/client-a.png')
    const previewPath = ensurePreviewFile(artist.id, 'p1.png')
    addPreview(order.id, artist.id, previewPath, null)
    updatePreviewSettings(order.id, { previewVisibleToClient: true })

    const res = await refresh(['references/client-a.png', previewPath])
    expect(res.statusCode).toBe(200)
    const { urls } = res.json() as { urls: Record<string, string> }
    expect(Object.keys(urls).sort()).toEqual(['previews/' + artist.id + '/p1.png', 'references/client-a.png'].sort())
    expect(urls['references/client-a.png']).toMatch(/^\/uploads\/references\/client-a\.png\?sig=/)
    expect(urls[previewPath]).toMatch(/^\/uploads\/previews\/.+\?sig=/)
  })

  // v81 语义修订（debug 批 D1-High）：续签**不做整批原子**。一条已失效的路径
  // （画师刚关掉开关/刚删图/单图刚设为不可见）若让整批 400，同页其它仍有效的图
  // （尤其参考图）会一起停止续签，5 分钟后 403 且永不自愈。故失效路径静默略过。
  it('TC-RS-02: 画师关掉过程稿开关后，同一路径不再返回签名（200，路径进 skipped）', async () => {
    const previewPath = ensurePreviewFile(artist.id, 'p2.png')
    addPreview(order.id, artist.id, previewPath, null)
    updatePreviewSettings(order.id, { previewVisibleToClient: true })
    expect((await refresh([previewPath])).statusCode).toBe(200)

    updatePreviewSettings(order.id, { previewVisibleToClient: false })
    const res = await refresh([previewPath])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { urls: Record<string, string>, skipped?: string[] }
    expect(body.urls[previewPath]).toBeUndefined()
    expect(body.skipped).toContain(previewPath)
  })

  it('TC-RS-03: 单图 visible=0 的过程稿同样不返回签名', async () => {
    const previewPath = ensurePreviewFile(artist.id, 'p3.png')
    const previewId = addPreview(order.id, artist.id, previewPath, null)
    updatePreviewSettings(order.id, { previewVisibleToClient: true })
    updatePreview(order.id, previewId, { visible: false })

    const res = await refresh([previewPath])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { urls: Record<string, string>, skipped?: string[] }
    expect(body.urls[previewPath]).toBeUndefined()
    expect(body.skipped).toContain(previewPath)
  })

  it('TC-RS-04: 他人订单的路径不返回签名（本单未持有该行）', async () => {
    const other = seedOrder(artist.id, { order_no: 'TEST-RS02', status: 'wip' })
    db.prepare('INSERT INTO order_references (order_id, file_path, original_name, source) VALUES (?, ?, ?, ?)')
      .run(other.id, 'references/other-order.png', 'o.png', 'client')

    const res = await refresh(['references/other-order.png'])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { urls: Record<string, string>, skipped?: string[] }
    expect(body.urls['references/other-order.png']).toBeUndefined()
    expect(body.skipped).toContain('references/other-order.png')
  })

  it('TC-RS-09（D1-High 回归）: 一批里混入已失效过程稿，参考图仍拿到签名（不整批中毒）', async () => {
    const refPath = 'references/client-poison.png'
    addReference(refPath)
    const deadPreview = ensurePreviewFile(artist.id, 'p-poison.png')
    addPreview(order.id, artist.id, deadPreview, null)
    updatePreviewSettings(order.id, { previewVisibleToClient: true })
    expect((await refresh([refPath, deadPreview])).statusCode).toBe(200)

    // 画师关掉开关 —— 客户端此刻仍持有该预览路径（未刷新页面），下一轮续签名会带上它
    updatePreviewSettings(order.id, { previewVisibleToClient: false })
    const res = await refresh([refPath, deadPreview])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { urls: Record<string, string>, skipped?: string[] }
    expect(body.urls[refPath]).toMatch(/^\/uploads\/references\/client-poison\.png\?sig=/)
    expect(body.urls[deadPreview]).toBeUndefined()
    expect(body.skipped).toContain(deadPreview)
  })

  it('TC-RS-05: 含 .. 的路径 → 4xx（穿越一律先拒）', async () => {
    addReference('references/client-a.png')
    const res = await refresh(['references/../references/client-a.png'])
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
  })

  it('TC-RS-06: 令牌不符 → 404（不暴露订单存在性）', async () => {
    addReference('references/client-a.png')
    const res = await refresh(['references/client-a.png'], 'wrong-token')
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('ORDER_NOT_FOUND')
  })

  it('TC-RS-07: 画师私有参考图（source=artist）不给客户续签', async () => {
    addReference('references/artist-private.png', 'artist')
    const res = await refresh(['references/artist-private.png'])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { urls: Record<string, string>, skipped?: string[] }
    expect(body.urls['references/artist-private.png']).toBeUndefined()
    expect(body.skipped).toContain('references/artist-private.png')
  })

  it('TC-RS-08: paths 走 schema 边界（1..50 项）', async () => {
    addReference('references/client-a.png')
    // 空数组直接 400（schema minItems）
    const empty = await refresh([])
    expect(empty.statusCode).toBe(400)
    // 前端按 50 分片（composables/useSignatureRefresh.ts SIGNATURE_REFRESH_BATCH_SIZE），51 项超上限被拒
    const tooMany = await refresh(Array.from({ length: 51 }, () => 'references/client-a.png'))
    expect(tooMany.statusCode).toBe(400)
  })
})
