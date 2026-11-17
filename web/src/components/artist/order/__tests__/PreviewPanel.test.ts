// 迁移 v81 画师侧回归：过程稿面板（PreviewPanel）
// 覆盖：取数映射（boolean 归一）/ 订单级开关走对端点 / 单图可见性 / 备注 / 删除 / 上传两步 /
//      免费修改额度 0..99 边界与「0 = 不限」提示 / 超限只提示不阻断 / 加载失败可重试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getPreviews: vi.fn(),
  addPreview: vi.fn(),
  updatePreview: vi.fn(),
  deletePreview: vi.fn(),
  updateSettings: vi.fn(),
  upload: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    getOrderPreviews: h.getPreviews,
    addOrderPreview: h.addPreview,
    updateOrderPreview: h.updatePreview,
    deleteOrderPreview: h.deletePreview,
    updateOrderPreviewSettings: h.updateSettings
  },
  uploadApi: { preview: h.upload }
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.success, error: h.error, warning: h.warning, info: vi.fn() }
}))

import PreviewPanel from '../PreviewPanel.vue'

const SWITCH_STUB = {
  name: 'ElSwitch',
  props: ['modelValue', 'disabled', 'size', 'ariaLabel'],
  emits: ['update:modelValue', 'change'],
  methods: {
    toggle(this: { modelValue: unknown; $emit: (e: string, v: unknown) => void }) {
      const next = !this.modelValue
      this.$emit('update:modelValue', next)
      this.$emit('change', next)
    }
  },
  template: '<button type="button" class="switch-stub" :data-checked="String(modelValue)" @click="toggle"><slot /></button>'
}

const INPUT_STUB = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder', 'maxlength', 'size', 'disabled'],
  emits: ['update:modelValue', 'change'],
  template: '<input class="input-stub" :value="modelValue" @input="onInput" @change="$emit(\'change\')" />',
  methods: {
    onInput(this: { $emit: (e: string, v: unknown) => void }, ev: Event) {
      this.$emit('update:modelValue', (ev.target as HTMLInputElement).value)
    }
  }
}

const NUMBER_STUB = {
  name: 'ElInputNumber',
  props: ['modelValue', 'min', 'max', 'step', 'precision', 'disabled', 'controlsPosition', 'size'],
  emits: ['update:modelValue', 'change'],
  template: '<input class="num-stub" type="number" :value="modelValue" @change="onChange" />',
  methods: {
    onChange(this: { $emit: (e: string, v: unknown) => void }, ev: Event) {
      const raw = (ev.target as HTMLInputElement).value
      const value = raw === '' ? null : Number(raw)
      this.$emit('update:modelValue', value)
      this.$emit('change', value)
    }
  }
}

function mountPanel() {
  return mount(PreviewPanel, {
    props: { orderId: 806 },
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      directives: { loading: {} },
      stubs: {
        'el-card': { template: '<div><slot name="header" /><slot /></div>' },
        'el-switch': SWITCH_STUB,
        'el-input': INPUT_STUB,
        'el-input-number': NUMBER_STUB,
        // emits 必须显式声明：否则原生 click 既穿透到根 button、又由 $emit 触发一次，父级 load() 会跑两遍
        'el-button': {
          name: 'ElButton',
          props: ['text', 'type', 'size'],
          emits: ['click'],
          template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
        },
        'el-image': { props: ['src', 'fit', 'alt'], template: '<img class="image-stub" :src="src" />' },
        'el-icon': { template: '<i><slot /></i>' }
      }
    }
  })
}

function previewsResponse(overrides: Record<string, unknown> = {}) {
  return {
    previewVisibleToClient: true,
    freeRevisionLimit: 3,
    revisionUsed: 1,
    previews: [
      // visible 故意给 1（DB INTEGER 口径）验证组件边界归一
      { id: 1, url: '/p/a.png', caption: '线稿', visible: 1, createdAt: '2026-11-01T10:00:00Z' }
    ],
    ...overrides
  }
}

beforeEach(() => {
  h.getPreviews.mockReset().mockResolvedValue(previewsResponse())
  h.addPreview.mockReset().mockResolvedValue({ id: 2, url: '/p/b.png', caption: null, visible: true, createdAt: '2026-11-02T10:00:00Z' })
  h.updatePreview.mockReset()
  h.deletePreview.mockReset().mockResolvedValue({ deleted: true })
  h.updateSettings.mockReset().mockResolvedValue({ previewVisibleToClient: true, freeRevisionLimit: 3 })
  h.upload.mockReset().mockResolvedValue({ filePath: 'previews/7/x.png', url: '/p/up.png', originalName: 'x.png', mimeType: 'image/png', size: 10 })
  h.success.mockClear()
  h.error.mockClear()
  h.warning.mockClear()
})

