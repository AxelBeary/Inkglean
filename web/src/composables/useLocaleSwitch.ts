// 语言切换动效（登录页重构 2026-08-10 从 Login.vue 抽出）
// WAAPI 单次交叉淡出 + 切换期锁容器高度（防布局跳动/二次闪烁），160ms 中点换 locale；
// busy 锁拦截连点；reduced-motion 直切。
//
// getContainerEl：返回需要淡变/锁高度的容器元素（函数形式，规避 ref 解包歧义）。
import { onUnmounted } from 'vue'
import { setLocale } from '../i18n/index'

// T 波：WAAPI 无法直接读 CSS token，抽为命名常量 + 注释对齐 artist-tokens.css。
// 380ms 落在 --dur-mid(.25s) 与 --dur-slow(.35s) 之间，属容器级交叉淡化节奏，保持原值等值；
// easing 为 WAAPI 专用字符串，无 --ease-* token 可引用，原曲线保留。
const LANG_SWAP_DURATION_MS = 380
const LANG_SWAP_EASING = 'cubic-bezier(.45, .05, .25, 1)'
const LANG_SWAP_MIDPOINT_MS = 160

export function useLocaleSwitch(getContainerEl: () => HTMLElement | null | undefined) {
  let busy = false
  // L-5: 中点换 locale 的定时器句柄——随调用方组件卸载清理，防组件销毁后仍改全局 locale
  let langTimer: number | null = null

  function switchLang(next: string, current: string) {
    if (next === current || busy) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLocale(next)
      return
    }
    const el = getContainerEl()
    if (!el) { setLocale(next); return }
    busy = true
    el.style.height = el.offsetHeight + 'px'
    el.style.overflow = 'hidden'
    const anim = el.animate(
      [{ opacity: 1 }, { opacity: 0.35, offset: 0.42 }, { opacity: 1 }],
      { duration: LANG_SWAP_DURATION_MS, easing: LANG_SWAP_EASING }
    )
    if (langTimer) clearTimeout(langTimer)
    langTimer = setTimeout(() => setLocale(next), LANG_SWAP_MIDPOINT_MS)
    const release = () => {
      el.style.height = ''
      el.style.overflow = ''
      busy = false
    }
    // T 波：anim 被取消（元素卸载/连续切换）时同样释放锁，防 busy 卡死
    anim.onfinish = release
    anim.oncancel = release
  }

  // L-5: composable 随调用方生命周期收口——卸载时清理中点定时器（不改动既有调用方）
  onUnmounted(() => { if (langTimer) clearTimeout(langTimer) })

  return { switchLang }
}
