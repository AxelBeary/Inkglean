// PaymentBar pointercancel 解绑测试（G-2 / R-22）
// 覆盖：pointercancel 后 pointermove 监听已解绑（不再更新/不再 emit），拖拽状态复位，且不提交变更
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

// happy-dom 无 Pointer Capture API，补齐（组件 pointerdown 时会调用）
if (!window.HTMLElement.prototype.setPointerCapture) {
  window.HTMLElement.prototype.setPointerCapture = () => {}
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {}
}

import PaymentBar from '../PaymentBar.vue'

const STAGES = [
  { id: 1, name: '定金', takesPayment: true, basisPoints: 3000, isFinal: false },
  { id: 2, name: '尾款', takesPayment: true, basisPoints: 7000, isFinal: true }
]

function mountBar() {
  return mount(PaymentBar, {
    props: { stages: STAGES },
    global: {
      mocks: {
        $t: (key) => key
      },
      stubs: {
        'el-input-number': { template: '<input />' },
        'el-icon': { template: '<i><slot /></i>' }
      }
    }
  })
}

describe('PaymentBar pointercancel（G-2）', () => {
  it('pointercancel 解绑 pointermove：后续 move 不更新分段、不 emit change', async () => {
    const wrapper = mountBar()
    const handle = wrapper.find('.bar-handle')

    // 开始拖拽（pointerdown 绑定 move/up/cancel 监听）
    await handle.trigger('pointerdown', { clientX: 100, pointerId: 1, button: 0 })
    // 拖拽中先移动一次（正常路径）
    await handle.trigger('pointermove', { clientX: 200, pointerId: 1 })

    // 系统取消拖拽（触摸打断/捕获丢失）
    await handle.trigger('pointercancel', { pointerId: 1 })
    expect(wrapper.emitted('change')).toBeUndefined()

    // 解绑验证：cancel 后再 move 不应再改变 localBp（无 emit 即无后续提交）
    await handle.trigger('pointermove', { clientX: 400, pointerId: 1 })
    await handle.trigger('pointerup', { pointerId: 1 })
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('pointercancel 后弹性/脱离视觉状态复位（再次拖拽不受上一次取消影响）', async () => {
    const wrapper = mountBar()
    const handle = wrapper.find('.bar-handle')

    // 拖到弹性区（新左段 < 5%）再取消
    await handle.trigger('pointerdown', { clientX: 100, pointerId: 1, button: 0 })
    await handle.trigger('pointermove', { clientX: -100, pointerId: 1 })
    expect(wrapper.find('.bar-seg.elastic').exists()).toBe(true)
    await handle.trigger('pointercancel', { pointerId: 1 })

    // 取消后弹性标记清除；正常拖拽提交照常工作
    expect(wrapper.find('.bar-seg.elastic').exists()).toBe(false)
    await handle.trigger('pointerdown', { clientX: 100, pointerId: 1, button: 0 })
    await handle.trigger('pointermove', { clientX: 120, pointerId: 1 })
    await handle.trigger('pointerup', { pointerId: 1 })
    expect(wrapper.emitted('change')).toHaveLength(1)
  })
})
