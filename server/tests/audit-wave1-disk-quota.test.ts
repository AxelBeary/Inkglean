import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, writeFileSync, existsSync, rmSync, utimesSync, readdirSync } from 'fs'
import type { StatsFs } from 'fs'
import { statfs } from 'fs/promises'
import { join, resolve } from 'path'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import Database from 'better-sqlite3'
import { buildApp } from '../src/app.js'
import { getDiskHeadroom, runHealthChecks } from '../src/features/admin/health.service.js'
import { MIGRATIONS } from '../src/db/init.js'
import { migration as v77 } from '../src/db/migrations/v77-reference-uploads-quota-columns.js'

// ============================================
// GHSA-6pf3-g4xq-854w（第三方审计，Wave1 高危 + Wave3 低）：磁盘耗尽 + OG 注入
// 本文件覆盖「磁盘耗尽」，闸门编号与 upload.routes 顶部注释一致：
//   闸① upload.routes ← health.service getDiskHeadroom —— statfs 接成写盘前磁盘水位（原 checkDisk 恒 'ok'）
//   闸② upload.routes —— 写盘前的 per-anon / per-IP 未绑定累计字节配额（非仅次数限流）
//   闸③ app.ts gcDatabaseTtl —— reference_uploads 未绑定行 TTL（默认 3 天，先删行再跑文件 GC）
//   闸④ 迁移 v77 —— reference_uploads.ip / .file_size 两列（闸②求和的数据源）
// OG `$` 注入（Wave3 低）见 tests/og-meta.test.ts（TC-OG-13~15）。
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR as string
const MB = 1024 * 1024

// statfs 只 mock 这一个出口：水位守卫的判据必须由测试给定，不能依赖跑分机的剩余空间
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, statfs: vi.fn(actual.statfs) }
})

/** 造一份 statfs 返回值（type 为内核文件系统编号，守卫只看 bfree×bsize，其余字段取无害值） */
function statfsWith(freeBytes: number): StatsFs {
  const blocks = Math.floor(freeBytes / 4096)
  return {
    type: 0, bsize: 4096, blocks: blocks * 2,
    bfree: blocks, bavail: blocks,
    files: 0, ffree: 0, frsize: 4096
  }
}

/** 默认放行水位：20GB 可用（阈值默认 512MB，远高于水位线，避免无关用例被闸①拦住） */
function mockHealthyDisk(): void {
  vi.mocked(statfs).mockResolvedValue(statfsWith(20 * 1024 * MB))
}

/** multipart 请求体（参考图上传：必须是真图片魔数，d3 P2 校验） */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

function multipartBody(filename: string, contentType: string, content: Buffer): { boundary: string; body: Buffer } {
  const boundary = '----Wave1Boundary' + Date.now() + Math.random().toString(36).slice(2)
  const head = Buffer.from([
    '--' + boundary,
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"',
    'Content-Type: ' + contentType,
    ''
  ].join('\r\n') + '\r\n')
  const tail = Buffer.from('\r\n--' + boundary + '--')
  return { boundary, body: Buffer.concat([head, content, tail]) }
}

/** 参考图上传（公开接口，带匿名凭证；可指定来源 IP） */
async function uploadReference(app: FastifyInstance, anonToken: string, remoteAddress = '203.0.113.11') {
  const { boundary, body } = multipartBody('ref.png', 'image/png', PNG_1X1)
  return app.inject({
    method: 'POST',
    url: '/api/upload/reference',
    remoteAddress,
    headers: { 'content-type': 'multipart/form-data; boundary=' + boundary, 'x-anon-token': anonToken },
    payload: body
  })
}

/** 签发匿名凭证并返回 (token, anon_id) */
async function issueAnon(app: FastifyInstance, remoteAddress = '203.0.113.11'): Promise<{ token: string; id: number }> {
  const res = await app.inject({ method: 'POST', url: '/api/anon-token', remoteAddress })
  expect(res.statusCode).toBe(200)
  const token = res.json().token as string
  const row = db.prepare('SELECT id FROM anon_tokens WHERE token = ?').get(token) as { id: number }
  return { token, id: row.id }
}

