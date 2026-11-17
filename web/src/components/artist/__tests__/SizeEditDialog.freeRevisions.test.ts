// 迁移 v81 回归：档位「含免费修改次数」（SizeEditDialog）
// 覆盖：编辑时回填 / 新建默认 0（= 不限）/ 保存 payload 带上 free_revisions / 字段提示「0 = 不限」
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  updateSize: vi.fn(),
  createSize: vi.fn(),
  uploadImage: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    updateStyleSize: h.updateSize,
    createStyleSize: h.createSize
  },
  uploadApi: { image: h.uploadImage }
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.success, error: h.error, warning: h.warning, info: vi.fn() }
}))

import SizeEditDialog from '../SizeEditDialog.vue'

const NUMBER_STUB = {
  name: 'ElInputNumber',
  props: ['modelValue', 'min', 'max', 'step', 'precision'],
  emits: ['update:modelValue', 'change'],
  template: '<input class="num-stub" :value="modelValue" @input="onInput" @change="onInput" />',
  methods: {
    onInput(this: { $emit: (e: string, v: unknown) => void }, ev: Event) {
      const raw = (ev.target as HTMLInputElement).value
      const value = raw === '' ? null : Number(raw)
      this.$emit('update:modelValue', value)
      this.$emit('change', value)
    }
  }
}

const BUTTON_STUB = {
  name: 'ElButton',
  props: ['text', 'type', 'size', 'loading'],
  emits: ['click'],
  template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
}

function mountDialog(size: Record<string, unknown> | null) {
  return mount(SizeEditDialog, {
    props: { modelValue: false, styleId: 3, size: size as never, artworks: [] },
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: {
        'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width', 'destroyOnClose'] },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': {
          props: ['label', 'required'],
          template: '<div class="form-item"><span class="form-label">{{ label }}</span><slot /></div>'
        },
        'el-input': {
          name: 'ElInput',
          props: ['modelValue', 'placeholder', 'maxlength', 'type', 'rows'],
          emits: ['update:modelValue', 'change'],
          template: '<input class="text-stub" :value="modelValue" @input="onInput" />',
          methods: {
            onInput(this: { $emit: (e: string, v: unknown) => void }, ev: Event) {
              this.$emit('update:modelValue', (ev.target as HTMLInputElement).value)
            }
          }
        },
        'el-input-number': NUMBER_STUB,
        'el-image': { template: '<img />' },
        'el-upload': { template: '<div><slot /></div>' },
        'el-button': BUTTON_STUB,
        'el-empty': { template: '<div />' }
      }
    }
  })
}

/** 表单里三个 el-input-number 的顺序：base_price / work_days / free_revisions */
const FREE_REVISIONS_INDEX = 2

beforeEach(() => {
  h.updateSize.mockReset().mockResolvedValue({})
  h.createSize.mockReset().mockResolvedValue({})
  h.uploadImage.mockReset()
  h.success.mockClear()
  h.error.mockClear()
  h.warning.mockClear()
})

describe('SizeEditDialog 含免费修改次数（迁移 v81）', () => {
  it('编辑已有档位：回填 free_revisions，字段提示「0 = 不限」', async () => {
    const wrapper = mountDialog({ id: 9, name: '半身', base_price: 200, free_revisions: 5 })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const nums = wrapper.findAllComponents({ name: 'ElInputNumber' })
    expect(nums).toHaveLength(3)
    expect(nums[FREE_REVISIONS_INDEX].props('modelValue')).toBe(5)
    expect(nums[FREE_REVISIONS_INDEX].props('min')).toBe(0)
    expect(nums[FREE_REVISIONS_INDEX].props('max')).toBe(99)
    expect(nums[FREE_REVISIONS_INDEX].props('precision')).toBe(0)
    expect(wrapper.findAll('.form-label').map(l => l.text())).toContain('revision.limitLabel')
    expect(wrapper.text()).toContain('revision.unlimitedHint')
    wrapper.unmount()
  })

  it('新建档位：默认 0（不限），保存时 payload 带 free_revisions', async () => {
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const nums = wrapper.findAllComponents({ name: 'ElInputNumber' })
    expect(nums[FREE_REVISIONS_INDEX].props('modelValue')).toBe(0)

    // 名称必填（saveSize 会先校验），其余用默认值
    await wrapper.find('.text-stub').setValue('胸像')
    const numsEls = wrapper.findAll('.num-stub')
    await numsEls[FREE_REVISIONS_INDEX].setValue('4')
    await numsEls[FREE_REVISIONS_INDEX].trigger('change')

    const saveBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'common.save')
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    const payload = h.createSize.mock.calls[0]?.[1] as Record<string, unknown> | undefined
    expect(payload).toBeTruthy()
    expect(payload!.free_revisions).toBe(4)
    wrapper.unmount()
  })

  it('编辑保存：free_revisions 一起提交到 PUT', async () => {
    const wrapper = mountDialog({ id: 9, name: '半身', base_price: 200, free_revisions: 5 })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const numsEls = wrapper.findAll('.num-stub')
    expect(numsEls[FREE_REVISIONS_INDEX].attributes('value')).toBe('5')
    await numsEls[FREE_REVISIONS_INDEX].setValue('2')
    await numsEls[FREE_REVISIONS_INDEX].trigger('change')

    const saveBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'common.save')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(h.updateSize).toHaveBeenCalledTimes(1)
    const [styleId, sizeId, payload] = h.updateSize.mock.calls[0] as [number, number, Record<string, unknown>]
    expect(styleId).toBe(3)
    expect(sizeId).toBe(9)
    expect(payload.free_revisions).toBe(2)
    wrapper.unmount()
  })
})
