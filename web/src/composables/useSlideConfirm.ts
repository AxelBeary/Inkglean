import { ref } from 'vue'

/**
 * useSlideConfirm — 拖到底确认（R30e 滑块确认的复用版）
 *
 * 用于高代价不可逆操作：取消订单（R39）、批量删除 ≥3（R45）。
 * 逻辑与 QueueBoard.vue 的内联实现一致（阈值 0.9、pointer capture），
 * 新页面统一走本 composable，QueueBoard 原有实现不动。
 *
 * 用法：
 *   const { active, progress, open, close, onStart, onMove, onEnd } =
 *     useSlideConfirm({ onConfirm: doCancel })
 *   模板中 .slide-confirm-fill 宽度 = progress * 100%，
 *   .slide-confirm-thumb left = 2px + progress * (100% - 40px)。
 *
 * @param options
 * @param options.onConfirm 拖到底后执行的确认动作
 * @param options.threshold 触发阈值（进度比例），默认 0.9
 */
export function useSlideConfirm({ onConfirm, threshold = 0.9 }: {
  onConfirm: () => void | Promise<void>
  threshold?: number
}) {
  /** 滑块确认行是否展开 */
  const active = ref(false)
  /** 拖动进度 0~1 */
  const progress = ref(0)
  /** 轨道矩形（拖动期间缓存） */
  let trackRect: DOMRect | null = null

  function open() {
    active.value = true
    progress.value = 0
  }

  function close() {
    active.value = false
    progress.value = 0
    trackRect = null
  }

  function onStart(e: PointerEvent) {
    const track = (e.currentTarget as HTMLElement).closest('.slide-confirm')
    if (!track) return
    trackRect = track.getBoundingClientRect()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent) {
    if (!trackRect) return
    const x = e.clientX - trackRect.left - 20
    progress.value = Math.max(0, Math.min(1, x / (trackRect.width - 40)))
  }

  async function onEnd() {
    if (!trackRect) return
    trackRect = null
    if (progress.value >= threshold) {
      close()
      await onConfirm()
    } else {
      // 未拖到底：回弹归零
      progress.value = 0
    }
  }

  return { active, progress, open, close, onStart, onMove, onEnd }
}