/** 直插一条 reference_uploads 登记行（可指定 created_at 偏移/绑定订单/尺寸/来源 IP） */
function insertUpload(opts: {
  anonId: number
  filePath: string
  orderId?: number | null
  createdAtDaysAgo?: number
  fileSize?: number | null
  ip?: string | null
}): void {
  const created = opts.createdAtDaysAgo
    ? `datetime('now', '-${opts.createdAtDaysAgo} days')`
    : `datetime('now')`
  db.prepare(
    `INSERT INTO reference_uploads (anon_id, file_path, order_id, created_at, ip, file_size)
     VALUES (?, ?, ?, ${created}, ?, ?)`
  ).run(opts.anonId, opts.filePath, opts.orderId ?? null, opts.ip ?? null, opts.fileSize ?? null)
}

/** 造一个磁盘文件（content 决定体积；可选把 mtime 推到过去以过 72h 回收窗口） */
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

/** 回收站内是否已存在该相对路径（GC 是移入回收站而非物理删） */
function inRecycleBin(rel: string): boolean {
  const root = join(UPLOAD_DIR, '.recycle-bin')
  if (!existsSync(root)) return false
  const target = join(root, rel)
  if (existsSync(target)) return true
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory() && existsSync(join(root, e.name, rel))) return true
  }
  return false
}

const countUploads = (filePath: string): number =>
  (db.prepare('SELECT COUNT(*) AS c FROM reference_uploads WHERE file_path = ?').get(filePath) as { c: number }).c

