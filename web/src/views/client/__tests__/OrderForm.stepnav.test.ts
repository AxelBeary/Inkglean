// OrderForm 步骤导航组件测试（F1：增项步骤"下一步"跳过写需求修复的回归守卫）
// SPEC-PRICE-2：画风模型唯一——单画风(4步) / 多画风(5步) + 无配置空态
// 步骤导航逻辑（stepDefs/step/各步骤号 computed）在本组件内、不在 useOrderForm 里，故 mock composable 控制模式
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import { polyfillResizeObserver, buildMockComposable } from './helpers/orderFormMock'

type MockComposable = ReturnType<typeof buildMockComposable>
type ComposableMode = 'single' | 'multi' | 'empty'
type ArtistStatus = 'open' | 'full' | 'break' | 'hidden'

interface OrderFormVM {
  step: number
}

polyfillResizeObserver()

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: {} }),
  useRouter: () => ({ push: () => {} }),
  onBeforeRouteLeave: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// ThemePicker（经 ClientFloatingActions import 链带入）依赖 i18n 单例与 pinia，mock 隔离
vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { locale: { value: 'zh-CN' } } },
  setLocale: vi.fn(),
  default: { global: { locale: { value: 'zh-CN' } } }
}))

// 提升容器：useOrderForm mock 每次返回可控实例（h.current），模式与接单状态由 h.mode/h.status 决定
const h = vi.hoisted(() => ({
  mode: 'multi' as ComposableMode,
  status: 'open' as ArtistStatus,
  current: null as MockComposable | null,
  build: null as ((mode: ComposableMode, status: ArtistStatus) => MockComposable) | null
}))

vi.mock('../../../composables/useOrderForm.js', () => ({
  useOrderForm: () => (h.current = h.build!(h.mode, h.status))
}))

import OrderForm from '../OrderForm.vue'

h.build = buildMockComposable

// ─── 挂载与 DOM 工具 ───

async function mountForm(mode: ComposableMode, status: ArtistStatus = 'open') {
  h.mode = mode
  h.status = status
  h.current = null
  const wrapper = mount(OrderForm, {
    global: {
      plugins: [ElementPlus],
      mocks: {
        $t: (key: string) => key,
        $tm: (key: string) => [key],
        $router: { push: () => {} }
      },
      // ThemePicker 依赖 pinia store，与本测试无关，stub 隔离
      stubs: { ClientFloatingActions: true }
    }
  })
  await flushPromises()
  return wrapper
}

/** 当前可见的步骤面板（其余面板被 v-show 隐藏） */
function activePanel(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('form > div').find(
    d => (d.element as HTMLElement).style.display !== 'none' && d.find('.step-title').exists()
  )
}

function activeTitle(wrapper: ReturnType<typeof mount>) {
  const panel = activePanel(wrapper)
  return panel ? panel.find('.step-title').text() : null
}

/** 点击当前可见面板 step-nav 里的按钮（按 i18n key 文案定位），并断言按钮可用 */
async function clickNav(wrapper: ReturnType<typeof mount>, labelKey: string) {
  const panel = activePanel(wrapper)
  expect(panel, `未找到可见步骤面板（找按钮 ${labelKey}）`).toBeTruthy()
  const btn = panel!.findAll('.step-nav button').find(
    b => b.text().replace(/\s+/g, '') === labelKey
  )
  expect(btn, `当前面板无"${labelKey}"按钮`).toBeTruthy()
  expect((btn!.element as HTMLButtonElement).disabled).toBe(false)
  await btn!.trigger('click')
  await nextTick()
}

// ─── 测试 ───

