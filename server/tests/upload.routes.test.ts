import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

/**
 * 上传路由测试
 * 覆盖：/api/upload/image、/api/upload/reference、/api/upload/deliverable
 * note-image 已在 routes.test.js 覆盖（TC-RT-19 系列）
 */

/** 构造 multipart/form-data 请求体 */
function multipartBody(filename: string, contentType: string, content: Buffer | string) {
  const boundary = '----TestBoundary' + Date.now() + Math.random().toString(36).slice(2)
  const head = Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
    'Content-Type: ' + contentType + '\r\n' +
    '\r\n',
    'utf8'
  )
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content)
  const tail = Buffer.from('\r\n--' + boundary + '--\r\n')
  return {
    boundary,
    body: Buffer.concat([head, body, tail])
  }
}

// d3 P2: 图片魔数校验后，成功用例必须用真实最小图片（不再用伪造字节）
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const JPEG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64')
const GIF_1PX = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const WEBP_1PX = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA', 'base64')

/** 快捷上传 */
async function uploadFile(app: FastifyInstance, url: string, filename: string, contentType: string, content: Buffer | string, token: string | null = null, anonToken?: string) {
  const { boundary, body } = multipartBody(filename, contentType, content)
  const headers: Record<string, string> = { 'content-type': 'multipart/form-data; boundary=' + boundary }
  if (token) headers.Authorization = 'Bear' + 'er ' + token
  // F-10（P2-13 后端侧）: 参考图上传需匿名凭证（x-anon-token）
  if (anonToken) headers['x-anon-token'] = anonToken
  return app.inject({ method: 'POST', url, headers, payload: body })
}

/** 签发匿名凭证（参考图上传/下单归属用） */
async function issueAnonToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/anon-token' })
  return res.json().token
}

