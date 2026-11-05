// 交付页一次性下载回归：验证拿到的令牌必须落进组件状态，
// 否则 download-start/confirm 带空 token 必然 404（旧实现只写局部变量）。
// issue #81 A 路补：423 冷却（DOWNLOAD_COOLDOWN）只提示剩余秒数，不得把文件误标为已下载。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  delivery: vi.fn(),
  downloadStart: vi.fn(),
  downloadConfirm: vi.fn(),
  downloadAsset: vi.fn(),
  // 页内提示句柄从 hoisted 取（同 ImageResize.test.ts 手法），否则 ElMessage 在 mock 工厂里拿不到引用
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice', orderNo: 'ALICE-001' }, query: { token: 'tok-123' } })
}))

vi.mock('vue-i18n', () => ({
  // 插值参数拼回文本（同 ImageResize.test.ts 口径），才能断言冷却剩余秒数真的传给了 i18n
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
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
  ElMessage: { success: h.success, error: h.error, warning: h.warning, info: vi.fn() }
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
  h.success.mockClear()
  h.error.mockClear()
  h.warning.mockClear()
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

  it('423 冷却：提示剩余秒数（向上取整），不把文件误标为已下载', async () => {
    // 服务端 3 次未完成下载 → 5 分钟冷却；这里取 299.5s 验证「向上取整」而非截断
    h.downloadStart.mockRejectedValue({
      code: 'DOWNLOAD_COOLDOWN',
      status: 423,
      detail: { retryAfterMs: 299_500 }
    })

    const wrapper = mountPage()
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text() === 'delivery.download')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(h.warning).toHaveBeenCalledWith('delivery.downloadCooldown:{"n":300}')
    // 冷却 ≠ 锁定：不弹「下载失败」，也不进入「已下载」态（按钮仍是「下载」、无「已下载」标签）
    expect(h.error).not.toHaveBeenCalled()
    expect(wrapper.findAll('button').map(b => b.text())).toContain('delivery.download')
    expect(wrapper.text()).not.toContain('delivery.downloadLocked')
    // 冷却发生在 start 阶段：不触发真实下载，也不发 confirm
    expect(h.downloadAsset).not.toHaveBeenCalled()
    expect(h.downloadConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
