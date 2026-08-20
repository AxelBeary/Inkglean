// 水印布局纯函数测试（REQ-035 批D）
// 策略：只测不依赖 canvas 的纯数学布局（wmAnchor/wmCorners/wmTileGrid），
//       绘制与合成依赖真实 canvas，由浏览器截图验证（交付报告视觉门禁）。
import { describe, it, expect } from 'vitest'
import { wmAnchor, wmCorners, wmTileGrid } from '../watermark'

describe('wmAnchor 单枚位置（四角 + 中央）', () => {
  const W = 1000
  const H = 600
  const wmW = 100
  const wmH = 40
  const margin = 20

  it('top-left 贴左上（margin 生效）', () => {
    expect(wmAnchor(W, H, wmW, wmH, 'top-left', margin)).toEqual({ x: 20, y: 20 })
  })

  it('top-right / bottom-left / bottom-right 贴对应角', () => {
    expect(wmAnchor(W, H, wmW, wmH, 'top-right', margin)).toEqual({ x: 880, y: 20 })
    expect(wmAnchor(W, H, wmW, wmH, 'bottom-left', margin)).toEqual({ x: 20, y: 540 })
    expect(wmAnchor(W, H, wmW, wmH, 'bottom-right', margin)).toEqual({ x: 880, y: 540 })
  })

  it('center 居中', () => {
    expect(wmAnchor(W, H, wmW, wmH, 'center', margin)).toEqual({ x: 450, y: 280 })
  })

  it('水印大于画布时 center 不产生负坐标（夹到 0）', () => {
    expect(wmAnchor(100, 100, 300, 50, 'center', 0)).toEqual({ x: 0, y: 25 })
  })

  it('负 margin 夹到 0', () => {
    expect(wmAnchor(W, H, wmW, wmH, 'top-left', -10)).toEqual({ x: 0, y: 0 })
  })
})

describe('wmCorners 四角各一枚', () => {
  it('返回四角坐标（顺时针：左上/右上/左下/右下）', () => {
    expect(wmCorners(1000, 600, 100, 40, 20)).toEqual([
      { x: 20, y: 20 },
      { x: 880, y: 20 },
      { x: 20, y: 540 },
      { x: 880, y: 540 }
    ])
  })

  it('大边距不越界（坐标不超出画布）', () => {
    const anchors = wmCorners(500, 300, 200, 100, 200)
    for (const a of anchors) {
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.y).toBeGreaterThanOrEqual(0)
      expect(a.x + 200).toBeLessThanOrEqual(500)
      expect(a.y + 100).toBeLessThanOrEqual(300)
    }
  })
})

describe('wmTileGrid 平铺网格', () => {
  it('基本平铺：间距 0 时按元素尺寸无缝步进', () => {
    const grid = wmTileGrid(200, 100, 100, 50, 0)
    expect(grid).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 50 },
      { x: 100, y: 50 }
    ])
  })

  it('间距参与步进（元素尺寸 + 间距）', () => {
    const grid = wmTileGrid(250, 100, 100, 50, 20)
    // 步进 120（x）/ 70（y = 50+20）：x 0/120/240；y 0/70
    expect(grid).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 240, y: 0 },
      { x: 0, y: 70 },
      { x: 120, y: 70 },
      { x: 240, y: 70 }
    ])
  })

  it('非法输入返回空数组（不崩溃）', () => {
    expect(wmTileGrid(100, 100, 0, 10, 10)).toEqual([])
    expect(wmTileGrid(100, 100, 10, 0, 10)).toEqual([])
    expect(wmTileGrid(100, 100, 10, 10, -5)).toEqual([])
    expect(wmTileGrid(0, 0, 10, 10, 10)).toEqual([])
  })

  it('元素大于画布时仍返回一枚（坐标为 0）', () => {
    expect(wmTileGrid(100, 100, 300, 300, 10)).toEqual([{ x: 0, y: 0 }])
  })
})
