// 阶段名内联编辑回归：回车提交后输入框卸载会再触发 blur，旧实现会重复 emit 一次改名请求。
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StageListView from '../StageListView.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'handle'],
    emits: ['update:modelValue', 'end'],
    setup(props: { modelValue: unknown[] }, { slots }: { slots: Record<string, unknown> }) {
      return () => {
        const items = props.modelValue || []
        const itemSlot = slots.item as ((p: { element: unknown; index: number }) => unknown) | undefined
        return items.map((item, index) => (itemSlot ? itemSlot({ element: item, index }) : null))
      }
    }
  }
}))

const STUBS = {
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
  },
  'el-switch': { props: ['modelValue'], template: '<input type="checkbox" />' },
  'el-button': { template: '<button type="button"><slot /></button>' },
  'el-popconfirm': { template: '<span><slot /></span>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-checkbox': { props: ['modelValue'], template: '<input type="checkbox" />' }
}

const STAGE = {
  id: 1,
  name: '草稿',
  description: null,
  sortOrder: 1,
  takesPayment: false,
  basisPoints: null,
  isFinal: false,
  speechTemplate: null,
  randomTemplate: false
}

describe('StageListView 内联编辑', () => {
  it('回车 + blur 只提交一次改名', async () => {
    const wrapper = mount(StageListView, {
      props: { stages: [{ ...STAGE }], readonly: false },
      global: { mocks: { $t: (key: string) => key }, stubs: STUBS, directives: { loading: {} } }
    })
    await flushPromises()

    await wrapper.find('.stage-name').trigger('click')
    await flushPromises()

    const input = wrapper.find('.name-input')
    expect(input.exists()).toBe(true)
    await input.setValue('线稿')
    await input.trigger('keyup.enter')
    await input.trigger('blur')
    await flushPromises()

    expect(wrapper.emitted('rename')).toHaveLength(1)
    expect(wrapper.emitted('rename')![0]).toEqual([1, '线稿'])
    wrapper.unmount()
  })
})
