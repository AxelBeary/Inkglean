// ============================================
// P1 余批：onboarding_mode 写入通道
//   - POST /api/setup/onboarding-mode（setup 阶段专用守卫 + 生命周期 410）
//   - 直接改库模拟 manual 的行为测试在 invite.test.ts TC-INV-12（另一码事）
// ============================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { buildApp } from '../src/app.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

/** platform_config 单值回读行 */
interface ConfigRow {
  value: string
}

/** 读取 onboarding_mode 落库真值（不信任响应体，直查库） */
function readMode(): string {
  return (db.prepare("SELECT value FROM platform_config WHERE key = 'onboarding_mode'").get() as ConfigRow).value
}

describe('P1 余批：POST /api/setup/onboarding-mode 写入通道', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    initDatabase(db)
    // 未初始化态：清空 admin_qq / setup_completed → isSetupCompleted()=false → guardSetupGone 放行
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'admin_qq'").run()
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'setup_completed'").run()
    // 默认入驻模式 invite（migrate INSERT OR IGNORE 预置值）
    db.prepare("UPDATE platform_config SET value = 'invite' WHERE key = 'onboarding_mode'").run()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── 合法值：落库真值断言 ───

  it('写入 manual：响应 {ok,mode}，库值真的变成 manual', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/setup/onboarding-mode', payload: { mode: 'manual' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, mode: 'manual' })
    expect(readMode()).toBe('manual')
  })

  it('写入 invite：从 manual 覆盖回 invite（UPDATE 命中既有行）', async () => {
    // 先置为 manual，使「写 invite」成为可观察的变更（证明 UPDATE 能覆盖既有行）
    db.prepare("UPDATE platform_config SET value = 'manual' WHERE key = 'onboarding_mode'").run()
    expect(readMode()).toBe('manual')

    const res = await app.inject({ method: 'POST', url: '/api/setup/onboarding-mode', payload: { mode: 'invite' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, mode: 'invite' })
    expect(readMode()).toBe('invite')
  })

  // ─── 非法值：400 且不落库 ───

  it('非法 mode：400 SETUP_ONBOARDING_MODE_INVALID，库值保持 invite 不变', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/setup/onboarding-mode', payload: { mode: 'delete' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('SETUP_ONBOARDING_MODE_INVALID')
    expect(readMode()).toBe('invite')
  })

  // ─── 生命周期：已初始化后调用被拒（最重要——防部署期口子变常态后台口子） ───

  it('已初始化状态：调用被拒 410 SETUP_GONE，库值不变', async () => {
    // 造已初始化态：admin_qq 已写 + 管理员画师存在且已绑 TOTP（seedArtist 默认即已绑定态）
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    seedArtist({ qq_number: '10001', subdomain: 'admin' })

    const res = await app.inject({ method: 'POST', url: '/api/setup/onboarding-mode', payload: { mode: 'manual' } })
    expect(res.statusCode).toBe(410)
    expect(res.json().code).toBe('SETUP_GONE')
    expect(readMode()).toBe('invite')
  })

  // ─── 幂等：重复调用第二次仍 ok 且值正确 ───

  it('重复调用幂等：连续两次 manual 均 200，库值恒为 manual', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/setup/onboarding-mode', payload: { mode: 'manual' } })
    const second = await app.inject({ method: 'POST', url: '/api/setup/onboarding-mode', payload: { mode: 'manual' } })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ ok: true, mode: 'manual' })
    expect(readMode()).toBe('manual')
  })
})
