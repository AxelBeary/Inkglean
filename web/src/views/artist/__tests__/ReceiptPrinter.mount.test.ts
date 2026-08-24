// 小票打印机挂载测试（oimimo 吸纳批五）
// shared-824 路 B 适配：表单/合计内部已迁入 @inkglean/shared 哑组件，
// 内部状态断言改经 wrapper.findComponent(ReceiptPrinterCore).vm 取子组件 vm（断言语义不变）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ReceiptPrinter from '../ReceiptPrinter.vue'
import { ReceiptPrinter as ReceiptPrinterCore } from '@inkglean/shared'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

// happy-dom 无 canvas 2d：统一 stub（与价目卡挂载测试同口径）
function canvasContextStub() {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'canvas') return { width: 0, height: 0 }
      return () => undefined
    },
    set() {
      return true
    }
  })
}

interface ReceiptItemVM { name: string; qty: number; priceYuan: number | null; gift: boolean }
interface ReceiptCoreVM {
  form: {
    title: string
    items: ReceiptItemVM[]
    discountType: string
    discountValue: number
    depositYuan: number | null
    style: string
  }
  totals: { subtotalCents: number; discountCents: number; totalCents: number; depositCents: number; balanceCents: number }
  addItem: () => void
  removeItem: (i: number) => void
}

function mountReceipt() {
  const wrapper = mount(ReceiptPrinter, {
    global: { mocks: { $t: (key: string) => key, $tm: () => [] } }
  })
  // 内部状态住在共享子组件：VTU vm 代理透出 script-setup setupState
  const vm = wrapper.findComponent(ReceiptPrinterCore).vm as unknown as ReceiptCoreVM
  return { wrapper, vm }
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
  localStorage.clear()
})

describe('ReceiptPrinter 小票打印机', () => {
  it('挂载渲染标题与默认 2 行制品', () => {
    const { wrapper } = mountReceipt()
    expect(wrapper.find('.od-page-title').text()).toBe('receipt.title')
    expect(wrapper.findAll('.rc-item')).toHaveLength(2)
  })

  it('制品行可加至 10 行、至少保留 1 行', async () => {
    const { wrapper, vm } = mountReceipt()
    const addBtn = wrapper.find('.rc-btn--ghost')
    for (let i = 0; i < 8; i++) await addBtn.trigger('click')
    expect(wrapper.findAll('.rc-item')).toHaveLength(10)
    expect(addBtn.attributes('disabled')).toBeDefined()

    const removeBtns = wrapper.findAll('.rc-mini-btn')
    for (let i = 0; i < 9; i++) {
      vm.removeItem(0)
    }
    expect(vm.form.items).toHaveLength(1)
    expect(removeBtns.length).toBeGreaterThan(0)
  })

  it('合计随表单联动：折扣与定金参与计算', async () => {
    const { vm } = mountReceipt()
    vm.form.items[0].name = '头像'
    vm.form.items[0].qty = 1
    vm.form.items[0].priceYuan = 100
    expect(vm.totals.totalCents).toBe(10000)

    vm.form.discountType = 'percent'
    vm.form.discountValue = 90
    expect(vm.totals.totalCents).toBe(9000)

    vm.form.depositYuan = 30
    expect(vm.totals.balanceCents).toBe(6000)
  })

  // 宿主接线断言：表单变更 → 共享组件 draft-change → 宿主写 localStorage；重挂回读恢复
  it('草稿持久化：修改落 localStorage，重挂恢复', async () => {
    const { vm, wrapper } = mountReceipt()
    vm.form.title = '星野的小铺'
    vm.form.items[0].name = '头像'
    vm.form.items[0].priceYuan = 80
    await wrapper.vm.$nextTick()

    const saved = JSON.parse(localStorage.getItem('huiyue_receipt_draft')!) as { title: string }
    expect(saved.title).toBe('星野的小铺')

    const { vm: vm2 } = mountReceipt()
    expect(vm2.form.title).toBe('星野的小铺')
    expect(vm2.form.items[0]).toMatchObject({ name: '头像', priceYuan: 80 })
  })
})
