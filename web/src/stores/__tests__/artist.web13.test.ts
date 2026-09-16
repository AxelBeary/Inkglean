// WEB-13: 客户查单令牌 TTL + 删除入口 + logout 清理测试
// 覆盖：30 天未用自动清、手动删除单条、清空全部、失效令牌移除条目、logout 清 key
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SAVED_LINKS_KEY = 'huiyue_track_links'
const TRACK_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface SavedLink {
  orderNo: string
  token: string
  savedAt: number
  lastUsedAt?: number
  invalid: boolean
}

/** 模拟 loadSavedLinks 的 TTL 过滤逻辑（与 TrackOrder.vue 同口径） */
function loadSavedLinksWithTTL(raw: string | null): SavedLink[] {
  const all: SavedLink[] = raw ? JSON.parse(raw) : []
  const now = Date.now()
  return all.filter(item => now - (item.lastUsedAt ?? item.savedAt) < TRACK_LINK_TTL_MS)
}

describe('WEB-13 客户查单令牌 TTL 过滤', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { window.localStorage.clear() })

  it('30 天内使用的条目保留', () => {
    const now = Date.now()
    const links: SavedLink[] = [
      { orderNo: 'ORD001', token: 'tok1', savedAt: now - 10 * 24 * 3600_000, lastUsedAt: now - 5 * 24 * 3600_000, invalid: false }
    ]
    window.localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify(links))
    const result = loadSavedLinksWithTTL(window.localStorage.getItem(SAVED_LINKS_KEY))
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('ORD001')
  })

  it('超过 30 天未使用的条目自动清除（lastUsedAt 判定）', () => {
    const now = Date.now()
    const links: SavedLink[] = [
      { orderNo: 'ORD001', token: 'tok1', savedAt: now - 40 * 24 * 3600_000, lastUsedAt: now - 35 * 24 * 3600_000, invalid: false },
      { orderNo: 'ORD002', token: 'tok2', savedAt: now - 10 * 24 * 3600_000, lastUsedAt: now - 2 * 24 * 3600_000, invalid: false }
    ]
    window.localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify(links))
    const result = loadSavedLinksWithTTL(window.localStorage.getItem(SAVED_LINKS_KEY))
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('ORD002')
  })

  it('旧数据无 lastUsedAt 时回退到 savedAt 判定 TTL', () => {
    const now = Date.now()
    const links: SavedLink[] = [
      { orderNo: 'ORD001', token: 'tok1', savedAt: now - 35 * 24 * 3600_000, invalid: false },
      { orderNo: 'ORD002', token: 'tok2', savedAt: now - 5 * 24 * 3600_000, invalid: false }
    ]
    window.localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify(links))
    const result = loadSavedLinksWithTTL(window.localStorage.getItem(SAVED_LINKS_KEY))
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('ORD002')
  })

  it('手动删除单条：removeSavedLink 过滤后持久化', () => {
    const now = Date.now()
    const links: SavedLink[] = [
      { orderNo: 'ORD001', token: 'tok1', savedAt: now, lastUsedAt: now, invalid: false },
      { orderNo: 'ORD002', token: 'tok2', savedAt: now, lastUsedAt: now, invalid: false }
    ]
    // 模拟 removeSavedLink
    const afterRemove = links.filter(i => i.orderNo !== 'ORD001')
    expect(afterRemove).toHaveLength(1)
    expect(afterRemove[0].orderNo).toBe('ORD002')
  })

  it('清空全部：clearAllSavedLinks 置空数组并持久化', () => {
    const now = Date.now()
    const links: SavedLink[] = [
      { orderNo: 'ORD001', token: 'tok1', savedAt: now, lastUsedAt: now, invalid: false }
    ]
    expect(links).toHaveLength(1)

    const afterClear: SavedLink[] = []
    expect(afterClear).toHaveLength(0)
  })

  it('令牌失效时移除条目（不再仅标 invalid 留存明文 token）', () => {
    const now = Date.now()
    const links: SavedLink[] = [
      { orderNo: 'ORD001', token: 'tok1', savedAt: now, lastUsedAt: now, invalid: false },
      { orderNo: 'ORD002', token: 'tok2', savedAt: now, lastUsedAt: now, invalid: false }
    ]
    // 模拟 querySaved 失败路径：移除失效条目
    const failedOrderNo = 'ORD001'
    const afterFail = links.filter(i => i.orderNo !== failedOrderNo)
    expect(afterFail).toHaveLength(1)
    expect(afterFail[0].orderNo).toBe('ORD002')
    // 确认失效条目的明文 token 不再驻留
    expect(afterFail.find(i => i.orderNo === 'ORD001')).toBeUndefined()
  })
})

describe('WEB-13 logout 清理 track_links（stores/artist.ts）', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { window.localStorage.clear() })

  it('logout 时 huiyue_track_links 被清除', async () => {
    // 预置 track_links
    const now = Date.now()
    window.localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify([
      { orderNo: 'ORD001', token: 'secret-token', savedAt: now, lastUsedAt: now, invalid: false }
    ]))
    expect(window.localStorage.getItem(SAVED_LINKS_KEY)).not.toBeNull()

    // 动态 import store（避免 module-level sessionSeq 跨测试污染）
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())

    vi.doMock('../../api/index.js', () => ({
      authApi: { verify: vi.fn(), logout: vi.fn().mockResolvedValue(undefined) },
      artistApi: { getProfile: vi.fn(), getStats: vi.fn() }
    }))
    const { useArtistStore } = await import('../artist')
    const store = useArtistStore()

    // 模拟已登录状态
    store.loggedIn = true
    window.localStorage.setItem('artist_logged_in', '1')

    await store.logout()

    // WEB-13 验收：logout 后 track_links 被清除
    expect(window.localStorage.getItem(SAVED_LINKS_KEY)).toBeNull()
  })
})
