// v81 下单页售前信息回归：档位卡片显示「含 N 次免费修改」/「免费修改次数不限」
// 来由：getPublicStyles 一直用 SELECT *（行里早有 free_revisions），但公开映射是显式字段清单把它丢了，
// 前端类型也没有 → 客户在下单页看不到「这个档位包几次免费修改」。覆盖：
//   1. free_revisions=3 → 含 3 次免费修改
//   2. free_revisions=0 → 不限（画师设 0 就是不限，不能显示成「0 次」）
//   3. 老后端响应没这个字段 → 按不限渲染（不裂、不显示 undefined）
//   4. 次数是次要信息层级，不得用告警/危险语义
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../../locales/zh-CN'
import SizePickStep from '../SizePickStep.vue'
import type { StyleSize } from '../types'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN }
})

function mountStep(sizes: StyleSize[]) {
  return mount(SizePickStep, {
    props: { sizes, selectedSizeId: null, isMultiStyle: false },
    global: {
      plugins: [i18n],
      stubs: { 'el-button': { template: '<button><slot /></button>' } }
    }
  })
}

describe('SizePickStep 档位免费修改次数（v81）', () => {
  it('free_revisions = 3 → 卡片显示「含 3 次免费修改」', () => {
    const wrapper = mountStep([{ id: 1, name: '半身', base_price: 200, free_revisions: 3 }])

    const revisions = wrapper.find('.size-pick-revisions')
    expect(revisions.exists()).toBe(true)
    expect(revisions.text()).toBe('含 3 次免费修改')
    // 名称仍在同一张卡片的主信息里
    expect(wrapper.find('.size-pick-name').text()).toBe('半身')
    wrapper.unmount()
  })

  it('free_revisions = 0 → 显示「免费修改次数不限」', () => {
    const wrapper = mountStep([{ id: 1, name: '头像', base_price: 100, free_revisions: 0 }])

    expect(wrapper.find('.size-pick-revisions').text()).toBe('免费修改次数不限')
    wrapper.unmount()
  })

  it('老后端响应没有该字段 → 按不限渲染（不出现 undefined/NaN）', () => {
    const wrapper = mountStep([{ id: 1, name: '插画', base_price: 500 }])

    const text = wrapper.find('.size-pick-revisions').text()
    expect(text).toBe('免费修改次数不限')
    expect(text).not.toContain('undefined')
    wrapper.unmount()
  })

  it('每张档位卡片各自一条提示（不串味、不共用一份）', () => {
    const wrapper = mountStep([
      { id: 1, name: '半身', base_price: 200, free_revisions: 2 },
      { id: 2, name: '全身', base_price: 400, free_revisions: 0 }
    ])

    const hints = wrapper.findAll('.size-pick-revisions').map(el => el.text())
    expect(hints).toEqual(['含 2 次免费修改', '免费修改次数不限'])
    // 次要信息层级：不得落成告警/危险色语义
    expect(wrapper.findAll('.size-pick-revisions')[0].classes().join(' ')).not.toMatch(/danger|warning|error/)
    wrapper.unmount()
  })
})
