// 压图改尺寸挂载测试（812-tools-a：③压图改尺寸）
// 覆盖：选图、非法文件拦截、压缩结果展示（体积/尺寸）、WebP 下载
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { ElMessage } = vi.hoisted(() => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))
vi.mock('element-plus', () => ({ ElMessage }))
vi.mock('../../utils/watermark.js', () => ({
  loadImage: vi.fn(() => Promise.resolve({ naturalWidth: 1000, naturalHeight: 500 }))
}))

import ImageResize from '../ImageResize.vue'

const ElRadioGroupStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div><slot /></div>'
}
const ElRadioButtonStub = {
  props: ['value'],
  emits: ['update:modelValue'],
  template: '<button type="button" :data-value="value" @click="$emit(\'update:modelValue\', value)"><slot /></button>'
}
const ElInputStub = {
  props: ['modelValue', 'placeholder', 'type'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}
const ElSliderStub = {
  props: ['modelValue', 'min', 'max', 'step'],
  emits: ['update:modelValue'],
  template: '<input type="range" :value="modelValue" />'
}
const ElButtonStub = {
  props: ['disabled', 'type', 'loading'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
}

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface ImageResizeVM {
  preset: string
}

function mountResize() {
  const wrapper = mount(ImageResize, {
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: () => []
      },
      stubs: {
        'el-radio-group': ElRadioGroupStub,
        'el-radio-button': ElRadioButtonStub,
        'el-input': ElInputStub,
        'el-slider': ElSliderStub,
        'el-button': ElButtonStub
      }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as ImageResizeVM }
}

describe('压图改尺寸（812-tools-a）', () => {
  let getContextSpy: MockInstance
  let toBlobSpy: MockInstance
  let anchorClickSpy: MockInstance

  beforeEach(() => {
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb(new Blob(['fake-webp'], { type: 'image/webp' }))
    })
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      ;(this as unknown as { result: string }).result = 'data:image/png;base64,AAAA'
      ;(this.onload as (() => void) | null)?.()
    })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    // happy-dom 未实现 createObjectURL/revokeObjectURL，直接以可配置属性注入
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock-result'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
    window.localStorage.clear()
  })

  async function chooseImage(wrapper: ReturnType<typeof mount>, type = 'image/png') {
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['fake'], 'demo.png', { type })], configurable: true })
    await input.trigger('change')
  }

  it('初始：无图时提示选图、压缩按钮禁用', () => {
    const { wrapper } = mountResize()
    expect(wrapper.text()).toContain('imageResize.chooseFile')
    expect(wrapper.text()).toContain('imageResize.noImage')
    expect(wrapper.find('.ir-process').attributes('disabled')).toBeDefined()
  })

  it('非图片文件被拦截并提示', async () => {
    const { wrapper } = mountResize()
    await chooseImage(wrapper, 'text/plain')
    expect(ElMessage.warning).toHaveBeenCalledWith('imageResize.fileTypeError')
    expect(wrapper.find('.ir-process').attributes('disabled')).toBeDefined()
  })

  it('选图后压缩：canvas 按预设 1242×1660 cover 绘制，展示体积与尺寸，可下载 WebP', async () => {
    const { wrapper } = mountResize()
    await chooseImage(wrapper)
    expect(wrapper.text()).toContain('demo.png')
    expect(wrapper.find('.ir-process').attributes('disabled')).toBeUndefined()

    await wrapper.find('.ir-process').trigger('click')
    await flushPromises()

    expect(getContextSpy).toHaveBeenCalledWith('2d')
    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.85)
    expect(wrapper.text()).toContain('imageResize.resultDims:{"w":1242,"h":1660}')
    expect(wrapper.text()).toContain('imageResize.resultSize')
    expect(wrapper.text()).toContain('imageResize.originalSize')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.ir-download').exists()).toBe(true)

    await wrapper.find('.ir-download').trigger('click')
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
  })

  it('自定义尺寸非法时提示且不压缩', async () => {
    const { wrapper, vm } = mountResize()
    await chooseImage(wrapper)
    vm.preset = 'custom' // script setup 绑定经实例 proxy 可写（dev/test 语义一致）
    await wrapper.find('.ir-process').trigger('click')
    await flushPromises()
    expect(ElMessage.warning).toHaveBeenCalledWith('imageResize.invalidDims')
    expect(toBlobSpy).not.toHaveBeenCalled()
  })
})
