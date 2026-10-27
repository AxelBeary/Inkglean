// useOrderForm 参考图归属凭据测试（G-7 / P2-13 前端侧）
// 覆盖：上传参考图携带 x-anon-token；提交带参考图时携带同一 token；无参考图下单不带 token；
//       凭证获取失败 → 上传/提交中止并提示，不发请求
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  getAnonToken: vi.fn(),
  getFreshAnonToken: vi.fn(),
  create: vi.fn(),
  reference: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: h.msgError, warning: h.msgWarning, info: vi.fn() },
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
  getAnonToken: h.getAnonToken,
  getFreshAnonToken: h.getFreshAnonToken
}))

vi.mock('../usePasteUpload.js', async () => {
  const { ref } = await import('vue')
  return {
    usePasteUpload: () => ({ pasteError: ref(null) })
  }
})

vi.mock('../../utils/sanitize.js', () => ({
  sanitizeHtml: (html: string) => html || ''
}))

import { useOrderForm } from '../useOrderForm'
import { orderApi, uploadApi } from '../../api/index'

const createMock = orderApi.create as unknown as Mock

async function createForm() {
  const formRef = ref({
    validate: vi.fn().mockResolvedValue(true),
    scrollToField: vi.fn()
  })
  let of!: ReturnType<typeof useOrderForm>
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

const FILE = { size: 1024, name: 'ref.png', uid: 'u1' } as unknown as File & { uid: string | number }
const FILE_B = { size: 1024, name: 'ref-b.png', uid: 'u2' } as unknown as File & { uid: string | number }

/** 模拟 EP onStart 落条目（v-model:file-list 下选文件即入同一数组，随后才走 http-request） */
function landRefItem(of: ReturnType<typeof useOrderForm>, file: File & { uid: string | number } = FILE) {
  of.refFileList.value.push({ name: file.name, uid: file.uid, status: 'ready' })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getAnonToken.mockReset()
  h.getFreshAnonToken.mockReset()
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
    landRefItem(of)
    await of.handleRefUpload({ file: FILE }) // 上传成功即回填参考图路径到同一数组
    of.form.clientQq = '12345'
    of.form.agreed = true

    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
    const [payload, options] = createMock.mock.calls[0]
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
    const [, options] = createMock.mock.calls[0]
    expect(options.headers['x-anon-token']).toBeUndefined()
    expect(options.headers['idempotency-key']).toBeDefined()
  })

  it('提交复用上传成功时记录的凭证（期间凭证链路失效也不影响下单）', async () => {
    // 上传时凭证可用并记录；提交时获取链路已失效（如埋点 400 清缓存）→ 仍用上传同源 token
    h.getAnonToken.mockResolvedValue('anon-token-abc')
    const of = await createForm()
    landRefItem(of)
    await of.handleRefUpload({ file: FILE })
    of.form.clientQq = '12345'
    of.form.agreed = true

    h.getAnonToken.mockResolvedValue(null)
    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
    const [, options] = createMock.mock.calls[0]
    expect(options.headers['x-anon-token']).toBe('anon-token-abc')
  })

  it('凭证获取失败：上传中止，不调上传接口', async () => {
    h.getAnonToken.mockResolvedValue(null)
    const of = await createForm()

    await expect(of.handleRefUpload({ file: FILE })).rejects.toThrow('orderForm.anonTokenRequired')
    expect(uploadApi.reference).not.toHaveBeenCalled()
  })

  it('上传遇 INVALID_ANON_TOKEN：清缓存换新凭证重试一次，提交用新凭证', async () => {
    const invalid = Object.assign(new Error('缺少有效匿名凭证（x-anon-token）'), { status: 400, code: 'INVALID_ANON_TOKEN' })
    h.getAnonToken.mockResolvedValue('anon-token-stale')
    h.getFreshAnonToken.mockResolvedValue('anon-token-fresh')
    h.reference
      .mockRejectedValueOnce(invalid)
      .mockResolvedValueOnce({ filePath: 'references/r.png', url: '/uploads/references/r.png' })

    const of = await createForm()
    landRefItem(of)
    await of.handleRefUpload({ file: FILE })

    expect(h.reference).toHaveBeenCalledTimes(2)
    expect(h.reference).toHaveBeenNthCalledWith(1, FILE, { headers: { 'x-anon-token': 'anon-token-stale' } })
    expect(h.reference).toHaveBeenNthCalledWith(2, FILE, { headers: { 'x-anon-token': 'anon-token-fresh' } })
    expect(h.getFreshAnonToken).toHaveBeenCalledTimes(1)

    of.form.clientQq = '12345'
    of.form.agreed = true
    await of.submit()
    const [, options] = createMock.mock.calls[0]
    expect(options.headers['x-anon-token']).toBe('anon-token-fresh')
  })

  it('换新凭证也失败：透传原始错误并提示，不静默吞掉', async () => {
    const invalid = Object.assign(new Error('缺少有效匿名凭证（x-anon-token）'), { status: 400, code: 'INVALID_ANON_TOKEN' })
    h.getAnonToken.mockResolvedValue('anon-token-stale')
    h.getFreshAnonToken.mockResolvedValue(null)
    h.reference.mockRejectedValue(invalid)

    const of = await createForm()
    await expect(of.handleRefUpload({ file: FILE })).rejects.toThrow('缺少有效匿名凭证（x-anon-token）')

    expect(h.reference).toHaveBeenCalledTimes(1)
    expect(h.getFreshAnonToken).toHaveBeenCalledTimes(1)
    expect(h.msgError).toHaveBeenCalledWith('缺少有效匿名凭证（x-anon-token）')
  })
})

