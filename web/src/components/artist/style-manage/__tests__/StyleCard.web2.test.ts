// 波2审计 WEB-06（子组件）：StyleCard 摘要 chip 触发 dragend → emit('chip-drag-end')
// 原缺 dragend 上报，父级 onDropToSize 早退未清 dragPayload 会污染后续排序拖拽
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import StyleCard from '../StyleCard.vue'
import type { ManagerSa, ManagerSizeRow, ManagerStyleRow } from '../types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

// draggable stub：正确渲染 scoped slot #item（chip 位于其中）
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    // inheritAttrs:false 消除父级传 class="size-row-list"/"style-grid" 到 fragment root 的 Vue warn
    inheritAttrs: false,
    props: ['modelValue', 'itemKey', 'handle', 'ghostClass'],
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
  'el-card': { template: '<div class="el-card-stub"><slot name="header" /><slot /></div>' },
  'el-image': { template: '<div class="el-image-stub" />' },
  'el-tag': { template: '<span class="el-tag-stub"><slot /></span>' },
  'el-button': { template: '<button type="button"><slot /></button>' },
  'el-switch': { template: '<input type="checkbox" class="el-switch-stub" />' },
  'el-empty': { template: '<div class="el-empty-stub" />' }
}

const STATUS_OPTIONS = [
  { value: 'available' as const, label: '可约' },
  { value: 'showcase' as const, label: '展示' },
  { value: 'closed' as const, label: '关闭' }
]

function buildStyle(): ManagerStyleRow {
  const addon: ManagerSa = {
    id: 100,
    addon_template_id: 1000,
    is_enabled: 1,
    template_name: '加人',
    template_control_type: 'switch',
    template_price_mode: 'fixed',
    template_default_price: 50,
    template_category: 'add'
  }
  const size: ManagerSizeRow = {
    id: 10,
    name: '头像',
    base_price: 100,
    sort_order: 0,
    // 尺寸级未隐藏 + 画风级启用 → sizeSummary 会产出 1 个 chip
    _overrides: { 100: { price_override: null, is_hidden: false } }
  }
  return {
    id: 1,
    name: 'Q版',
    sort_order: 0,
    is_active: 1,
    sizes: [size],
    addons: [addon]
  }
}

function mountCard() {
  return mount(StyleCard, {
    props: {
      style: buildStyle(),
      locked: false,
      multiStyleEnabled: true,
      styleCount: 1,
      defaultStyleId: 1,
      statusOptions: STATUS_OPTIONS,
      artworks: [],
      poolDragOver: false
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS
    }
  })
}

describe('StyleCard WEB-06：摘要 chip dragend 上报', () => {
  it('chip 元素绑定 dragend，触发后 emit("chip-drag-end")（父级据此清 dragPayload）', async () => {
    const wrapper = mountCard()
    const chip = wrapper.find('.sum-chip')
    expect(chip.exists()).toBe(true)
    await chip.trigger('dragend')
    const emitted = wrapper.emitted('chip-drag-end')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
  })

  it('chip 元素仍绑定 dragstart（原语义未回归，且带 size 与 chip 参数）', async () => {
    const wrapper = mountCard()
    const chip = wrapper.find('.sum-chip')
    await chip.trigger('dragstart')
    const emitted = wrapper.emitted('chip-drag-start')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
    // 参数：(size, chip, event)
    const [size, chipPayload] = emitted![0] as [ManagerSizeRow, { id: number }, DragEvent]
    expect(size.id).toBe(10)
    expect(chipPayload.id).toBe(100)
  })

  it('池内胶囊 dragend 上报仍走 cap-drag-end（原语义未回归）', async () => {
    const wrapper = mountCard()
    const cap = wrapper.find('.addon-cap')
    expect(cap.exists()).toBe(true)
    await cap.trigger('dragend')
    expect(wrapper.emitted('cap-drag-end')).toBeTruthy()
  })
})
