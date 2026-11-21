import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  start: vi.fn(),
  confirm: vi.fn(),
  downloadAsset: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  orderApi: {
    deliveryDownloadStart: (...args: unknown[]) => h.start(...args),
    deliveryDownloadConfirm: (...args: unknown[]) => h.confirm(...args)
  }
}))

vi.mock('../../utils/download.js', () => ({
  downloadAsset: (...args: unknown[]) => h.downloadAsset(...args)
}))

import { confirmOneTimeDownload, downloadOneTimeFile } from '../useOneTimeDownload'

describe('useOneTimeDownload', () => {
  beforeEach(() => {
    h.start.mockReset()
    h.confirm.mockReset()
    h.downloadAsset.mockReset()
    h.start.mockResolvedValue({ url: '/uploads/deliverables/1/file.zip?sig=one-time', confirmationToken: 'attempt-1' })
    h.confirm.mockResolvedValue({ locked: true })
    h.downloadAsset.mockResolvedValue(undefined)
  })

  it('确认失败返回可重试的本轮令牌，不伪装成下载失败', async () => {
    const onConfirmed = vi.fn()
    h.confirm.mockRejectedValueOnce(new Error('network'))
    await expect(
      downloadOneTimeFile('ORDER-1', 7, 'customer-token', 'file.zip', onConfirmed)
    ).resolves.toEqual({ status: 'confirm-failed', confirmationToken: 'attempt-1' })
    expect(h.confirm).toHaveBeenCalledWith('ORDER-1', 7, 'customer-token', 'attempt-1')
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('确认链路成功回调锁定状态', async () => {
    const onConfirmed = vi.fn()
    await expect(
      downloadOneTimeFile('ORDER-1', 7, 'customer-token', 'file.zip', onConfirmed)
    ).resolves.toEqual({ status: 'confirmed' })
    expect(h.start).toHaveBeenCalledWith('ORDER-1', 7, 'customer-token')
    expect(h.downloadAsset).toHaveBeenCalledWith('/uploads/deliverables/1/file.zip?sig=one-time', 'file.zip')
    expect(h.confirm).toHaveBeenCalledWith('ORDER-1', 7, 'customer-token', 'attempt-1')
    expect(onConfirmed).toHaveBeenCalledOnce()
  })

  it('重复确认遇到 DOWNLOAD_LOCKED 也按已锁定处理', async () => {
    const onConfirmed = vi.fn()
    h.confirm.mockRejectedValueOnce({ code: 'DOWNLOAD_LOCKED' })
    await expect(
      confirmOneTimeDownload('ORDER-1', 7, 'customer-token', 'attempt-1', onConfirmed)
    ).resolves.toEqual({ status: 'confirmed' })
    expect(onConfirmed).toHaveBeenCalledOnce()
  })
})
