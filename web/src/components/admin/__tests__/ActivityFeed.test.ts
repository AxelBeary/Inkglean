// v86 事件流水幕布（步 2）单测
// 覆盖任务书要求：轮询（可暂停 / 零残留定时器 / 可见性暂停）、失败明示状态（不静默空屏）、
// 按事件类型着色、筛选、中英 i18n 成对。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import ActivityFeed from '../ActivityFeed.vue'
import { useActivityFeed, ACTIVITY_POLL_MS } from '../useActivityFeed'

const hoisted = vi.hoisted(() => ({
  getActivityEvents: vi.fn(),
  getActivityFilters: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  activityApi: {
    getActivityEvents: hoisted.getActivityEvents,
    getActivityFilters: hoisted.getActivityFilters
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params?.time ? `${key}:${params.time}` : key) })
}))

vi.mock('../../../utils/datetime.js', () => ({
  formatDateTime: (iso: string) => `FMT(${iso})`
}))

/** EP stub：只保留本组件用到的四个 */
const EP_STUBS = {
  'el-select': {
    name: 'ElSelectStub',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue', 'change'],
    template: '<div class="select-stub" :data-placeholder="placeholder"><slot /></div>'
  },
  'el-option': { props: ['value', 'label'], template: '<div :data-option="value">{{ label }}</div>' },
  'el-button': {
    name: 'ElButtonStub',
    emits: ['click'],
    template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-empty': { name: 'ElEmpty', props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' }
}

const mounted: ReturnType<typeof mount>[] = []

function mountFeed() {
  const w = mount(ActivityFeed, { global: { stubs: EP_STUBS } })
  mounted.push(w)
  return w
}

