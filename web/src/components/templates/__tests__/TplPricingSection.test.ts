// P1-B 收敛（813-hunt）：TplPricingSection 关键断言
// 覆盖：空数据不渲染；style/tier 二选一分支；标题 slot 只在有展示柜时出现；
//       addons 透传；流程/修改说明渲染；inner-class / section-id 变体
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TplPricingSection from '../TplPricingSection.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const ShowcaseStub = {
  name: 'TplShowcase',
  props: ['mode', 'styles', 'tiers', 'subdomain', 'artist'],
  template: '<div class="showcase-stub"><slot name="addons" :tier="(tiers || [])[0]" /></div>'
}

const WorkflowStub = {
  name: 'WorkflowOverviewStrip',
  template: '<div class="workflow-stub" />'
}

function mountSection(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(TplPricingSection, {
    props,
    slots,
    global: {
      mocks: {
        $t: (key: string) => key,
        $tm: () => []
      },
      stubs: { TplShowcase: ShowcaseStub, WorkflowOverviewStrip: WorkflowStub }
    }
  })
}

describe('TplPricingSection（价格+流程+修改说明共享区块）', () => {
  it('styles/tiers/workflowStages 全空 → 不渲染根 section', () => {
    const wrapper = mountSection()
    expect(wrapper.find('.tpl-pricing-section').exists()).toBe(false)
  })

  it('有画风 → 走 style 展示柜；标题 slot 渲染一次', () => {
    const wrapper = mountSection(
      { styles: [{ id: 1, name: 'A' }], workflowStages: [], revisionNote: '' },
      { title: '<p class="tpl-section-label classic-label">artistHome.priceList</p>' }
    )
    const showcase = wrapper.getComponent({ name: 'TplShowcase' })
    expect(showcase.props('mode')).toBe('style')
    expect(showcase.props('styles')).toHaveLength(1)
    expect(wrapper.findAll('p.tpl-section-label').length).toBe(1)
  })

  it('无画风有档位 → 走 tier 展示柜；addons 收到档位数据', () => {
    const tier = { id: 2, name: 'T1', price: 100 }
    const wrapper = mountSection(
      { tiers: [tier] },
      {
        addons: '<span class="addons-stub" v-if="tier">{{ tier.name }}</span>'
      }
    )
    const showcase = wrapper.getComponent({ name: 'TplShowcase' })
    expect(showcase.props('mode')).toBe('tier')
    expect(showcase.props('tiers')).toEqual([tier])
    expect(wrapper.find('.addons-stub').text()).toBe('T1')
  })

  it('流程与修改说明渲染（仅流程时也渲染区块）', () => {
    const wrapper = mountSection({
      workflowStages: [{ id: 1, name: 'W1' }],
      revisionNote: '修改说明文案'
    })
    expect(wrapper.find('.tpl-pricing-section').exists()).toBe(true)
    expect(wrapper.find('.tpl-workflow-inline').exists()).toBe(true)
    expect(wrapper.find('.workflow-stub').exists()).toBe(true)
    expect(wrapper.find('.tpl-revision-note').text()).toContain('修改说明文案')
  })

  it('section-id 与 inner-class 变体落到对应元素（Folio 锚点 / 内层宽度）', () => {
    const wrapper = mountSection(
      { styles: [{ id: 1, name: 'A' }], sectionId: 'pricing', innerClass: 'folio-inner' },
      { title: '<h2 class="folio-title">artistHome.priceList</h2>' }
    )
    expect(wrapper.get('section.tpl-pricing-section').attributes('id')).toBe('pricing')
    expect(wrapper.find('.folio-inner').exists()).toBe(true)
    expect(wrapper.find('.folio-title').exists()).toBe(true)
  })
})
