// REQ-028 过渡期（P1 修复批·任务 2）：画师录单页「允许客户接收QQ排队提醒」灰置 + 同款提示
// 覆盖：复选框 disabled（默认值 false 由 ManualOrder.vue 保证，此处不重复收紧）；
//       「开发中」灰标与说明文案在场，且文案取的是与客户下单页同一个键 common.notifyDevHint（禁止两页各写一份）；
//       内联快照留存真实渲染 DOM 作为灰置态证据
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../../locales/zh-CN'
import ManualOrderLeft from '../ManualOrderLeft.vue'

// 真实词条渲染：证明画师看到的是译后文案，且与客户档同源同键
const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN }
})

describe('ManualOrderLeft QQ 通知过渡处理（REQ-028）', () => {
  it('灰置 + 「开发中」徽标 + 与客户档同键的说明文案', () => {
    const wrapper = mount(ManualOrderLeft, { global: { plugins: [ElementPlus, i18n] } })
    const block = wrapper.find('.mo-notify')
    expect(block.exists()).toBe(true)

    const input = block.find('input[type="checkbox"]')
    expect(input.attributes('disabled')).toBeDefined()
    expect((input.element as HTMLInputElement).checked).toBe(false)

    expect(block.text()).toContain(zhCN.manualOrder.clientNotify)
    expect(block.text()).toContain(zhCN.common.notifyDevTag)
    // 两页共用同一份说明（此处直接比对字面值：任一侧改成硬编码或换键都会红）
    expect(block.find('.mo-notify-hint').text()).toBe(zhCN.common.notifyDevHint)
    expect(block.find('.el-tag--info').exists()).toBe(true)

    expect(block.html()).toMatchInlineSnapshot(`
      "<div data-v-a71931dd="" class="mo-notify">
        <div data-v-a71931dd="" class="mo-notify-row"><label data-v-a71931dd="" class="el-checkbox is-disabled"><span class="el-checkbox__input is-disabled"><input class="el-checkbox__original" type="checkbox" disabled=""><span class="el-checkbox__inner"></span></span><span class="el-checkbox__label">允许客户接收QQ排队提醒<!--v-if--></span></label>
          <transition-stub data-v-a71931dd="" name="el-zoom-in-center" appear="true" persisted="false" css="true"><span class="el-tag el-tag--info el-tag--small el-tag--light"><span class="el-tag__content">开发中</span>
            <!--v-if--></span>
          </transition-stub>
        </div>
        <p data-v-a71931dd="" class="mo-notify-hint">这一项现在还用不了：平台的 QQ 通知通道还在开发中，就算勾上也不会发出任何提醒，所以先灰着、默认不勾。排队位次和订单进度在站内页面随时可看，不影响约稿。</p>
      </div>"
    `)
    wrapper.unmount()
  })
})
