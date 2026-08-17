// P1-B 收敛（813-hunt）：TplGuestbook 主题变体关键断言
// 覆盖：4 主题根类（card/plaque/inline/note）；默认无主题类；表单/列表语义结构保留
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TplGuestbook from '../TplGuestbook.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('../../../api/index.js', () => ({
  artistPublicApi: {
    getMessages: vi.fn(() => Promise.resolve({ messages: [], total: 0, page: 1, pageSize: 20 })),
    postMessage: vi.fn(() => Promise.resolve({ id: 1 }))
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

const THEMES = [
  ['card', 'tpl-guestbook--card'],
  ['plaque', 'tpl-guestbook--plaque'],
  ['inline', 'tpl-guestbook--inline'],
  ['note', 'tpl-guestbook--note']
]

function mountGuestbook(props = {}) {
  return mount(TplGuestbook, {
    props: { subdomain: 'alice', ...props },
    global: {
      mocks: {
        $t: (key) => key,
        $tm: () => []
      }
    }
  })
}

describe('TplGuestbook 主题变体', () => {
  it.each(THEMES)('theme="%s" → 根类 %s', async (theme, expectedClass) => {
    const wrapper = mountGuestbook({ theme })
    await flushPromises()
    expect(wrapper.get('.tpl-guestbook').classes()).toContain(expectedClass)
  })

  it('未传 theme → 无主题装饰类（旧硬约束默认）', async () => {
    const wrapper = mountGuestbook()
    await flushPromises()
    const classes = wrapper.get('.tpl-guestbook').classes()
    expect(classes.some((c) => c.startsWith('tpl-guestbook--'))).toBe(false)
  })

  it('语义结构保留：表单（input/textarea/submit）+ 空态', async () => {
    const wrapper = mountGuestbook({ theme: 'card' })
    await flushPromises()
    expect(wrapper.find('.gb-form').exists()).toBe(true)
    expect(wrapper.find('input.gb-input').exists()).toBe(true)
    expect(wrapper.find('textarea.gb-textarea').exists()).toBe(true)
    expect(wrapper.find('.gb-submit').exists()).toBe(true)
    expect(wrapper.find('.gb-empty').exists()).toBe(true)
  })

  it('820-L：enabled=false 时整个板块不渲染（客户端隐藏留言）', async () => {
    const wrapper = mountGuestbook({ enabled: false })
    await flushPromises()
    expect(wrapper.find('.tpl-guestbook').exists()).toBe(false)
    expect(wrapper.find('.gb-form').exists()).toBe(false)
  })
})