// issue #50-8：整表参考图必须同一凭证——凭证中途换新不得静默混提
describe('useOrderForm 上传凭证锁定（#50-8）', () => {
  it('首次上传后凭证换新 → 旧批参考图被清空并提示需重传，提交只带新凭证的图', async () => {
    h.getAnonToken.mockResolvedValue('anon-token-old')
    const of = await createForm()
    landRefItem(of)
    await of.handleRefUpload({ file: FILE })
    expect(of.refFileList.value.map(f => f.filePath)).toEqual(['references/r.png'])

    // anonUpload 内部换新（旧凭证失效重试）：第二次上传用的是新凭证
    h.getAnonToken.mockResolvedValue('anon-token-new')
    h.reference.mockImplementationOnce((file: File) => Promise.resolve({
      filePath: `references/${file.name}`, url: `/uploads/references/${file.name}`
    }))
    landRefItem(of, FILE_B)
    await of.handleRefUpload({ file: FILE_B })

    expect(of.refFileList.value.map(f => f.filePath)).toEqual(['references/ref-b.png'])
    expect(h.msgWarning).toHaveBeenCalledWith('orderForm.refTokenRotated')

    of.form.clientQq = '12345'
    of.form.agreed = true
    await of.submit()
    const [payload, options] = createMock.mock.calls[0]
    expect(payload.references).toEqual(['references/ref-b.png'])
    expect(options.headers['x-anon-token']).toBe('anon-token-new')
  })

  it('凭证未变 → 参考图全部保留并随提交发出', async () => {
    h.getAnonToken.mockResolvedValue('anon-token-abc')
    const of = await createForm()
    landRefItem(of)
    await of.handleRefUpload({ file: FILE })
    h.reference.mockImplementationOnce((file: File) => Promise.resolve({
      filePath: `references/${file.name}`, url: `/uploads/references/${file.name}`
    }))
    landRefItem(of, FILE_B)
    await of.handleRefUpload({ file: FILE_B })

    expect(of.refFileList.value.map(f => f.filePath)).toEqual(['references/r.png', 'references/ref-b.png'])
    expect(h.msgWarning).not.toHaveBeenCalled()

    of.form.clientQq = '12345'
    of.form.agreed = true
    await of.submit()
    const [payload, options] = createMock.mock.calls[0]
    expect(payload.references).toEqual(['references/r.png', 'references/ref-b.png'])
    expect(options.headers['x-anon-token']).toBe('anon-token-abc')
  })

  it('无参考图时凭证换新 → 不提示、不阻塞（没有旧批可混）', async () => {
    h.getAnonToken.mockResolvedValue('anon-token-old')
    const of = await createForm()
    landRefItem(of)
    await of.handleRefUpload({ file: FILE })
    // 用户把已传的图删了：列表里无旧批条目
    of.refFileList.value.splice(0)

    h.getAnonToken.mockResolvedValue('anon-token-new')
    h.reference.mockImplementationOnce((file: File) => Promise.resolve({
      filePath: `references/${file.name}`, url: `/uploads/references/${file.name}`
    }))
    landRefItem(of, FILE_B)
    await of.handleRefUpload({ file: FILE_B })

    expect(h.msgWarning).not.toHaveBeenCalled()
    expect(of.refFileList.value.map(f => f.filePath)).toEqual(['references/ref-b.png'])

    of.form.clientQq = '12345'
    of.form.agreed = true
    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0][1].headers['x-anon-token']).toBe('anon-token-new')
  })
})
