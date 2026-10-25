// 订单写路径乐观锁回归：
// 截稿日/开工日/取消订单都必须带当前 version（缺失时服务端按当前版本无条件覆盖，双开标签页会静默丢改动）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h as vh, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'

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

function runDeadline(order: ReturnType<typeof ref>, onConflict?: () => void) {
  return runComposable(() => useOrderDeadline({
    order: order as never,
    routeId: 1,
    applyOrder: vi.fn(),
    onConflict
  }))
}

function runActions(order: ReturnType<typeof ref>, loadOrder?: () => Promise<unknown>) {
  return runComposable(() => useOrderActions({
    order: order as never,
    routeId: 1,
    statusAction: ref(''),
    prevPriority: ref(null),
    loadOrder: loadOrder ?? (async () => {}),
    applyOrder: vi.fn()
  }))
}

function conflict(code = 'ORDER_CONFLICT') {
  return Object.assign(new Error(code), { code, status: 409 })
}

beforeEach(() => {
  h.updateDeadline.mockReset().mockResolvedValue({ ...ORDER })
  h.updateStartDate.mockReset().mockResolvedValue({ ...ORDER })
  h.cancelOrder.mockReset().mockResolvedValue({ ...ORDER, undoWindowMs: 5000 })
  h.push.mockReset()
  // element-plus 桩是模块级单例：不清的话「提示冲突只发生一次」这类断言会被上一个用例带脏
  vi.clearAllMocks()
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

  it('改截稿日撞 409：提示冲突并重拉真相，不按普通失败弹错', async () => {
    const onConflict = vi.fn(async () => {})
    h.updateDeadline.mockRejectedValueOnce(conflict())
    const api = runDeadline(ref({ ...ORDER }), onConflict)
    await api.changeDeadline('2026-11-01')
    expect(ElMessage.warning).toHaveBeenCalledWith('common.orderConflict')
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(onConflict).toHaveBeenCalledTimes(1)
  })

  it('取消订单撞 409：提示冲突并重拉订单（旧 version 不留在快照里反复撞）', async () => {
    const loadOrder = vi.fn(async () => {})
    h.cancelOrder.mockRejectedValueOnce(conflict())
    const api = runActions(ref({ ...ORDER }), loadOrder)
    await api.confirmCancelOrder()
    expect(ElMessage.warning).toHaveBeenCalledWith('common.orderConflict')
    expect(loadOrder).toHaveBeenCalledTimes(1)
  })

  it('已收款二次确认重发撞 409：同样提示冲突并重拉', async () => {
    const loadOrder = vi.fn(async () => {})
    h.cancelOrder
      .mockRejectedValueOnce(Object.assign(conflict('CANCEL_WITH_PAYMENT'), { detail: { paidCents: 5000 } }))
      .mockRejectedValueOnce(conflict())
    const api = runActions(ref({ ...ORDER }), loadOrder)
    await api.confirmCancelOrder()
    expect(h.cancelOrder).toHaveBeenLastCalledWith(1, { version: 7, confirmPaidCancel: true })
    expect(ElMessage.warning).toHaveBeenCalledWith('common.orderConflict')
    expect(loadOrder).toHaveBeenCalledTimes(1)
  })

  it('开工日自动回填截稿日：第二笔写仍带 version（接力不丢锁）', async () => {
    h.updateStartDate.mockResolvedValueOnce({ ...ORDER, deadline: null, start_date: '2026-10-30', tier_work_days: 3 })
    const api = runDeadline(ref({ ...ORDER }))
    await api.changeStartDate('2026-10-30')
    expect(h.updateDeadline).toHaveBeenCalledTimes(1)
    expect(h.updateDeadline.mock.calls[0][2]).toEqual({ version: 7 })
  })
})
