// issue #82 补：参考图「按 filePath 现签」接口（POST /api/upload/reference/sign）
// 覆盖：本凭证未绑定路径可签 / 他人不可签 / 已绑定订单不可签 / 文件缺失不可签 /
//       穿越与前缀不符一律静默略过（不 500、不泄露存在性）/ 去重与条数上限 / 无凭证 400。
// 说明：本文件不走上传接口造数据（上传限流 10 次/10 分钟，多条用例会互相拖累），
//       直接落盘 + 插 reference_uploads 行，聚焦被测算接口本身。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb } from './setup.js'
import { buildApp } from '../src/app.js'
import { mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { dirname, join, resolve } from 'path'

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')

/** 造一张「已登记」的参考图：落盘 + reference_uploads 行 */
function seedReference(filePath: string, anonId: number, orderId: number | null = null): string {
  const abs = join(UPLOAD_ROOT, filePath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, 'ref-bytes')
  db.prepare('INSERT INTO reference_uploads (anon_id, file_path, ip, file_size, order_id) VALUES (?, ?, ?, ?, ?)')
    .run(anonId, filePath, '127.0.0.1', 9, orderId)
  return abs
}

/**
 * 直接建匿名凭证行（不走 POST /api/anon-token：签发接口 10 个/分钟/IP，
 * 本文件 8 条用例要 10 个凭证，走接口会把自己限流掉）
 */
function issueAnonToken(): { token: string; anonId: number } {
  const token = `test-anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const info = db.prepare('INSERT INTO anon_tokens (token) VALUES (?)').run(token)
  return { token, anonId: Number(info.lastInsertRowid) }
}

function sign(app: FastifyInstance, token: string | null, filePaths: unknown) {
  const headers: Record<string, string> = {}
  if (token) headers['x-anon-token'] = token
  return app.inject({ method: 'POST', url: '/api/upload/reference/sign', headers, payload: { filePaths } })
}

describe('参考图现签（POST /api/upload/reference/sign）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-SIGN-01: 本凭证未绑定路径 → 签回带 sig 的预览 URL', async () => {
    const { token, anonId } = issueAnonToken()
    seedReference('references/own.png', anonId)

    const res = await sign(app, token, ['references/own.png'])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: Array<{ filePath: string; url: string }> }
    expect(body.items).toHaveLength(1)
    expect(body.items[0].filePath).toBe('references/own.png')
    expect(body.items[0].url.startsWith('/uploads/references/own.png?sig=')).toBe(true)
  })

  it('TC-SIGN-02: 他人凭证上传的路径签不出来（不区分「不归你」与「不存在」）', async () => {
    const owner = issueAnonToken()
    const stranger = issueAnonToken()
    seedReference('references/owner-only.png', owner.anonId)

    const res = await sign(app, stranger.token, ['references/owner-only.png'])
    expect(res.statusCode).toBe(200)
    expect((res.json() as { items: unknown[] }).items).toEqual([])
  })

  it('TC-SIGN-03: 已随订单提交（order_id 非空）的参考图不走匿名通道重签', async () => {
    const { token, anonId } = issueAnonToken()
    seedReference('references/bound.png', anonId, 42)

    const res = await sign(app, token, ['references/bound.png'])
    expect(res.statusCode).toBe(200)
    expect((res.json() as { items: unknown[] }).items).toEqual([])
  })

  it('TC-SIGN-04: 磁盘上已不存在 → 不签（登记行还在也不签）', async () => {
    const { token, anonId } = issueAnonToken()
    const abs = seedReference('references/gone.png', anonId)
    unlinkSync(abs)

    const res = await sign(app, token, ['references/gone.png'])
    expect(res.statusCode).toBe(200)
    expect((res.json() as { items: unknown[] }).items).toEqual([])
  })

  it('TC-SIGN-05: 穿越 / 非 references 前缀 / 非字符串 → 静默略过，200 而非 500', async () => {
    const { token, anonId } = issueAnonToken()
    seedReference('references/legit.png', anonId)

    const res = await sign(app, token, [
      'references/../secret.png',
      'deliverables/x.png',
      '/etc/passwd',
      { evil: true },
      'references/legit.png'
    ])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: Array<{ filePath: string }> }
    // 只有合法那一条回来；穿越/前缀不符不会因为「文件夹里真有文件」而泄露
    expect(body.items.map(i => i.filePath)).toEqual(['references/legit.png'])
  })

  it('TC-SIGN-06: 重复路径去重；可签与不可签混合时只回可签的', async () => {
    const { token, anonId } = issueAnonToken()
    seedReference('references/a.png', anonId)
    const other = issueAnonToken()
    seedReference('references/b.png', other.anonId)

    const res = await sign(app, token, ['references/a.png', 'references/a.png', 'references/b.png'])
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: Array<{ filePath: string }> }
    expect(body.items.map(i => i.filePath)).toEqual(['references/a.png'])
  })

  it('TC-SIGN-07: 条数上限与空数组 → 400 INVALID_FILE_PATHS', async () => {
    const { token } = issueAnonToken()
    const six = Array.from({ length: 6 }, (_, i) => `references/p${i}.png`)

    const over = await sign(app, token, six)
    expect(over.statusCode).toBe(400)
    expect((over.json() as { code: string }).code).toBe('INVALID_FILE_PATHS')

    const empty = await sign(app, token, [])
    expect(empty.statusCode).toBe(400)

    const notArray = await sign(app, token, 'references/a.png')
    expect(notArray.statusCode).toBe(400)
  })

  it('TC-SIGN-08: 缺 / 无效 x-anon-token → 400 INVALID_ANON_TOKEN（不签任何东西）', async () => {
    const { anonId } = issueAnonToken()
    seedReference('references/mine.png', anonId)

    const missing = await sign(app, null, ['references/mine.png'])
    expect(missing.statusCode).toBe(400)
    expect((missing.json() as { code: string }).code).toBe('INVALID_ANON_TOKEN')

    const bogus = await sign(app, 'not-a-real-token', ['references/mine.png'])
    expect(bogus.statusCode).toBe(400)
    expect((bogus.json() as { code: string }).code).toBe('INVALID_ANON_TOKEN')
  })
})