describe('GHSA-6pf3 闸④：迁移 v77 — reference_uploads.ip / .file_size', () => {
  it('TC-W1-01: v77 已应用，两列存在且为可空无默认（老库纯 ADD COLUMN）', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 77').get() as { version?: number }
    expect(applied.version).toBe(77)
    const cols = db.prepare('PRAGMA table_info(reference_uploads)').all() as
      Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>
    const ip = cols.find(c => c.name === 'ip')
    const size = cols.find(c => c.name === 'file_size')
    expect(ip, 'reference_uploads.ip').toMatchObject({ type: 'TEXT', notnull: 0, dflt_value: null })
    expect(size, 'reference_uploads.file_size').toMatchObject({ type: 'INTEGER', notnull: 0, dflt_value: null })
  })

  it('TC-W1-02: 幂等——重跑迁移不抛错且列不重复（PRAGMA 守卫生效，不靠 ALTER 报错兜底）', () => {
    expect(() => v77.up(db)).not.toThrow()
    expect(() => v77.up(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(reference_uploads)').all() as Array<{ name: string }>
    expect(cols.filter(c => c.name === 'ip')).toHaveLength(1)
    expect(cols.filter(c => c.name === 'file_size')).toHaveLength(1)
    expect(MIGRATIONS[MIGRATIONS.length - 1].version).toBe(77)
  })

  it('TC-W1-02b: 老库升级（v55 形态无两列）——加列后存量行不丢、新列为 NULL', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE reference_uploads (
        id INTEGER PRIMARY KEY,
        anon_id INTEGER NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        order_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    mem.prepare('INSERT INTO reference_uploads (anon_id, file_path) VALUES (?, ?)').run(7, 'references/legacy.png')
    expect(() => v77.up(mem)).not.toThrow()

    const cols = mem.prepare('PRAGMA table_info(reference_uploads)').all() as Array<{ name: string }>
    expect(cols.some(c => c.name === 'ip')).toBe(true)
    expect(cols.some(c => c.name === 'file_size')).toBe(true)
    const row = mem.prepare("SELECT * FROM reference_uploads WHERE file_path = 'references/legacy.png'").get() as
      { anon_id: number; ip: string | null; file_size: number | null }
    expect(row.anon_id).toBe(7)
    expect(row.ip).toBeNull()
    expect(row.file_size).toBeNull()
    mem.close()
  })
})

describe('GHSA-6pf3 闸③：reference_uploads 未绑定行 TTL（先删行 → 文件才被孤儿 GC 回收）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    db.exec('DELETE FROM reference_uploads')
    mockHealthyDisk()
    artist = seedArtist({ qq_number: '88601', subdomain: 'wave1-ttl' })
  })

  afterEach(() => {
    rmSync(UPLOAD_DIR, { recursive: true, force: true })
    delete process.env.REFERENCE_UPLOAD_TTL_DAYS
    vi.mocked(statfs).mockReset()
    mockHealthyDisk()
  })

  it('TC-W1-03: 未绑定且超 TTL 窗的行被删，且同轮文件 GC 把该文件移入回收站', async () => {
    const rel = 'references/expire-me.png'
    // 行 4 天前（> 默认 3 天窗），文件 mtime 5 天前（> 72h 回收窗口）
    createUploadFile(rel, 128, 5)
    insertUpload({ anonId: 1, filePath: rel, createdAtDaysAgo: 4, fileSize: 128, ip: '203.0.113.50' })
    expect(countUploads(rel)).toBe(1)

    await buildApp({ logger: false })

    expect(countUploads(rel)).toBe(0)
    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(false)
    expect(inRecycleBin(rel)).toBe(true)
  })

  it('TC-W1-04: 已绑定订单的行不删——即使远超窗，文件也保留（订单归属凭据不销毁）', async () => {
    const rel = 'references/bound-old.png'
    createUploadFile(rel, 128, 40)
    const order = seedOrder(artist.id, { order_no: 'W1-BOUND' })
    insertUpload({ anonId: 2, filePath: rel, orderId: order.id, createdAtDaysAgo: 30, fileSize: 128, ip: '203.0.113.51' })

    await buildApp({ logger: false })

    expect(countUploads(rel)).toBe(1)
    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
    expect(inRecycleBin(rel)).toBe(false)
  })

  it('TC-W1-05: 窗内未绑定行不删（3 天窗内的文件也保留）', async () => {
    const rel = 'references/recent-unbound.png'
    createUploadFile(rel, 128, 2)
    insertUpload({ anonId: 3, filePath: rel, createdAtDaysAgo: 2, fileSize: 128, ip: '203.0.113.52' })

    await buildApp({ logger: false })

    expect(countUploads(rel)).toBe(1)
    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
  })

  it('TC-W1-06: 窗可配（REFERENCE_UPLOAD_TTL_DAYS=10）——4 天前的未绑定行按新窗保留', async () => {
    process.env.REFERENCE_UPLOAD_TTL_DAYS = '10'
    const rel = 'references/keep-by-env.png'
    createUploadFile(rel, 128, 5)
    insertUpload({ anonId: 4, filePath: rel, createdAtDaysAgo: 4, fileSize: 128, ip: '203.0.113.53' })

    await buildApp({ logger: false })

    expect(countUploads(rel)).toBe(1)
    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
  })

  it('TC-W1-07: env 误配成 0/负数/非数字一律回默认 3 天窗（防「上传即删」与「永不清理」两种误配）', async () => {
    const cases: Array<[string, number]> = [['0', 4], ['-1', 4], ['abc', 4]]
    for (const [raw, daysAgo] of cases) {
      process.env.REFERENCE_UPLOAD_TTL_DAYS = raw
      const rel = `references/invalid-env-${raw}.png`
      createUploadFile(rel, 128, 5)
      insertUpload({ anonId: 5, filePath: rel, createdAtDaysAgo: daysAgo, fileSize: 128, ip: '203.0.113.54' })
      await buildApp({ logger: false })
      expect(countUploads(rel), `REFERENCE_UPLOAD_TTL_DAYS=${raw} 应按默认 3 天窗删除`).toBe(0)
    }
  })
})