describe('上传路由 (Upload Routes)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── POST /api/upload/image ───

  describe('POST /api/upload/image', () => {
    it('TC-U-01: 正常上传 PNG 返回 filePath + url', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'test.png', 'image/png', PNG_1PX, token)
      expect(res.statusCode).toBe(200)
      const json = res.json()
      expect(json.filePath).toContain('images/' + artist.id + '/')
      expect(json.filePath).toMatch(/\.png$/)
      expect(json.url).toBe('/uploads/' + json.filePath)
      expect(json.originalName).toBe('test.png')
      expect(json.mimeType).toBe('image/png')
      expect(json.size).toBeGreaterThan(0)
      expect(json.typeWarning).toBeNull() // PNG 是推荐格式
    })

    it('TC-U-02: 上传 JPG 正常', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'photo.jpg', 'image/jpeg', JPEG_1PX, token)
      expect(res.statusCode).toBe(200)
      expect(res.json().mimeType).toBe('image/jpeg')
      expect(res.json().typeWarning).toBeNull()
    })

    it('TC-U-03: 上传 WebP 正常', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'img.webp', 'image/webp', WEBP_1PX, token)
      expect(res.statusCode).toBe(200)
      expect(res.json().typeWarning).toBeNull()
    })

    it('TC-U-04: 上传 GIF 正常但返回格式建议', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'anim.gif', 'image/gif', GIF_1PX, token)
      expect(res.statusCode).toBe(200)
      // GIF 不在 RECOMMENDED_TYPES 中，应返回 typeWarning
      expect(res.json().typeWarning).toContain('建议转换')
    })

    it('TC-U-05: 无 token 返回 401', async () => {
      const res = await uploadFile(app, '/api/upload/image', 'test.png', 'image/png', 'data', null)
      expect(res.statusCode).toBe(401)
    })

    it('TC-U-06: 拒绝 .html 扩展名', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'evil.html', 'image/png', 'data', token)
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('仅支持')
    })

    it('TC-U-07: 拒绝 .svg 扩展名', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'evil.svg', 'image/svg+xml', '<svg/>', token)
      expect(res.statusCode).toBe(400)
    })

    it('TC-U-08: 合法扩展名但非法 MIME 被拒绝', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      // .png 扩展名 + text/html MIME → MIME 白名单不通过
      const res = await uploadFile(app, '/api/upload/image', 'fake.png', 'text/html', '<script>', token)
      expect(res.statusCode).toBe(400)
    })

    it('TC-U-09: 无文件返回 400', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      // 发送空 multipart（无 file 字段）
      const boundary = '----EmptyBoundary'
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/image',
        headers: {
          Authorization: 'Bear' + 'er ' + token,
          'content-type': 'multipart/form-data; boundary=' + boundary
        },
        payload: '--' + boundary + '--'
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('未收到文件')
    })

    it('TC-U-10: 无扩展名文件被拒绝', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'noext', 'image/png', 'data', token)
      expect(res.statusCode).toBe(400)
    })
  })

  // ─── POST /api/upload/reference ───

  describe('POST /api/upload/reference', () => {
    it('TC-U-11: 匿名凭证上传参考图成功（无需登录，F-10 需 x-anon-token）', async () => {
      const anonToken = await issueAnonToken(app)
      const res = await uploadFile(app, '/api/upload/reference', 'ref.png', 'image/png', PNG_1PX, null, anonToken)
      expect(res.statusCode).toBe(200)
      const json = res.json()
      expect(json.filePath).toContain('references/')
      expect(json.url).toContain('/uploads/references/')
      expect(json.url).toContain('?sig=') // 签名 URL
      expect(json.originalName).toBe('ref.png')
    })

    it('TC-U-12: 参考图拒绝非图片格式', async () => {
      const anonToken = await issueAnonToken(app)
      const res = await uploadFile(app, '/api/upload/reference', 'doc.pdf', 'application/pdf', 'pdf-data', null, anonToken)
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('仅支持')
    })

    it('TC-U-13: 参考图 GIF 返回格式建议', async () => {
      const anonToken = await issueAnonToken(app)
      const res = await uploadFile(app, '/api/upload/reference', 'anim.gif', 'image/gif', GIF_1PX, null, anonToken)
      expect(res.statusCode).toBe(200)
      expect(res.json().typeWarning).toContain('建议转换')
    })

    it('TC-U-14: 参考图无文件返回 400', async () => {
      const anonToken = await issueAnonToken(app)
      const boundary = '----EmptyRef'
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/reference',
        headers: { 'content-type': 'multipart/form-data; boundary=' + boundary, 'x-anon-token': anonToken },
        payload: '--' + boundary + '--'
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('未收到文件')
    })

    it('TC-U-14b: 无 x-anon-token 上传 → 400 INVALID_ANON_TOKEN（F-10）', async () => {
      const res = await uploadFile(app, '/api/upload/reference', 'ref.png', 'image/png', 'fake-ref')
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('INVALID_ANON_TOKEN')
    })
  })

  // ─── POST /api/upload/deliverable ───

  describe('POST /api/upload/deliverable', () => {
    it('TC-U-15: 上传 PSD 交付文件成功', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'art.psd', 'image/vnd.adobe.photoshop', 'psd-data', token)
      expect(res.statusCode).toBe(200)
      const json = res.json()
      expect(json.filePath).toContain('deliverables/' + artist.id + '/')
      expect(json.filePath).toMatch(/\.psd$/)
      // 260830 审计 H-4：上传时账本行未建，交付目录不再下发可用直链（见 TC-ENV-03 同口径）
      expect(json.url).toBe('')
    })

    it('TC-U-16: 上传 ZIP 交付文件成功', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'files.zip', 'application/zip', 'zip-data', token)
      expect(res.statusCode).toBe(200)
      expect(res.json().filePath).toMatch(/\.zip$/)
    })

    it('TC-U-17: 上传 PDF 交付文件成功', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'doc.pdf', 'application/pdf', 'pdf-data', token)
      expect(res.statusCode).toBe(200)
      expect(res.json().filePath).toMatch(/\.pdf$/)
    })

    it('TC-U-18: 上传 MP4 交付文件成功', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'video.mp4', 'video/mp4', 'mp4-data', token)
      expect(res.statusCode).toBe(200)
      expect(res.json().filePath).toMatch(/\.mp4$/)
    })

    it('TC-U-19: 拒绝 SVG MIME（黑名单）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'evil.svg', 'image/svg+xml', '<svg/>', token)
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('SVG/HTML')
    })

    it('TC-U-20: 拒绝 HTML MIME（黑名单）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'page.html', 'text/html', '<html/>', token)
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('SVG/HTML')
    })

    it('TC-U-21: 拒绝不在白名单的扩展名（.exe）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'virus.exe', 'application/octet-stream', 'exe', token)
      expect(res.statusCode).toBe(400)
    })

    it('TC-U-21b: 交付文件内容为 HTML（绕过 MIME 头声明）→ 400（内容黑名单）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'fake.psd', 'application/octet-stream', '<!DOCTYPE html><html><script>alert(1)</script></html>', token)
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('UNSUPPORTED_FORMAT')
    })

    it('TC-U-22: 无 token 返回 401', async () => {
      const res = await uploadFile(app, '/api/upload/deliverable', 'art.psd', 'image/vnd.adobe.photoshop', 'data', null)
      expect(res.statusCode).toBe(401)
    })

    it('TC-U-23: 无文件返回 400', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const boundary = '----EmptyDeliver'
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/deliverable',
        headers: {
          Authorization: 'Bear' + 'er ' + token,
          'content-type': 'multipart/form-data; boundary=' + boundary
        },
        payload: '--' + boundary + '--'
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('未收到文件')
    })

    it('TC-U-24: 交付文件返回 size 字段', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/deliverable', 'img.png', 'image/png', 'some-png-data', token)
      expect(res.statusCode).toBe(200)
      expect(res.json().size).toBeGreaterThan(0)
    })
  })

  // ─── 边界与安全 ───

  describe('边界与安全', () => {
    it('TC-U-25: 双扩展名 .png.html 被拒绝', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'img.png.html', 'image/png', 'data', token)
      expect(res.statusCode).toBe(400)
    })

    it('TC-U-26: 大写扩展名 .PNG 正常处理', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'PHOTO.PNG', 'image/png', PNG_1PX, token)
      expect(res.statusCode).toBe(200)
      expect(res.json().filePath).toMatch(/\.png$/) // 小写化
    })

    it('TC-U-26b: 伪造图片内容（HTML 正文 + image/jpeg + .jpg）→ 400（魔数校验）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', 'evil.jpg', 'image/jpeg', '<!DOCTYPE html><html><body>pwn</body></html>', token)
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBeTruthy()
    })

    it('TC-U-27: 空文件名被拒绝', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await uploadFile(app, '/api/upload/image', '', 'image/png', 'data', token)
      expect(res.statusCode).toBe(400)
    })

    it('TC-U-28: 交付文件 .txt 和 .md 允许', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const resTxt = await uploadFile(app, '/api/upload/deliverable', 'notes.txt', 'text/plain', 'hello', token)
      expect(resTxt.statusCode).toBe(200)

      const resMd = await uploadFile(app, '/api/upload/deliverable', 'readme.md', 'text/markdown', '# hi', token)
      expect(resMd.statusCode).toBe(200)
    })

    it('TC-U-29: 交付文件 .docx/.xlsx/.pptx 允许', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      for (const [name, mime] of [
        ['doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
      ] as Array<[string, string]>) {
        const res = await uploadFile(app, '/api/upload/deliverable', name, mime, 'office-data', token)
        expect(res.statusCode).toBe(200)
      }
    })
  })

  // ─── 环境批 B2: uploads 响应头区分公开/签名 ───

  describe('uploads 响应头 (B2)', () => {
    it('TC-ENV-01: 公开图片（images/）→ inline + 可缓存，无强制下载头', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const up = await uploadFile(app, '/api/upload/image', 'public.png', 'image/png', PNG_1PX, token)
      expect(up.statusCode).toBe(200)
      const url = up.json().url // /uploads/images/{id}/{nanoid}.png

      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-disposition']).toBe('inline')
      expect(res.headers['cache-control']).toBe('public, max-age=86400')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('TC-ENV-02: 参考图（references/）→ attachment + no-store', async () => {
      const anonToken = await issueAnonToken(app)
      const up = await uploadFile(app, '/api/upload/reference', 'ref.png', 'image/png', PNG_1PX, null, anonToken)
      expect(up.statusCode).toBe(200)
      const url = up.json().url // 签名 URL，可直接 GET

      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-disposition']).toBe('attachment')
      expect(res.headers['cache-control']).toBe('no-store')
    })

    it('TC-ENV-03: 交付文件（deliverables/）上传后不再下发可用直链（260830 审计 H-4）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const up = await uploadFile(app, '/api/upload/deliverable', 'art.psd', 'image/vnd.adobe.photoshop', 'psd-data', token)
      expect(up.statusCode).toBe(200)
      // 上传时账本行未建、无法带载荷签发；交付目录裸签名会被钩子 403，故 url 为空串（前端消费 filePath）。
      // 交付后的下载/预览响应头语义由 one-time-download-access.test.ts（TC-DLA-01）覆盖。
      expect(up.json().url).toBe('')
      expect(up.json().filePath).toMatch(/^deliverables\//)
    })

    it('TC-ENV-03b: 参考图签名 URL 拒绝无签名访问（F-10 归属登记后行为不变）', async () => {
      const anonToken = await issueAnonToken(app)
      const up = await uploadFile(app, '/api/upload/reference', 'ref.png', 'image/png', PNG_1PX, null, anonToken)
      expect(up.statusCode).toBe(200)
      const filePath = up.json().filePath
      const raw = await app.inject({ method: 'GET', url: `/uploads/${filePath}` })
      expect(raw.statusCode).toBe(403)
    })

    it('TC-ENV-04: 公开图片路径无签名也可访问（保持现状）', async () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const up = await uploadFile(app, '/api/upload/image', 'public.png', 'image/png', PNG_1PX, token)
      expect(up.statusCode).toBe(200)
      const url = up.json().url

      const res = await app.inject({ method: 'GET', url: url + '?sig=bogus' })
      expect(res.statusCode).toBe(200) // 公开路径忽略签名参数
    })

    it('TC-ENV-05: 签名路径无有效签名 → 403', async () => {
      const up = await uploadFile(app, '/api/upload/reference', 'ref.png', 'image/png', PNG_1PX)
      const filePath = up.json().filePath
      const res = await app.inject({ method: 'GET', url: '/uploads/' + filePath })
      expect(res.statusCode).toBe(403)
    })
  })
})
