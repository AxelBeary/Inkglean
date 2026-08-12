import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ShopVisibilitySwitch from '../ShopVisibilitySwitch.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const ElSwitchStub = {
  name: 'ElSwitch',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: `
    <button
      type="button"
      class="switch-stub"
      :disabled="disabled"
      @click="$emit('update:modelValue', !modelValue)"
    >switch</button>
  `
}

function mountSwitch(visible: boolean, disabled = false) {
  return mount(ShopVisibilitySwitch, {
    props: { visible, disabled },
    global: {
      stubs: {
        'el-switch': ElSwitchStub
      }
    }
  })
}

describe('ShopVisibilitySwitch 小店展示开关（812-B B2+B3）', () => {
  it('展示中（visible=true）时点击 → 发出 update:visible=false（隐藏）', async () => {
    const wrapper = mountSwitch(true)
    await wrapper.get('.switch-stub').trigger('click')
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })

  it('已隐藏（visible=false）时点击 → 发出 update:visible=true（重新展示）', async () => {
    const wrapper = mountSwitch(false)
    await wrapper.get('.switch-stub').trigger('click')
    expect(wrapper.emitted('update:visible')).toEqual([[true]])
  })

  it('隐藏态显示当前隐藏提示', () => {
    const wrapper = mountSwitch(false)
    expect(wrapper.text()).toContain('settings.shopHiddenNotice')
  })

  it('展示态不显示隐藏提示', () => {
    const wrapper = mountSwitch(true)
    expect(wrapper.text()).not.toContain('settings.shopHiddenNotice')
  })

  it('disabled 时点击不发出变更', async () => {
    const wrapper = mountSwitch(true, true)
    const button = wrapper.get('.switch-stub')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted('update:visible')).toBeUndefined()
  })
})
