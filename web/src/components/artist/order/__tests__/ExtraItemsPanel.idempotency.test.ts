// 审计 #21 条目 7（画师端）：附加项提交必须带幂等键，且「同一次意图重试复用、改内容换新」
// 服务端去重由 server/tests/extra-item-idempotency.test.ts 钉；这里只钉前端发键的口径。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExtraItemsPanel from '../ExtraItemsPanel.vue'

const addExtraItemMock = vi.fn()

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../../api/index', () => ({
  artistApi: {
    addExtraItem: (...args: unknown[]) => addExtraItemMock(...args),
    deleteExtraItem: vi.fn()
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) }
}))

const EP_STUBS = {
  'el-dialog': { props: ['modelValue'], emits: ['update:modelValue'], template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input />' },
  'el-input-number': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input />' },
  'el-button': { props: ['type', 'loading'], emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-tag': { template: '<span><slot /></span>' }
}

function mountPanel() {
  return mount(ExtraItemsPanel, {
    props: {
      routeId: 42,
      order: { extraItems: [], final_price_cents: 50000, status: 'wip', version: 1 },
      isTerminal: false
    },
    global: { stubs: EP_STUBS, mocks: { $t: (k: string) => k } }
  })
}

/** <script setup> 的内部状态在 dev 模式下经 vm 代理可访问，但类型上不暴露——这里收窄一次 */
type PanelVm = {
  extraForm: { name: string; description: string; priceYuan: number }
  submitExtraItem: () => Promise<void>
}
const vmOf = (wrapper: ReturnType<typeof mountPanel>): PanelVm => wrapper.vm as unknown as PanelVm

/** 填表并提交（<script setup> 状态在 dev 模式下可经 vm 访问） */
async function submitWith(wrapper: ReturnType<typeof mountPanel>, name: string, priceYuan: number): Promise<void> {
  vmOf(wrapper).extraForm = { name, description: '', priceYuan }
  await flushPromises()
  await vmOf(wrapper).submitExtraItem()
  await flushPromises()
}

/** 不改表单再点一次——即「同一次提交意图的重试」 */
async function resubmit(wrapper: ReturnType<typeof mountPanel>): Promise<void> {
  await vmOf(wrapper).submitExtraItem()
  await flushPromises()
}

beforeEach(() => {
  addExtraItemMock.mockReset()
  addExtraItemMock.mockResolvedValue({ id: 1, final_price_cents: 60000 })
})

describe('ExtraItemsPanel 幂等键（#21-7）', () => {
  it('提交携带 idempotency-key 请求头', async () => {
    const wrapper = mountPanel()
    await submitWith(wrapper, '加急', 80)

    const args = addExtraItemMock.mock.calls[0]
    expect(args[0]).toBe(42)
    expect(args[2]?.headers?.['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('同一意图失败后重试复用同 key（防响应丢失后重投重复加价）', async () => {
    addExtraItemMock.mockRejectedValueOnce(new Error('timeout'))
    const wrapper = mountPanel()

    await submitWith(wrapper, '加急', 80).catch(() => {})
    await resubmit(wrapper)

    const k1 = addExtraItemMock.mock.calls[0][2].headers['idempotency-key']
    const k2 = addExtraItemMock.mock.calls[1][2].headers['idempotency-key']
    expect(k2).toBe(k1)
  })

  it('改过内容再提交＝新意图，换新 key', async () => {
    addExtraItemMock.mockRejectedValueOnce(new Error('timeout'))
    const wrapper = mountPanel()

    await submitWith(wrapper, '加急', 80).catch(() => {})
    await submitWith(wrapper, '加急', 120)

    const k1 = addExtraItemMock.mock.calls[0][2].headers['idempotency-key']
    const k2 = addExtraItemMock.mock.calls[1][2].headers['idempotency-key']
    expect(k2).not.toBe(k1)
  })

  it('提交成功后清空 key：表单未改再点一次也是新意图（不再被同 key 吞掉）', async () => {
    const wrapper = mountPanel()
    await submitWith(wrapper, '加急', 80)
    // 刻意不动表单：若成功后没清空 key，这一笔会被服务端按重放吞掉（同名同价第二次加不上）
    await resubmit(wrapper)

    const k1 = addExtraItemMock.mock.calls[0][2].headers['idempotency-key']
    const k2 = addExtraItemMock.mock.calls[1][2].headers['idempotency-key']
    expect(k2).not.toBe(k1)
  })
})
