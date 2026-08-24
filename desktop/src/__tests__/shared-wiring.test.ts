// 共享包接线冒烟：@inkglean/shared 以 file: 链接接入，此测试保证链接可解析、源码可导入
// （F3/F4/F12 双端共享组件接线的前置保险丝——接线断了这里先红）
//
// shared-824 升级：保险丝从「sharedVersion 可导入」升为「真组件可导入可挂载」——
// F3 约稿条 PriceCard / F4 小票 ReceiptPrinter 已迁入共享包，此处断言值导出存活、
// ReceiptPrinter 能在桌面端测试栈（happy-dom + plugin-vue）里挂载出制品行结构。
// 挂载兜底说明：desktop 测试栈未装 @vue/test-utils（本批禁加依赖），改用 vue 原生
// createApp + nextTick 直接挂到 happy-dom 节点上，断言等价（.rc-item 存在 + 卸载干净）。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { sharedVersion, PriceCard, ReceiptPrinter } from '@inkglean/shared'

// 组件内预览走 150ms 防抖定时器，fake timers 接管保证卸载后无残留计时
afterEach(() => {
  vi.useRealTimers()
})

describe('@inkglean/shared 接线', () => {
  it('desktop 端可导入共享包', () => {
    expect(sharedVersion).toBe('0.1.0')
  })

  it('F3/F4 哑组件以值导出存活（组件对象可导入）', () => {
    // 哑组件纪律见 shared/src/index.ts：数据进 props、事件出 emit
    expect(PriceCard).toBeTruthy()
    expect(ReceiptPrinter).toBeTruthy()
  })
})

describe('ReceiptPrinter 挂载（shared-824 真组件冒烟）', () => {
  let app: App | null = null
  let root: HTMLElement | null = null

  afterEach(() => {
    if (app) {
      app.unmount()
      app = null
    }
    if (root) {
      root.remove()
      root = null
    }
  })

  it('挂载后渲染制品行结构（.rc-item）且卸载干净', async () => {
    vi.useFakeTimers()
    root = document.createElement('div')
    document.body.appendChild(root)

    app = createApp(ReceiptPrinter, { t: (k: string) => k })
    app.mount(root)
    await nextTick()

    // 默认草稿两行空制品签，制品行结构必须渲染出来
    expect(root.querySelectorAll('.rc-item').length).toBeGreaterThanOrEqual(1)

    app.unmount()
    app = null
    // 卸载干净：容器清空、无残留防抖计时器
    expect(root.innerHTML).toBe('')
    expect(() => vi.runAllTimers()).not.toThrow()
    expect(root.innerHTML).toBe('')
  })
})
