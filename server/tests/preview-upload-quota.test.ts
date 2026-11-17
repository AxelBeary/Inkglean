import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, writeFileSync, existsSync, readdirSync, utimesSync } from 'fs'
import type { StatsFs } from 'fs'
import { statfs } from 'fs/promises'
import { join } from 'path'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'

// ============================================
// A1（v82）：过程稿上传磁盘水位 + per-artist 未绑定字节配额 + TTL
// 闸门编号与 upload.routes 顶部注释一致：
//   闸① upload.routes ← health.service getDiskHeadroom（写盘前 507）
//   闸② upload.routes —— 写盘前 per-artist 未挂单累计字节配额（429）
//   闸③ app.ts gcDatabaseTtl —— preview_uploads 未挂单行 TTL（默认 3 天）
//   闸④ 迁移 v82 —— preview_uploads 台账（闸②求和与闸③清理的数据源）
// 绑定事实唯一源：order_previews.file_path（挂单出额度，删稿重新计入）。
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR as string
const MB = 1024 * 1024

/** 启动时的孤儿回收是 setImmediate 延后的：排队回调必定排在启动回收之后 */
const flushStartupGc = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

// statfs 只 mock 这一个出口：水位判据由测试给定，不依赖跑分机剩余空间
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, statfs: vi.fn(actual.statfs) }
})

function statfsWith(freeBytes: number): StatsFs {
  const blocks = Math.floor(freeBytes / 4096)
  return {
    type: 0, bsize: 4096, blocks: blocks * 2,
    bfree: blocks, bavail: blocks,
    files: 0, ffree: 0, frsize: 4096
  }
}

function mockHealthyDisk(): void {
  vi.mocked(statfs).mockResolvedValue(statfsWith(20 * 1024 * MB))
}

/** 1×1 PNG（真图片魔数，过上传校验） */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

function multipartBody(filename: string, contentType: string, content: Buffer): { boundary: string; body: Buffer } {
  const boundary = '----A1Boundary' + Date.now() + Math.random().toString(36).slice(2)
  const head = Buffer.from([
    '--' + boundary,
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"',
    'Content-Type: ' + contentType,
    ''
  ].join('\r\n') + '\r\n')
  const tail = Buffer.from('\r\n--' + boundary + '--')
  return { boundary, body: Buffer.concat([head, content, tail]) }
}

/** 过程稿上传（登录画师） */
async function uploadPreview(app: FastifyInstance, artist: ArtistRow, remoteAddress: string) {
  const session = createSession(artist.id, artist.token_version as number)
  const { boundary, body } = multipartBody('wip.png', 'image/png', PNG_1X1)
  return app.inject({
    method: 'POST',
    url: '/api/upload/preview',
    remoteAddress,
    headers: { Authorization: 'Bearer ' + session, 'content-type': 'multipart/form-data; boundary=' + boundary },
    payload: body
  })
}

/** 直插一条过程稿台账行（可指定 created_at 偏移） */
function insertLedger(opts: {
  artistId: number
  filePath: string
  fileSize: number
  createdAtDaysAgo?: number
  ip?: string | null
}): void {
  const created = opts.createdAtDaysAgo
    ? `datetime('now', '-${opts.createdAtDaysAgo} days')`
    : `datetime('now')`
  db.prepare(
    `INSERT INTO preview_uploads (artist_id, file_path, file_size, ip, created_at)
     VALUES (?, ?, ?, ?, ${created})`
  ).run(opts.artistId, opts.filePath, opts.fileSize, opts.ip ?? null)
}

/** 挂单（绑定事实唯一源）：插入 order_previews 行 */
function bindPreview(orderId: number, filePath: string): void {
  db.prepare('INSERT INTO order_previews (order_id, file_path) VALUES (?, ?)').run(orderId, filePath)
}

/** 造一个磁盘文件（content 决定体积；可选把 mtime 推到过去） */
function createUploadFile(rel: string, bytes = 128, ageDays?: number): string {
  const abs = join(UPLOAD_DIR, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, Buffer.alloc(bytes, 7))
  if (ageDays) {
    const past = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000)
    utimesSync(abs, past, past)
  }
  return abs
}

/** 某画师 previews 目录下的文件数（目录不存在按 0） */
function previewFileCount(artistId: number): number {
  const dir = join(UPLOAD_DIR, 'previews', String(artistId))
  return existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.png')).length : 0
}

