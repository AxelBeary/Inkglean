// 数字滚动 composable（0 → target，默认 600ms ease-out；尊重 reduced-motion 直接跳终值）
// 派工 02D P1-1：金额/计数从 0 滚动到目标值，替代「突然出现」。
// 纪律：滚动的是**数值**，¥ 前缀/格式化留在调用方外层（`¥{{ formatCents(display) }}`）；
//      只对首次数据到达滚动一次，后续更新从当前值平滑过渡；不循环。
import { ref, reactive, watch, onUnmounted, isRef } from 'vue'
import type { Ref } from 'vue'

// 模块级检测一次系统「减少动态效果」偏好（SSR 安全兜底）
const prefersReduced = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * @param {import('vue').Ref<number>|number|(() => number)} target 目标数值（响应式或普通值）
 * @param {{ duration?: number, delay?: number }} [options] duration 时长 ms（默认 600）、delay 首次延迟 ms（默认 0）
 * @returns {{ display: import('vue').Ref<number> }} display：滚动中的当前值（写入模板）
 */
export function useCountUp(target: Ref<number> | number | (() => number), { duration = 600, delay = 0 }: { duration?: number, delay?: number } = {}) {
  const display = ref(0)
  let raf = 0
  let timer = 0
  let firstRun = true

  // 兼容：ref / 普通值 / getter——必须返回**值**而非 ref 对象本身，
  // 否则 watch 做引用比较，computed/ref 的 .value 变化不触发回调（2026-08-08 实测 NaN/不滚动根因）
  const source = (): number => {
    if (typeof target === 'function') return target()
    return isRef(target) ? target.value : target
  }

  function run(from: number, to: number): void {
    if (raf) cancelAnimationFrame(raf)
    if (prefersReduced) { display.value = to; return }
    const start = performance.now()
    const step = (now: number): void => {
      const p = Math.min((now - start) / duration, 1)
      display.value = Math.round(from + (to - from) * easeOutCubic(p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }

  watch(source, (to) => {
    const from = display.value
    if (firstRun && delay > 0) {
      timer = window.setTimeout(() => run(from, to), delay)
    } else {
      run(from, to)
    }
    firstRun = false
  }, { immediate: true })

  onUnmounted(() => {
    cancelAnimationFrame(raf)
    clearTimeout(timer)
  })

  return reactive({ display })
}
