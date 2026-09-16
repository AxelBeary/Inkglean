// WEB-02: StageListView 深拷贝隔离测试
// 覆盖：v-model 切换 takesPayment 不穿透到父级 props.stages（浅拷贝同引用根因）；
// togglePay 事件正确携带新值，父级 onTogglePay 守卫 s.takesPayment===val 不再恒真早退
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StageListView from '../StageListView.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// draggable stub：正确渲染 scoped slot #item
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'handle'],
    emits: ['update:modelValue', 'end'],
    setup(props: { modelValue: unknown[] }, { slots }: { slots: Record<string, unknown> }) {
      return () => {
        const items = props.modelValue || []
        return items.map((item: unknown, index: number) => {
          const itemSlot = slots.item as ((p: { element: unknown; index: number }) => unknown) | undefined
          return itemSlot ? itemSlot({ element: item, index }) : null
        })
      }
    }
  }
}))

const EP_STUBS = {
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" />'
  },
  'el-switch': {
    name: 'ElSwitch',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="checkbox" class="el-switch-stub" :checked="modelValue" :disabled="disabled" />'
  },
  'el-button': {
    inheritAttrs: false,
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-popconfirm': { template: '<span><slot /><template v-if="false"><slot name="reference" /></template></span>' },
  'el-tag': { template: '<span class="tag-stub"><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-checkbox': {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="checkbox" :checked="modelValue" />'
  }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

function makeStage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '草稿',
    description: null,
    sortOrder: 1,
    takesPayment: false,
    basisPoints: null,
    isFinal: false,
    speechTemplate: null,
    randomTemplate: false,
    ...overrides
  }
}

describe('StageListView WEB-02 深拷贝隔离', () => {
  it('v-model 切换 takesPayment 不穿透到父级 props.stages 对象', async () => {
    const parentStages = [makeStage({ id: 1, takesPayment: false })]
    const wrapper = mount(StageListView, {
      props: { stages: parentStages, readonly: false },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    // 找到 el-switch stub（通过 class）
    const sw = wrapper.find('.el-switch-stub')
    expect(sw.exists()).toBe(true)

    // 模拟用户点击：触发 change 事件
    const switchComp = wrapper.findComponent({ name: 'ElSwitch' })
    expect(switchComp.exists()).toBe(true)
    switchComp.vm.$emit('change', true)
    switchComp.vm.$emit('update:modelValue', true)
    await flushPromises()

    // WEB-02 核心验收：父级 props.stages[0].takesPayment 仍为 false（未被穿透修改）
    expect(parentStages[0].takesPayment).toBe(false)
  })

  it('togglePay 事件正确携带新值（父级守卫 s.takesPayment===val 不再恒真）', async () => {
    const parentStages = [makeStage({ id: 1, takesPayment: false })]
    const wrapper = mount(StageListView, {
      props: { stages: parentStages, readonly: false },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    const switchComp = wrapper.findComponent({ name: 'ElSwitch' })
    switchComp.vm.$emit('change', true)
    await flushPromises()

    // togglePay 事件应携带 (id=1, val=true)
    const emitted = wrapper.emitted('togglePay')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([1, true])

    // 父级此时查 parentStages[0].takesPayment 仍为 false（旧值）
    // → 守卫 s.takesPayment === val → false === true → false → 不早退 → PATCH 正常发出
    expect(parentStages[0].takesPayment).toBe(false)
  })

  it('props.stages 更新后 localStages 同步（深拷贝不阻断响应式）', async () => {
    const parentStages = [makeStage({ id: 1, name: '草稿', takesPayment: false })]
    const wrapper = mount(StageListView, {
      props: { stages: parentStages, readonly: false },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    expect(wrapper.text()).toContain('草稿')

    // 父级更新 stages（模拟 load() 后刷新）
    await wrapper.setProps({
      stages: [makeStage({ id: 1, name: '已更名', takesPayment: true, basisPoints: 5000 })]
    })
    await flushPromises()

    expect(wrapper.text()).toContain('已更名')
  })

  it('readonly 模式下 switch disabled', async () => {
    const parentStages = [makeStage({ id: 1, takesPayment: false })]
    const wrapper = mount(StageListView, {
      props: { stages: parentStages, readonly: true },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    const switchComp = wrapper.findComponent({ name: 'ElSwitch' })
    expect(switchComp.exists()).toBe(true)
    expect(switchComp.props('disabled')).toBe(true)
  })
})
