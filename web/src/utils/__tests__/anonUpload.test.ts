// anonUpload 参考图匿名凭证链路单测（817-B2 加固）
// 覆盖：上传前凭证先行；INVALID_ANON_TOKEN → 换新凭证重试一次；
//       换新失败透传原始错误；凭证获取失败不发请求；非凭证错误不触发换新。
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 上传成功返回体（与 uploadApi.reference 一致） */
interface UploadedRef {
  filePath: string
  url: string
}

const h = vi.hoisted(() => ({
  getAnonToken: vi.fn<() => Promise<string | null>>(),
  getFreshAnonToken: vi.fn<() => Promise<string | null>>(),
  reference: vi.fn<(...args: unknown[]) => Promise<UploadedRef>>(),
  signReferences: vi.fn<(paths: string[], opts?: unknown) => Promise<{ items: Array<{ filePath: string; url: string }> }>>()
}))

vi.mock('../track.js', () => ({
  getAnonToken: h.getAnonToken,
  getFreshAnonToken: h.getFreshAnonToken
}))

vi.mock('../../api/index.js', () => ({
  uploadApi: { reference: h.reference, signReferences: h.signReferences }
}))

import { uploadReferenceWithAnonToken, signReferenceUrlsWithAnonToken, AnonTokenUnavailableError } from '../anonUpload'

const FILE = { size: 1024, name: 'ref.png', uid: 'u1' } as unknown as Blob
const UPLOADED: UploadedRef = { filePath: 'references/r.png', url: '/uploads/references/r.png' }

function invalidTokenError(): Error {
  return Object.assign(new Error('缺少有效匿名凭证（x-anon-token）'), { status: 400, code: 'INVALID_ANON_TOKEN' })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getAnonToken.mockReset().mockResolvedValue('anon-token-abc')
  h.getFreshAnonToken.mockReset().mockResolvedValue('anon-token-fresh')
  h.reference.mockReset().mockResolvedValue(UPLOADED)
  h.signReferences.mockReset().mockResolvedValue({ items: [] })
})

describe('uploadReferenceWithAnonToken（G-7/F-10 统一链路）', () => {
  it('上传前持有凭证并携带 x-anon-token，返回实际使用凭证', async () => {
    const result = await uploadReferenceWithAnonToken(FILE)

    expect(h.getAnonToken).toHaveBeenCalledTimes(1)
    expect(h.reference).toHaveBeenCalledWith(FILE, { headers: { 'x-anon-token': 'anon-token-abc' } })
    expect(result).toEqual({ token: 'anon-token-abc', uploaded: UPLOADED })
  })

  it('INVALID_ANON_TOKEN：清缓存换新凭证并重试一次', async () => {
    h.reference
      .mockRejectedValueOnce(invalidTokenError())
      .mockResolvedValueOnce(UPLOADED)

    const result = await uploadReferenceWithAnonToken(FILE)

    expect(h.getFreshAnonToken).toHaveBeenCalledTimes(1)
    expect(h.reference).toHaveBeenCalledTimes(2)
    expect(h.reference).toHaveBeenNthCalledWith(1, FILE, { headers: { 'x-anon-token': 'anon-token-abc' } })
    expect(h.reference).toHaveBeenNthCalledWith(2, FILE, { headers: { 'x-anon-token': 'anon-token-fresh' } })
    expect(result.token).toBe('anon-token-fresh')
  })

  it('换新凭证失败：透传原始 INVALID 错误，不掩盖', async () => {
    h.getFreshAnonToken.mockResolvedValue(null)
    h.reference.mockRejectedValue(invalidTokenError())

    await expect(uploadReferenceWithAnonToken(FILE)).rejects.toThrow('缺少有效匿名凭证（x-anon-token）')
    expect(h.reference).toHaveBeenCalledTimes(1)
  })

  it('凭证获取失败：抛 AnonTokenUnavailableError，不发上传请求', async () => {
    h.getAnonToken.mockResolvedValue(null)

    await expect(uploadReferenceWithAnonToken(FILE)).rejects.toBeInstanceOf(AnonTokenUnavailableError)
    expect(h.reference).not.toHaveBeenCalled()
  })

  it('非凭证错误（如限流 429）：不换新、不透传错码路径', async () => {
    const rateLimited = Object.assign(new Error('上传过于频繁，请稍后再试'), { status: 429, code: 'RATE_LIMITED' })
    h.reference.mockRejectedValue(rateLimited)

    await expect(uploadReferenceWithAnonToken(FILE)).rejects.toThrow('上传过于频繁，请稍后再试')
    expect(h.getFreshAnonToken).not.toHaveBeenCalled()
    expect(h.reference).toHaveBeenCalledTimes(1)
  })
})

// issue #82 补：草稿恢复按 filePath 现签预览 URL
describe('signReferenceUrlsWithAnonToken（草稿参考图现签）', () => {
  const PATHS = ['references/a.png', 'references/b.png']

  it('空数组：不发请求、直接返回空表', async () => {
    const urls = await signReferenceUrlsWithAnonToken([])
    expect(urls.size).toBe(0)
    expect(h.signReferences).not.toHaveBeenCalled()
    expect(h.getAnonToken).not.toHaveBeenCalled()
  })

  it('带 x-anon-token 请求，按 filePath 建表（缺席即失效，不补空值）', async () => {
    h.signReferences.mockResolvedValueOnce({
      items: [{ filePath: 'references/a.png', url: '/uploads/references/a.png?sig=x' }]
    })

    const urls = await signReferenceUrlsWithAnonToken(PATHS)

    expect(h.signReferences).toHaveBeenCalledWith(PATHS, { headers: { 'x-anon-token': 'anon-token-abc' } })
    expect(urls.get('references/a.png')).toBe('/uploads/references/a.png?sig=x')
    // 服务端签不出来的路径不能凭空补 url，否则前端会把死图当活图
    expect(urls.has('references/b.png')).toBe(false)
  })

  it('INVALID_ANON_TOKEN：换新凭证重试一次', async () => {
    h.signReferences
      .mockRejectedValueOnce(invalidTokenError())
      .mockResolvedValueOnce({ items: [{ filePath: 'references/a.png', url: '/uploads/references/a.png?sig=fresh' }] })

    const urls = await signReferenceUrlsWithAnonToken(['references/a.png'])

    expect(h.getFreshAnonToken).toHaveBeenCalledTimes(1)
    expect(h.signReferences).toHaveBeenNthCalledWith(2, ['references/a.png'], { headers: { 'x-anon-token': 'anon-token-fresh' } })
    expect(urls.get('references/a.png')).toContain('sig=fresh')
  })

  it('凭证获取失败：抛 AnonTokenUnavailableError，不发请求', async () => {
    h.getAnonToken.mockResolvedValue(null)

    await expect(signReferenceUrlsWithAnonToken(PATHS)).rejects.toBeInstanceOf(AnonTokenUnavailableError)
    expect(h.signReferences).not.toHaveBeenCalled()
  })

  it('非凭证错误：不换新、原样抛（调用方据此保留条目）', async () => {
    h.signReferences.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

    await expect(signReferenceUrlsWithAnonToken(PATHS)).rejects.toThrow('boom')
    expect(h.getFreshAnonToken).not.toHaveBeenCalled()
  })
})
