// issue #52-7: setup store 的三个写接口必须「先判 res.ok 再解析」
// 旧实现先 res.json() 再判 ok：5xx/反代 HTML 错误页会抛 SyntaxError，
// 把「服务器报错」伪装成「解析失败」，调用方拿不到 status/code 也展示不出错误文案。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } }
}))

import { useSetupStore } from '../setup'

/** 非 JSON 错误体（反代 502/HTML 错误页的典型形状） */
function htmlResponse(status: number): Response {
  return new Response('<html><body>Bad Gateway</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' }
  })
}

describe('setup store 先判 ok 后解析（issue #52-7）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('submitAdmin：500 + 非法 JSON → 抛带 status 的业务错误，而不是解析错', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(htmlResponse(500))))

    const err = (await useSetupStore().submitAdmin({ qq: '10001' }).catch(e => e)) as {
      message: string; status?: number; code?: string
    }

    expect(err.message).toBe('setup.submitAdminFailed')
    expect(err.status).toBe(500)
    expect(err.code).toBeUndefined()
  })

  it('submitAdmin：409 + JSON 错误体 → 透传后端 error/code/status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ code: 'SETUP_ALREADY_DONE', error: '已完成初始化' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    ))))

    const err = (await useSetupStore().submitAdmin({}).catch(e => e)) as {
      message: string; status?: number; code?: string
    }

    expect(err.message).toBe('已完成初始化')
    expect(err.code).toBe('SETUP_ALREADY_DONE')
    expect(err.status).toBe(409)
  })

  it('confirmTotp：500 + 非法 JSON → 走失败分支而非抛解析错', async () => {
    const store = useSetupStore()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(htmlResponse(502))))

    const err = (await store.confirmTotp('123456').catch(e => e)) as {
      message: string; status?: number
    }

    expect(err.message).toBe('setup.confirmTotpFailed')
    expect(err.status).toBe(502)
    expect(store.initialized).toBe(false) // 失败不得把向导标成已完成
  })

  it('成功路径不受影响：ok 才解析并回填管理员字段', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      artist: { qqNumber: '10001', name: '画师A' },
      totpSecret: 'SECRET',
      otpauthUri: 'otpauth://x'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))))

    const store = useSetupStore()
    const res = await store.submitAdmin({})
    expect(res.artist.name).toBe('画师A')
    expect(store.adminName).toBe('画师A')
    expect(store.totpSecret).toBe('SECRET')
  })
})
