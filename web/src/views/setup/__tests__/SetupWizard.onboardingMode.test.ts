// 9/12 余批（任务2）：开箱向导新增「画师入驻方式」一步
// 覆盖：① 步进器 5 格与真实面板一一对应（杜绝"进度条 5 格、代码还写 4 步"的错位）；
//       ② 创建管理员成功后落在入驻方式步（不再直落扫码步）；
//       ③ 默认选中 invite、切 manual 后 POST 载荷正确；
//       ④ 写入失败绝不静默前进（M-11 口径），就地显错并可原样重试；
//       ⑤ 上一步链路闭环：入驻方式 ⇄ 创建管理员 / 扫码 ⇄ 入驻方式；
//       ⑥ 英文 locale 下新步渲染真实词条而非裸键（中英成对）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../locales/zh-CN'
import en from '../../../locales/en'
import { useSetupStore } from '../../../stores/setup'

const h = vi.hoisted(() => ({
  setOnboardingMode: vi.fn(),
  applySession: vi.fn(),
  enterArtistScope: vi.fn()
}))

// 真实 api 模块会建 axios 实例并挂拦截器，测试只需拦截这一次写入
vi.mock('../../../api/index.js', () => ({
  setupApi: { setOnboardingMode: (...a: unknown[]) => h.setOnboardingMode(...a) }
}))
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ applySession: (...a: unknown[]) => h.applySession(...a) })
}))
vi.mock('../../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: (...a: unknown[]) => h.enterArtistScope(...a) })
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() })
}))
// 二维码生成打桩（happy-dom 无 canvas 绘图；本测试不验出图）
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mockqr')) }
}))

import SetupWizard from '../SetupWizard.vue'

/** 真实词条渲染（不用键名透传 mock）：证明用户看到的是译后文案，而不是裸键 */
function mountWizard(locale: 'zh-CN' | 'en'): VueWrapper {
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, en }
  })
  return mount(SetupWizard, { global: { plugins: [ElementPlus, i18n] } })
}

/** 只在按钮行里找，避免与步进器圆下方的同名步骤标题串扰（如 step2Submit 是 step2Title 的子串） */
function navButton(wrapper: VueWrapper, text: string) {
  const btn = wrapper.findAll('.btn-row button').find(b => b.text().includes(text))
  expect(btn, `找不到文案含「${text}」的操作按钮`).toBeTruthy()
  return btn!
}

