// REQ-028 过渡期（P1 修复批·任务 1）：客户下单页「排到我的时候通过QQ通知我」三件套
// 覆盖：复选框灰置（disabled）、默认不勾、旁边明示「开发中」灰标 + 人话说明；
//       内联快照留存真实渲染 DOM 作为灰置态证据（快照即证据，回归时先红）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../locales/zh-CN'
import ContactStep from '../order-form/ContactStep.vue'

// 真实词条渲染（不用键名透传 mock）：证明客户看到的是译后文案，而不是裸键
const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN }
})

function mountStep() {
  return mount(ContactStep, {
    props: {
      notifyVisible: true,
      hasRules: false,
      sanitizedRules: '',
      submitPriceText: null
    },
    global: { plugins: [ElementPlus, i18n] }
  })
}

describe('ContactStep QQ 排队提醒过渡处理（REQ-028）', () => {
  it('灰置 + 默认不勾 + 「开发中」徽标与说明文案同时在场', () => {
    const wrapper = mountStep()
    const block = wrapper.find('.notify-block')
    expect(block.exists()).toBe(true)

    const input = block.find('input[type="checkbox"]')
    expect(input.attributes('disabled')).toBeDefined()
    expect((input.element as HTMLInputElement).checked).toBe(false)

    expect(block.text()).toContain(zhCN.orderForm.notifyLabel)
    expect(block.text()).toContain(zhCN.common.notifyDevTag)
    expect(block.text()).toContain(zhCN.common.notifyDevHint)
    // 灰标必须走 EP info 灰态（与客户档视觉口径一致，不自造色值）
    expect(block.find('.el-tag--info').exists()).toBe(true)

    expect(block.html()).toMatchInlineSnapshot(`
      "<div data-v-5c2b7dc5="" class="notify-block">
        <div data-v-5c2b7dc5="" class="notify-row"><label data-v-5c2b7dc5="" class="el-checkbox is-disabled"><span class="el-checkbox__input is-disabled"><input class="el-checkbox__original" type="checkbox" disabled=""><span class="el-checkbox__inner"></span></span><span class="el-checkbox__label">排到我的时候通过QQ通知我<!--v-if--></span></label>
          <transition-stub data-v-5c2b7dc5="" name="el-zoom-in-center" appear="true" persisted="false" css="true"><span class="el-tag el-tag--info el-tag--small el-tag--light"><span class="el-tag__content">开发中</span>
            <!--v-if--></span>
          </transition-stub>
        </div>
        <p data-v-5c2b7dc5="" class="notify-hint">这一项现在还用不了：平台的 QQ 通知通道还在开发中，就算勾上也不会发出任何提醒，所以先灰着、默认不勾。排队位次和订单进度在站内页面随时可看，不影响约稿。</p>
      </div>"
    `)
    wrapper.unmount()
  })

  it('画师未开启通知时整块不渲染（原 notifyVisible 语义不变）', () => {
    const wrapper = mount(ContactStep, {
      props: { notifyVisible: false, hasRules: false, sanitizedRules: '', submitPriceText: null },
      global: { plugins: [ElementPlus, i18n] }
    })
    expect(wrapper.find('.notify-block').exists()).toBe(false)
    wrapper.unmount()
  })
})