describe('GHSA-6pf3 闸②：per-anon / per-IP 未绑定累计字节配额', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    db.exec('DELETE FROM reference_uploads')
    mockHealthyDisk()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    delete process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB
    vi.mocked(statfs).mockReset()
    mockHealthyDisk()
  })

  it('TC-W1-08: 上传成功后登记行带 ip 与真实落盘字节（配额求和的数据源）', async () => {
    const { token, id } = await issueAnon(app, '203.0.113.20')
    const res = await uploadReference(app, token, '203.0.113.20')
    expect(res.statusCode).toBe(200)
    const row = db.prepare('SELECT anon_id, ip, file_size, order_id FROM reference_uploads WHERE file_path = ?')
      .get(res.json().filePath as string) as { anon_id: number; ip: string; file_size: number; order_id: number | null }
    expect(row.anon_id).toBe(id)
    expect(row.ip).toBe('203.0.113.20')
    expect(row.file_size).toBe(res.json().size as number)
    expect(row.order_id).toBeNull()
  })

  it('TC-W1-09: per-anon 未绑定累计字节超阈 → 429 REFERENCE_QUOTA_EXCEEDED（不落盘、不登记）', async () => {
    const { token, id } = await issueAnon(app, '203.0.113.21')
    // 配额 30MB，同匿名凭证名下已有 25MB 未绑定囤积（25MB + 本请求最坏 10MB > 30MB）
    process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB = '30'
    insertUpload({ anonId: id, filePath: 'references/stored-big.png', fileSize: 25 * MB, ip: '198.51.100.9' })
    const before = (db.prepare('SELECT COUNT(*) AS c FROM reference_uploads').get() as { c: number }).c
    const refDir = join(UPLOAD_DIR, 'references')
    const filesBefore = existsSync(refDir) ? readdirSync(refDir).filter(n => n.endsWith('.png')).length : 0

    const res = await uploadReference(app, token, '203.0.113.21')

    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('REFERENCE_QUOTA_EXCEEDED')
    expect((res.json().detail as { subject: string }).subject).toBe('anon')
    expect((db.prepare('SELECT COUNT(*) AS c FROM reference_uploads').get() as { c: number }).c).toBe(before)
    // 闸②同样排在 request.file() 之前：被拒的请求一个字节都不落盘
    const filesAfter = existsSync(refDir) ? readdirSync(refDir).filter(n => n.endsWith('.png')).length : 0
    expect(filesAfter).toBe(filesBefore)
  })

  it('TC-W1-10: per-IP 未绑定累计字节超阈（不同匿名凭证同 IP）→ 429，subject=ip', async () => {
    // 配额 30MB：攻击面是「同 IP 批量签发匿名凭证」，每个新 anon 各囤一份 → per-anon 拦不住
    process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB = '30'
    const ip = '203.0.113.22'
    const { token } = await issueAnon(app, ip)
    insertUpload({ anonId: 900 + Math.floor(Math.random() * 100), filePath: 'references/by-ip-big.png', fileSize: 25 * MB, ip })

    const res = await uploadReference(app, token, ip)

    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('REFERENCE_QUOTA_EXCEEDED')
    expect((res.json().detail as { subject: string }).subject).toBe('ip')
  })

  it('TC-W1-11: 已绑定订单的行不计入配额（正常客户囤完稿后仍可继续上传）', async () => {
    const { token, id } = await issueAnon(app, '203.0.113.23')
    process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB = '30'
    // 45MB 都已绑定订单（已交付的既成事实），不占用暂存额度
    insertUpload({ anonId: id, filePath: 'references/bound-quota.png', orderId: 1, createdAtDaysAgo: 1, fileSize: 45 * MB, ip: '203.0.113.23' })

    const res = await uploadReference(app, token, '203.0.113.23')

    expect(res.statusCode).toBe(200)
    expect(res.json().filePath).toMatch(/^references\//)
  })

  it('TC-W1-12: 存量行无 file_size（v77 之前）按单文件上限保守计入', async () => {
    const { token, id } = await issueAnon(app, '203.0.113.24')
    process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB = '30'
    // 3 条 NULL 尺寸存量行 → 保守计 3×10MB=30MB，本请求必被拒（真实尺寸未知，宁可早拒）
    insertUpload({ anonId: id, filePath: 'references/legacy-a.png', fileSize: null, ip: null })
    insertUpload({ anonId: id, filePath: 'references/legacy-b.png', fileSize: null, ip: null })
    insertUpload({ anonId: id, filePath: 'references/legacy-c.png', fileSize: null, ip: null })

    const res = await uploadReference(app, token, '203.0.113.24')

    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('REFERENCE_QUOTA_EXCEEDED')
  })

  it('TC-W1-13: 配额可配为 0 = 显式关闭（运维口径），此时不再拦正常上传', async () => {
    const { token, id } = await issueAnon(app, '203.0.113.25')
    process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB = '0'
    insertUpload({ anonId: id, filePath: 'references/huge-legacy.png', fileSize: null, ip: null })

    const res = await uploadReference(app, token, '203.0.113.25')

    expect(res.statusCode).toBe(200)
  })

  it('TC-W1-14: 配额只拦公开参考图口，登录画师的 /api/upload/image 不受该配额约束', async () => {
    // 配额压到最紧：仍不能影响已鉴别的画师作品图上传（本批只收紧匿名可写的公开口）
    process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB = '1'
    const artist = seedArtist({ qq_number: '88602', subdomain: 'wave1-img' })
    const { createSession } = await import('../src/features/auth/auth.service.js')
    const session = createSession(artist.id, artist.token_version)
    const { boundary, body } = multipartBody('art.png', 'image/png', PNG_1X1)
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload/image',
      headers: { Authorization: 'Bearer ' + session, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: body
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('GHSA-6pf3 闸①：statfs 水位接成上传前守卫', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    db.exec('DELETE FROM reference_uploads')
    mockHealthyDisk()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    delete process.env.UPLOAD_DISK_MIN_FREE_MB
    vi.mocked(statfs).mockReset()
    mockHealthyDisk()
  })

  it('TC-W1-15: 可用低于阈值 → 507 DISK_WATERMARK_BLOCKED，且不写盘不登记', async () => {
    const { token } = await issueAnon(app, '203.0.113.30')
    // 阈值 1GB，可用 500MB
    process.env.UPLOAD_DISK_MIN_FREE_MB = '1024'
    vi.mocked(statfs).mockResolvedValue(statfsWith(500 * MB))
    const before = (db.prepare('SELECT COUNT(*) AS c FROM reference_uploads').get() as { c: number }).c
    const refDir = join(UPLOAD_DIR, 'references')
    const filesBefore = existsSync(refDir) ? readdirSync(refDir).filter(n => n.endsWith('.png')).length : 0

    const res = await uploadReference(app, token, '203.0.113.30')

    expect(res.statusCode).toBe(507)
    expect(res.json().code).toBe('DISK_WATERMARK_BLOCKED')
    expect((res.json().detail as { minFreeMb: number }).minFreeMb).toBe(1024)
    expect((db.prepare('SELECT COUNT(*) AS c FROM reference_uploads').get() as { c: number }).c).toBe(before)
    // 公开口在落盘前就被拦住：references 目录没有新增文件（闸①排在 request.file() 之前）
    const filesAfter = existsSync(refDir) ? readdirSync(refDir).filter(n => n.endsWith('.png')).length : 0
    expect(filesAfter).toBe(filesBefore)
  })

  it('TC-W1-16: 可用高于阈值 → 放行（守卫不是恒拒）', async () => {
    const { token } = await issueAnon(app, '203.0.113.31')
    process.env.UPLOAD_DISK_MIN_FREE_MB = '1024'
    vi.mocked(statfs).mockResolvedValue(statfsWith(2 * 1024 * MB))

    const res = await uploadReference(app, token, '203.0.113.31')

    expect(res.statusCode).toBe(200)
  })

  it('TC-W1-17: 阈值未配置时取默认 512MB——低于默认阈值同样拒', async () => {
    const { token } = await issueAnon(app, '203.0.113.32')
    delete process.env.UPLOAD_DISK_MIN_FREE_MB
    vi.mocked(statfs).mockResolvedValue(statfsWith(300 * MB))

    const res = await uploadReference(app, token, '203.0.113.32')

    expect(res.statusCode).toBe(507)
    expect((res.json().detail as { minFreeMb: number }).minFreeMb).toBe(512)
  })

  it('TC-W1-18: UPLOAD_DISK_MIN_FREE_MB=0 = 显式关闭水位守卫', async () => {
    const { token } = await issueAnon(app, '203.0.113.33')
    process.env.UPLOAD_DISK_MIN_FREE_MB = '0'
    vi.mocked(statfs).mockResolvedValue(statfsWith(1 * MB))

    const res = await uploadReference(app, token, '203.0.113.33')

    expect(res.statusCode).toBe(200)
  })

  it('TC-W1-19: getDiskHeadroom 判据（阈值边界相等放行 / 低于阈值拒 / 探针异常不阻断）', async () => {
    process.env.UPLOAD_DISK_MIN_FREE_MB = '512'
    vi.mocked(statfs).mockResolvedValueOnce(statfsWith(512 * MB))
    expect(await getDiskHeadroom(resolve(UPLOAD_DIR))).toMatchObject({ ok: true, freeMb: 512, minFreeMb: 512 })

    vi.mocked(statfs).mockResolvedValueOnce(statfsWith(511 * MB + 1024))
    expect(await getDiskHeadroom(resolve(UPLOAD_DIR))).toMatchObject({ ok: false })

    vi.mocked(statfs).mockRejectedValueOnce(new Error('statfs unsupported'))
    const probeFailed = await getDiskHeadroom(resolve(UPLOAD_DIR))
    expect(probeFailed).toMatchObject({ ok: true, freeMb: null })
    expect(probeFailed.probeError).toContain('statfs unsupported')
  })

  it('TC-W1-20: 自检报表与守卫同口径——低水位时 disk 项不再是恒 ok（warn + 阈值入 detail）', async () => {
    process.env.UPLOAD_DISK_MIN_FREE_MB = '1024'
    vi.mocked(statfs).mockResolvedValue(statfsWith(200 * MB))
    const latest = MIGRATIONS[MIGRATIONS.length - 1].version

    const checks = await runHealthChecks(latest)
    const disk = checks.find(c => c.id === 'disk')!

    expect(disk.status).toBe('warn')
    expect(disk.summary).toContain('1024')
    expect(disk.detail).toMatchObject({ minFreeMb: 1024, freeMb: 200 })

    // 高水位时仍 ok（回归：不是把该项改成恒 warn）
    vi.mocked(statfs).mockResolvedValue(statfsWith(20 * 1024 * MB))
    const healthy = (await runHealthChecks(latest)).find(c => c.id === 'disk')!
    expect(healthy.status).toBe('ok')
    expect(healthy.detail).toMatchObject({ minFreeMb: 1024 })
  })

  it('TC-W1-21: 水位闸不拦登录画师的交付/作品口（本批只收紧公开参考图口）', async () => {
    const artist = seedArtist({ qq_number: '88603', subdomain: 'wave1-deliver' })
    const { createSession } = await import('../src/features/auth/auth.service.js')
    const session = createSession(artist.id, artist.token_version)
    process.env.UPLOAD_DISK_MIN_FREE_MB = '1048576' // 1GB 阈值 → 公开口必拒
    vi.mocked(statfs).mockResolvedValue(statfsWith(10 * MB))

    const { boundary, body } = multipartBody('art.png', 'image/png', PNG_1X1)
    const img = await app.inject({
      method: 'POST',
      url: '/api/upload/image',
      headers: { Authorization: 'Bearer ' + session, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: body
    })
    expect(img.statusCode).toBe(200)

    const { token } = await issueAnon(app, '203.0.113.34')
    const ref = await uploadReference(app, token, '203.0.113.34')
    expect(ref.statusCode).toBe(507)
  })
})
