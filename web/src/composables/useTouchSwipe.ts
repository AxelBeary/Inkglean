/**
 * useTouchSwipe — 触摸横向滑动方向判定（波 M 抽公共）
 *
 * TplStyleGrid / TplTierGrid 共用：touchstart 记录起点，touchend 计算横向位移，
 * 超过阈值（默认 50px，防误触）时返回滑动方向；否则返回 null。
 * 行为与既有实现等价：只看横向位移，不拦截纵向滚动（纵向交给 touch-action: pan-y）。
 */

export type SwipeDirection = 'left' | 'right' | null

export interface UseTouchSwipeOptions {
  /** 横向位移阈值（px），默认 50 */
  threshold?: number
  /** 可选：touchstart 回调（透传原生事件） */
  onStart?: (event: TouchEvent) => void
  /** 可选：touchmove 回调（透传原生事件） */
  onMove?: (event: TouchEvent) => void
}

export function useTouchSwipe(options: UseTouchSwipeOptions = {}) {
  const threshold = options.threshold ?? 50
  let startX: number | null = null

  function onTouchStart(event: TouchEvent) {
    startX = event.touches[0]?.clientX ?? null
    options.onStart?.(event)
  }

  function onTouchMove(event: TouchEvent) {
    options.onMove?.(event)
  }

  /** 计算滑动方向；无有效起点或位移不足阈值 → null */
  function onTouchEnd(event: TouchEvent): SwipeDirection {
    const endX = event.changedTouches[0]?.clientX
    if (startX == null || endX == null) return null
    const dx = endX - startX
    startX = null
    if (Math.abs(dx) < threshold) return null
    return dx < 0 ? 'left' : 'right'
  }

  return { onTouchStart, onTouchMove, onTouchEnd }
}
