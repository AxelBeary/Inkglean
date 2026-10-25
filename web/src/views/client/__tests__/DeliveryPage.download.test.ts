// 交付页一次性下载回归：验证拿到的令牌必须落进组件状态，
// 否则 download-start/confirm 带空 token 必然 404（旧实现只写局部变量）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  delivery: vi.fn(),
  downloadStart: vi.fn(),
  downloadConfirm: vi.fn(),
  downloadAsset: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice', orderNo: 'ALICE-001' }, query: { token: 'tok-123' } })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../api/index.js', () => ({
  orderApi: {
    delivery: h.delivery,
    deliveryDownloadStart: h.downloadStart,
    deliveryDownloadConfirm: h.downloadConfirm
  }
}))

vi.mock('../../../composables/useArtistPublicProfile.js', () => ({
  fetchArtistPublicProfile: () => Promise.resolve(null)
}))

vi.mock('../../../composables/usePalette.js', () => ({
  usePalette: () => {}
}))

vi.mock('../../../utils/download.js', () => ({
  downloadAsset: h.downloadAsset
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

import DeliveryPage from '../DeliveryPage.vue'

const BUTTON_STUB = {
  props: ['loading', 'disabled', 'type', 'size'],
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
}

function mountPage() {
  return mount(DeliveryPage, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $router: { push: vi.fn() }
      },
      stubs: {
        'el-page-header': { template: '<div><slot name="title" /><slot /></div>' },
        'el-card': { template: '<div><slot name="header" /><slot /></div>' },
        'el-form': true,
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': true,
        'el-button': BUTTON_STUB,
        'el-tag': { template: '<span><slot /></span>' },
        'el-result': true
      },
      directives: { loading: {} }
    }
  })
}

beforeEach(() => {
  h.delivery.mockReset().mockResolvedValue({
    orderNo: 'ALICE-001',
    artistName: 'Alice',
    deliverables: [
      { id: 7, fileName: 'final.png', fileSize: 1024, downloadLocked: false }
    ]
  })
  h.downloadStart.mockReset().mockResolvedValue({ url: 'https://example.test/signed' })
  h.downloadConfirm.mockReset().mockResolvedValue({ success: true })
  h.downloadAsset.mockReset().mockResolvedValue(undefined)
})

describe('DeliveryPage 一次性下载', () => {
  it('验证后下载带同一枚令牌（旧实现 token 恒为空串）', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(h.delivery).toHaveBeenCalledWith('ALICE-001', 'tok-123')

    const btn = wrapper.findAll('button').find(b => b.text() === 'delivery.download')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(h.downloadStart).toHaveBeenCalledWith('ALICE-001', 7, 'tok-123')
    expect(h.downloadAsset).toHaveBeenCalledWith('https://example.test/signed', 'final.png')
    expect(h.downloadConfirm).toHaveBeenCalledWith('ALICE-001', 7, 'tok-123')
    wrapper.unmount()
  })
})
