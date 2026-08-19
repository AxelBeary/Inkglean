// 报价单工具纯函数测试（812-tools-a：①报价单生成）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { quoteTotalCents, buildQuoteText, quoteCanvasHeight, renderQuoteCanvas, QUOTE_CANVAS_W } from '../quote.js'

describe('quoteTotalCents 条目合计（分）', () => {
  it('累加合法条目', () => {
    expect(quoteTotalCents([{ name: 'a', cents: 100 }, { name: 'b', cents: 20050 }])).toBe(20150)
  })

  it('非法/空条目按 0 处理，空数组返回 0', () => {
    expect(quoteTotalCents([{ cents: NaN }, { cents: null }, {}] as unknown as Parameters<typeof quoteTotalCents>[0])).toBe(0)
    expect(quoteTotalCents([])).toBe(0)
  })
})

describe('buildQuoteText 纯文字版', () => {
  const labels = {
    title: '报价单',
    clientLine: '客户：{name}',
    totalLine: '合计：{total}',
    noteLine: '备注：{note}',
    footer: '拾绘 Inkglean 生成'
  }

  it('按模板生成条目、合计与页脚（金额走 formatYuan 两位小数）', () => {
    const text = buildQuoteText({
      clientName: '张三',
      items: [{ name: '头像', cents: 20000 }, { name: '背景', cents: 8000 }],
      labels
    } as unknown as Parameters<typeof buildQuoteText>[0])
    expect(text.split('\n')).toEqual([
      '报价单',
      '客户：张三',
      '1. 头像 ¥200.00',
      '2. 背景 ¥80.00',
      '合计：¥280.00',
      '— 拾绘 Inkglean 生成'
    ])
  })

  it('客户称呼与备注留空时对应行不出现', () => {
    const text = buildQuoteText({ items: [{ name: '头像', cents: 100 }], labels } as unknown as Parameters<typeof buildQuoteText>[0])
    expect(text).not.toContain('客户：')
    expect(text).not.toContain('备注：')
  })

  it('备注填入备注行并裁剪首尾空白', () => {
    const text = buildQuoteText({
      items: [{ name: '头像', cents: 100 }],
      note: '  含 3 次修改  ',
      labels
    } as unknown as Parameters<typeof buildQuoteText>[0])
    expect(text).toContain('备注：含 3 次修改')
  })
})

describe('quoteCanvasHeight 画布高度（单模板固定布局）', () => {
  it('条目行数与备注参与高度计算', () => {
    expect(quoteCanvasHeight(1, false)).toBeLessThan(quoteCanvasHeight(3, false))
    expect(quoteCanvasHeight(2, true)).toBeGreaterThan(quoteCanvasHeight(2, false))
  })

  it('空条目按 1 行兜底（不塌陷）', () => {
    expect(quoteCanvasHeight(0, false)).toBe(quoteCanvasHeight(1, false))
  })
})

describe('renderQuoteCanvas 纸墨风绘制', () => {
  let getContextSpy: MockInstance<HTMLCanvasElement['getContext']> | undefined
  let ctxStub: {
    fillRect: ReturnType<typeof vi.fn>
    strokeRect: ReturnType<typeof vi.fn>
    fillText: ReturnType<typeof vi.fn>
    measureText: () => { width: number }
    beginPath: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
    lineTo: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
    setLineDash: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    ctxStub = {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 12 }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn()
    }
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctxStub as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    getContextSpy?.mockRestore()
  })

  it('按固定宽 + 内容高建画布，绘制纸底、标题、合计与页脚', () => {
    const canvas = document.createElement('canvas')
    renderQuoteCanvas(canvas, {
      title: '报价单',
      date: '2026-08-12',
      clientLabel: '客户：',
      clientName: '张三',
      items: [{ name: '头像', cents: 20000 }, { name: '背景', cents: 8000 }],
      totalLabel: '合计：',
      noteLabel: '备注：',
      note: '',
      footer: '拾绘 Inkglean 生成'
    })
    expect(canvas.width).toBe(QUOTE_CANVAS_W)
    expect(canvas.height).toBe(quoteCanvasHeight(2, false))
    expect(ctxStub.fillRect).toHaveBeenCalledWith(0, 0, QUOTE_CANVAS_W, canvas.height)
    expect(ctxStub.fillText).toHaveBeenCalledWith('报价单', 48, expect.any(Number))
    expect(ctxStub.fillText).toHaveBeenCalledWith('¥280.00', expect.any(Number), expect.any(Number))
    expect(ctxStub.fillText).toHaveBeenCalledWith('拾绘 Inkglean 生成', QUOTE_CANVAS_W / 2, expect.any(Number))
  })
})
