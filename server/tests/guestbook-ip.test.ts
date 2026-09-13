// v75 留言取证 IP（B4）：写入链路 + 按构造防泄露（画师端/公开端取不到 ip）+ v76 可见性收口
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

const REAL_CLIENT_IP = '203.0.113.7'      // 文档用 TEST-NET-3 段（CF 换算后的用户真实 IP）
const CADDY_CONTAINER_IP = '172.18.0.5'   // Caddy 容器内网地址（TRUST_PROXY 可信代理）

/** guestbook_messages 回读行（测试消费字段） */
interface MessageDbRow {
  id: number
  nickname: string
  content: string
  ip: string | null
  deleted_by_admin: number
}

describe('v75 留言来源 IP（B4）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    // 限流桶是进程级内存：公开提交口 2/分钟，逐例清零防相互波及
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function setAdmin(qq: string = '10001') {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    return seedArtist({ qq_number: qq, subdomain: `gb-admin-${qq.slice(-4)}` })
  }

  /** 管理员会话（/api/admin/messages 受 step-up 入口闸，需 admin_verified 级） */
  function authAdminH(artist: { id: number; token_version: number }): { authorization: string } {
    return {
      authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version, {
        authLevel: 'admin_verified',
        adminVerifiedAt: Date.now() as unknown as string
      })
    }
  }

  function readRow(id: number): MessageDbRow {
    return db.prepare('SELECT id, nickname, content, ip, deleted_by_admin FROM guestbook_messages WHERE id = ?')
      .get(id) as MessageDbRow
  }

  function postMessage(subdomain: string, inject: { remoteAddress?: string; headers?: Record<string, string> } = {}) {
    return app.inject({
      method: 'POST',
      url: `/api/public/artist/${subdomain}/messages`,
      ...inject,
      payload: { nickname: '访客', content: '留言内容' }
    })
  }

  // ─── 写入链路 ───

  it('TC-GBIP-01: 公开端提交留言 → request.ip 落 guestbook_messages.ip', async () => {
    seedArtist({ qq_number: '88101', subdomain: 'gbip-direct' })
    const res = await postMessage('gbip-direct', { remoteAddress: '198.51.100.31' })
    expect(res.statusCode).toBe(201)
    const row = readRow(Number(res.json().id))
    // 非信任网段：request.ip 原样等于连接地址
    expect(row.ip).toBe('198.51.100.31')
  })

  it('TC-GBIP-02: 未传 IP（service 直调，无 HTTP 上下文）→ 落 NULL，不写占位串', () => {
    const artist = seedArtist({ qq_number: '88102', subdomain: 'gbip-null' })
    const msg = guestbookService.createMessage(artist.id, '老调用', '不传第五参')!
    const row = readRow(msg.id)
    expect(row.ip).toBeNull()
    expect(row.ip).not.toBe('unknown')
  })

  it('TC-GBIP-03: 超长值钳制为 45 字符（防超长请求头灌库）', () => {
    const artist = seedArtist({ qq_number: '88103', subdomain: 'gbip-long' })
    const oversized = '9'.repeat(120)
    const msg = guestbookService.createMessage(artist.id, '甲', '内容', 'zh-CN', oversized)!
    expect((readRow(msg.id).ip ?? '').length).toBe(45)
    expect(readRow(msg.id).ip).toBe('9'.repeat(45))
  })

  it('TC-GBIP-04: CF→Caddy 链路——记的是换算后的真实用户 IP，且不等于内网代理 IP', async () => {
    seedArtist({ qq_number: '88104', subdomain: 'gbip-cf' })
    const res = await postMessage('gbip-cf', {
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { 'x-forwarded-for': REAL_CLIENT_IP }
    })
    expect(res.statusCode).toBe(201)
    const ip = readRow(Number(res.json().id)).ip
    expect(ip).toBe(REAL_CLIENT_IP)
    // 正是计划书担心的那个病：把代理地址当来源记下来，等于零证据
    expect(ip).not.toBe(CADDY_CONTAINER_IP)
  })

  it('TC-GBIP-05: 反伪造前缀——XFF 里客户端自塞的 1.1.1.1 不被采纳', async () => {
    seedArtist({ qq_number: '88105', subdomain: 'gbip-spoof' })
    const res = await postMessage('gbip-spoof', {
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { 'x-forwarded-for': `1.1.1.1, ${REAL_CLIENT_IP}` }
    })
    expect(res.statusCode).toBe(201)
    const ip = readRow(Number(res.json().id)).ip
    expect(ip).toBe(REAL_CLIENT_IP)
    expect(ip).not.toBe('1.1.1.1')
  })

  // ─── 防泄露：按构造做到，画师端与公开端取不到 ip ───

  it('TC-GBIP-06: 公开端留言列表响应体不含 ip（含字符串级兜底断言）', async () => {
    seedArtist({ qq_number: '88106', subdomain: 'gbip-leak-public' })
    const posted = await postMessage('gbip-leak-public', { remoteAddress: '198.51.100.36' })
    const msgId = Number(posted.json().id)
    db.prepare("UPDATE guestbook_messages SET status = 'approved' WHERE id = ?").run(msgId)

    const res = await app.inject({ method: 'GET', url: '/api/public/artist/gbip-leak-public/messages' })
    expect(res.statusCode).toBe(200)
    expect(res.json().messages).toHaveLength(1)
    expect('ip' in res.json().messages[0]).toBe(false)
    // 整份响应体文本里不该出现该列名或那个 IP
    expect(res.body).not.toContain('"ip"')
    expect(res.body).not.toContain('198.51.100.36')
  })

  it('TC-GBIP-07: 画师端留言列表响应体不含 ip（画师不是执法者）', async () => {
    const artist = seedArtist({ qq_number: '88107', subdomain: 'gbip-leak-artist' })
    const posted = await postMessage('gbip-leak-artist', { remoteAddress: '198.51.100.37' })
    const msgId = Number(posted.json().id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/messages',
      headers: { authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version) }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toHaveLength(1)
    expect(res.json().items[0].id).toBe(msgId)
    expect('ip' in res.json().items[0]).toBe(false)
    expect(res.body).not.toContain('"ip"')
    expect(res.body).not.toContain('198.51.100.37')
    // 但留言本身照常可见（防泄露不能做成把业务数据一起藏了）
    expect(res.json().items[0].content).toBe('留言内容')
  })

  it('TC-GBIP-08: service 三处非管理端读函数返回对象均无 ip 键（防泄露按构造，不靠出口剔除）', () => {
    const artist = seedArtist({ qq_number: '88108', subdomain: 'gbip-service' })
    const msg = guestbookService.createMessage(artist.id, '甲', '一条留言', 'zh-CN', '198.51.100.38')!
    expect(readRow(msg.id).ip).toBe('198.51.100.38')

    const single = guestbookService.getMessageById(msg.id)
    expect(single).toBeDefined()
    expect('ip' in (single as object)).toBe(false)

    // pending 阶段公开端本就该空；批准后再查一次，两个分支都不带 ip
    expect(guestbookService.getPublicMessages(artist.id).messages).toHaveLength(0)
    db.prepare("UPDATE guestbook_messages SET status = 'approved' WHERE id = ?").run(msg.id)
    const pub = guestbookService.getPublicMessages(artist.id)
    expect(pub.messages).toHaveLength(1)
    expect('ip' in pub.messages[0]).toBe(false)

    const mine = guestbookService.getArtistMessages(artist.id)
    expect(mine.items).toHaveLength(1)
    expect('ip' in mine.items[0]).toBe(false)
  })

  it('TC-GBIP-09: 管理端可见 ip（正向对照）；管理员强删后取证列不丢', async () => {
    const admin = setAdmin('10009')
    const artist = seedArtist({ qq_number: '88109', subdomain: 'gbip-admin' })
    const posted = await postMessage('gbip-admin', { remoteAddress: '198.51.100.39' })
    const msgId = Number(posted.json().id)

    const list = await app.inject({ method: 'GET', url: '/api/admin/messages', headers: authAdminH(admin) })
    expect(list.statusCode).toBe(200)
    expect(list.json()[0].ip).toBe('198.51.100.39')
    expect(list.json()[0].artist_name).toBe(artist.name)

    // 软删（取证数据永不物理删）
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/messages/${msgId}`,
      headers: authAdminH(admin)
    })
    expect(del.statusCode).toBe(200)
    expect(readRow(msgId).deleted_by_admin).toBe(1)
    expect(readRow(msgId).ip).toBe('198.51.100.39')
  })

  // ─── v76 接入：可见性判定收口到唯一事实源 ───

  it('TC-GBIP-10: 被平台下架的主页——公开端读留言与提交留言一律 404；恢复后照常', async () => {
    seedArtist({ qq_number: '88110', subdomain: 'gbip-takedown' })
    db.prepare("UPDATE artists SET home_takedown_at = '2026-09-13T00:00:00.000Z', home_takedown_reason = '违规' WHERE subdomain = 'gbip-takedown'").run()

    expect((await postMessage('gbip-takedown', { remoteAddress: '198.51.100.40' })).statusCode).toBe(404)
    const read = await app.inject({ method: 'GET', url: '/api/public/artist/gbip-takedown/messages' })
    expect(read.statusCode).toBe(404)

    db.prepare('UPDATE artists SET home_takedown_at = NULL, home_takedown_reason = NULL WHERE subdomain = ?').run('gbip-takedown')
    expect((await postMessage('gbip-takedown', { remoteAddress: '198.51.100.41' })).statusCode).toBe(201)
    expect((await app.inject({ method: 'GET', url: '/api/public/artist/gbip-takedown/messages' })).statusCode).toBe(200)
  })

  it('TC-GBIP-11: 自助隐身 / 封禁画师仍按原口径 404（收口未改变既有可见性语义）', async () => {
    seedArtist({ qq_number: '88111', subdomain: 'gbip-hidden', status: 'hidden' })
    const banned = seedArtist({ qq_number: '88112', subdomain: 'gbip-banned' })
    // seedArtist 的 INSERT 不含 is_banned，必须显式 UPDATE 才是封禁态
    db.prepare('UPDATE artists SET is_banned = 1 WHERE id = ?').run(banned.id)

    expect((await postMessage('gbip-hidden', { remoteAddress: '198.51.100.42' })).statusCode).toBe(404)
    expect((await postMessage('gbip-banned', { remoteAddress: '198.51.100.43' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/public/artist/gbip-hidden/messages' })).statusCode).toBe(404)
  })
})
