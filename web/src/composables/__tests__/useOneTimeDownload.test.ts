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
    h.start.mockResolvedValue({ url: '/uploads/deliverables/1/file.zip?sig=one-time' })
    h.confirm.mockResolvedValue({ locked: true })
    h.downloadAsset.mockResolvedValue(undefined)
  })

  it('确认失败返回 confirm-failed，不伪装成下载失败', async () => {
    const onConfirmed = vi.fn()
    h.confirm.mockRejectedValueOnce(new Error('network'))
    await expect(
      downloadOneTimeFile('ORDER-1', 7, 'token', 'file.zip', onConfirmed)
    ).resolves.toBe('confirm-failed')
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('确认链路成功回调锁定状态', async () => {
    const onConfirmed = vi.fn()
    await expect(
      downloadOneTimeFile('ORDER-1', 7, 'token', 'file.zip', onConfirmed)
    ).resolves.toBe('confirmed')
    expect(h.start).toHaveBeenCalledWith('ORDER-1', 7, 'token')
    expect(h.downloadAsset).toHaveBeenCalledWith('/uploads/deliverables/1/file.zip?sig=one-time', 'file.zip')
    expect(onConfirmed).toHaveBeenCalledOnce()
  })

  it('重复确认遇到 DOWNLOAD_LOCKED 也按已锁定处理', async () => {
    const onConfirmed = vi.fn()
    h.confirm.mockRejectedValueOnce({ code: 'DOWNLOAD_LOCKED' })
    await expect(
      confirmOneTimeDownload('ORDER-1', 7, 'token', onConfirmed)
    ).resolves.toBe('confirmed')
    expect(onConfirmed).toHaveBeenCalledOnce()
  })
})
