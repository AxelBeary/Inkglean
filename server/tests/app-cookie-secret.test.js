import { describe, it, expect, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'

// L-9（审计 五#8）: fastifyCookie 兜底链末端弱默认字符串删除——
// 生产环境 COOKIE_SECRET/SESSION_SECRET 均缺省时拒绝启动（fail-fast）
describe('cookie 密钥兜底 (L-9)', () => {
  const saved = {
    cookie: process.env.COOKIE_SECRET,
    session: process.env.SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV
  }

  afterEach(() => {
    if (saved.cookie === undefined) delete process.env.COOKIE_SECRET
    else process.env.COOKIE_SECRET = saved.cookie
    if (saved.session === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = saved.session
    if (saved.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = saved.nodeEnv
  })

  it('TC-COOKIE-G1: 生产环境无任何密钥时 buildApp 拒绝启动', async () => {
    delete process.env.COOKIE_SECRET
    delete process.env.SESSION_SECRET
    process.env.NODE_ENV = 'production'

    let caught = null
    try {
      await buildApp({ logger: false })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught.message).toContain('COOKIE_SECRET/SESSION_SECRET 未设置')
  })
})
