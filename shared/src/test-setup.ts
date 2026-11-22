// F0173: 共享包测试全局 setup（vitest setupFiles）
// happy-dom 无 canvas 2d 实现，PriceCard / ReceiptPrinter 挂载测试此前各自逐字复制同一份
// Proxy stub；收敛到此处统一注入，新增 canvas 组件测试无需再复制。
import { beforeEach, vi } from 'vitest'

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

// 每个用例前重置 stub，避免用例间相互污染
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
})
