// useOrderForm 参考图归属凭据测试（G-7 / P2-13 前端侧）
// 覆盖：上传参考图携带 x-anon-token；提交带参考图时携带同一 token；无参考图下单不带 token；
//       凭证获取失败 → 上传/提交中止并提示，不发请求
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const h = vi.hoisted(() => ({
  getAnonToken: vi.fn(),
  create: vi.fn(),
  reference: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: h.msgError, warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
}))

vi.mock('../../api/index.js', () => ({
  artistPublicApi: {
    getProfile: () => Promise.resolve({ subdomain: 'alice', rules: '' }),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getPricing: () => Promise.resolve({ styles: [], installments: [], discountEnabled: false }),
    getPublicStyles: () => Promise.resolve([]),
    calculateStylePrice: () => Promise.resolve(null)
  },
  orderApi: { create: h.create },
  uploadApi: { reference: h.reference }
}))

vi.mock('../../utils/track.js', () => ({
  getAnonToken: h.getAnonToken
}))

vi.mock('../usePasteUpload.js', async () => {
  const { ref } = await import('vue')
  return {
    usePasteUpload: () => ({ pasteError: ref(null) })
  }
})

vi.mock('../../utils/sanitize.js', () => ({
  sanitizeHtml: (html) => html || ''
}))

import { useOrderForm } from '../useOrderForm.js'
import { orderApi, uploadApi } from '../../api/index.js'

async function createForm() {
  const formRef = ref({
    validate: vi.fn().mockResolvedValue(true),
    scrollToField: vi.fn()
  })
  let of
  mount({
    setup() {
      of = useOrderForm('alice', formRef)
      return {}
    },
    template: '<div />'
  })
  await flushPromises()
  return of
}

const FILE = { size: 1024, name: 'ref.png', uid: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  h.getAnonToken.mockReset()
  h.create.mockReset().mockResolvedValue({ orderNo: 'ALICE-001' })
  h.reference.mockReset().mockResolvedValue({ filePath: 'references/r.png', url: '/uploads/references/r.png' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useOrderForm 参考图归属凭据（G-7）', () => {
  it('上传参考图携带 x-anon-token（与下单同 token 链路）', async () => {
    h.getAnonToken.mockResolvedValue('anon-token-abc')
    const of = await createForm()

    await of.handleRefUpload({ file: FILE })
    expect(uploadApi.reference).toHaveBeenCalledWith(FILE, {
      headers: { 'x-anon-token': 'anon-token-abc' }
    })
  })

  it('带参考图提交：同一 x-anon-token + 幂等键同时携带', async () => {
    h.getAnonToken.mockResolvedValue('anon-token-abc')
    const of = await createForm()
    await of.handleRefUpload({ file: FILE }) // 上传成功即持有参考图路径
    of.form.clientQq = '12345'
    of.form.agreed = true

    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
    const [payload, options] = orderApi.create.mock.calls[0]
    expect(payload.references).toEqual(['references/r.png'])
    expect(options.headers['x-anon-token']).toBe('anon-token-abc')
    expect(options.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('无参考图下单：不带 x-anon-token（幂等键照常）', async () => {
    h.getAnonToken.mockResolvedValue('anon-token-abc')
    const of = await createForm()
    of.form.clientQq = '12345'
    of.form.agreed = true

    await of.submit()
    const [, options] = orderApi.create.mock.calls[0]
    expect(options.headers['x-anon-token']).toBeUndefined()
    expect(options.headers['idempotency-key']).toBeDefined()
  })

  it('凭证获取失败：带参考图提交中止，不发下单请求', async () => {
    // 上传时凭证可用；提交时凭证链路失效 → 中止
    h.getAnonToken.mockResolvedValueOnce('anon-token-abc').mockResolvedValue(null)
    const of = await createForm()
    await of.handleRefUpload({ file: FILE })
    of.form.clientQq = '12345'
    of.form.agreed = true

    await of.submit()
    expect(orderApi.create).not.toHaveBeenCalled()
    expect(h.msgError).toHaveBeenCalledWith('orderForm.anonTokenRequired')
  })

  it('凭证获取失败：上传中止，不调上传接口', async () => {
    h.getAnonToken.mockResolvedValue(null)
    const of = await createForm()

    await expect(of.handleRefUpload({ file: FILE })).rejects.toThrow('orderForm.anonTokenRequired')
    expect(uploadApi.reference).not.toHaveBeenCalled()
  })
})