describe('PreviewPanel 过程稿管理（迁移 v81）', () => {
  it('取数：开关/额度/已用次数/列表渲染，visible=1 归一为 el-switch 打开', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(h.getPreviews).toHaveBeenCalledWith(806)
    expect(wrapper.find('.preview-count').text()).toBe('1')
    const switches = wrapper.findAllComponents({ name: 'ElSwitch' })
    expect(switches).toHaveLength(2) // 订单级 + 单图级
    expect(switches[0].props('modelValue')).toBe(true)
    expect(switches[1].props('modelValue')).toBe(true)
    expect(wrapper.find('.preview-used').text()).toContain('revision.usedCount')
    expect(wrapper.find('.preview-used').text()).toContain('"used":1')
    // 额度输入框边界
    const num = wrapper.findComponent({ name: 'ElInputNumber' })
    expect(num.props('min')).toBe(0)
    expect(num.props('max')).toBe(99)
    expect(num.props('precision')).toBe(0)
    expect(wrapper.text()).toContain('revision.unlimitedHint')
    wrapper.unmount()
  })

  it('订单级开关：调用 preview-settings 端点，参数为布尔', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    h.updateSettings.mockResolvedValue({ previewVisibleToClient: false, freeRevisionLimit: 3 })

    await wrapper.findAllComponents({ name: 'ElSwitch' })[0].find('.switch-stub').trigger('click')
    await flushPromises()

    expect(h.updateSettings).toHaveBeenCalledWith(806, { previewVisibleToClient: false })
    wrapper.unmount()
  })

  it('单图可见性开关：调用 PATCH 该图，参数 visible=false', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    h.updatePreview.mockResolvedValue({ id: 1, url: '/p/a.png', caption: '线稿', visible: false, createdAt: '2026-11-01T10:00:00Z' })

    await wrapper.findAllComponents({ name: 'ElSwitch' })[1].find('.switch-stub').trigger('click')
    await flushPromises()

    expect(h.updatePreview).toHaveBeenCalledWith(806, 1, { visible: false })
    wrapper.unmount()
  })

  it('备注：失焦才提交；清空提交 null', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    h.updatePreview.mockResolvedValue({ id: 1, url: '/p/a.png', caption: '新说明', visible: true, createdAt: '2026-11-01T10:00:00Z' })

    const input = wrapper.find('.input-stub')
    await input.setValue('新说明')
    await input.trigger('change')
    await flushPromises()

    expect(h.updatePreview).toHaveBeenCalledWith(806, 1, { caption: '新说明' })
    wrapper.unmount()
  })

  it('删除：调用 DELETE 并移除该行', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('.preview-item-del').trigger('click')
    await flushPromises()

    expect(h.deletePreview).toHaveBeenCalledTimes(1)
    expect(h.deletePreview).toHaveBeenCalledWith(806, 1)
    expect(wrapper.findAll('.preview-item')).toHaveLength(0)
    wrapper.unmount()
  })

  it('上传：先走 /upload/preview 拿 filePath，再登记到订单，新行入列', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['x'], 'x.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(h.upload).toHaveBeenCalledTimes(1)
    expect(h.addPreview).toHaveBeenCalledWith(806, { filePath: 'previews/7/x.png' })
    expect(wrapper.findAll('.preview-item')).toHaveLength(2)
    expect(wrapper.find('.preview-count').text()).toBe('2')
    wrapper.unmount()
  })

  it('免费修改额度：改值调用 preview-settings；0 = 不限时不出现超限提示', async () => {
    h.getPreviews.mockResolvedValue(previewsResponse({ freeRevisionLimit: 0, revisionUsed: 5 }))
    h.updateSettings.mockResolvedValue({ previewVisibleToClient: true, freeRevisionLimit: 2 })
    const wrapper = mountPanel()
    await flushPromises()

    // limit=0：即使已用 5 次也不提示超限（0 = 不限）
    expect(wrapper.find('.preview-over-limit').exists()).toBe(false)

    const num = wrapper.find('.num-stub')
    await num.setValue('2')
    await num.trigger('change')
    await flushPromises()

    expect(h.updateSettings).toHaveBeenCalledWith(806, { freeRevisionLimit: 2 })
    wrapper.unmount()
  })

  it('超限：非阻断提示文案带 used/limit，且不 disable/隐藏任何操作', async () => {
    h.getPreviews.mockResolvedValue(previewsResponse({ freeRevisionLimit: 3, revisionUsed: 3 }))
    const wrapper = mountPanel()
    await flushPromises()

    const hint = wrapper.find('.preview-over-limit')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('revision.overLimit')
    expect(hint.text()).toContain('"used":3')
    expect(hint.text()).toContain('"limit":3')
    // 上传磁贴仍可用、删除按钮仍在
    expect(wrapper.find('.preview-upload-tile').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('.preview-item-del')).toHaveLength(1)
    wrapper.unmount()
  })

  it('加载失败：卡内错误条 + 重试按钮可重新取数', async () => {
    h.getPreviews.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.find('.module-error').exists()).toBe(true)
    h.getPreviews.mockResolvedValue(previewsResponse())
    await wrapper.find('.module-error .btn-stub').trigger('click')
    await flushPromises()

    expect(h.getPreviews).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.module-error').exists()).toBe(false)
    expect(wrapper.findAll('.preview-item')).toHaveLength(1)
    wrapper.unmount()
  })
})
