// LedgerTodo E3：账本待办动作词接真实工作流节点
// 覆盖：wip 有节点名 → 「推进 · {stage}」；无节点名/字段缺失 → 降级既有「完成」措辞；
// 点击推进语义不变（仍 updateStatus → done）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'

interface TodoTestItem {
  id: number
  orderNo: string
  clientName: string
  status: string
  deadline: string | null
  tag: string
  stageName?: string | null
  version?: number | null
}

const h = vi.hoisted(() => ({
  getDashboardTodo: vi.fn(),
  updateStatus: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { stage: string }) => {
      if (key === 'dashboard.ledgerVerbAdvance') return `推进 · ${params!.stage}`
      return key
    }
  })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    getDashboardTodo: h.getDashboardTodo,
    updateStatus: h.updateStatus
  }
}))

vi.mock('../../../../utils/datetime.js', () => ({
  formatDateTime: (s: string) => s || ''
}))

vi.mock('../../../../utils/money.js', () => ({
  formatCents: (c: number) => String(c)
}))

import LedgerTodo from '../LedgerTodo.vue'

function makeItem(overrides: Partial<TodoTestItem> = {}): TodoTestItem {
  return {
    id: 1,
    orderNo: 'A-001',
    clientName: '客户甲',
    status: 'wip',
    deadline: null,
    tag: '进行中',
    stageName: null,
    version: 11,
    ...overrides
  }
}

async function mountLedger(items: TodoTestItem[]) {
  h.getDashboardTodo.mockResolvedValue({ items })
  const wrapper = mount(LedgerTodo, { props: { monthCents: null } })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  h.getDashboardTodo.mockReset()
  h.updateStatus.mockReset()
  h.updateStatus.mockResolvedValue({})
  h.push.mockReset()
})

describe('LedgerTodo 动作词接真实工作流节点（E3）', () => {
  it('wip 订单有节点名 → 按钮显示「推进 · 节点名」', async () => {
    const wrapper = await mountLedger([makeItem({ id: 1, stageName: '细化' })])

    const btn = wrapper.find('.r-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('推进 · 细化')
  })

  it('wip 订单 stageName 为 null → 降级显示既有「完成」措辞', async () => {
    const wrapper = await mountLedger([makeItem({ id: 2, stageName: null })])

    const btn = wrapper.find('.r-btn')
    expect(btn.text()).toBe('dashboard.ledgerVerbDone')
  })

  it('旧契约无 stageName 字段 → 同样降级不报错', async () => {
    const item = makeItem({ id: 3 })
    delete item.stageName
    const wrapper = await mountLedger([item])

    const btn = wrapper.find('.r-btn')
    expect(btn.text()).toBe('dashboard.ledgerVerbDone')
  })

  it('有/无节点名两行并存：各自动词互不影响', async () => {
    const wrapper = await mountLedger([
      makeItem({ id: 4, orderNo: 'A-004', stageName: '线稿' }),
      makeItem({ id: 5, orderNo: 'A-005', stageName: null })
    ])

    const btns = wrapper.findAll('.r-btn')
    expect(btns).toHaveLength(2)
    expect(btns[0].text()).toBe('推进 · 线稿')
    expect(btns[1].text()).toBe('dashboard.ledgerVerbDone')
  })

  it('点击节点动词按钮：推进语义不变（updateStatus → done）并行沉底', async () => {
    const wrapper = await mountLedger([makeItem({ id: 6, stageName: '细化' })])

    await wrapper.find('.r-btn').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(h.updateStatus).toHaveBeenCalledWith(6, 'done', { version: 11 })
    // 完成后行沉底：沉底区显示 done 状态文案
    expect(wrapper.find('.row.sunk').exists()).toBe(true)
    expect(wrapper.text()).toContain('common.orderStatus.done')
  })

  it('非 wip 状态不吃节点名：pending 仍显示「确认」动词', async () => {
    const wrapper = await mountLedger([
      makeItem({ id: 7, status: 'pending', tag: '新单', stageName: '细化' })
    ])

    expect(wrapper.find('.r-btn').text()).toBe('dashboard.ledgerVerbConfirm')
  })

  // GHSA Wave2 issue #48：台账动词同为订单写路径——带锁、409 按本仓口径处理、旧契约不伪造版本
  it('撞 409：提示冲突并重拉待办，不当普通失败弹错', async () => {
    h.updateStatus.mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'ORDER_CONFLICT' }))
    const wrapper = await mountLedger([makeItem({ id: 8, stageName: '细化' })])

    await wrapper.find('.r-btn').trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('common.orderConflict')
    expect(ElMessage.error).not.toHaveBeenCalled()
    // 重拉：挂载一次 + 冲突后一次
    expect(h.getDashboardTodo).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('旧契约缺 version → 不伪造，沿用服务端当前版本（不带 version 字段）', async () => {
    const item = makeItem({ id: 9, stageName: '细化' })
    delete item.version
    const wrapper = await mountLedger([item])

    await wrapper.find('.r-btn').trigger('click')
    await flushPromises()

    expect(h.updateStatus).toHaveBeenCalledWith(9, 'done', {})
    wrapper.unmount()
  })
})
