// issue #83 · C 路单测：纸墨确认框。
// 测试栈无 @vue/test-utils（本批禁加依赖），故走 confirmDialog() 的真实挂载路径：
// 每次调用 createApp 到 body → 查 DOM 点按/按键 → 断言 Promise 落定值与宿主节点回收。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { confirmDialog } from '../tools/confirm'

function find<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`未找到 ${selector}`)
  return el
}
function host(): HTMLElement | null {
  return document.querySelector('[data-confirm-dialog]')
}

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { document.body.innerHTML = '' })

describe('confirmDialog · 纸墨确认框（issue #83）', () => {
  it('点确定 → true，且宿主节点已卸载', async () => {
    const result = confirmDialog({ message: '新版本已下载，现在重启完成更新？' })
    await nextTick()
    expect(find('.cd-msg').textContent).toBe('新版本已下载，现在重启完成更新？')
    find<HTMLButtonElement>('.cd-ok').click()
    await expect(result).resolves.toBe(true)
    expect(host()).toBeNull()
  })

  it('点取消 → false，且宿主节点已卸载', async () => {
    const result = confirmDialog({ message: '确定替换？' })
    await nextTick()
    find<HTMLButtonElement>('.cd-cancel').click()
    await expect(result).resolves.toBe(false)
    expect(host()).toBeNull()
  })

  it('Esc → false', async () => {
    const result = confirmDialog({ message: '按 Esc 应取消' })
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(result).resolves.toBe(false)
    expect(host()).toBeNull()
  })

  it('点遮罩 → false', async () => {
    const result = confirmDialog({ message: '点遮罩应取消' })
    await nextTick()
    find<HTMLElement>('.cd-overlay').click()
    await expect(result).resolves.toBe(false)
    expect(host()).toBeNull()
  })

  it('点卡片内部不关闭', async () => {
    const result = confirmDialog({ message: '点卡片内部不关闭' })
    await nextTick()
    let settled = false
    void result.then(() => { settled = true })
    find<HTMLElement>('.cd-card').click()
    find<HTMLElement>('.cd-msg').click()
    await nextTick()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(host()).not.toBeNull()
    // 收尾：从取消落定，避免测试间残留挂载实例
    find<HTMLButtonElement>('.cd-cancel').click()
    await expect(result).resolves.toBe(false)
  })

  it('打开焦点落确定，关闭后还原到触发元素', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = '触发确认'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const result = confirmDialog({ message: '焦点还原' })
    await nextTick()
    expect(document.activeElement).toBe(find('.cd-ok'))

    find<HTMLButtonElement>('.cd-cancel').click()
    await expect(result).resolves.toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})
