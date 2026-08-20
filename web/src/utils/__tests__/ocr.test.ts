// ocr.ts 单测（820 第二批：本地图片识别封装）
// mock tesseract.js：只测封装自身的校验/单例/错误包装契约，不触发真实识别库下载
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recognizeImageText, OCR_MAX_SIZE_MB, __resetOcrWorkerForTest } from '../ocr'

// ─── mock tesseract.js（createWorker 工厂可逐用例定制返回；default 自指满足 CJS interop） ───
const recognizeMock = vi.fn()
const terminateMock = vi.fn()
const createWorkerMock = vi.fn()

vi.mock('tesseract.js', () => {
  const mod = { createWorker: (...args: unknown[]) => createWorkerMock(...args) }
  return { ...mod, default: mod }
})

function mockWorkerOk(text: string) {
  recognizeMock.mockResolvedValue({ data: { text } })
  createWorkerMock.mockResolvedValue({ recognize: recognizeMock, terminate: terminateMock })
}

function pngFile(name = 'chat.png'): File {
  return new File(['fake'], name, { type: 'image/png' })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetOcrWorkerForTest()
})

describe('recognizeImageText 基础链路', () => {
  it('识别成功 → 返回 trim 后的文本', async () => {
    mockWorkerOk('  QQ 12345678 想要头像\n ')
    const text = await recognizeImageText(pngFile())
    expect(text).toBe('QQ 12345678 想要头像')
  })

  it('识别结果为空 → 返回空串（由 UI 层提示，不猜）', async () => {
    mockWorkerOk('   \n ')
    await expect(recognizeImageText(pngFile())).resolves.toBe('')
  })

  it('识别语言含中文（chi_sim）', async () => {
    mockWorkerOk('ok')
    await recognizeImageText(pngFile())
    expect(createWorkerMock).toHaveBeenCalledWith(expect.arrayContaining(['chi_sim', 'eng']))
  })
})

describe('入参校验（不合法不进识别器）', () => {
  it('非图片类型 → OcrError(not-image)', async () => {
    const f = new File(['x'], 'a.txt', { type: 'text/plain' })
    await expect(recognizeImageText(f)).rejects.toMatchObject({ kind: 'not-image' })
    expect(createWorkerMock).not.toHaveBeenCalled()
  })

  it('超过大小上限 → OcrError(too-big)', async () => {
    const f = pngFile()
    Object.defineProperty(f, 'size', { value: (OCR_MAX_SIZE_MB + 1) * 1024 * 1024 })
    await expect(recognizeImageText(f)).rejects.toMatchObject({ kind: 'too-big' })
    expect(createWorkerMock).not.toHaveBeenCalled()
  })

  it('上限内的大小放行', async () => {
    mockWorkerOk('ok')
    const f = pngFile()
    Object.defineProperty(f, 'size', { value: OCR_MAX_SIZE_MB * 1024 * 1024 })
    await expect(recognizeImageText(f)).resolves.toBe('ok')
  })
})

describe('worker 单例与失败重试', () => {
  it('多次识别复用同一 worker（只创建一次）', async () => {
    mockWorkerOk('ok')
    await recognizeImageText(pngFile())
    await recognizeImageText(pngFile())
    expect(createWorkerMock).toHaveBeenCalledTimes(1)
    expect(recognizeMock).toHaveBeenCalledTimes(2)
  })

  it('worker 创建失败（如识别库下载失败）→ 释放单例，下次可重试', async () => {
    createWorkerMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ recognize: recognizeMock, terminate: terminateMock })
    recognizeMock.mockResolvedValue({ data: { text: 'retry-ok' } })

    await expect(recognizeImageText(pngFile())).rejects.toMatchObject({ kind: 'recognize-failed' })
    await expect(recognizeImageText(pngFile())).resolves.toBe('retry-ok')
    expect(createWorkerMock).toHaveBeenCalledTimes(2)
  })

  it('识别过程失败 → 包装为 recognize-failed（不泄漏底层堆栈语义由 UI 出人话）', async () => {
    createWorkerMock.mockResolvedValue({ recognize: vi.fn().mockRejectedValue(new Error('boom')), terminate: terminateMock })
    await expect(recognizeImageText(pngFile())).rejects.toMatchObject({ kind: 'recognize-failed' })
  })
})
