// CommPanel QQ 唤起定时器测试（R-19）
// 覆盖：1 秒内卸载后不再 window.open；未卸载 1 秒后正常唤起 QQ；剪贴板失败不调度跳转
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  message: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: h.message, warning: h.message, error: h.message, info: h.message }
}))
vi.mock('../visual/CardHead.vue', () => ({
  default: { name: 'CardHead', template: '<div><slot /><slot name="extra" /></div>' }
}))

import CommPanel from '../CommPanel.vue'

function makeProps() {
  return {
    order: { client_qq: '123456', speechText: '你好，这是话术', currentStageId: 1 },
    poolFinalCents: 10000,
    poolPaidCents: 4000,
    poolRemainingCents: 6000
  }
}

function mountPanel() {
  return mount(CommPanel, {
    props: makeProps(),
    global: {
      mocks: {
        $t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key: string) => [key]
      },
      stubs: {
        'el-card': { template: '<div><slot /><slot name="header" /></div>' },
        'el-button': { template: '<button v-bind="$attrs"><slot /></button>' }
      }
    }
  })
}

describe('CommPanel QQ 唤起定时器（R-19）', () => {
  let originalOpen: typeof window.open

  beforeEach(() => {
    vi.useFakeTimers()
    h.message.mockClear()
    originalOpen = window.open
    window.open = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    window.open = originalOpen
  })

  it('1 秒内卸载 → 定时器被清理，window.open 不再被调用', async () => {
    const wrapper = mountPanel()
    await wrapper.find('button').trigger('click')
    await Promise.resolve() // 剪贴板 promise 落定后 setTimeout 才被调度
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(1100)

    expect(window.open).not.toHaveBeenCalled()
  })

  it('未卸载 → 1 秒后正常唤起 QQ', async () => {
    const wrapper = mountPanel()
    await wrapper.find('button').trigger('click')
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1100)

    expect(window.open).toHaveBeenCalledWith('tencent://message/?uin=123456', '_self')
    wrapper.unmount()
  })

  it('剪贴板失败 → 降级提示且不调度 QQ 跳转', async () => {
    const clipboard = navigator.clipboard as unknown as { writeText: ReturnType<typeof vi.fn> }
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
    const wrapper = mountPanel()
    await wrapper.find('button').trigger('click')
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1100)

    expect(window.open).not.toHaveBeenCalled()
    expect(h.message).toHaveBeenCalledWith('你好，这是话术')
    wrapper.unmount()
  })
})