describe('OrderForm 步骤导航——画风模型步骤链回归（SPEC-PRICE-2）', () => {
  describe('多画风（5 步：选画风→选尺寸→选增项→写需求→联系方式）', () => {
    it('步骤指示器渲染 5 步，起始于选画风', async () => {
      const wrapper = await mountForm('multi')
      const vm = wrapper.vm as unknown as OrderFormVM
      expect(wrapper.findAll('.step-item')).toHaveLength(5)
      expect(vm.step).toBe(1)
      expect(activeTitle(wrapper)).toBe('orderForm.styleStepTitle')
    })

    it('正向全链路：1→2→3→4→5 逐步移动无跳步', async () => {
      const wrapper = await mountForm('multi')
      const vm = wrapper.vm as unknown as OrderFormVM

      h.current!.selectedStyleId.value = 11
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(2)
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')

      h.current!.selectedSizeId.value = 111
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(3)
      expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(4)
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')

      // D 软提示：填描述后可直接进入联系方式步骤
      h.current!.form.description = '想要一个酷酷的头像'
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(5)
      expect(activeTitle(wrapper)).toBe('orderForm.step3Title')
    })

    it('反向全链路：联系方式→写需求→增项→尺寸→画风', async () => {
      const wrapper = await mountForm('multi')
      const vm = wrapper.vm as unknown as OrderFormVM
      vm.step = 5
      await nextTick()

      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.styleStepTitle')
      expect(vm.step).toBe(1)
    })
  })

  describe('单画风（4 步：选尺寸→选增项→写需求→联系方式，无选画风步）', () => {
    it('步骤指示器渲染 4 步，起始于选尺寸', async () => {
      const wrapper = await mountForm('single')
      const vm = wrapper.vm as unknown as OrderFormVM
      expect(wrapper.findAll('.step-item')).toHaveLength(4)
      expect(vm.step).toBe(1)
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')
    })

    it('正向全链路：1→2→3→4 逐步移动无跳步', async () => {
      const wrapper = await mountForm('single')
      const vm = wrapper.vm as unknown as OrderFormVM

      h.current!.selectedSizeId.value = 111
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(2)
      expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(3)
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')

      // D 软提示：填描述后可直接进入联系方式步骤
      h.current!.form.description = '想要一个酷酷的头像'
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(4)
      expect(activeTitle(wrapper)).toBe('orderForm.step3Title')
    })

    it('反向全链路；选尺寸步无"上一步"按钮', async () => {
      const wrapper = await mountForm('single')
      const vm = wrapper.vm as unknown as OrderFormVM
      vm.step = 4
      await nextTick()

      await clickNav(wrapper, 'orderForm.prevStep')
      expect(vm.step).toBe(3)
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(vm.step).toBe(2)
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(vm.step).toBe(1)
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')

      // 选尺寸是单画风第一步：导航区只有"下一步"一个按钮
      expect(activePanel(wrapper)!.findAll('.step-nav button')).toHaveLength(1)
    })
  })

  describe('无画风配置空态（SPEC-PRICE-2：旧档位模型已退役）', () => {
    it('无画风 → 无可见步骤面板，渲染空态提示 + 返回主页按钮', async () => {
      const wrapper = await mountForm('empty')
      expect(activePanel(wrapper)).toBeUndefined()
      expect(wrapper.text()).toContain('orderForm.noStylesHint')
    })
  })

  describe('D 软提示：空描述点下一步 → 弹确认框；取消留下、确认放行', () => {
    it('多画风写需求步：取消留在本步，确认放行到联系方式', async () => {
      const { ElMessageBox } = await import('element-plus')
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
      try {
        const wrapper = await mountForm('multi')
        const vm = wrapper.vm as unknown as OrderFormVM
        vm.step = 4
        await nextTick()

        // 需求描述留空点下一步 → 弹软提示（用户取消）→ 留在本步
        confirmSpy.mockRejectedValueOnce('cancel')
        await clickNav(wrapper, 'orderForm.nextStep')
        expect(confirmSpy).toHaveBeenCalled()
        expect(vm.step).toBe(4)

        // 确认「继续」→ 放行到联系方式步骤
        confirmSpy.mockResolvedValueOnce('confirm' as unknown as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
        await clickNav(wrapper, 'orderForm.nextStep')
        await flushPromises()
        expect(vm.step).toBe(5)
        expect(activeTitle(wrapper)).toBe('orderForm.step3Title')
      } finally {
        confirmSpy.mockRestore()
      }
    })
  })

  describe('F1 回归专项：增项步骤"下一步"必须到写需求', () => {
    it('多画风：增项步(3)下一步 → 写需求(4)，不得跳到联系方式(5)', async () => {
      const wrapper = await mountForm('multi')
      const vm = wrapper.vm as unknown as OrderFormVM
      vm.step = 3
      await nextTick()

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(4) // detailStep，而非 contactStep=5
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')
    })

    it('单画风：增项步(2)下一步 → 写需求(3)，不得跳到联系方式(4)', async () => {
      const wrapper = await mountForm('single')
      const vm = wrapper.vm as unknown as OrderFormVM
      vm.step = 2
      await nextTick()

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(vm.step).toBe(3) // detailStep，而非 contactStep=4
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')
    })
  })

  // ─── B09/B12-FE-03/B26：尺寸缺省或仅展示时的「跳过」出口，吸底栏须与卡内出口同流转 ───
  // 口径锚点：SizePickStep.vue 的 hasAvailable —— display_status 为空或 'available' 才可约，
  // 无一条可约时卡内出「跳过尺寸，继续」；窄屏该按钮被 .step-nav 主按钮隐藏规则吃掉，
  // 吸底栏 CTA 成了唯一出口，故 CTA 必须在本状态下沿用同一阶段流转（sizeStep → addonStep）。
  describe('尺寸缺省/仅展示：跳过出口与吸底栏 CTA 同流转（B09/B12-FE-03/B26）', () => {
    /** 夹具：画风仅剩展示档尺寸（可见不可约，对齐 SizePickStep 口径） */
    const STYLE_SHOWCASE_ONLY = {
      id: 11, name: '厚涂', description: null as string | null, cover_image: null as string | null, sort_order: 1,
      sizes: [{
        id: 111, name: '头像', base_price: 80, sort_order: 1,
        display_status: 'showcase' as string | null, addons: [] as never[]
      }]
    }
    /** 夹具：画风一条尺寸都没有（尺寸缺省） */
    const STYLE_WITHOUT_SIZES = {
      id: 11, name: '厚涂', description: null as string | null, cover_image: null as string | null, sort_order: 1,
      sizes: [] as never[]
    }

    /** 挂载后替换当前画风的尺寸集合（id 保持 11，单画风自动选中不变） */
    async function mountWithStyle(mode: ComposableMode, style: typeof STYLE_SHOWCASE_ONLY | typeof STYLE_WITHOUT_SIZES) {
      const wrapper = await mountForm(mode)
      h.current!.styles.value = [style]
      await nextTick()
      return wrapper
    }

    /** 多画风：选中唯一画风并落到选尺寸步 */
    async function gotoSizeStepMulti(wrapper: ReturnType<typeof mount>) {
      const vm = wrapper.vm as unknown as OrderFormVM
      h.current!.selectedStyleId.value = 11
      vm.step = 2
      await nextTick()
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')
    }

    /** 点击窄屏吸底栏主按钮（元素常驻 DOM，窄屏可见性由媒体查询控制，故此处验处理器流转） */
    async function clickMobileCta(wrapper: ReturnType<typeof mount>) {
      const btn = wrapper.find('.mobile-cta-btn')
      expect(btn.exists(), '吸底栏主按钮未渲染').toBe(true)
      await btn.trigger('click')
      await nextTick()
    }

    describe('单画风（选尺寸即第 1 步，跳过 → 第 2 步增项）', () => {
      it('尺寸缺省：卡内提示 + 「跳过尺寸，继续」可见且可用，点击进入增项步', async () => {
        const wrapper = await mountWithStyle('single', STYLE_WITHOUT_SIZES)
        const vm = wrapper.vm as unknown as OrderFormVM
        expect(activePanel(wrapper)!.find('.no-size-hint').exists()).toBe(true)
        await clickNav(wrapper, 'orderForm.noSizeContinue')
        expect(vm.step).toBe(2)
        expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      })

      it('尺寸缺省：吸底栏 CTA 与卡内出口同流转 → 进入增项步（不得卡在尺寸步）', async () => {
        const wrapper = await mountWithStyle('single', STYLE_WITHOUT_SIZES)
        const vm = wrapper.vm as unknown as OrderFormVM
        await clickMobileCta(wrapper)
        expect(vm.step).toBe(2)
        expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      })

      it('仅展示尺寸：卡内「跳过尺寸，继续」进入增项步，且不产生选中尺寸', async () => {
        const wrapper = await mountWithStyle('single', STYLE_SHOWCASE_ONLY)
        const vm = wrapper.vm as unknown as OrderFormVM
        expect(activePanel(wrapper)!.find('.no-size-hint').exists()).toBe(true)
        await clickNav(wrapper, 'orderForm.noSizeContinue')
        expect(vm.step).toBe(2)
        expect(h.current!.selectedSizeId.value).toBe(null)
      })

      it('仅展示尺寸：吸底栏 CTA 与卡内出口同流转 → 进入增项步（不得卡在尺寸步）', async () => {
        const wrapper = await mountWithStyle('single', STYLE_SHOWCASE_ONLY)
        const vm = wrapper.vm as unknown as OrderFormVM
        await clickMobileCta(wrapper)
        expect(vm.step).toBe(2)
        expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      })
    })

    describe('多画风（选尺寸是第 2 步，跳过 → 第 3 步增项）', () => {
      it('尺寸缺省：卡内「跳过尺寸，继续」进入增项步（第 3 步）', async () => {
        const wrapper = await mountWithStyle('multi', STYLE_WITHOUT_SIZES)
        const vm = wrapper.vm as unknown as OrderFormVM
        await gotoSizeStepMulti(wrapper)
        await clickNav(wrapper, 'orderForm.noSizeContinue')
        expect(vm.step).toBe(3)
        expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      })

      it('尺寸缺省：吸底栏 CTA 与卡内出口同流转 → 进入增项步（第 3 步）', async () => {
        const wrapper = await mountWithStyle('multi', STYLE_WITHOUT_SIZES)
        const vm = wrapper.vm as unknown as OrderFormVM
        await gotoSizeStepMulti(wrapper)
        await clickMobileCta(wrapper)
        expect(vm.step).toBe(3)
        expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      })

      it('仅展示尺寸：吸底栏 CTA 与卡内出口同流转 → 进入增项步（第 3 步）', async () => {
        const wrapper = await mountWithStyle('multi', STYLE_SHOWCASE_ONLY)
        const vm = wrapper.vm as unknown as OrderFormVM
        await gotoSizeStepMulti(wrapper)
        await clickMobileCta(wrapper)
        expect(vm.step).toBe(3)
        expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      })
    })

    describe('吸底栏主按钮文案：与卡内出口同语义（复用既有 noSizeContinue，不新增文案）', () => {
      it('单画风无尺寸 → 吸底栏写「跳过尺寸，继续」而非「下一步」', async () => {
        const wrapper = await mountWithStyle('single', STYLE_WITHOUT_SIZES)
        expect(wrapper.find('.mobile-cta-btn').text()).toBe('orderForm.noSizeContinue')
      })

      it('单画风仅展示尺寸 → 吸底栏同样写「跳过尺寸，继续」', async () => {
        const wrapper = await mountWithStyle('single', STYLE_SHOWCASE_ONLY)
        expect(wrapper.find('.mobile-cta-btn').text()).toBe('orderForm.noSizeContinue')
      })

      it('单画风有可约尺寸 → 吸底栏维持「下一步」（不把可约场景误标成跳过）', async () => {
        const wrapper = await mountForm('single')
        expect(wrapper.find('.mobile-cta-btn').text()).toBe('orderForm.nextStep')
      })

      it('多画风选画风步 → 吸底栏维持「下一步」（文案只随环节变化，不越权提前提示跳过）', async () => {
        const wrapper = await mountForm('multi')
        expect(wrapper.find('.mobile-cta-btn').text()).toBe('orderForm.nextStep')
      })
    })

    describe('有可约尺寸但尚未选中：保持选中校验（不得因放开跳过关口而放行）', () => {
      it('单画风：无跳过出口，吸底栏 CTA 拦下并提示 selectSizeFirst', async () => {
        const { ElMessage } = await import('element-plus')
        const warnSpy = vi.spyOn(ElMessage, 'warning')
        try {
          const wrapper = await mountForm('single')
          const vm = wrapper.vm as unknown as OrderFormVM
          expect(activePanel(wrapper)!.find('.no-size-hint').exists()).toBe(false)
          await clickMobileCta(wrapper)
          expect(vm.step).toBe(1)
          expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')
          expect(warnSpy).toHaveBeenCalledWith('orderForm.selectSizeFirst')
        } finally {
          warnSpy.mockRestore()
        }
      })

      it('多画风：无跳过出口，吸底栏 CTA 拦下并提示 selectSizeFirst', async () => {
        const { ElMessage } = await import('element-plus')
        const warnSpy = vi.spyOn(ElMessage, 'warning')
        try {
          const wrapper = await mountForm('multi')
          const vm = wrapper.vm as unknown as OrderFormVM
          h.current!.selectedStyleId.value = 11
          vm.step = 2
          await nextTick()
          expect(activePanel(wrapper)!.find('.no-size-hint').exists()).toBe(false)
          await clickMobileCta(wrapper)
          expect(vm.step).toBe(2)
          expect(warnSpy).toHaveBeenCalledWith('orderForm.selectSizeFirst')
        } finally {
          warnSpy.mockRestore()
        }
      })
    })
  })

  // issue #50-7：服务端 POST /api/orders 对 status !== 'open' 一律 400 ARTIST_NOT_OPEN，
  // 页面须在填表前出空态（判据只看服务端回显 status，不看 effectiveStatus）
  describe('接单状态门禁（#50-7）', () => {
    it('status=open → 正常渲染表单，无空态', async () => {
      const wrapper = await mountForm('single', 'open')
      expect(wrapper.find('form').exists()).toBe(true)
      expect(wrapper.find('.closed-banner').exists()).toBe(false)
    })

    for (const status of ['full', 'break', 'hidden'] as const) {
      it(`status=${status} → 渲染空态（errors.ARTIST_NOT_OPEN），不渲染表单、不进提交链路`, async () => {
        const wrapper = await mountForm('single', status)
        expect(wrapper.find('.closed-banner').exists()).toBe(true)
        expect(wrapper.text()).toContain('errors.ARTIST_NOT_OPEN')
        expect(wrapper.find('form').exists()).toBe(false)
        expect(wrapper.find('.step-item').exists()).toBe(false)
        expect(wrapper.find('.mobile-cta-bar').exists()).toBe(false)
        expect(h.current!.submit).not.toHaveBeenCalled()
      })
    }
  })
})