const countLedger = (filePath: string): number =>
  (db.prepare('SELECT COUNT(*) AS c FROM preview_uploads WHERE file_path = ?').get(filePath) as { c: number }).c

describe('A1 闸①：磁盘水位与台账写入', () => {
  it('TC-A1-01: 水位不足 → 507 DISK_WATERMARK_BLOCKED，且不落盘不写台账', async () => {
    cleanDb()
    mockHealthyDisk()
    const artist = seedArtist({ qq_number: '88701', subdomain: 'a1-disk' })
    process.env.UPLOAD_DISK_MIN_FREE_MB = '1024'
    vi.mocked(statfs).mockResolvedValue(statfsWith(500 * MB))
    const app = await buildApp({ logger: false })
    await flushStartupGc()
    await app.ready()

    try {
      const res = await uploadPreview(app, artist, '203.0.113.101')
      expect(res.statusCode).toBe(507)
      expect(res.json().code).toBe('DISK_WATERMARK_BLOCKED')
      expect((res.json().detail as { minFreeMb: number }).minFreeMb).toBe(1024)
      expect(previewFileCount(artist.id)).toBe(0)
      expect((db.prepare('SELECT COUNT(*) AS c FROM preview_uploads').get() as { c: number }).c).toBe(0)
    } finally {
      delete process.env.UPLOAD_DISK_MIN_FREE_MB
      await app.close()
    }
  })

  it('TC-A1-02: statfs 探针异常 → 放行（warn，不误伤上传），并写台账', async () => {
    cleanDb()
    mockHealthyDisk()
    const artist = seedArtist({ qq_number: '88702', subdomain: 'a1-probe' })
    const app = await buildApp({ logger: false })
    await flushStartupGc()
    await app.ready()

    try {
      vi.mocked(statfs).mockRejectedValueOnce(new Error('statfs unsupported'))
      const res = await uploadPreview(app, artist, '203.0.113.102')
      expect(res.statusCode).toBe(200)
      const filePath = res.json().filePath as string
      const row = db.prepare('SELECT artist_id, file_size, ip FROM preview_uploads WHERE file_path = ?')
        .get(filePath) as { artist_id: number; file_size: number; ip: string }
      expect(row.artist_id).toBe(artist.id)
      expect(row.file_size).toBe(res.json().size as number)
      expect(row.ip).toBe('203.0.113.102')
    } finally {
      delete process.env.UPLOAD_DISK_MIN_FREE_MB
      await app.close()
    }
  })
})

