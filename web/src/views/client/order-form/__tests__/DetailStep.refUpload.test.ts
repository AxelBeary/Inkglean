// issue #50-3 回归（参考图上限双向失效）：DetailStep 的 el-upload 必须与父层 refFileList 双向绑定。
// EP 内部选文件是 `uploadFiles.value = [...uploadFiles.value, 新条目]`（整组换数组），
// 单向 `:file-list` 一旦断开，后续条目与 on-remove 都回不到父层——粘贴缩略图不渲染、上限各算各的。
// 覆盖：
//   1. EP onStart 落的条目经 update:fileList 回到父层同一数组（改回单向 :file-list → 本条转红）
//   2. 点选成功后按 uid 回填 filePath/url，不新增条目（退回 uploadedRefs 双数组 → 本条转红）
//   3. EP 移除条目即从同一数组删（提交口径同源，无需并行映射表）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import { defineComponent, h, nextTick, ref } from 'vue'
import zhCN from '../../../../locales/zh-CN'
import DetailStep from '../DetailStep.vue'
import type { RefFileItem } from '../types'
import { useOrderForm } from '../../../../composables/useOrderForm'

const mocks = vi.hoisted(() => ({ uploadRef: vi.fn() }))

vi.mock('../../../../api/index', () => ({
  artistPublicApi: {
    getProfile: () => Promise.resolve({ name: 'Alice', subdomain: 'alice', rules: '' }),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getPricing: () => Promise.resolve({ styles: [], installments: [], discountEnabled: false }),
    getPublicStyles: () => Promise.resolve([]),
    calculateStylePrice: () => Promise.resolve(null),
    validateDiscount: () => Promise.resolve({})
  },
  orderApi: { create: vi.fn() },
  uploadApi: { reference: mocks.uploadRef }
}))

vi.mock('../../../../utils/track', () => ({
  getAnonToken: () => Promise.resolve('anon-token-test'),
  getFreshAnonToken: () => Promise.resolve('anon-token-test')
}))

vi.mock('../../../../utils/sanitize', () => ({
  sanitizeHtml: (html: string) => html || ''
}))

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN }
})

/** ElUpload 暴露面（element-plus upload.vue 的 defineExpose） */
interface UploadExposed {
  handleStart: (file: File) => void
  handleRemove: (file: { uid: string | number }) => Promise<void>
}

function makeFile(name: string): File {
  return new File([new Uint8Array(8)], name, { type: 'image/png' })
}

/** 用真实 composable 的 handleRefUpload 作 http-request：点选链路端到端可验 */
function mountStep() {
  const formRef = ref({ validate: () => Promise.resolve(true), scrollToField: () => {} })
  let of!: ReturnType<typeof useOrderForm>

  const wrapper = mount(defineComponent({
    setup() {
      of = useOrderForm('alice', formRef)
      return () => h(DetailStep, {
        refFileList: of.refFileList.value,
        'onUpdate:refFileList': (next: RefFileItem[]) => { of.refFileList.value = next },
        inspireTags: [],
        workflowStages: [],
        revisionNote: '',
        // 与 OrderForm.vue 同款适配：el-upload 实际调用时 file 恒带 uid
        uploadRequest: (options: { file: File }) =>
          of.handleRefUpload(options as { file: File & { uid: string | number } })
      })
    }
  }), { global: { plugins: [ElementPlus, i18n] } })

  const upload = wrapper.findComponent({ name: 'ElUpload' })
  const exposed = (upload.vm.$ as unknown as { exposed: UploadExposed }).exposed
  const httpRequest = upload.props('httpRequest') as (options: { file: File }) => Promise<void>
  return { wrapper, upload, exposed, httpRequest, of: () => of }
}

beforeEach(() => {
  mocks.uploadRef.mockReset()
  mocks.uploadRef.mockImplementation((file: File) => Promise.resolve({
    filePath: `references/${file.name}`,
    url: `/uploads/references/${file.name}`,
    originalName: file.name,
    mimeType: 'image/png',
    size: 8,
    typeWarning: null
  }))
})

describe('issue #50-3: DetailStep 参考图列表双向绑定', () => {
  it('EP 落的条目经 update:fileList 回到父层同一数组（单向 :file-list 时父层拿不到）', async () => {
    const { upload, exposed, of } = mountStep()
    await flushPromises()
    expect(of().refFileList.value).toHaveLength(0)

    const file = makeFile('picked.png')
    Object.defineProperty(file, 'uid', { value: 'u-pick-1', writable: true, configurable: true })
    exposed.handleStart(file)
    await nextTick()

    expect(of().refFileList.value).toHaveLength(1)
    expect(of().refFileList.value[0].uid).toBe('u-pick-1')
    // EP 渲染用的就是父层这一个数组（同一引用，不是拷贝）
    expect(upload.props('fileList')).toBe(of().refFileList.value)
  })

  it('点选成功 → 同一数组内按 uid 回填 filePath/url，且不新增条目', async () => {
    const { exposed, httpRequest, of } = mountStep()
    await flushPromises()

    const file = makeFile('picked.png')
    Object.defineProperty(file, 'uid', { value: 'u-pick-2', writable: true, configurable: true })
    exposed.handleStart(file)
    await nextTick()
    await httpRequest({ file })
    await nextTick()

    expect(mocks.uploadRef).toHaveBeenCalledTimes(1)
    expect(of().refFileList.value).toHaveLength(1)
    expect(of().refFileList.value[0].filePath).toBe('references/picked.png')
    expect(of().refFileList.value[0].url).toBe('/uploads/references/picked.png')
  })

  it('EP 移除条目 → 同一数组同步删（提交不再带这张）', async () => {
    const { exposed, httpRequest, of } = mountStep()
    await flushPromises()

    const file = makeFile('picked.png')
    Object.defineProperty(file, 'uid', { value: 'u-pick-3', writable: true, configurable: true })
    exposed.handleStart(file)
    await nextTick()
    await httpRequest({ file })
    await nextTick()
    expect(of().refFileList.value).toHaveLength(1)

    await exposed.handleRemove(of().refFileList.value[0])
    await nextTick()
    expect(of().refFileList.value).toHaveLength(0)
  })
})
