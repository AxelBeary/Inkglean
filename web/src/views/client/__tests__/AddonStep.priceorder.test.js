// 817-D 10-2: AddonStep 价格预览「折扣→合计」行序回归测试
// 后端 preview.totalCents 为折后价（afterMultipliersCents - discountCents），
// 合计行必须排在折扣行之后，避免「先合计后减折扣」的假折前行序。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import AddonStep from '../order-form/AddonStep.vue'

const basePreview = {
  sizeName: '半身',
  baseCents: 10000,
  fixedAddonItems: [],
  percentAddonItems: [],
  subtotalCents: 10000,
  usage: null,
  rush: null,
  discount: null,
  totalCents: 10000
}

function mountStep(preview) {
  return mount(AddonStep, {
    props: {
      regularAddons: [],
      usageAddons: [],
      rushAddons: [],
      hasAddons: false,
      addonSelections: {},
      selectedUsageId: null,
      selectedRushId: null,
      priceText: (a) => `+${a.price}%`,
      preview,
      styleCalcError: '',
      installments: [],
      discountEnabled: true,
      discountValidating: false,
      discountResult: null,
      discountError: ''
    },
    global: {
      stubs: {
        'el-button': { template: '<button><slot /></button>' },
        'el-input': { template: '<input />' },
        'el-input-number': { template: '<input />' },
        'el-switch': { template: '<input type="checkbox" />' },
        'el-empty': { template: '<div />' }
      }
    }
  })
}

describe('AddonStep 合计/折扣行序（817-D 10-2）', () => {
  it('有折扣：合计行在折扣行之后，且展示折后 totalCents', () => {
    const wrapper = mountStep({
      ...basePreview,
      discount: { code: 'SALE', amountCents: 1000 },
      totalCents: 9000
    })

    const lines = wrapper.findAll('.price-line')
    const classes = lines.map(l => l.classes())
    const discountIdx = classes.findIndex(c => c.includes('discount'))
    const totalIdx = classes.findIndex(c => c.includes('total'))

    expect(discountIdx).toBeGreaterThanOrEqual(0)
    expect(totalIdx).toBeGreaterThan(discountIdx)
    expect(lines[totalIdx].text()).toContain('¥90.00')
  })

  it('无折扣：合计行照常渲染 totalCents', () => {
    const wrapper = mountStep(basePreview)

    const total = wrapper.find('.price-line.total')
    expect(total.exists()).toBe(true)
    expect(total.text()).toContain('¥100.00')
    expect(wrapper.find('.price-line.discount').exists()).toBe(false)
  })
})
