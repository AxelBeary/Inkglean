// F0192 回归：AddonSettingsDialog「一次保存」——单次调用 saveAddonSettings、payload 字段齐全、
// 互斥停用项不再由前端拼（服务端推导）、孤儿行（addon_template_id=null）不再被当 number 回传、
// 零变更不发请求（对齐旧多写路径「无 diff 即零请求」行为）、失败只提示不关弹窗。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  saveSettings: vi.fn(),
  updateTpl: vi.fn(),
  setStyleAddons: vi.fn(),
  setSizeOverrides: vi.fn(),
  removeStyleAddon: vi.fn(),
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
    saveAddonSettings: h.saveSettings,
    updateAddonTemplate: h.updateTpl,
    setStyleAddons: h.setStyleAddons,
    setSizeOverrides: h.setSizeOverrides,
    removeStyleAddon: h.removeStyleAddon
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.success, error: h.error, warning: h.warning, info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

import AddonSettingsDialog from '../AddonSettingsDialog.vue'

const STYLE_ID = 7
const SA_ID = 55
const TPL_ID = 9

/** el-dialog 桩：modelValue 翻真时发 open（真实组件同语义），触发 @open="initForm" */
const DIALOG_STUB = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'destroyOnClose'],
  emits: ['update:modelValue', 'open'],
  template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
  watch: {
    modelValue(this: { $emit: (e: string, ...args: unknown[]) => void }, v: boolean) {
      if (v) this.$emit('open')
    }
  }
}

const NUMBER_STUB = {
  name: 'ElInputNumber',
  props: ['modelValue', 'min', 'max', 'step', 'precision', 'size', 'placeholder'],
  emits: ['update:modelValue', 'change'],
  template: '<input class="num-stub" :value="modelValue" @input="onInput" @change="onInput" />',
  methods: {
    onInput(this: { $emit: (e: string, v: unknown) => void; modelValue: unknown }, ev: Event) {
      const raw = (ev.target as HTMLInputElement).value
      const value = raw === '' ? null : Number(raw)
      this.$emit('update:modelValue', value)
      this.$emit('change', value)
    }
  }
}

/** el-switch 桩：v-model 行与 :model-value+@change 两用法都覆盖（update:modelValue + change 双发） */
const SWITCH_STUB = {
  name: 'ElSwitch',
  props: ['modelValue', 'size', 'activeText', 'ariaLabel'],
  emits: ['update:modelValue', 'change'],
  template: '<button class="switch-stub" type="button" @click="toggle" />',
  methods: {
    toggle(this: { $emit: (e: string, v: boolean) => void; modelValue: boolean }) {
      this.$emit('update:modelValue', !this.modelValue)
      this.$emit('change', !this.modelValue)
    }
  }
}

const BUTTON_STUB = {
  name: 'ElButton',
  props: ['text', 'type', 'size', 'plain', 'loading'],
  emits: ['click'],
  template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
}

/** 胶囊行最小形状（与组件私有 SettingsSa 结构兼容；addon_template_id 如实可为 null——孤儿行口径） */
interface TestSaRow {
  id: number
  addon_template_id: number | null
  is_enabled: number
  price_override: number | null
  template_name: string
  template_price_mode: string
  template_control_type: string
  template_default_price: number
  template_category: string
}

/** 组件 props.style 最小形状（SettingsStyleLite 同形；addons 已不被 save() 消费，省略） */
interface TestStyleLite {
  id: number
  sizes: Array<{ id: number; name: string; _overrides?: Record<number, { is_hidden?: number | boolean | null; price_override?: number | null }> | null }>
}

function buildSa(overrides: Partial<TestSaRow> = {}): TestSaRow {
  return {
    id: SA_ID,
    addon_template_id: TPL_ID,
    is_enabled: 1,
    price_override: null,
    template_name: '加人',
    template_price_mode: 'fixed',
    template_control_type: 'quantity',
    template_default_price: 100,
    template_category: 'add',
    ...overrides
  }
}

