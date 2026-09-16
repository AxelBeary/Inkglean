// 波2审计 WEB-07：ArtworkLikeButton toggle 后同步 emit `update:liked` + `update:count`
// 原只 emit update:count 且父级不监听 → 翻页/关灯箱后按钮重建时读父级陈旧快照（红心变空心、再点多加一次）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArtworkLikeButton from '../ArtworkLikeButton.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  likeArtwork: vi.fn(),
  unlikeArtwork: vi.fn(),
  storage: new Map<string, string>()
}))

vi.mock('../../../api/index.js', () => ({
  artistPublicApi: {
    likeArtwork: h.likeArtwork,
    unlikeArtwork: h.unlikeArtwork
  }
}))

// 用内存 Map 模拟 localStorage（safeGetItem/safeSetItem 底层）
vi.mock('../../../utils/storage', () => ({
  safeGetItem: (key: string) => h.storage.get(key) ?? null,
  safeSetItem: (key: string, value: string) => { h.storage.set(key, value) },
  safeRemoveItem: (key: string) => { h.storage.delete(key) }
}))

function mountBtn(props: Record<string, unknown> = {}) {
  return mount(ArtworkLikeButton, {
    props: {
      artworkId: 42,
      initialCount: 10,
      liked: false,
      subdomain: 'alice',
      ...props
    },
    global: { mocks: { $t: (key: string) => key } }
  })
}

describe('ArtworkLikeButton WEB-07：toggle 后 emit 双事件', () => {
  beforeEach(() => {
    h.likeArtwork.mockReset()
    h.unlikeArtwork.mockReset()
    h.storage.clear()
  })

  it('未赞→点赞：emit update:liked=true + update:count=后端返回计数', async () => {
    h.likeArtwork.mockResolvedValue({ likeCount: 11 })
    const wrapper = mountBtn({ liked: false, initialCount: 10 })
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(h.likeArtwork).toHaveBeenCalledWith(42)
    const likedEvents = wrapper.emitted('update:liked')
    const countEvents = wrapper.emitted('update:count')
    expect(likedEvents).toBeTruthy()
    expect(likedEvents![0]).toEqual([true])
    expect(countEvents).toBeTruthy()
    expect(countEvents![0]).toEqual([11])
    // localStorage 持久化仍工作（原语义未回归）
    expect(JSON.parse(h.storage.get('huiyue_liked_alice') || '[]')).toContain(42)
  })

  it('已赞→取消：emit update:liked=false + update:count=后端返回计数', async () => {
    h.unlikeArtwork.mockResolvedValue({ likeCount: 9 })
    h.storage.set('huiyue_liked_alice', JSON.stringify([42]))
    const wrapper = mountBtn({ liked: true, initialCount: 10 })
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(h.unlikeArtwork).toHaveBeenCalledWith(42)
    expect(wrapper.emitted('update:liked')![0]).toEqual([false])
    expect(wrapper.emitted('update:count')![0]).toEqual([9])
    expect(JSON.parse(h.storage.get('huiyue_liked_alice') || '[]')).not.toContain(42)
  })

  it('API 失败：静默不 emit（原语义未回归，不误报状态变化）', async () => {
    h.likeArtwork.mockRejectedValue(new Error('network down'))
    const wrapper = mountBtn({ liked: false, initialCount: 10 })
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:liked')).toBeFalsy()
    expect(wrapper.emitted('update:count')).toBeFalsy()
    // 失败不写 localStorage
    expect(h.storage.has('huiyue_liked_alice')).toBe(false)
  })

  it('busy 期间二次点击被守卫（原语义未回归，防重复 emit）', async () => {
    // 用永不 resolve 的 promise 卡住 busy 状态
    let resolveLike: (v: { likeCount: number }) => void = () => {}
    h.likeArtwork.mockImplementation(() => new Promise<{ likeCount: number }>(r => { resolveLike = r }))
    const wrapper = mountBtn({ liked: false, initialCount: 10 })
    await wrapper.get('button').trigger('click') // 第一次点击，进入 busy
    await wrapper.get('button').trigger('click') // 第二次点击应被守卫拦下
    expect(h.likeArtwork).toHaveBeenCalledTimes(1)
    resolveLike({ likeCount: 11 })
    await flushPromises()
    // 只 emit 一次
    expect(wrapper.emitted('update:liked')!.length).toBe(1)
    expect(wrapper.emitted('update:count')!.length).toBe(1)
  })
})
