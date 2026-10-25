// 订单写路径乐观锁回归：
// 截稿日/开工日/取消订单都必须带当前 version（缺失时服务端按当前版本无条件覆盖，双开标签页会静默丢改动）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h as vh, ref } from 'vue'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  updateDeadline: vi.fn(),
  updateStartDate: vi.fn(),
  cancelOrder: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
}))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    updateDeadline: h.updateDeadline,
    updateStartDate: h.updateStartDate,
    cancelOrder: h.cancelOrder
  }
}))

vi.mock('../../utils/track.js', () => ({ trackEvent: vi.fn() }))

// 滑块只做最小实现：把 onConfirm 原样交回，测试直接调 confirmCancelOrder
vi.mock('../useSlideConfirm.js', () => ({
  useSlideConfirm: ({ onConfirm }: { onConfirm: () => unknown }) => ({
    active: ref(false),
    progress: ref(0),
    open: vi.fn(),
    close: vi.fn(),
    onStart: vi.fn(),
    onMove: vi.fn(),
    onEnd: async () => { await onConfirm() }
  })
}))

import { useOrderDeadline } from '../useOrderDeadline'
import { useOrderActions } from '../useOrderActions'

const ORDER = {
  id: 1,
  version: 7,
  deadline: null,
  start_date: null,
  priority: 'medium',
  status: 'wip'
} as unknown as Record<string, unknown>

/** 在真实组件上下文里跑 composable（useI18n/useRouter 需要 app 实例） */
function runComposable<T>(factory: () => T): T {
  let api!: T
  mount(defineComponent({
    setup() {
      api = factory()
      return () => vh('div')
    }
  }))
  return api
}

function runDeadline(order: ReturnType<typeof ref>) {
  return runComposable(() => useOrderDeadline({
    order: order as never,
    routeId: 1,
    applyOrder: vi.fn()
  }))
}

function runActions(order: ReturnType<typeof ref>) {
  return runComposable(() => useOrderActions({
    order: order as never,
    routeId: 1,
    statusAction: ref(''),
    prevPriority: ref(null),
    loadOrder: async () => {},
    applyOrder: vi.fn()
  }))
}

beforeEach(() => {
  h.updateDeadline.mockReset().mockResolvedValue({ ...ORDER })
  h.updateStartDate.mockReset().mockResolvedValue({ ...ORDER })
  h.cancelOrder.mockReset().mockResolvedValue({ ...ORDER, undoWindowMs: 5000 })
  h.push.mockReset()
})

describe('订单写路径带乐观锁 version', () => {
  it('改截稿日带 version', async () => {
    const api = runDeadline(ref({ ...ORDER }))
    await api.changeDeadline('2026-11-01')
    expect(h.updateDeadline).toHaveBeenCalledWith(1, '2026-11-01', { version: 7 })
  })

  it('改开工日带 version', async () => {
    const api = runDeadline(ref({ ...ORDER }))
    await api.changeStartDate('2026-10-30')
    expect(h.updateStartDate).toHaveBeenCalledWith(1, '2026-10-30', { version: 7 })
  })

  it('取消订单带 version（含已收款二次确认路径）', async () => {
    const api = runActions(ref({ ...ORDER }))
    await api.confirmCancelOrder()
    expect(h.cancelOrder).toHaveBeenCalledWith(1, { version: 7 })
  })

  it('快照缺 version 时不伪造（沿用服务端当前版本）', async () => {
    const api = runActions(ref({ ...ORDER, version: undefined }))
    await api.confirmCancelOrder()
    expect(h.cancelOrder).toHaveBeenCalledWith(1, {})
  })
})