const copy = zhCN.setup
const enCopy = en.setup

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  // 向导不查 status（路由守卫才查），这里只兜住创建管理员那一次 fetch
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      artist: { qqNumber: '12345678', name: '管理员甲' },
      totpSecret: 'SECRET',
      otpauthUri: 'otpauth://totp/inkglean?secret=SECRET'
    })
  })))
  h.setOnboardingMode.mockResolvedValue({ ok: true, mode: 'invite' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('开箱向导步进器与新增步的对齐', () => {
  it('步进器渲染 5 格，第 3 格就是「画师入驻方式」，末格仍是「设置完成」', () => {
    const wrapper = mountWizard('zh-CN')
    const items = wrapper.findAll('.step-item')
    expect(items).toHaveLength(5)
    expect(items[2].text()).toContain(copy.stepModeTitle)
    expect(items[3].text()).toContain(copy.step3Title)
    expect(items[4].text()).toContain(copy.step4Title)
    // 首格为当前步：aria-current=step 只有一处
    expect(wrapper.findAll('[aria-current="step"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('第 3 步面板只渲染入驻方式内容：既不是扫码表单也不是完成页', () => {
    useSetupStore().currentStep = 3
    const wrapper = mountWizard('zh-CN')
    expect(wrapper.find('.panel-title').text()).toBe(copy.stepModeTitle)
    expect(wrapper.find('[name="setup-onboarding-mode"]').exists()).toBe(true)
    expect(wrapper.find('.qr-section').exists()).toBe(false)
    expect(wrapper.find('.done-icon').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('步骤流转：创建管理员 → 入驻方式 → 扫码', () => {
  it('创建管理员成功后停在入驻方式步（原先直落扫码，现按 REQ-039 原意插一步）', async () => {
    const store = useSetupStore()
    // 步进器与面板都按 store 当前步渲染：先置状态再挂载，免掉一次 nextTick
    store.createStudio = false
    store.currentStep = 2
    const wrapper = mountWizard('zh-CN')

    await wrapper.find('input[inputmode="numeric"]').setValue('12345678')
    await wrapper.findAll('.field-input')[1].setValue('管理员甲')
    await navButton(wrapper, copy.step2Submit).trigger('click')
    await flushPromises()

    expect(store.currentStep).toBe(3)
    expect(wrapper.find('.panel-title').text()).toBe(copy.stepModeTitle)
    wrapper.unmount()
  })

  it('默认选中「邀请码入驻」，与后端 migrate 预置默认值同口径', () => {
    useSetupStore().currentStep = 3
    const wrapper = mountWizard('zh-CN')
    const radios = wrapper.findAll('[name="setup-onboarding-mode"]')
    expect(radios).toHaveLength(2)
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)
    expect(radios[0].attributes('value')).toBe('invite')
    expect(radios[1].attributes('value')).toBe('manual')
    expect(wrapper.find('.mode-option.active').text()).toContain(copy.stepModeInviteLabel)
    wrapper.unmount()
  })

  it('选 manual 保存：POST 载荷 {mode:"manual"}，服务端确认后才进扫码步', async () => {
    const store = useSetupStore()
    store.currentStep = 3
    const wrapper = mountWizard('zh-CN')

    await wrapper.findAll('[name="setup-onboarding-mode"]')[1].setValue(true)
    await navButton(wrapper, copy.stepModeSubmit).trigger('click')
    await flushPromises()

    expect(h.setOnboardingMode).toHaveBeenCalledWith('manual')
    expect(store.currentStep).toBe(4)
    expect(wrapper.find('.panel-title').text()).toBe(copy.step3Title)
    wrapper.unmount()
  })
})

describe('写入失败不静默前进（M-11 口径）', () => {
  it('失败：就地显示错误、留在本步，原样重试成功后才前进', async () => {
    const store = useSetupStore()
    store.currentStep = 3
    const wrapper = mountWizard('zh-CN')

    h.setOnboardingMode.mockRejectedValueOnce(new Error('服务端拒绝：setup 阶段已结束'))
    await navButton(wrapper, copy.stepModeSubmit).trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-banner').exists()).toBe(true)
    expect(wrapper.find('.error-banner').text()).toContain('服务端拒绝：setup 阶段已结束')
    expect(store.currentStep).toBe(3)
    // 失败后按钮恢复可点（不被 submitting 卡死）
    expect(navButton(wrapper, copy.stepModeSubmit).attributes('disabled')).toBeUndefined()

    await navButton(wrapper, copy.stepModeSubmit).trigger('click')
    await flushPromises()
    expect(store.currentStep).toBe(4)
    expect(wrapper.find('.error-banner').exists()).toBe(false)
    wrapper.unmount()
  })

  it('错误体无 message 时回落到 i18n 兜底文案，不显示空白', async () => {
    const store = useSetupStore()
    store.currentStep = 3
    const wrapper = mountWizard('zh-CN')

    h.setOnboardingMode.mockRejectedValueOnce(new Error(''))
    await navButton(wrapper, copy.stepModeSubmit).trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-banner').text()).toBe(copy.stepModeFailed)
    expect(store.currentStep).toBe(3)
    wrapper.unmount()
  })
})

describe('上一步链路闭环', () => {
  it('入驻方式步的「上一步」回创建管理员，不跳回欢迎页', async () => {
    const store = useSetupStore()
    store.currentStep = 3
    const wrapper = mountWizard('zh-CN')
    await navButton(wrapper, copy.prevStep).trigger('click')
    expect(store.currentStep).toBe(2)
    wrapper.unmount()
  })

  it('扫码步的「上一步」回入驻方式步（此前写死回第 2 步，插步后会跳错）', async () => {
    const store = useSetupStore()
    store.currentStep = 4
    const wrapper = mountWizard('zh-CN')
    await navButton(wrapper, copy.prevStep).trigger('click')
    expect(store.currentStep).toBe(3)
    expect(wrapper.find('.panel-title').text()).toBe(copy.stepModeTitle)
    wrapper.unmount()
  })

  it('步进器不允许向前跳步（未完成的后续步骤禁用）', () => {
    useSetupStore().currentStep = 2
    const wrapper = mountWizard('zh-CN')
    const items = wrapper.findAll('.step-item')
    expect(items[0].attributes('disabled')).toBeUndefined()
    expect(items[1].attributes('disabled')).toBeUndefined()
    expect(items[2].attributes('disabled')).toBeDefined()
    expect(items[4].attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('英文 locale 下新步词条成对', () => {
  it('入驻方式步渲染真实英文，不出现裸键', () => {
    useSetupStore().currentStep = 3
    const wrapper = mountWizard('en')
    const text = wrapper.text()
    expect(wrapper.find('.panel-title').text()).toBe(enCopy.stepModeTitle)
    expect(text).toContain(enCopy.stepModeInviteLabel)
    expect(text).toContain(enCopy.stepModeManualLabel)
    expect(text).not.toContain('setup.stepMode')
    wrapper.unmount()
  })

  it('欢迎页的验证器预告提示不再说"下一步就是扫码"（插步后措辞自洽）', () => {
    useSetupStore().currentStep = 2
    const wrapper = mountWizard('zh-CN')
    const notice = wrapper.find('.prep-notice').text()
    expect(notice).toContain(copy.step2Prep)
    expect(notice).not.toContain('下一步要扫二维码')
    wrapper.unmount()
  })
})
