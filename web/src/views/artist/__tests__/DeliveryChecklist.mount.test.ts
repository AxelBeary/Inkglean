// 交付检查清单挂载测试（812 工具波 B ⑤）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DeliveryChecklist from '../DeliveryChecklist.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

beforeEach(() => {
  localStorage.clear()
})

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface ChecklistVM {
  doneCount: number
  totalCount: number
  percent: number
  allDone: boolean
}

function mountChecklist() {
  const wrapper = mount(DeliveryChecklist, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $tm: () => []
      }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as ChecklistVM }
}

describe('DeliveryChecklist 交付检查清单', () => {
  it('挂载后渲染 5 条默认自查项，进度为 0', () => {
    const { wrapper, vm } = mountChecklist()
    expect(wrapper.findAll('.cl-item')).toHaveLength(5)
    expect(vm.doneCount).toBe(0)
    expect(vm.totalCount).toBe(5)
    expect(wrapper.find('.cl-done').exists()).toBe(false)
  })

  it('勾选后进度更新并写入 localStorage', async () => {
    const { wrapper, vm } = mountChecklist()
    const boxes = wrapper.findAll('.cl-checkbox')
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)
    expect(vm.doneCount).toBe(2)
    expect(vm.percent).toBe(40)

    const saved = JSON.parse(localStorage.getItem('huiyue_delivery_checklist')!)
    expect(saved.defaults.finishWatermark).toBe(true)
    expect(saved.defaults.sourceExport).toBe(true)
    expect(saved.defaults.finalPayment).toBe(false)
  })

  it('可新增并删除自定义条目', async () => {
    const { wrapper, vm } = mountChecklist()
    await wrapper.find('.cl-input').setValue('压缩包内附 PSD 分层')
    await wrapper.find('.cl-btn').trigger('click')
    expect(wrapper.findAll('.cl-item')).toHaveLength(6)
    expect(vm.totalCount).toBe(6)

    await wrapper.find('.cl-mini-btn').trigger('click')
    expect(wrapper.findAll('.cl-item')).toHaveLength(5)
    expect(vm.totalCount).toBe(5)
  })

  it('全部勾选后显示石绿小结文案', async () => {
    const { wrapper, vm } = mountChecklist()
    const boxes = wrapper.findAll('.cl-checkbox')
    for (const box of boxes) {
      await box.setValue(true)
    }
    expect(vm.allDone).toBe(true)
    expect(wrapper.find('.cl-done').exists()).toBe(true)
  })
})
