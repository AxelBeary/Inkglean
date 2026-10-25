// issue 51-5：「挑作品」弹窗可达性测试（ArtworkPickerModal）
// 覆盖：dialog 语义三件（role/aria-modal/aria-label + tabindex）、开弹窗聚焦首项、
// Escape 关闭、Tab 焦点陷阱（首尾循环）、关弹窗焦点归还触发元素、遮罩空白/确定钮关闭。
// 焦点断言口径：attachTo document.body 后走真实 element.focus() + document.activeElement。
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtworkPickerModal from '../components/pricecard/ArtworkPickerModal.vue'
import type { PriceCardArtwork } from '../components/pricecard/types'

const t = (key: string) => key
const artworks: PriceCardArtwork[] = [1, 2, 3].map(id => ({ id, title: `作品${id}`, src: `https://cdn.test/a${id}.png` }))

function mountModal(props: Record<string, unknown> = {}) {
  return mount(ArtworkPickerModal, {
    props: { t, artworks, loading: false, pickedIds: new Set<number>(), ...props },
    attachTo: document.body
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ArtworkPickerModal 可达性（issue 51-5）', () => {
  it('dialog 语义：role=dialog + aria-modal=true + aria-label + tabindex=-1', () => {
    const wrapper = mountModal()
    const dialog = wrapper.find('.pc-modal')
    expect(dialog.attributes('role')).toBe('dialog')
    // aria-modal 走 attribute 断言（非 DOM 布尔 property，无 inert/aria-hidden 双路径坑）
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-label')).toBe('priceCard.pickTitle')
    expect(dialog.attributes('tabindex')).toBe('-1')
    wrapper.unmount()
  })

  it('打开时焦点落到弹窗内首个可聚焦元素（第一张作品钮）', () => {
    const wrapper = mountModal()
    const first = wrapper.findAll('.pc-picker-item')[0].element as HTMLElement
    expect(document.activeElement).toBe(first)
    wrapper.unmount()
  })

  it('加载态无可聚焦作品项时，首个可聚焦元素回落确定钮', () => {
    const wrapper = mountModal({ loading: true, artworks: [] })
    const confirm = wrapper.find('.pc-modal-foot .pc-btn').element as HTMLElement
    expect(document.activeElement).toBe(confirm)
    wrapper.unmount()
  })

  it('Escape 关闭：emit close', async () => {
    const wrapper = mountModal()
    await wrapper.find('.pc-modal').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('Tab 焦点陷阱：末项 Tab 回首项、首项 Shift+Tab 回末项', async () => {
    const wrapper = mountModal()
    const dialog = wrapper.find('.pc-modal')
    const items = wrapper.findAll('.pc-picker-item')
    const first = items[0].element as HTMLElement
    const last = wrapper.find('.pc-modal-foot .pc-btn').element as HTMLElement

    // 末项（确定钮）Tab → 循环回首项
    last.focus()
    expect(document.activeElement).toBe(last)
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    // 首项 Shift+Tab → 循环回末项
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('中间项 Tab 不劫持（浏览器默认前进，不 preventDefault 不移焦）', async () => {
    const wrapper = mountModal()
    const dialog = wrapper.find('.pc-modal')
    const items = wrapper.findAll('.pc-picker-item')
    const mid = items[1].element as HTMLElement
    mid.focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(mid)
    wrapper.unmount()
  })

  it('关闭（卸载）时焦点归还打开前的触发元素', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const wrapper = mountModal()
    // 焦点已进弹窗
    expect(document.activeElement).not.toBe(trigger)
    wrapper.unmount()
    expect(document.activeElement).toBe(trigger)
  })

  it('触发元素已不在文档中时卸载不抛错（防宿主先卸载触发钮）', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mountModal()
    trigger.remove()
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('勾选/关闭事件契约：picker 项 click 发 toggle、确定钮与遮罩空白发 close', async () => {
    const wrapper = mountModal({ pickedIds: new Set([2]) })
    // 已勾选态描边
    expect(wrapper.findAll('.pc-picker-item')[1].classes()).toContain('pc-picker-item--on')

    await wrapper.findAll('.pc-picker-item')[0].trigger('click')
    const evts = wrapper.emitted('toggle')
    expect(evts).toHaveLength(1)
    expect(evts![0][0]).toEqual(artworks[0])

    await wrapper.find('.pc-modal-foot .pc-btn').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    // 遮罩空白（click.self）关闭
    await wrapper.find('.pc-modal-mask').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })
})
