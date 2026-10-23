// 审计 #23 条目 1：setup（首次部署）错误码原样显示给用户
// AppError 的 message 就是码名本身（super(code)），全局处理器回落顺序是
// ERROR_MESSAGES[code] || error.message ⇒ 没登记进文案表的码会直接把 SETUP_TOKEN_INVALID 打给首次部署者。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { ERROR_MESSAGES } from '../src/shared/errors.js'
import { buildApp } from '../src/app.js'

const SETUP_CODES = [
  'SETUP_TOKEN_INVALID',
  'SETUP_ALREADY_DONE',
  'SETUP_GONE',
  'SETUP_ONBOARDING_MODE_INVALID',
  'DEFAULT_ADDONS_SEED_FAILED'
] as const

const ORIGINAL_TOKEN = process.env.SETUP_TOKEN

/** isSetupCompleted 的口径＝admin_qq 有值 + 该画师存在且已绑 TOTP（只看配置位会误判未完成） */
function markSetupCompleted(): void {
  const artist = seedArtist({ qq_number: '100200300', subdomain: 'setup-done-admin' })
  db.prepare('UPDATE artists SET totp_verified = 1 WHERE id = ?').run(artist.id)
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(String(artist.qq_number))
  db.prepare("UPDATE platform_config SET value = 'yes' WHERE key = 'setup_completed'").run()
}

beforeAll(() => {
  process.env.SETUP_TOKEN = 'seed-check-token'
})

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.SETUP_TOKEN
  else process.env.SETUP_TOKEN = ORIGINAL_TOKEN
})

describe('setup 错误码文案登记（#23-1）', () => {
  beforeEach(() => {
    cleanDb()
    initDatabase(db)
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'setup_completed'").run()
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'admin_qq'").run()
  })

  it('TC-SEM-01: 五个 setup 码都在 ERROR_MESSAGES 里，且文案不是码名本身', () => {
    for (const code of SETUP_CODES) {
      const msg = ERROR_MESSAGES[code]
      expect(msg, `${code} 应有中文文案`).toBeTruthy()
      expect(msg).not.toBe(code)
      // 文案必须是给人看的中文句子，不是机器码或占位
      expect(/[\u4e00-\u9fff]/.test(msg), `${code} 文案应可读`).toBe(true)
    }
  })

  it('TC-SEM-02: 安装口令错误 → 响应体给中文，不再漏码名', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/api/setup/admin',
      payload: { token: 'wrong-token', qqNumber: '100200300', name: '测试画师' }
    })

    expect(res.statusCode).toBe(403)
    const body = res.json() as { code: string; error: string }
    expect(body.code).toBe('SETUP_TOKEN_INVALID')
    expect(body.error).toBe(ERROR_MESSAGES.SETUP_TOKEN_INVALID)
    expect(body.error).not.toContain('SETUP_TOKEN_INVALID')
    await app.close()
  })

  it('TC-SEM-03: 向导已销毁 → 410 也给可读文案（A2 物理销毁路径同样登记）', async () => {
    markSetupCompleted()
    const app = await buildApp({ logger: false })
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/api/setup/admin',
      payload: { token: 'seed-check-token', qqNumber: '100200300', name: '测试画师' }
    })

    expect(res.statusCode).toBe(410)
    const body = res.json() as { code: string; error: string }
    expect(body.code).toBe('SETUP_GONE')
    expect(body.error).toBe(ERROR_MESSAGES.SETUP_GONE)
    await app.close()
  })
})
