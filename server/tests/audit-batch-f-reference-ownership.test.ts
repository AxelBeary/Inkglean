import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

// ============================================
// 审计批 F-10（P2-13 后端侧）: 参考图归属凭据
// 迁移 v55 reference_uploads 登记表 + 上传登记 + 下单归属校验/绑定
// A token 上传的文件 B token 挂不上；绑定后不可二次使用；存量未登记路径放行
// ============================================

/** 构造 multipart/form-data 请求体（Buffer 拼装：d3 图片魔数校验要求真实文件头） */
function multipartBody(filename: string, contentType: string, content: Buffer | string): { boundary: string; body: Buffer } {
  const boundary = '----F10Boundary' + Date.now() + Math.random().toString(36).slice(2)
  const head = Buffer.from([
    '--' + boundary,
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"',
    'Content-Type: ' + contentType,
    ''
  ].join('\r\n') + '\r\n')
  const tail = Buffer.from('\r\n--' + boundary + '--')
  const mid = Buffer.isBuffer(content) ? content : Buffer.from(String(content))
  return { boundary, body: Buffer.concat([head, mid, tail]) }
}

/** 1x1 透明 PNG（真实魔数，过 d3 图片魔数校验） */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

async function uploadReference(app: FastifyInstance, anonToken: string | null) {
  const { boundary, body } = multipartBody('ref.png', 'image/png', PNG_1X1)
  const headers: Record<string, string> = { 'content-type': 'multipart/form-data; boundary=' + boundary }
  if (anonToken) headers['x-anon-token'] = anonToken
  return app.inject({ method: 'POST', url: '/api/upload/reference', headers, payload: body })
}

async function issueAnonToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/anon-token' })
  expect(res.statusCode).toBe(200)
  return res.json().token as string
}

function createLegacyReferenceFile(filePath: string): string {
  const uploadRoot = resolve(process.env.UPLOAD_DIR || './uploads')
  const abs = join(uploadRoot, filePath)
  mkdirSync(join(uploadRoot, 'references'), { recursive: true })
  writeFileSync(abs, 'legacy-file')
  return abs
}