describe('A1 闸②：per-artist 未挂单累计字节配额', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    mockHealthyDisk()
    app = await buildApp({ logger: false })
    await flushStartupGc()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    delete process.env.PREVIEW_UPLOAD_MAX_TOTAL_MB
    vi.mocked(statfs).mockReset()
    mockHealthyDisk()
  })

  it('TC-A1-03: 未挂单累计 + 本次最坏 > 上限 → 429 PREVIEW_QUOTA_EXCEEDED，不落盘', async () => {
    const artist = seedArtist({ qq_number: '88703', subdomain: 'a1-quota' })
    process.env.PREVIEW_UPLOAD_MAX_TOTAL_MB = '30'
    insertLedger({ artistId: artist.id, filePath: 'previews/x/stored-big.png', fileSize: 25 * MB })

    const res = await uploadPreview(app, artist, '203.0.113.103')

    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('PREVIEW_QUOTA_EXCEEDED')
    expect(res.json().detail).toMatchObject({ usedMb: 25, maxMb: 30, unboundCount: 1 })
    expect(previewFileCount(artist.id)).toBe(0)
  })

  it('TC-A1-04: 已挂单的台账行不计入配额（挂单后同画师可继续传）', async () => {
    const artist = seedArtist({ qq_number: '88704', subdomain: 'a1-bound' })
    const order = seedOrder(artist.id, { order_no: 'A1-BOUND' })
    process.env.PREVIEW_UPLOAD_MAX_TOTAL_MB = '30'
    const boundPath = 'previews/' + artist.id + '/bound.png'
    insertLedger({ artistId: artist.id, filePath: boundPath, fileSize: 25 * MB })
    bindPreview(order.id, boundPath)

    const res = await uploadPreview(app, artist, '203.0.113.104')

    expect(res.statusCode).toBe(200)
    expect(countLedger(res.json().filePath as string)).toBe(1)
  })

  it('TC-A1-05: 删除过程稿行 → 该文件立即重新计入配额（磁盘文件仍在，宁严）', async () => {
    const artist = seedArtist({ qq_number: '88705', subdomain: 'a1-unbind' })
    const order = seedOrder(artist.id, { order_no: 'A1-UNBIND' })
    process.env.PREVIEW_UPLOAD_MAX_TOTAL_MB = '30'
    const boundPath = 'previews/' + artist.id + '/unbound-again.png'
    insertLedger({ artistId: artist.id, filePath: boundPath, fileSize: 25 * MB })
    bindPreview(order.id, boundPath)
    db.prepare('DELETE FROM order_previews WHERE file_path = ?').run(boundPath)

    const res = await uploadPreview(app, artist, '203.0.113.105')

    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('PREVIEW_QUOTA_EXCEEDED')
  })

  it('TC-A1-06: 两个画师互不影响（配额只按 artist_id 求和）', async () => {
    const artistA = seedArtist({ qq_number: '88706', subdomain: 'a1-a' })
    const artistB = seedArtist({ qq_number: '88707', subdomain: 'a1-b' })
    process.env.PREVIEW_UPLOAD_MAX_TOTAL_MB = '30'
    insertLedger({ artistId: artistA.id, filePath: 'previews/a/stored.png', fileSize: 25 * MB })

    const resA = await uploadPreview(app, artistA, '203.0.113.106')
    const resB = await uploadPreview(app, artistB, '203.0.113.107')

    expect(resA.statusCode).toBe(429)
    expect(resB.statusCode).toBe(200)
    expect(countLedger(resB.json().filePath as string)).toBe(1)
  })

  it('TC-A1-07: PREVIEW_UPLOAD_MAX_TOTAL_MB=0 → 配额关闭（水位闸仍独立生效）', async () => {
    const artist = seedArtist({ qq_number: '88708', subdomain: 'a1-off' })
    process.env.PREVIEW_UPLOAD_MAX_TOTAL_MB = '0'
    insertLedger({ artistId: artist.id, filePath: 'previews/x/huge-legacy.png', fileSize: 1024 * MB })

    const res = await uploadPreview(app, artist, '203.0.113.108')

    expect(res.statusCode).toBe(200)
  })
})

describe('A1 闸③：preview_uploads 未挂单行 TTL', () => {
  it('TC-A1-08: 3 天前未挂单行被清、已挂单行保留；文件仍在目录（等 72h 文件回收）', async () => {
    cleanDb()
    mockHealthyDisk()
    process.env.PREVIEW_UPLOAD_TTL_DAYS = '3'
    const artist = seedArtist({ qq_number: '88709', subdomain: 'a1-ttl' })
    const order = seedOrder(artist.id, { order_no: 'A1-TTL' })

    // 未挂单：行 4 天前（> 3 天窗），文件 mtime 仍新（不归文件回收管，证明 TTL 只删行）
    const unboundRel = 'previews/' + artist.id + '/ttl-unbound.png'
    createUploadFile(unboundRel, 128)
    insertLedger({ artistId: artist.id, filePath: unboundRel, fileSize: 128, createdAtDaysAgo: 4 })

    // 已挂单：行走 30 天前也不清（业务凭据），文件 40 天前也保留（DB 仍引用）
    const boundRel = 'previews/' + artist.id + '/ttl-bound.png'
    createUploadFile(boundRel, 128, 40)
    insertLedger({ artistId: artist.id, filePath: boundRel, fileSize: 128, createdAtDaysAgo: 30 })
    bindPreview(order.id, boundRel)

    // 窗内未挂单：2 天前，保留
    const recentRel = 'previews/' + artist.id + '/ttl-recent.png'
    createUploadFile(recentRel, 128)
    insertLedger({ artistId: artist.id, filePath: recentRel, fileSize: 128, createdAtDaysAgo: 2 })

    const app = await buildApp({ logger: false })
    await flushStartupGc()

    try {
      expect(countLedger(unboundRel)).toBe(0)
      expect(countLedger(boundRel)).toBe(1)
      expect(countLedger(recentRel)).toBe(1)
      expect(existsSync(join(UPLOAD_DIR, unboundRel))).toBe(true)
      expect(existsSync(join(UPLOAD_DIR, boundRel))).toBe(true)
    } finally {
      await app.close()
      delete process.env.PREVIEW_UPLOAD_TTL_DAYS
    }
  })
})
