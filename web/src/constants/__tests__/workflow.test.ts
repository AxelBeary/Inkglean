// 收款比例/分页魔数单源测试（P1 汇总波 C15/C17）
// 断言：抽出的常量与各组件原硬编码值完全一致（防重构漂移）
import { describe, it, expect } from 'vitest'
import { MIN_BP, TOTAL_BP, SNAP, MAX_INSTALLMENTS, NEW_BP } from '../workflow'
import { UI_PAGE_SIZE, FETCH_ALL_PAGE_SIZE, GUESTBOOK_FETCH_ALL_PAGE_SIZE, ORDER_LIST_UI_PAGE_SIZE } from '../pagination'
import { ADDON_PERCENT_MAX, ADDON_FIXED_PRICE_MAX, ADDON_DEFAULT_PRICE } from '../addon'
import { REBIND_COOLDOWN_DEFAULT_MS } from '../account'

describe('收款比例常量（C15）', () => {
  it('与 PaymentBar/WorkflowPaymentEditor 原硬编码值一致', () => {
    expect(MIN_BP).toBe(500)
    expect(TOTAL_BP).toBe(10000)
    expect(SNAP).toBe(100)
    expect(MAX_INSTALLMENTS).toBe(20)
    expect(NEW_BP).toBe(1000)
  })
})

describe('分页常量（C17）', () => {
  it('与各页原 pageSize 一致', () => {
    expect(UI_PAGE_SIZE).toBe(20)
    expect(FETCH_ALL_PAGE_SIZE).toBe(200)
    expect(GUESTBOOK_FETCH_ALL_PAGE_SIZE).toBe(100)
    expect(ORDER_LIST_UI_PAGE_SIZE).toBe(50)
  })
})

describe('增项/重绑常量（C16/C18）', () => {
  it('与 Addon* 对话框及 AccountSecurity 原值一致', () => {
    expect(ADDON_PERCENT_MAX).toBe(1000)
    expect(ADDON_FIXED_PRICE_MAX).toBe(999999)
    expect(ADDON_DEFAULT_PRICE).toBe(50)
    expect(REBIND_COOLDOWN_DEFAULT_MS).toBe(24 * 3600000)
  })
})