function buildStyle(): TestStyleLite {
  return {
    id: STYLE_ID,
    sizes: [
      { id: 101, name: '头像', _overrides: {} },
      { id: 102, name: '半身', _overrides: { [SA_ID]: { is_hidden: 1, price_override: 30 } } }
    ]
  }
}

function mountDialog(sa: TestSaRow) {
  return mount(AddonSettingsDialog, {
    props: { modelValue: false, style: buildStyle(), sa },
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      directives: { loading: {} },
      stubs: {
        'el-dialog': DIALOG_STUB,
        'el-input-number': NUMBER_STUB,
        'el-switch': SWITCH_STUB,
        'el-button': BUTTON_STUB,
        'el-tag': { template: '<span class="tag-stub"><slot /></span>' }
      }
    }
  })
}

async function openDialog(sa: TestSaRow) {
  const wrapper = mountDialog(sa)
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

/** 点击底部确认按钮 */
async function clickSave(wrapper: Awaited<ReturnType<typeof openDialog>>) {
  const saveBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'common.confirm')
  expect(saveBtn).toBeTruthy()
  await saveBtn!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  h.saveSettings.mockReset().mockResolvedValue({ addons: [], sizeOverrides: [] })
  h.updateTpl.mockReset()
  h.setStyleAddons.mockReset()
  h.setSizeOverrides.mockReset()
  h.removeStyleAddon.mockReset()
  h.success.mockClear()
  h.error.mockClear()
  h.warning.mockClear()
})

