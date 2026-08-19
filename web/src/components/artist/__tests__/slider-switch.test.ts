// SliderSwitch 滑块式切换器组件测试（05B 后台视觉交互批）
// 覆盖：radiogroup 渲染/aria、点击切换、键盘左右、拖动选最近项、--sw-index 随选中变化
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SliderSwitch from '../SliderSwitch.vue'

const opts = [
  { value: 'board', label: '看板' },
  { value: 'calendar', label: '月历' },
  { value: 'timeline', label: '时间条' }
]

// happy-dom 的 getBoundingClientRect 全 0 → indexFromX 恒为 0；mock 出合理轨道几何（宽 300，三态每项 98px）
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const cls = this.classList || { contains: () => false }
    const w = cls.contains('sw-track') ? 300 : 100
    return { left: 0, width: w, right: w, top: 0, bottom: 36, height: 36, x: 0, y: 0, toJSON: () => ({}) }
  }
})

function mountSwitch(extraProps: Record<string, unknown> = {}) {
  return mount(SliderSwitch, {
    props: { modelValue: 'board', options: opts, ...extraProps },
    global: { stubs: { 'el-icon': { template: '<i><slot /></i>' } } }
  })
}

// clientX → 三态下标（innerW = 300-6 = 294，per = 98，left=3px 修正）
const X_FIRST = 50   // index 0
const X_SECOND = 150 // index 1
const X_THIRD = 250  // index 2

describe('SliderSwitch', () => {
  it('渲染：N 个 radio 项，aria-checked 只标记选中项，--sw-index/--sw-count 正确', () => {
    const wrapper = mountSwitch()
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios).toHaveLength(3)
    expect(radios[0].attributes('aria-checked')).toBe('true')
    expect(radios[1].attributes('aria-checked')).toBe('false')
    expect(radios[2].attributes('aria-checked')).toBe('false')
    const style = wrapper.find('.sw-track').attributes('style')
    expect(style).toContain('--sw-count: 3')
    expect(style).toContain('--sw-index: 0')
  })

  it('点击切换：pointerdown/up 后 emit update:modelValue + change；点当前项不重复 emit', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    await track.trigger('pointerdown', { clientX: X_THIRD, pointerId: 1 })
    await track.trigger('pointerup', { clientX: X_THIRD, pointerId: 1 })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['timeline'])
    expect(wrapper.emitted('change')![0]).toEqual(['timeline'])
    // 再点当前选中项（index 0）→ 不重复 emit
    await track.trigger('pointerdown', { clientX: X_FIRST, pointerId: 1 })
    await track.trigger('pointerup', { clientX: X_FIRST, pointerId: 1 })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('键盘：ArrowRight 选下一项，ArrowLeft 回上一项，首项 ArrowLeft 不动', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    // 受控组件：每次按键后 setProps 模拟父级 v-model 更新
    await track.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['calendar'])
    await wrapper.setProps({ modelValue: 'calendar' })
    await track.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')![1]).toEqual(['timeline'])
    await wrapper.setProps({ modelValue: 'timeline' })
    // 末项 ArrowRight 不动
    await track.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
    await wrapper.setProps({ modelValue: 'calendar' })
    await track.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')![2]).toEqual(['board'])
  })

  it('拖动：超过 4px 阈值视为拖，pointermove 实时更新 --sw-index，pointerup 选中最近项', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    await track.trigger('pointerdown', { clientX: X_FIRST, pointerId: 1 })
    // 移动 200px（远超阈值）→ 拖到 index 2
    await track.trigger('pointermove', { clientX: X_THIRD, pointerId: 1 })
    expect(track.attributes('style')).toContain('--sw-index: 2')
    await track.trigger('pointerup', { clientX: X_THIRD, pointerId: 1 })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['timeline'])
  })

  it('B8 悬停：未按下时 pointermove 不改变显示与值', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    // 无 pointerdown，直接划过轨道（旧缺陷：pointerStartX=0 越过 4px 阈值进入拖动态）
    await track.trigger('pointermove', { clientX: X_THIRD, pointerId: 1 })
    expect(track.attributes('style')).toContain('--sw-index: 0')
    expect(track.classes()).not.toContain('sw-track--dragging')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('B8 拖动：pointerdown + move + up 正常切换', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    await track.trigger('pointerdown', { clientX: X_FIRST, pointerId: 1 })
    await track.trigger('pointermove', { clientX: X_SECOND, pointerId: 1 })
    expect(track.attributes('style')).toContain('--sw-index: 1')
    await track.trigger('pointerup', { clientX: X_SECOND, pointerId: 1 })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['calendar'])
    expect(wrapper.emitted('change')![0]).toEqual(['calendar'])
  })

  it('B8 纯点击：切换后悬停移动不回退', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    await track.trigger('pointerdown', { clientX: X_SECOND, pointerId: 1 })
    await track.trigger('pointerup', { clientX: X_SECOND, pointerId: 1 })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['calendar'])
    // 松手后（未再次按下）划过轨道，视觉不得跳到 index 2（父级未同步时仍显示 board）
    await track.trigger('pointermove', { clientX: X_THIRD, pointerId: 1 })
    expect(track.attributes('style')).toContain('--sw-index: 0')
    expect(track.classes()).not.toContain('sw-track--dragging')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('轻移阈值：4px 以内不算拖动，pointerup 按落点处理', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    await track.trigger('pointerdown', { clientX: X_FIRST, pointerId: 1 })
    // 只移 3px（≤4）→ 不进入拖动态，--sw-index 保持 0
    await track.trigger('pointermove', { clientX: X_FIRST + 3, pointerId: 1 })
    expect(track.attributes('style')).toContain('--sw-index: 0')
    await track.trigger('pointerup', { clientX: X_FIRST + 3, pointerId: 1 })
    // 落点仍在 index 0（当前项）→ 不 emit
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('拖动中滑块实时跟随：--sw-index 先到中间位置再落定', async () => {
    const wrapper = mountSwitch()
    const track = wrapper.find('.sw-track')
    await track.trigger('pointerdown', { clientX: X_FIRST, pointerId: 1 })
    await track.trigger('pointermove', { clientX: X_SECOND, pointerId: 1 })
    expect(track.attributes('style')).toContain('--sw-index: 1')
    expect(track.classes()).toContain('sw-track--dragging')
    await track.trigger('pointerup', { clientX: X_SECOND, pointerId: 1 })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['calendar'])
  })
})
