// 820-L 需求二：统计功能管理员未开（默认）→ 直接访问 /stats 给空态，不发统计请求
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getMyTrackingSummary: vi.fn(() => Promise.resolve({ mode: 'on', enabled: true, total: 0, byDay: [], byName: [] })),
  store: {
    profile: { statsEnabled: true } as { statsEnabled: boolean } | null,
    fetchProfile: vi.fn(() => Promise.resolve())
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getMyTrackingSummary: h.getMyTrackingSummary
  }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => h.store
}))

import StatsPage from '../StatsPage.vue'

function mountPage() {
  return mount(StatsPage, {
    global: {
      mocks: { $t: (key: string) => key },
      directives: { loading: () => {} },
      stubs: {
        'el-button': { template: '<button><slot /></button>' }
      }
    }
  })
}

beforeEach(() => {
  h.getMyTrackingSummary.mockClear()
  h.store.profile = { statsEnabled: true }
})

describe('StatsPage 统计功能开关（820-L）', () => {
  it('默认未开（statsEnabled=false）→ 显示空态且不发统计请求', async () => {
    h.store.profile = { statsEnabled: false }

    const wrapper = mountPage()
    await flushPromises()

    expect(h.getMyTrackingSummary).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('stats.featureDisabled')
    expect(wrapper.find('.stats-disabled').exists()).toBe(true)
  })

  it('开启后正常拉取统计', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(h.getMyTrackingSummary).toHaveBeenCalledWith(14)
    expect(wrapper.text()).not.toContain('stats.featureDisabled')
  })

  it('profile 未加载时先补拉再判定（关闭 → 空态）', async () => {
    h.store.profile = null
    h.store.fetchProfile.mockImplementation(() => {
      h.store.profile = { statsEnabled: false }
      return Promise.resolve()
    })

    const wrapper = mountPage()
    await flushPromises()

    expect(h.store.fetchProfile).toHaveBeenCalled()
    expect(h.getMyTrackingSummary).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('stats.featureDisabled')
  })
})