describe('F0192 增项设置「一次保存」（AddonSettingsDialog.save）', () => {
  it('四层变更 → 只发 1 个 API 调用且 payload 字段齐全（旧三端点零调用）', async () => {
    // 初始：禁用 + 画风覆盖 120；尺寸 102 有覆盖（is_hidden=1, price=30）
    const wrapper = await openDialog(buildSa({ is_enabled: 0, price_override: 120 }))

    // 模板价输入 100 → 150（.num-stub 顺序：0=模板级 basePrice，1/2=尺寸行差异价）
    const nums = wrapper.findAll('.num-stub')
    expect(nums).toHaveLength(3)
    await nums[0].setValue('150')
    await nums[0].trigger('change')
    // 画风级激活开关（.switch-stub 顺序：0=画风级，1/2=尺寸行）
    const switches = wrapper.findAll('.switch-stub')
    expect(switches).toHaveLength(3)
    await switches[0].trigger('click')
    // 尺寸 101 停用
    await switches[1].trigger('click')
    // 尺寸 102 差异价 30 → 45
    await nums[2].setValue('45')
    await nums[2].trigger('change')

    await clickSave(wrapper)

    // 单调用断言（替代旧多调用断言）：仅 saveAddonSettings 一次，旧三端点零调用
    expect(h.saveSettings).toHaveBeenCalledTimes(1)
    expect(h.updateTpl).not.toHaveBeenCalled()
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    const [styleId, payload] = h.saveSettings.mock.calls[0] as [number, Record<string, unknown>]
    expect(styleId).toBe(STYLE_ID)
    // payload 字段齐全：身份键 = 行 id；互斥停用项不在前端拼（payload 内无任何互斥项字段）
    expect(payload).toEqual({
      styleAddonId: SA_ID,
      stylePriceOverride: 150, // scope=style：150 ≠ 模板价 100 → 写画风覆盖
      styleEnabled: true,
      sizeOverrides: [
        { sizeId: 101, priceOverride: null, isHidden: true },
        { sizeId: 102, priceOverride: 45, isHidden: true }
      ]
    })
    // 成功提示 + 关弹窗 + saved 上抛
    expect(h.success).toHaveBeenCalledWith('styleManage.addonSaved')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('saved')).toBeTruthy()
    wrapper.unmount()
  })

  it('scope=all → 模板价 + 清画风覆盖合并同一 payload，仍是单调用', async () => {
    const wrapper = await openDialog(buildSa({ price_override: 120 }))

    // 切到「所有画风」（初始 scope=style 按钮文案）
    const scopeBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'styleManage.addonScopeStyle')
    expect(scopeBtn).toBeTruthy()
    await scopeBtn!.trigger('click')
    // 模板价 100 → 200
    const nums = wrapper.findAll('.num-stub')
    await nums[0].setValue('200')
    await nums[0].trigger('change')

    await clickSave(wrapper)

    expect(h.saveSettings).toHaveBeenCalledTimes(1)
    expect(h.updateTpl).not.toHaveBeenCalled()
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    const [, payload] = h.saveSettings.mock.calls[0] as [number, Record<string, unknown>]
    expect(payload).toEqual({
      styleAddonId: SA_ID,
      templateDefaultPrice: 200, // 模板级
      stylePriceOverride: null,  // 应用到所有画风 → 清画风覆盖（继承）
      sizeOverrides: []          // 尺寸无变更不入 payload
    })
    wrapper.unmount()
  })

  it('孤儿行（addon_template_id=null）照常单调用：身份键用行 id，模板价原样上送由服务端跳过', async () => {
    const orphanSa = buildSa({
      addon_template_id: null,
      template_name: '旧加急',
      template_category: 'rush',
      template_price_mode: 'percent',
      template_default_price: 50,
      price_override: null
    })
    const wrapper = await openDialog(orphanSa)

    // scope=all + 模板价 50 → 80（percent 整数校验通过；孤儿行由服务端跳过+告警，不 422）
    const scopeBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'styleManage.addonScopeStyle')
    await scopeBtn!.trigger('click')
    const nums = wrapper.findAll('.num-stub')
    await nums[0].setValue('80')
    await nums[0].trigger('change')

    await clickSave(wrapper)

    // 不因孤儿行降级回旧多写路径：仍单调用
    expect(h.saveSettings).toHaveBeenCalledTimes(1)
    expect(h.updateTpl).not.toHaveBeenCalled()
    const [styleId, payload] = h.saveSettings.mock.calls[0] as [number, Record<string, unknown>]
    expect(styleId).toBe(STYLE_ID)
    expect(payload).toEqual({
      styleAddonId: SA_ID,
      templateDefaultPrice: 80,
      sizeOverrides: []
    })
    expect(h.success).toHaveBeenCalledWith('styleManage.addonSaved')
    wrapper.unmount()
  })

  it('零变更 → 不发请求（对齐旧多写路径「无 diff 即零请求」），直接成功关闭', async () => {
    const wrapper = await openDialog(buildSa())

    await clickSave(wrapper)

    expect(h.saveSettings).not.toHaveBeenCalled()
    expect(h.updateTpl).not.toHaveBeenCalled()
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    expect(h.success).toHaveBeenCalledWith('styleManage.addonSaved')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('saved')).toBeTruthy()
    wrapper.unmount()
  })

  it('保存失败 → 只提示不关弹窗、不吐 saved（本地无残留可重试）', async () => {
    h.saveSettings.mockReset().mockRejectedValue(new Error('SAVE_FAILED'))
    const wrapper = await openDialog(buildSa({ is_enabled: 0 }))

    // 仅翻激活开关制造一处变更
    await wrapper.findAll('.switch-stub')[0].trigger('click')
    await clickSave(wrapper)

    expect(h.saveSettings).toHaveBeenCalledTimes(1)
    expect(h.error).toHaveBeenCalledWith('SAVE_FAILED')
    // 关闭/上抛均未发生
    const closes = wrapper.emitted('update:modelValue') ?? []
    expect(closes.at(-1)).toBeUndefined()
    expect(wrapper.emitted('saved')).toBeFalsy()
    wrapper.unmount()
  })

  it('percent 非整数 → 前端先拦（沿用既有提示，不发请求）', async () => {
    const wrapper = await openDialog(buildSa({
      template_price_mode: 'percent',
      template_default_price: 50
    }))
    const nums = wrapper.findAll('.num-stub')
    await nums[0].setValue('12.5')
    await nums[0].trigger('change')

    await clickSave(wrapper)

    expect(h.warning).toHaveBeenCalledWith('styleManage.createPercentRangeHint')
    expect(h.saveSettings).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
