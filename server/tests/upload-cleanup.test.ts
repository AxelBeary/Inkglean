import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { cleanDb, seedArtist, db, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

// ============================================
// F0200：POST /api/upload/cleanup — 取消弹窗的孤儿图清理端点
// 安全边界（CROSSEND-PLAN §3）：requireAuth + 仅 images/{artist.id}/ 前缀 + 拒 .. +
// maxItems 10 + per-artist 限流 + 幂等（ENOENT 按成功）+ 只 unlink 精确路径不递归。
// 跨画师/越目录/穿越段一律 fail-closed 400，不做静默跳过（删除是破坏性操作）。
// ============================================

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')

/** 真实 1px PNG（/api/upload/image 有魔数校验，TC-01 走真上传链路时需要） */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

/** 直接在 images/{artistId}/ 下落一张假图（端点不查库、只 unlink 精确路径，落盘即可测） */
function ensureImageFile(artistId: number, name: string): string {
  const dir = join(UPLOAD_ROOT, 'images', String(artistId))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), `cleanup-test file ${name}`)
  return `images/${artistId}/${name}`
}

/** 构造 multipart/form-data 请求体（与 upload.routes.test.ts 同款，走真上传链路） */
function multipartBody(filename: string, contentType: string, content: Buffer) {
  const boundary = '----CleanupBoundary' + Date.now()
  const body = Buffer.concat([
    Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
      'Content-Type: ' + contentType + '\r\n\r\n',
      'utf8'
    ),
    content,
    Buffer.from('\r\n--' + boundary + '--\r\n')
  ])
  return { boundary, body }
}

