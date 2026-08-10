import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * audit-batch-b P2-12：下单参考图存在性校验 + 字段长度上限
 * 客户 A 不能挂客户 B 上传的文件——存在性校验是当前归属校验的最小替代
 */

/** 在测试 uploads 目录造一个真实参考图文件 */
function createReferenceFile(relPath) {
  const abs = join(process.env.UPLOAD_DIR, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'fake-image')
  return relPath
}

describe('audit-batch-b P2-12 参考图存在性校验', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-P2-12-01: 客户下单引用不存在的参考图 → 400 ILLEGAL_PATH 且不落库', async () => {
    seedArtist({ qq_number: '88001', subdomain: 'p212-client' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'p212-client', clientQq: '123456', agreeRules: true, references: ['references/nope.png'] }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
    expect(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c).toBe(0)
  })

  it('TC-P2-12-02: 客户下单引用真实存在的参考图 → 200 且订单带参考图', async () => {
    seedArtist({ qq_number: '88002', subdomain: 'p212-ok' })
    // F-10（P2-13 后端侧）: references 非空需 x-anon-token；未登记存量路径放行（存在性校验兜底）
    const anon = await app.inject({ method: 'POST', url: '/api/anon-token' })
    const ref = createReferenceFile('references/p2-12-ok.png')
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-anon-token': anon.json().token },
      payload: { subdomain: 'p212-ok', clientQq: '123456', agreeRules: true, references: [ref] }
    })
    expect(res.statusCode).toBe(200)
    const refRow = db.prepare('SELECT file_path FROM order_references').get()
    expect(refRow.file_path).toBe(ref)
  })

  it('TC-P2-12-03: 手动录单——不存在被拒 / 真实路径通过', async () => {
    const artist = seedArtist({ qq_number: '88003', subdomain: 'p212-manual' })
    const auth = { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }

    const bad = await app.inject({
      method: 'POST', url: '/api/artist/orders/manual', headers: auth,
      payload: { clientQq: '123456', references: ['references/missing.png'] }
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().code).toBe('ILLEGAL_PATH')

    const ref = createReferenceFile('references/manual.png')
    const ok = await app.inject({
      method: 'POST', url: '/api/artist/orders/manual', headers: auth,
      payload: { clientQq: '123456', references: [ref] }
    })
    expect(ok.statusCode).toBe(200)
  })

  it('TC-P2-12-04: 画师追加参考图——不存在被拒 / 真实存在通过', async () => {
    const artist = seedArtist({ qq_number: '88004', subdomain: 'p212-addref' })
    const order = seedOrder(artist.id, { order_no: 'P212-ADD' })
    const auth = { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }

    const bad = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/references`, headers: auth,
      payload: { filePath: 'references/not-there.png' }
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().code).toBe('ILLEGAL_PATH')

    const ref = createReferenceFile('references/addref.png')
    const ok = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/references`, headers: auth,
      payload: { filePath: ref }
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().references.some(r => r.file_path === ref)).toBe(true)
  })

  it('TC-P2-12-05: schema 限制——references 单条超 2000 字符 → 400', async () => {
    seedArtist({ qq_number: '88005', subdomain: 'p212-len' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'p212-len', clientQq: '123456', agreeRules: true, references: ['references/' + 'a'.repeat(2000)] }
    })
    expect(res.statusCode).toBe(400)
  })
})
