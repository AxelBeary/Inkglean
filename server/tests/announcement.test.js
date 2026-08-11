import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import {
  getPlatformAnnouncement,
  savePlatformAnnouncement,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_CONTENT_MAX
} from '../src/features/announcement/announcement.service.js'

// ============================================
// REQ-043 I4: 平台公告测试（零打扰版）
// 消毒入库/消毒输出 / 无公告返回 null / 管理端 step-up / 画师登录态读取
// ============================================

/** 设置管理员并返回升级会话 token（管理后台路由需 step-up） */
function adminToken(artist) {
  return createSession(artist.id, artist.token_version, {
    authLevel: 'admin_verified',
    adminVerifiedAt: Date.now()
  })
}

describe('REQ-043 I4 平台公告（服务层）', () => {
  beforeEach(() => cleanDb())

  it('TC-ANN-01: 无公告返回 null', () => {
    expect(getPlatformAnnouncement()).toBeNull()
  })

  it('TC-ANN-02: 保存后读取——updatedAt 写入，内容一致', () => {
    savePlatformAnnouncement({ title: '平台升级公告', content: '明日起开放新功能。' })
    const ann = getPlatformAnnouncement()
    expect(ann).not.toBeNull()
    expect(ann.title).toBe('平台升级公告')
    expect(ann.content).toBe('明日起开放新功能。')
    expect(ann.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('TC-ANN-03: 恶意内容消毒入库 + 消毒输出（script/事件属性/javascript: 协议清除）', () => {
    savePlatformAnnouncement({
      title: '<script>alert(1)</script>标题',
      content: '<script>alert("x")</script>公告<img src=x onerror=alert(1)> <a href="javascript:alert(1)">链接</a>'
    })
    const ann = getPlatformAnnouncement()
    expect(ann.content).not.toContain('<script')
    expect(ann.content).not.toContain('onerror')
    expect(ann.content).not.toContain('javascript:')
    expect(ann.content).toContain('公告')
    // 标题同样消毒
    expect(ann.title).not.toContain('<script')
  })

  it('TC-ANN-04: 标题/内容超长截断（schema 限长之外的纵深防御）', () => {
    savePlatformAnnouncement({ title: '题'.repeat(500), content: '文'.repeat(20000) })
    const ann = getPlatformAnnouncement()
    expect(ann.title.length).toBeLessThanOrEqual(ANNOUNCEMENT_TITLE_MAX)
    expect(ann.content.length).toBeLessThanOrEqual(ANNOUNCEMENT_CONTENT_MAX)
  })

  it('TC-ANN-05: 标题与内容都为空 = 清空公告（GET 返回 null）', () => {
    savePlatformAnnouncement({ title: '旧公告', content: '内容' })
    expect(getPlatformAnnouncement()).not.toBeNull()
    savePlatformAnnouncement({ title: '', content: '' })
    expect(getPlatformAnnouncement()).toBeNull()
  })
})

describe('REQ-043 I4 平台公告（路由层）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function setAdmin(qqNumber = '10001') {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
    return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
  }

  it('TC-ANN-06: 画师侧 GET 需登录；登录后无公告返回 null', async () => {
    const artist = seedArtist()
    const anon = await app.inject({ method: 'GET', url: '/api/artist/announcement' })
    expect(anon.statusCode).toBe(401)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/announcement',
      headers: { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })

  it('TC-ANN-07: 管理端 PUT 需 step-up（未升级 401 STEP_UP_REQUIRED）', async () => {
    const admin = setAdmin()
    const basic = createSession(admin.id, admin.token_version)
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/announcement',
      headers: { Authorization: `Bearer ${basic}` },
      payload: { title: '公告', content: '内容' }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('STEP_UP_REQUIRED')
  })

  it('TC-ANN-08: 非管理员 PUT 403', async () => {
    setAdmin()
    const pleb = seedArtist({ qq_number: '20002', subdomain: 'pleb' })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/announcement',
      headers: { Authorization: `Bearer ${adminToken(pleb)}` },
      payload: { title: '公告', content: '内容' }
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ADMIN_REQUIRED')
  })

  it('TC-ANN-09: 管理员发布 → 画师侧读到消毒后内容', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '20002', subdomain: 'reader' })

    const pub = await app.inject({
      method: 'PUT',
      url: '/api/admin/announcement',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: {
        title: '<script>alert(1)</script>维护公告',
        content: '本周末维护<img src=x onerror=alert(1)>'
      }
    })
    expect(pub.statusCode).toBe(200)
    const saved = pub.json()
    expect(saved.title).not.toContain('<script')
    expect(saved.content).not.toContain('onerror')

    const read = await app.inject({
      method: 'GET',
      url: '/api/artist/announcement',
      headers: { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
    })
    expect(read.statusCode).toBe(200)
    expect(read.json().title).toBe('维护公告')
    expect(read.json().content).toContain('本周末维护')
    expect(read.json().content).not.toContain('onerror')
    expect(read.json().updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
  })

  it('TC-ANN-10: 管理端 schema 校验——超长内容 400；附加字段按白名单静默剥离不落库', async () => {
    const admin = setAdmin()
    const headers = { Authorization: `Bearer ${adminToken(admin)}` }

    const tooLong = await app.inject({
      method: 'PUT',
      url: '/api/admin/announcement',
      headers,
      payload: { title: 'x', content: 'x'.repeat(10001) }
    })
    expect(tooLong.statusCode).toBe(400)

    // Fastify 默认 AJV removeAdditional：additionalProperties:false 的附加字段被剥离而非 400
    // （安全语义=白名单剥离，恶意字段永远不会到达服务层/落库）
    const extra = await app.inject({
      method: 'PUT',
      url: '/api/admin/announcement',
      headers,
      payload: { title: 'x', content: 'y', malicious: true }
    })
    expect(extra.statusCode).toBe(200)
    expect(extra.json()).toMatchObject({ title: 'x', content: 'y' })
    expect(extra.json()).not.toHaveProperty('malicious')
  })
})
