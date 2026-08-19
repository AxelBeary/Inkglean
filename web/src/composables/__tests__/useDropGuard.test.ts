// useDropGuard composable 测试（G1 页内拖拽守卫）
// 覆盖：来源识别（Files / 页内 text/html / 无 dataTransfer）、
// 捕获阶段守卫（dragenter/dragover/drop）、警告节流
// 测试策略：happy-dom 无真实 DragEvent，用 new Event + 手动挂 dataTransfer 模拟
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn() }
}))

import { ElMessage } from 'element-plus'
import { isSystemFileDrag, useDropGuard } from '../useDropGuard.js'

interface DataTransferLike {
  types: string[]
  files: File[]
}
type DragEventLike = Event & { dataTransfer?: DataTransferLike }

/** 构造带 dataTransfer 的事件（happy-dom 无真实 DragEvent，底层是普通 Event） */
function makeDragEvent(type: string, types?: string[]): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEventLike
  event.dataTransfer = types ? { types, files: [] } : undefined
  return event as unknown as DragEvent
}

const systemDrag = () => makeDragEvent('drop', ['Files'])
const pageDrag = () => makeDragEvent('drop', ['text/html', 'text/plain'])

function setup() {
  let guard!: ReturnType<typeof useDropGuard>
  const wrapper = mount({
    setup() {
      guard = useDropGuard()
      return { guard }
    },
    template: '<div />'
  })
  return { wrapper, guard }
}

// 模块级节流时间戳 lastWarnAt 会被上一个用例的警告写入；
// 每个用例的时钟基准递增 60s，保证新用例的"现在"一定在旧节流窗口之外
let testTick = 0
beforeEach(() => {
  vi.useFakeTimers()
  testTick += 1
  vi.setSystemTime(new Date('2026-08-04T12:00:00Z').getTime() + testTick * 60_000)
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('isSystemFileDrag', () => {
  it('types 含 Files → true', () => {
    expect(isSystemFileDrag(systemDrag())).toBe(true)
  })

  it('仅 text/html（页内拖拽）→ false', () => {
    expect(isSystemFileDrag(pageDrag())).toBe(false)
  })

  it('无 dataTransfer → false', () => {
    expect(isSystemFileDrag(makeDragEvent('drop'))).toBe(false)
  })

  it('事件对象为 undefined → false（不抛错）', () => {
    expect(isSystemFileDrag(undefined)).toBe(false)
  })
})

describe('useDropGuard 捕获阶段守卫', () => {
  it('系统文件拖入 dragenter → 放行（不 preventDefault、不警告）', () => {
    const { guard } = setup()
    const event = systemDrag()
    expect(guard.guardDragEnter(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('页内图拖入 dragenter → 拦截 + 警告 + 返回 false', () => {
    const { guard } = setup()
    const event = pageDrag()
    expect(guard.guardDragEnter(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(ElMessage.warning).toHaveBeenCalledWith('upload.dragFromPage')
  })

  it('页内图拖入 dragover → 拦截但不警告（dragenter 已警告）', () => {
    const { guard } = setup()
    const event = pageDrag()
    expect(guard.guardDragOver(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('系统文件 dragover → 放行', () => {
    const { guard } = setup()
    const event = systemDrag()
    expect(guard.guardDragOver(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it('页内图 drop → preventDefault + 警告 + 返回 false', () => {
    const { guard } = setup()
    const event = pageDrag()
    expect(guard.guardDrop(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(ElMessage.warning).toHaveBeenCalledWith('upload.dragFromPage')
  })

  it('系统文件 drop → 返回 true 放行', () => {
    const { guard } = setup()
    const event = systemDrag()
    expect(guard.guardDrop(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('警告节流', () => {
  it('1.5s 内多次页内拖拽只警告一次', () => {
    const { guard } = setup()
    guard.guardDrop(pageDrag())
    guard.guardDragEnter(pageDrag())
    guard.guardDrop(pageDrag())
    expect(ElMessage.warning).toHaveBeenCalledTimes(1)
  })

  it('超过节流窗口后可再次警告', () => {
    const { guard } = setup()
    guard.guardDrop(pageDrag())
    vi.advanceTimersByTime(1600)
    guard.guardDrop(pageDrag())
    expect(ElMessage.warning).toHaveBeenCalledTimes(2)
  })
})