describe('审计批 F-10 参考图归属凭据', () => {
  let app: FastifyInstance
  let artist: ArtistRow

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist({ qq_number: '88440', subdomain: 'f10-ref' })
  })

  afterEach(() => app.close())

  function orderPayload(filePath: string): { subdomain: string; clientQq: string; agreeRules: boolean; references: string[] } {
    return {
      subdomain: artist.subdomain,
      clientQq: '88441',
      agreeRules: true,
      references: [filePath]
    }
  }

  it('TC-F10-01: 迁移 v55 后 reference_uploads 表存在', () => {
    const table = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='reference_uploads'"
    ).get() as { sql: string }
    expect(table).toBeTruthy()
    expect(table.sql).toContain('file_path TEXT NOT NULL UNIQUE')
    expect(table.sql).toContain('anon_id INTEGER NOT NULL')
  })

  it('TC-F10-02: 上传无 x-anon-token / 无效 token → 400 拒绝', async () => {
    const noToken = await uploadReference(app, null)
    expect(noToken.statusCode).toBe(400)
    expect(noToken.json().code).toBe('INVALID_ANON_TOKEN')

    const badToken = await uploadReference(app, 'deadbeef'.repeat(8))
    expect(badToken.statusCode).toBe(400)
    expect(badToken.json().code).toBe('INVALID_ANON_TOKEN')
  })

  it('TC-F10-03: 有效 token 上传成功并登记 (anon_id, file_path, order_id=NULL)', async () => {
    const token = await issueAnonToken(app)
    const res = await uploadReference(app, token)
    expect(res.statusCode).toBe(200)
    const filePath = res.json().filePath as string
    expect(filePath).toMatch(/^references\//)

    const row = db.prepare('SELECT anon_id, file_path, order_id FROM reference_uploads WHERE file_path = ?').get(filePath) as { anon_id: number; file_path: string; order_id: number | null }
    expect(row).toBeTruthy()
    expect(row.order_id).toBeNull()
    const anonId = (db.prepare('SELECT id FROM anon_tokens WHERE token = ?').get(token) as { id: number }).id
    expect(row.anon_id).toBe(anonId)
  })

  it('TC-F10-04: A token 上传的文件，B token 下单挂不上（ILLEGAL_PATH，无半态）', async () => {
    const tokenA = await issueAnonToken(app)
    const tokenB = await issueAnonToken(app)
    const upload = await uploadReference(app, tokenA)
    const filePath = upload.json().filePath as string

    const order = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-anon-token': tokenB },
      payload: orderPayload(filePath)
    })
    expect(order.statusCode).toBe(400)
    expect(order.json().code).toBe('ILLEGAL_PATH')

    // 无订单、登记记录未被绑定
    expect((db.prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number }).c).toBe(0)
    const row = db.prepare('SELECT order_id FROM reference_uploads WHERE file_path = ?').get(filePath) as { order_id: number | null }
    expect(row.order_id).toBeNull()
  })

  it('TC-F10-05: 同 token 正常下单并绑定，随后不可二次使用', async () => {
    const token = await issueAnonToken(app)
    const upload = await uploadReference(app, token)
    const filePath = upload.json().filePath as string

    const first = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-anon-token': token },
      payload: orderPayload(filePath)
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().orderNo).toBeTruthy()

    const order = db.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 1').get() as { id: number }
    const row = db.prepare('SELECT order_id FROM reference_uploads WHERE file_path = ?').get(filePath) as { order_id: number | null }
    expect(row.order_id).toBe(order.id)
    expect((db.prepare('SELECT COUNT(*) AS c FROM order_references WHERE order_id = ? AND file_path = ?').get(order.id, filePath) as { c: number }).c).toBe(1)

    // 已绑定 → 同 token 再下单也被拒（防复用同一张参考图重复挂单）
    const second = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-anon-token': token },
      payload: orderPayload(filePath)
    })
    expect(second.statusCode).toBe(400)
    expect(second.json().code).toBe('ILLEGAL_PATH')
    expect((db.prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number }).c).toBe(1)
  })

  it('TC-F10-06: 无参考图下单不需要 token（向后兼容）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        subdomain: artist.subdomain,
        clientQq: '88442',
        agreeRules: true
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().orderNo).toBeTruthy()
  })

  it('TC-F10-07: references 非空但无 token → ILLEGAL_PATH', async () => {
    const token = await issueAnonToken(app)
    const upload = await uploadReference(app, token)
    const filePath = upload.json().filePath as string

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: orderPayload(filePath)
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
    expect((db.prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number }).c).toBe(0)
  })

  it('TC-F10-08: 存量未登记路径（v55 前文件）放行，不要求登记记录', async () => {
    const legacyPath = 'references/legacy-before-v55.png'
    createLegacyReferenceFile(legacyPath)
    const token = await issueAnonToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-anon-token': token },
      payload: orderPayload(legacyPath)
    })
    expect(res.statusCode).toBe(200)
    // 存量豁免：不写入登记记录（随 GC 自然淘汰后全部走登记路径）
    expect((db.prepare('SELECT COUNT(*) AS c FROM reference_uploads WHERE file_path = ?').get(legacyPath) as { c: number }).c).toBe(0)
  })

  it('TC-F10-09: 不存在的路径 + 有效 token 仍被存在性校验拒绝', async () => {
    const token = await issueAnonToken(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { 'x-anon-token': token },
      payload: orderPayload('references/ghost.png')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
  })

  it('TC-F10-10: 画师手动录单带参考图不要求匿名 token（归属校验仅限客户自助下单）', async () => {
    const legacyPath = 'references/manual-legacy.png'
    createLegacyReferenceFile(legacyPath)
    const { createSession } = await import('../src/features/auth/auth.service.js')
    const token = createSession(artist.id, artist.token_version)
    const res = await app.inject({
      method: 'POST',
      url: '/api/artist/orders/manual',
      headers: { Authorization: `Bearer ${token}` },
      payload: { clientQq: '88443', references: [legacyPath] }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().order_no).toBeTruthy()
  })
})
