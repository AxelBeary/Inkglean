// issue #54-2: 插值外的硬编码全角标点（英文态仍显示「（）：」）
// 本批把标点收进 i18n 词条——英文态必须是半角。既有基座（AddonStep.priceorder / PaymentPanel）
// 都 mock 了 vue-i18n，测不到真实英文文案，故这里用真实 i18n 插件按 en 渲染三个代表位：
// 客服下单增项行/折扣行、画师节点差额行、法务页「更新日期」行。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en'
import zh from '../../../locales/zh-CN'
import AddonStep from '../order-form/AddonStep.vue'
import LegalDoc from '../LegalDoc.vue'
import PaymentPanel from '../../../components/artist/order/PaymentPanel.vue'
import type { StylePricePreview } from '../order-form/types'

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'PrivacyPolicy', params: {}, query: {} })
}))

/** 真实 i18n（en）：插件自带 $t，组件内 useI18n() 也拿到同一份消息 */
function realI18n(locale: 'en' | 'zh-CN') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { en, 'zh-CN': zh }
  })
}

/** 全角标点（这批的真问题：英文态不该出现） */
const FULLWIDTH = /[（）：]/

const previewWithDiscount: StylePricePreview = {
  sizeName: '半身',
  baseCents: 10000,
  fixedAddonItems: [],
  percentAddonItems: [{ name: '渐变', percent: 20, amountCents: 2000 }],
  subtotalCents: 12000,
  usage: null,
  rush: null,
  discount: { code: 'SALE', amountCents: 1000 },
  totalCents: 11000
}

function mountAddonStep(locale: 'en' | 'zh-CN') {
  return mount(AddonStep, {
    props: {
      regularAddons: [],
      usageAddons: [],
      rushAddons: [],
      hasAddons: false,
      addonSelections: {},
      selectedUsageId: null,
      selectedRushId: null,
      priceText: () => '',
      preview: previewWithDiscount,
      styleCalcError: '',
      installments: [],
      discountEnabled: true,
      discountValidating: false,
      discountResult: null,
      discountError: ''
    },
    global: {
      plugins: [realI18n(locale)],
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

describe('英文态标点：增项/折扣行（issue #54-2）', () => {
  it('英文：百分比增项注与折扣行都用半角括号', () => {
    const wrapper = mountAddonStep('en')
    expect(wrapper.find('.price-line-note').text()).toBe('(of base price)')
    expect(wrapper.find('.price-line.discount').text()).toContain('Est. discount (SALE)')
    expect(wrapper.find('.price-preview').text()).not.toMatch(FULLWIDTH)
  })

  it('中文：仍显示全角括号（词条两侧各自成句，不是一刀切去标点）', () => {
    const wrapper = mountAddonStep('zh-CN')
    expect(wrapper.find('.price-line-note').text()).toBe('（按基础价计算）')
    expect(wrapper.find('.price-line.discount').text()).toContain('预估折扣（SALE）')
  })
})

describe('英文态标点：节点差额行（issue #54-2）', () => {
  it('英文：差额行是半角括号整句', () => {
    const wrapper = mount(PaymentPanel, {
      props: {
        payments: [],
        poolPaidCents: 12000,
        poolFinalCents: 15000,
        poolRemainingCents: 3000,
        installments: [],
        installmentRefs: [{ id: 7, name: '线稿', status: 'partial', paidCents: 12000, amountCents: 15000, remainingCents: 3000 }],
        isTerminal: false,
        revokeSubmitting: false
      },
      global: {
        plugins: [realI18n('en')],
        stubs: {
          'el-card': { template: '<div><slot /><slot name="header" /></div>' },
          'el-button': { template: '<button><slot /></button>' },
          'el-progress': { template: '<div />' },
          'el-tag': { template: '<span><slot /></span>' }
        }
      }
    })
    expect(wrapper.find('.pool-ref-remain').text()).toBe('(Remaining ¥30.00)')
    expect(wrapper.find('.pool-ref').text()).not.toMatch(FULLWIDTH)
  })
})

describe('英文态标点：法务页更新日期（issue #54-2）', () => {
  it('英文：更新日期行是半角冒号整句', () => {
    const wrapper = mount(LegalDoc, { global: { plugins: [realI18n('en')] } })
    expect(wrapper.find('.legal-updated').text()).toBe('Last updated: 2026-09-13')
  })
})

// 后台三处 + 手工下单两处未单独挂载（物料重、且与本批标点改法同形），
// 这里锁词条本身的字符集：英文侧不许出现全角标点，中文侧必须保留（两侧成对不塌成同一句）。
describe('英文态标点：其余词条字符集（issue #54-2）', () => {
  it.each([
    ['styleManage.styleInactiveInParens', en.styleManage.styleInactiveInParens, zh.styleManage.styleInactiveInParens],
    ['admin.greetingPreviewLine', en.admin.greetingPreviewLine, zh.admin.greetingPreviewLine],
    ['dashboard.guestbookReplyLabel', en.dashboard.guestbookReplyLabel, zh.dashboard.guestbookReplyLabel],
    ['orderForm.multOptionalHintInParens', en.orderForm.multOptionalHintInParens, zh.orderForm.multOptionalHintInParens],
    ['orderForm.pctOfBaseInParens', en.orderForm.pctOfBaseInParens, zh.orderForm.pctOfBaseInParens],
    ['orderForm.discountEstimateWithCode', en.orderForm.discountEstimateWithCode, zh.orderForm.discountEstimateWithCode],
    ['orderDetail.payNodeRemainInParens', en.orderDetail.payNodeRemainInParens, zh.orderDetail.payNodeRemainInParens],
    ['compliance.common.updatedOn', en.compliance.common.updatedOn, zh.compliance.common.updatedOn]
  ])('%s 英文半角、中文全角', (_key, enValue, zhValue) => {
    expect(enValue).not.toMatch(FULLWIDTH)
    expect(zhValue).toMatch(FULLWIDTH)
  })
})
