// P1-B 收敛（813-hunt）：TplShowcase（旧 TplStyleGrid / TplTierGrid 合并）关键断言
// 覆盖：tier 形态（菜单/展示/徽标禁用/addons 透传/跳转）；style 多画风（尺寸选择/下单 query/状态禁用）；
//       单画风退化；菜单切换清空尺寸选择
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TplShowcase from '../TplShowcase.vue'

const h = vi.hoisted(() => ({
  push: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

const ElImageStub = {
  name: 'ElImage',
  props: ['src', 'alt'],
  template: '<img class="el-image-stub" :src="src" :alt="alt" />'
}

function mountShowcase(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(TplShowcase, {
    props,
    slots,
    global: {
      mocks: {
        $t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: () => []
      },
      stubs: { 'el-image': ElImageStub }
    }
  })
}

beforeEach(() => {
  h.push.mockReset()
})

describe('TplShowcase tier 形态（档位柜）', () => {
  const tiers = [
    { id: 1, name: '立绘', price: 300, description: '全身立绘', work_days: 7, visibility: 'available' },
    { id: 2, name: '插图', price: 500, description: '', example_image: 'img/2.png', visibility: 'showcase' }
  ]

  it('左菜单渲染名称/价格；默认展示第一档', () => {
    const wrapper = mountShowcase({ mode: 'tier', tiers, subdomain: 'alice', artist: { status: 'open' } })
    const menuItems = wrapper.findAll('.tpl-tier-menu-item')
    expect(menuItems).toHaveLength(2)
    expect(menuItems[0].text()).toContain('立绘')
    expect(menuItems[0].text()).toContain('¥300')
    expect(wrapper.find('.tpl-tier-display-name').text()).toBe('立绘')
    expect(wrapper.find('.tpl-tier-display-price').text()).toBe('¥300')
    expect(wrapper.find('.tpl-tier-display-desc').text()).toBe('全身立绘')
  })

  it('点击菜单切换展示；showcase 档带徽标且按钮禁用', async () => {
    const wrapper = mountShowcase({ mode: 'tier', tiers, subdomain: 'alice', artist: { status: 'open' } })
    await wrapper.findAll('.tpl-tier-menu-item')[1].trigger('click')
    expect(wrapper.find('.tpl-tier-display-name').text()).toBe('插图')
    expect(wrapper.findAll('.tpl-tier-menu-badge')).toHaveLength(1)
    const btn = wrapper.find('.tpl-tier-select-btn')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    expect(btn.text()).toContain('artistHome.tierShowcaseBtn')
  })

  it('addons 插槽透传当前档位；选择按钮跳转原路径', async () => {
    const wrapper = mountShowcase(
      { mode: 'tier', tiers, subdomain: 'alice', artist: { status: 'open' } },
      { addons: '<span class="addons-stub">{{ tier.name }}</span>' }
    )
    expect(wrapper.find('.addons-stub').text()).toBe('立绘')
    await wrapper.find('.tpl-tier-select-btn').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/artist/alice/order')
  })

  it('画师非 open 时选择按钮禁用', () => {
    const wrapper = mountShowcase({ mode: 'tier', tiers, subdomain: 'alice', artist: { status: 'full' } })
    expect((wrapper.find('.tpl-tier-select-btn').element as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('TplShowcase style 形态（画风柜）', () => {
  const styles = [
    {
      id: 10,
      name: '厚涂',
      cover_image: 'cover/10.png',
      sizes: [
        { id: 101, name: '半身', base_price: 200, work_days: 5, description: '半身彩绘' },
        { id: 102, name: '全身', base_price: 400 }
      ]
    },
    {
      id: 11,
      name: '平涂',
      cover_image: 'cover/11.png',
      sizes: [{ id: 111, name: '头像', base_price: 150 }]
    }
  ]

  it('多画风：菜单起步价标签 + 默认展示 + 尺寸行点选高亮/提示', async () => {
    const wrapper = mountShowcase({ mode: 'style', styles, subdomain: 'alice', artist: { status: 'open' } })
    expect(wrapper.findAll('.tpl-style-menu-item')).toHaveLength(2)
    expect(wrapper.findAll('.tpl-style-menu-price')[0].text()).toBe('¥200+')
    expect(wrapper.find('.tpl-style-display-name').text()).toBe('厚涂')
    expect(wrapper.findAll('.tpl-style-size-row')).toHaveLength(2)

    await wrapper.findAll('.tpl-style-size-row')[0].trigger('click')
    expect(wrapper.findAll('.tpl-style-size-row')[0].classes()).toContain('tpl-style-size-row--active')
    expect(wrapper.find('.tpl-style-order-hint').exists()).toBe(true)
    // 选中带描述尺寸 → 展示尺寸描述
    expect(wrapper.find('.tpl-style-display-desc').text()).toBe('半身彩绘')
  })

  it('菜单切换画风 → 新画风无残留高亮/提示（旧行为等价保留）', async () => {
    const wrapper = mountShowcase({ mode: 'style', styles, subdomain: 'alice', artist: { status: 'open' } })
    await wrapper.findAll('.tpl-style-size-row')[0].trigger('click')
    expect(wrapper.find('.tpl-style-size-row--active').exists()).toBe(true)
    await wrapper.findAll('.tpl-style-menu-item')[1].trigger('click')
    expect(wrapper.find('.tpl-style-display-name').text()).toBe('平涂')
    expect(wrapper.find('.tpl-style-size-row--active').exists()).toBe(false)
    expect(wrapper.find('.tpl-style-order-hint').exists()).toBe(false)
  })

  it('下单跳转带 styleId/sizeId query；画师非 open 时按钮禁用', async () => {
    const wrapper = mountShowcase({ mode: 'style', styles, subdomain: 'alice', artist: { status: 'full' } })
    expect((wrapper.find('.tpl-style-order-btn').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.setProps({ artist: { status: 'open' } })
    await wrapper.findAll('.tpl-style-size-row')[1].trigger('click')
    await wrapper.find('.tpl-style-order-btn').trigger('click')
    expect(h.push).toHaveBeenCalledWith({ path: '/artist/alice/order', query: { styleId: 10, sizeId: 102 } })
  })

  it('单画风退化：无菜单，直出尺寸列表', () => {
    const wrapper = mountShowcase({
      mode: 'style',
      styles: [styles[0]],
      subdomain: 'alice',
      artist: { status: 'open' }
    })
    expect(wrapper.find('.tpl-style-single').exists()).toBe(true)
    expect(wrapper.find('.tpl-style-menu').exists()).toBe(false)
    expect(wrapper.findAll('.tpl-style-size-row')).toHaveLength(2)
  })

  it('展示态（showcase）尺寸不可选中：不高亮、无提示、下单 query 不含该尺寸', async () => {
    const showcaseStyles = [
      {
        id: 20,
        name: '厚涂',
        sizes: [
          { id: 201, name: '半身', base_price: 200, display_status: 'showcase' },
          { id: 202, name: '全身', base_price: 400 }
        ]
      }
    ]
    const wrapper = mountShowcase({ mode: 'style', styles: showcaseStyles, subdomain: 'alice', artist: { status: 'open' } })

    await wrapper.findAll('.tpl-style-size-row')[0].trigger('click')
    expect(wrapper.find('.tpl-style-size-row--active').exists()).toBe(false)
    expect(wrapper.find('.tpl-style-order-hint').exists()).toBe(false)

    // 正常尺寸仍可选并携带进下单 query
    await wrapper.findAll('.tpl-style-size-row')[1].trigger('click')
    expect(wrapper.find('.tpl-style-size-row--active').exists()).toBe(true)
    await wrapper.find('.tpl-style-order-btn').trigger('click')
    expect(h.push).toHaveBeenCalledWith({ path: '/artist/alice/order', query: { styleId: 20, sizeId: 202 } })
  })
})
