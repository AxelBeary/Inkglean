import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Writable } from 'stream'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { getAdminQq } from '../src/shared/middleware/auth.js'
import { buildApp } from '../src/app.js'

// ============================================
// P1 修复批（2026-09-12）：管理员判定残留环境变量回退
// 口径：platform_config.admin_qq 是唯一真值；库值为空 → getAdminQq() 返回空串
// （无人是管理员），不再回退 process.env.ADMIN_QQ。
// 配套强制交付物：库值为空但 env 配了 ADMIN_QQ 时，启动自检 log.warn 引导落库
//（只告警，不写库、不参与判定）。
// 注：db/seed.ts 的 process.env.ADMIN_QQ || '10003' 属 dev-only 种子（有
// assertSeedAllowed 生产门禁），本次保留不动，不在本文件断言范围内。
// ============================================

const ORIGINAL_ADMIN_QQ = process.env.ADMIN_QQ

const ADMIN_WARN_KEY = 'platform_config.admin_qq'

/** 写库值（UPSERT：不依赖 initDatabase 是否已插过该 key） */
function setAdminQqInDb(value: string): void {
  db.prepare(`
    INSERT INTO platform_config (key, value) VALUES ('admin_qq', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(value)
}

/** 读库值原文（副作用断言用：缺行与空串要能区分） */
function readAdminQqInDb(): string {
  const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'")
    .get() as { value: string | null } | undefined
  return row ? `row:${row.value}` : 'no-row'
}

/** 捕获型 logger（pino JSON 行 → 只取 msg 文本；口径同 routes.test.ts 的 823 用例） */
function createLogCapture(): { stream: Writable; msgs: string[] } {
  const msgs: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      try {
        const rec = JSON.parse(chunk.toString()) as { msg?: string }
        if (typeof rec.msg === 'string') msgs.push(rec.msg)
      } catch { /* 非 JSON 行（子进程噪音等）跳过 */ }
      cb()
    }
  })
  return { stream, msgs }
}

describe('P1 修复批：管理员判定唯一真值（不再回退 ADMIN_QQ 环境变量）', () => {
  let app: FastifyInstance | undefined

  beforeEach(() => {
    cleanDb()
    // cleanDb 不清 platform_config（跨用例残留），本组用例一律显式置空库值
    setAdminQqInDb('')
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
    if (ORIGINAL_ADMIN_QQ === undefined) delete process.env.ADMIN_QQ
    else process.env.ADMIN_QQ = ORIGINAL_ADMIN_QQ
  })

  it('TC-AQS-01: 库值为空 + env 有值 → getAdminQq() 返回空串（回退不再生效）且无副作用', () => {
    process.env.ADMIN_QQ = '70001'

    expect(getAdminQq()).toBe('')
    // 无副作用：不回填库值、不动画师表（去回退只做减法，不引入任何写路径）
    expect(readAdminQqInDb()).toBe('row:')
    expect((db.prepare('SELECT COUNT(*) AS c FROM artists').get() as { c: number }).c).toBe(0)
  })

  it('TC-AQS-02: 库值为空时 env 那个 QQ 的画师不是管理员（403 之外无副作用）', async () => {
    process.env.ADMIN_QQ = '70002'
    const artist = seedArtist({ qq_number: '70002', subdomain: 'envqq' })
    const token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${token}` } })
    expect(me.statusCode).toBe(200)
    expect(me.json().isAdmin).toBe(false)

    const admin = await app.inject({ method: 'GET', url: '/api/admin/artists', headers: { Authorization: `Bearer ${token}` } })
    expect(admin.statusCode).toBe(403)
    expect(admin.json().code).toBe('ADMIN_REQUIRED')
    // 判定路径不写库、不改会话/画师数据
    expect(readAdminQqInDb()).toBe('row:')
    const row = db.prepare('SELECT token_version, is_banned, deleted_at FROM artists WHERE id = ?')
      .get(artist.id) as { token_version: number; is_banned: number; deleted_at: string | null }
    expect(row.token_version).toBe(artist.token_version)
    expect(row.is_banned).toBe(0)
    expect(row.deleted_at).toBeNull()
  })

  it('TC-AQS-03: 库值与 env 不同值时只认库值（库值画师仍是管理员，未把人锁死）', async () => {
    process.env.ADMIN_QQ = '70003'
    setAdminQqInDb('70004')
    const dbAdmin = seedArtist({ qq_number: '70004', subdomain: 'dbadmin' })
    const envArtist = seedArtist({ qq_number: '70003', subdomain: 'envadmin' })
    app = await buildApp({ logger: false })
    await app.ready()

    expect(getAdminQq()).toBe('70004')

    // env 里那个号：非管理员
    const envToken = createSession(envArtist.id, envArtist.token_version)
    const meEnv = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${envToken}` } })
    expect(meEnv.json().isAdmin).toBe(false)
    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/artists', headers: { Authorization: `Bearer ${envToken}` } })
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json().code).toBe('ADMIN_REQUIRED')

    // 库值里那个号：管理员（requireAdmin + REQ-041 step-up 升级会话）
    const stepUpToken = createSession(dbAdmin.id, dbAdmin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: Date.now() as unknown as string
    })
    const ok = await app.inject({ method: 'GET', url: '/api/admin/artists', headers: { Authorization: `Bearer ${stepUpToken}` } })
    expect(ok.statusCode).toBe(200)
    const meAdmin = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${stepUpToken}` } })
    expect(meAdmin.json().isAdmin).toBe(true)
  })

  it('TC-AQS-04: 启动自检——库空 + env 有值 → warn 引导落库（不写库、不改判定）', async () => {
    process.env.ADMIN_QQ = '70005'
    const capture = createLogCapture()
    app = await buildApp({ logger: capture.stream })
    await app.ready()

    const warn = capture.msgs.find(m => m.includes(ADMIN_WARN_KEY)) ?? ''
    expect(warn).not.toBe('')
    expect(warn).toContain('ADMIN_QQ 已不再参与判定')
    expect(warn).toContain('更换管理员')
    expect(warn).toContain('落库')
    // 只告警：库值仍是空的，判定结果也仍是「无人是管理员」
    expect(readAdminQqInDb()).toBe('row:')
    expect(getAdminQq()).toBe('')
  })

  it('TC-AQS-05: 库值已落库 / env 未配 → 不误报告警', async () => {
    // 情形一：env 有值但库值已落库 → 唯一真值可用，无需告警
    process.env.ADMIN_QQ = '70006'
    setAdminQqInDb('70007')
    const c1 = createLogCapture()
    app = await buildApp({ logger: c1.stream })
    await app.ready()
    expect(c1.msgs.some(m => m.includes(ADMIN_WARN_KEY))).toBe(false)
    expect(getAdminQq()).toBe('70007')
    await app.close()
    app = undefined

    // 情形二：env 未配且库值为空 → 没有「靠 env 提供管理员号」的历史包袱，不打扰
    delete process.env.ADMIN_QQ
    setAdminQqInDb('')
    const c2 = createLogCapture()
    app = await buildApp({ logger: c2.stream })
    await app.ready()
    expect(c2.msgs.some(m => m.includes(ADMIN_WARN_KEY))).toBe(false)
    expect(getAdminQq()).toBe('')
  })
})