/** 造一条流水行 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    at: Date.parse('2026-11-28T01:00:00.000Z'),
    actorKind: 'admin' as const,
    actorId: 7,
    ip: '203.0.113.10',
    action: 'artist_ban',
    targetType: 'artist',
    targetId: 42,
    outcome: 'ok' as const,
    meta: { reason: '违规' },
    ...overrides
  }
}

describe('事件流水幕布 ActivityFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hoisted.getActivityEvents.mockReset()
    hoisted.getActivityFilters.mockReset()
    hoisted.getActivityFilters.mockResolvedValue({
      actorKinds: ['admin', 'artist', 'client', 'anon'],
      actions: ['login_success', 'login_fail', 'stepup_fail', 'order_create', 'report_submit']
    })
    hoisted.getActivityEvents.mockResolvedValue({ rows: [row()], nextBeforeId: null, hasMore: false })
  })

  afterEach(() => {
    for (const w of mounted.splice(0)) w.unmount()
    vi.useRealTimers()
  })

  it('TC-AF-01: 挂载即拉一次，渲染行（事件/主体/对象/来源 IP 全部可见）', async () => {
    const w = mountFeed()
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(1)
    const html = w.html()
    expect(html).toContain('203.0.113.10')       // 来源 IP 可见（管理员面）
    // actionLabel 的语义：i18n 命中就显示译名，查不到回退原始 action 名。
    // 本文件 mock 的 t 恒返回 key（=查不到），故这里断言回退路径为原名而非 key。
    expect(html).toContain('artist_ban')
    expect(html).not.toContain('admin.activity.action.artist_ban')
    expect(html).toContain('#7')                  // 主体 id
    expect(html).toContain('FMT(')                // 时间经 formatDateTime
    expect(w.find('[data-testid="afeed-live"]').exists()).toBe(true)
  })

  it('TC-AF-02: 轮询——5 秒一次，interval 间隔等于 ACTIVITY_POLL_MS', async () => {
    expect(ACTIVITY_POLL_MS).toBe(5000)
    mountFeed()
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(ACTIVITY_POLL_MS)
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(2)

    // 逐步推进（每步 flush 让上一次请求落地）：in-flight 保护下，同一 tick 内的
    // 多个 interval 只会发一次请求——这是防慢响应堆叠的设计，不是丢 tick
    for (let i = 0; i < 2; i++) {
      vi.advanceTimersByTime(ACTIVITY_POLL_MS)
      await flushPromises()
    }
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(4)
  })

  it('TC-AF-03: 可暂停——暂停后不再轮询，恢复后立刻刷新一次并继续', async () => {
    const w = mountFeed()
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(1)

    await w.find('[data-testid="afeed-pause"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="afeed-paused"]').exists()).toBe(true)

    const afterPause = hoisted.getActivityEvents.mock.calls.length
    vi.advanceTimersByTime(ACTIVITY_POLL_MS * 3)
    await flushPromises()
    // 暂停期间零请求（不是"请求了但不更新"）
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(afterPause)

    await w.find('[data-testid="afeed-pause"]').trigger('click')
    await flushPromises()
    // 恢复立即刷新一次
    expect(hoisted.getActivityEvents.mock.calls.length).toBe(afterPause + 1)
    vi.advanceTimersByTime(ACTIVITY_POLL_MS)
    await flushPromises()
    expect(hoisted.getActivityEvents.mock.calls.length).toBe(afterPause + 2)
  })

  it('TC-AF-04: 零残留定时器——卸载后推进时间不再发请求', async () => {
    const w = mountFeed()
    await flushPromises()
    const before = hoisted.getActivityEvents.mock.calls.length
    w.unmount()
    mounted.splice(mounted.indexOf(w), 1)
    vi.advanceTimersByTime(ACTIVITY_POLL_MS * 10)
    await flushPromises()
    // 全仓先例断言范式（ArtistLayout.split.test.ts:268）：卸载后零残留
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(before)
  })

  it('TC-AF-05: 首次失败 → 全屏错误态（不是空态），带重试按钮', async () => {
    hoisted.getActivityEvents.mockRejectedValue(new Error('boom'))
    const w = mountFeed()
    await flushPromises()
    expect(w.find('[data-testid="afeed-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="afeed-retry"]').exists()).toBe(true)
    // 硬要求：失败不能表现为"没有事件"
    expect(w.find('[data-testid="afeed-empty"]').exists()).toBe(false)
  })

  it('TC-AF-06: 已加载后轮询失败 → stale（保留旧数据 + 明示过期时间），不静默', async () => {
    const w = mountFeed()
    await flushPromises()
    expect(w.find('[data-testid="afeed-live"]').exists()).toBe(true)

    hoisted.getActivityEvents.mockRejectedValueOnce(new Error('network'))
    vi.advanceTimersByTime(ACTIVITY_POLL_MS)
    await flushPromises()

    expect(w.find('[data-testid="afeed-stale"]').exists()).toBe(true)
    // 旧数据仍在（不闪空白），但顶部明示过期
    expect(w.html()).toContain('203.0.113.10')
    expect(w.find('[data-testid="afeed-stale"]').text()).toContain('admin.activity.stale')
  })

  it('TC-AF-07: 重试按钮——错误态点重试后回到 live 并渲染数据', async () => {
    hoisted.getActivityEvents.mockRejectedValueOnce(new Error('boom'))
    const w = mountFeed()
    await flushPromises()
    expect(w.find('[data-testid="afeed-error"]').exists()).toBe(true)

    hoisted.getActivityEvents.mockResolvedValue({ rows: [row()], nextBeforeId: null, hasMore: false })
    await w.find('[data-testid="afeed-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="afeed-error"]').exists()).toBe(false)
    expect(w.find('[data-testid="afeed-live"]').exists()).toBe(true)
  })

  it('TC-AF-08: 按事件类型着色——auth/admin/trade 三类不同 class，fail 优先', async () => {
    hoisted.getActivityEvents.mockResolvedValue({
      rows: [
        row({ id: 1, action: 'login_success', outcome: 'ok' }),
        row({ id: 2, action: 'artist_ban', outcome: 'ok' }),
        row({ id: 3, action: 'order_create', outcome: 'ok' }),
        row({ id: 4, action: 'login_fail', outcome: 'fail' })
      ],
      nextBeforeId: null,
      hasMore: false
    })
    const w = mountFeed()
    await flushPromises()
    const html = w.html()
    expect(html).toContain('afeed-row--auth')
    expect(html).toContain('afeed-row--admin')
    expect(html).toContain('afeed-row--trade')
    // fail 优先于类型色（login_fail 属 auth，但必须落 fail 色）
    expect(w.find('[data-testid="afeed-row-login_fail"]').classes()).toContain('afeed-row--fail')
  })

  it('TC-AF-09: 筛选——action / actor 变更带上参数重拉，并清空游标', async () => {
    hoisted.getActivityEvents.mockResolvedValue({ rows: [row()], nextBeforeId: 1, hasMore: true })
    const w = mountFeed()
    await flushPromises()
    hoisted.getActivityEvents.mockClear()

    const selects = w.findAllComponents({ name: 'ElSelectStub' })
    await selects[0].vm.$emit('change', 'login_success')
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'login_success', limit: 100 })
    )
    // 清空游标：筛选变更后的请求不带 beforeId
    expect(hoisted.getActivityEvents.mock.calls.at(-1)![0]).not.toHaveProperty('beforeId')

    await selects[1].vm.$emit('change', 'admin')
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'login_success', actorKind: 'admin' })
    )
  })

  it('TC-AF-10: 加载更早——hasMore 时按钮可用，带 beforeId 追加而非替换', async () => {
    hoisted.getActivityEvents.mockResolvedValueOnce({ rows: [row({ id: 5 })], nextBeforeId: 5, hasMore: true })
    const w = mountFeed()
    await flushPromises()
    const more = w.find('[data-testid="afeed-load-more"]')
    expect(more.exists()).toBe(true)

    hoisted.getActivityEvents.mockResolvedValueOnce({ rows: [row({ id: 3, action: 'login_success' })], nextBeforeId: null, hasMore: false })
    await more.trigger('click')
    await flushPromises()

    expect(hoisted.getActivityEvents).toHaveBeenLastCalledWith(expect.objectContaining({ beforeId: 5 }))
    // 追加而非替换：两条都在
    expect(w.findAll('[data-testid^="afeed-row-"]')).toHaveLength(2)
  })

  it('TC-AF-11: 空态——确实没有事件时显示空态文案（与错误态区分）', async () => {
    hoisted.getActivityEvents.mockResolvedValue({ rows: [], nextBeforeId: null, hasMore: false })
    const w = mountFeed()
    await flushPromises()
    expect(w.find('[data-testid="afeed-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="afeed-error"]').exists()).toBe(false)
    expect(w.find('[data-testid="afeed-live"]').exists()).toBe(true)
  })

  it('TC-AF-12: 筛选枚举拉失败不阻塞主功能（下拉退化，流水照常显示）', async () => {
    hoisted.getActivityFilters.mockRejectedValue(new Error('enum down'))
    const w = mountFeed()
    await flushPromises()
    expect(w.html()).toContain('203.0.113.10')
    expect(w.find('[data-testid="afeed-error"]').exists()).toBe(false)
  })

  it('TC-AF-13: 页面隐藏暂停轮询、回到前台立即刷新（visibilitychange）', async () => {
    const w = mountFeed()
    await flushPromises()
    const before = hoisted.getActivityEvents.mock.calls.length

    // 隐藏
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    vi.advanceTimersByTime(ACTIVITY_POLL_MS * 2)
    await flushPromises()
    expect(hoisted.getActivityEvents).toHaveBeenCalledTimes(before)

    // 恢复可见
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(hoisted.getActivityEvents.mock.calls.length).toBe(before + 1)
    void w
  })

  it('TC-AF-14: 组合式函数直接调用——卸载后 __hasTimer() 为 false（定时器句柄被清）', async () => {
    // 用一个最小宿主组件包住 composable，断言句柄本身，不只断言"没再发请求"
    let api: ReturnType<typeof useActivityFeed> | null = null
    const Host = defineComponent({
      setup() {
        api = useActivityFeed()
        return () => h('div')
      }
    })
    const w = mount(Host)
    await flushPromises()
    expect(api!.__hasTimer()).toBe(true)
    w.unmount()
    await nextTick()
    expect(api!.__hasTimer()).toBe(false)
  })
})