describe('POST /api/upload/cleanup（F0200 孤儿图清理）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let token: string

  beforeEach(async () => {
    cleanDb()
    // per-artist 限流桶跨用例累计（30 次/10 分钟），不清会让后面的用例吃前面的余量
    resetRateLimitBuckets()
    artist = seedArtist({ qq_number: '99061', subdomain: 'cleanup-art' })
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 调清理端点（默认用本人 token） */
  function cleanup(filePaths: unknown, auth: string | null = 'Bearer ' + token) {
    return app.inject({
      method: 'POST',
      url: '/api/upload/cleanup',
      headers: auth ? { Authorization: auth } : undefined,
      payload: { filePaths }
    })
  }

  it('TC-CLN-01: 真上传链路落的图可被本人清理：200 + deleted 对账 + 文件消失', async () => {
    // 走真 /api/upload/image（魔数校验 + nanoid 命名），证明端到端路径形状吻合
    const { boundary, body } = multipartBody('orphan.png', 'image/png', PNG_1PX)
    const up = await app.inject({
      method: 'POST',
      url: '/api/upload/image',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: body
    })
    expect(up.statusCode).toBe(200)
    const filePath = up.json().filePath as string
    expect(existsSync(join(UPLOAD_ROOT, filePath))).toBe(true)

    const res = await cleanup([filePath])
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted).toEqual([filePath])
    expect(existsSync(join(UPLOAD_ROOT, filePath))).toBe(false)
  })

  it('TC-CLN-02: 多张一次清 + 重复路径去重', async () => {
    const p1 = ensureImageFile(artist.id, 'a.png')
    const p2 = ensureImageFile(artist.id, 'b.png')
    const res = await cleanup([p1, p2, p1])
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted.sort()).toEqual([p1, p2].sort())
    expect(existsSync(join(UPLOAD_ROOT, p1))).toBe(false)
    expect(existsSync(join(UPLOAD_ROOT, p2))).toBe(false)
  })

  it('TC-CLN-03: 幂等——已不存在的路径 200，但单列 missing 不再混进 deleted（XVB-3）', async () => {
    const p = ensureImageFile(artist.id, 'idem.png')
    expect((await cleanup([p])).statusCode).toBe(200)
    // 第二次清同一路径：文件已删（ENOENT），仍 200，但必须能区分「真删了」与「本就不存在」
    const res = await cleanup([p])
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted).toEqual([])
    expect(res.json().missing).toEqual([p])
  })

  it('TC-CLN-04: 跨画师路径 → 400 ILLEGAL_CLEANUP_PATH，对方文件不受影响', async () => {
    const other = seedArtist({ qq_number: '99062', subdomain: 'cleanup-other' })
    const otherPath = ensureImageFile(other.id, 'not-yours.png')
    const res = await cleanup([otherPath])
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_CLEANUP_PATH')
    expect(existsSync(join(UPLOAD_ROOT, otherPath))).toBe(true)
  })

  it('TC-CLN-05: 含 .. 的路径 → 400 拒绝（fail-closed：不静默跳过、整单拒）', async () => {
    const kept = ensureImageFile(artist.id, 'alive.png')
    const evil = `images/${artist.id}/../../../etc/passwd`
    const res = await cleanup([kept, evil])
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_CLEANUP_PATH')
    // fail-closed 语义：同批里的合法路径也不删（整单拒绝，不做部分执行）
    expect(existsSync(join(UPLOAD_ROOT, kept))).toBe(true)
  })

  it('TC-CLN-06: 其他目录前缀（references/deliverables/notes）不在清理范围 → 400', async () => {
    for (const p of ['references/x.png', `deliverables/${artist.id}/y.png`, `notes/${artist.id}/z.png`]) {
      const res = await cleanup([p])
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('ILLEGAL_CLEANUP_PATH')
    }
  })

  it('TC-CLN-07: body 形状校验：非数组/空数组/超 10 条/超长路径/非字符串条目 → 400 INVALID_FILE_PATHS', async () => {
    expect((await cleanup('not-array')).statusCode).toBe(400)
    expect((await cleanup([])).statusCode).toBe(400)
    expect((await cleanup(Array.from({ length: 11 }, (_, i) => `images/${artist.id}/x${i}.png`))).statusCode).toBe(400)
    const tooLong = `images/${artist.id}/${'x'.repeat(250)}.png`
    expect((await cleanup([tooLong])).statusCode).toBe(400)
    // F1（尾巴批 cleanup 复核）：非字符串条目从「静默跳过」改整单拒——与坏路径 fail-closed 同哲学；
    // 同批合法路径也不删（不做部分执行），落盘文件保留可对账
    const kept = ensureImageFile(artist.id, 'ok.png')
    const mixed = await cleanup([kept, 42])
    expect(mixed.statusCode).toBe(400)
    expect(mixed.json().code).toBe('INVALID_FILE_PATHS')
    expect(existsSync(join(UPLOAD_ROOT, kept))).toBe(true)
  })

  it('TC-CLN-08: 未登录 → 401', async () => {
    const res = await cleanup([`images/${artist.id}/x.png`], null)
    expect(res.statusCode).toBe(401)
  })

  it('TC-CLN-09: 目录路径（EISDIR）→ 500 UPLOAD_CLEANUP_FAILED，结构化 failed 只带 errno 不带绝对路径', async () => {
    const okPath = ensureImageFile(artist.id, 'fine.png')
    // 在本人目录下造一个非空子目录：unlinkSync 目录抛 EISDIR，进结构化失败分支。
    // 必须非空：buildApp 启动即跑的孤儿回收（app.ts gcUploads.removeEmptyDirs）会异步
    // rmdir 掉空目录——空目录常在断言前被扫掉，端点看到 ENOENT 按幂等 200，用例变偶发绿。
    const subDir = join(UPLOAD_ROOT, 'images', String(artist.id), 'subdir')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'keep.txt'), 'keep dir non-empty')
    try {
      const res = await cleanup([okPath, `images/${artist.id}/subdir`])
      expect(res.statusCode).toBe(500)
      const json = res.json()
      expect(json.code).toBe('UPLOAD_CLEANUP_FAILED')
      // 已删的先删掉了（不可回滚，如实对账）；失败条目带相对路径 + errno
      expect(json.detail.deleted).toEqual([okPath])
      expect(json.detail.failed).toEqual([{ filePath: `images/${artist.id}/subdir`, error: expect.any(String) }])
      expect(JSON.stringify(json)).not.toContain(UPLOAD_ROOT)
      expect(existsSync(join(UPLOAD_ROOT, okPath))).toBe(false)
    } finally {
      rmSync(subDir, { recursive: true, force: true })
    }
  })

  it('TC-CLN-10: per-artist 限流 30 次/10min：第 31 次 429（IP 维度不背锅，换画师各算各的）', async () => {
    // 用新画师隔离桶（本人桶已被上面用例消耗若干次）
    const other = seedArtist({ qq_number: '99063', subdomain: 'cleanup-rate' })
    const otherToken = createSession(other.id, other.token_version)
    const paths = [`images/${other.id}/x.png`]
    let lastStatus = 0
    for (let i = 0; i < 31; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/cleanup',
        headers: { Authorization: 'Bearer ' + otherToken },
        payload: { filePaths: paths }
      })
      lastStatus = res.statusCode
      if (i < 30) expect(lastStatus).toBe(200) // 路径不存在按幂等成功
    }
    expect(lastStatus).toBe(429)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // SEC-1（★4 张表，不是 3 张）：images/{artistId}/ 下同时住着作品集/交付公开副本
  // （artworks.image_path）、画风封面（art_styles.cover_image）、头像（artists.avatar）、
  // 尺寸示例图（style_sizes.image）。引用命中必须整单 409 且磁盘不变。
  // ───────────────────────────────────────────────────────────────────────────

  /** 在 DB 里给四个引用列各造一条指向「已落盘文件」的引用，返回 { 列名 → 相对路径 } */
  function seedAllReferences(): Record<string, string> {
    const refs = {
      artwork: ensureImageFile(artist.id, 'ref-artwork.png'),
      styleCover: ensureImageFile(artist.id, 'ref-cover.png'),
      avatar: ensureImageFile(artist.id, 'ref-avatar.png'),
      sizeImage: ensureImageFile(artist.id, 'ref-size.png')
    }
    db.prepare('INSERT INTO artworks (artist_id, image_path, title, is_cover) VALUES (?, ?, ?, 0)')
      .run(artist.id, refs.artwork, '作品集/交付公开副本')
    const styleId = Number(db.prepare('INSERT INTO art_styles (artist_id, name, cover_image) VALUES (?, ?, ?)')
      .run(artist.id, 'cleanup-style', refs.styleCover).lastInsertRowid)
    db.prepare('UPDATE artists SET avatar = ? WHERE id = ?').run(refs.avatar, artist.id)
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, image) VALUES (?, ?, ?, ?)')
      .run(styleId, 'cleanup-size', 100, refs.sizeImage)
    return refs
  }

  it('TC-CLN-11: 4 张表的引用各一例 → 整单 409 UPLOAD_IN_USE，四文件全在、detail 只回相对路径', async () => {
    const refs = seedAllReferences()
    const paths = Object.values(refs)

    const res = await cleanup(paths)
    expect(res.statusCode).toBe(409)
    const json = res.json()
    expect(json.code).toBe('UPLOAD_IN_USE')
    // 一条 UNION 把这四列全查到（漏掉 style_sizes 这第 4 张表时这里会少一条）
    expect(json.detail.referenced).toEqual([...paths].sort())
    // 拒绝即磁盘未变：四条都还在
    for (const p of paths) expect(existsSync(join(UPLOAD_ROOT, p))).toBe(true)
    // 口径对齐 UPLOAD_CLEANUP_FAILED：不回服务端绝对路径
    expect(JSON.stringify(json)).not.toContain(UPLOAD_ROOT)
  })

  it('TC-CLN-12: 引用与孤儿混批 → 整单 409（fail-closed：孤儿也不删，不做部分执行）', async () => {
    const refs = seedAllReferences()
    const orphan = ensureImageFile(artist.id, 'orphan-with-ref.png')

    const res = await cleanup([orphan, refs.artwork])
    expect(res.statusCode).toBe(409)
    expect(res.json().detail.referenced).toEqual([refs.artwork])
    expect(existsSync(join(UPLOAD_ROOT, orphan))).toBe(true)
  })

  it('TC-CLN-13: 解除引用后同一路径可正常清理（409 不是永久封印）', async () => {
    const refs = seedAllReferences()
    expect((await cleanup([refs.artwork])).statusCode).toBe(409)

    db.prepare('DELETE FROM artworks WHERE image_path = ?').run(refs.artwork)
    const res = await cleanup([refs.artwork])
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted).toEqual([refs.artwork])
    expect(existsSync(join(UPLOAD_ROOT, refs.artwork))).toBe(false)
  })

  // MEDIUM-1：引用守卫必须按**规范化相对路径**查库。评审实测反例——`images/{id}//ref.png`
  // 过得了前缀与 `..` 校验、resolve 到同一文件，但与 DB 里的规范写法字面不等，
  // 旧实现 `IN (原串)` 查不到引用 → 200 并真删在用作品图。
  it('TC-CLN-14: 非规范写法（双斜杠 / ./）指向在用文件 → 仍 409 UPLOAD_IN_USE 且文件在', async () => {
    const ref = ensureImageFile(artist.id, 'variant-ref.png')
    db.prepare('INSERT INTO artworks (artist_id, image_path, title, is_cover) VALUES (?, ?, ?, 0)')
      .run(artist.id, ref, '变体路径守卫')

    for (const variant of [`images/${artist.id}//variant-ref.png`, `images/${artist.id}/./variant-ref.png`]) {
      const res = await cleanup([variant])
      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('UPLOAD_IN_USE')
      // 查库键是规范路径 → detail 回的是 DB 里的规范写法，而不是请求原串
      expect(res.json().detail.referenced).toEqual([ref])
      expect(existsSync(join(UPLOAD_ROOT, ref))).toBe(true)
    }

    // 同一批里「规范 + 变体」同时出现：规范化去重后仍只是一条引用，同样整单 409
    const both = await cleanup([ref, `images/${artist.id}//variant-ref.png`])
    expect(both.statusCode).toBe(409)
    expect(both.json().detail.referenced).toEqual([ref])
    expect(existsSync(join(UPLOAD_ROOT, ref))).toBe(true)
  })

  it('TC-CLN-15: 未引用文件的变体写法仍可清理（规范化不误伤主路径）', async () => {
    ensureImageFile(artist.id, 'variant-orphan.png')
    const variant = `images/${artist.id}//variant-orphan.png`

    const res = await cleanup([variant])
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted).toEqual([variant])
    expect(existsSync(join(UPLOAD_ROOT, `images/${artist.id}/variant-orphan.png`))).toBe(false)
  })
})
