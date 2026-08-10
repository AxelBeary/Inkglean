// 语言切换动效（登录页重构 2026-08-10 从 Login.vue 抽出）
// WAAPI 单次交叉淡出 + 切换期锁容器高度（防布局跳动/二次闪烁），160ms 中点换 locale；
// busy 锁拦截连点；reduced-motion 直切。
//
// getContainerEl：返回需要淡变/锁高度的容器元素（函数形式，规避 ref 解包歧义）。
import { setLocale } from '../i18n/index.js'

export function useLocaleSwitch(getContainerEl) {
  let busy = false

  function switchLang(next, current) {
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
      { duration: 380, easing: 'cubic-bezier(.45, .05, .25, 1)' }
    )
    setTimeout(() => setLocale(next), 160)
    anim.onfinish = () => {
      el.style.height = ''
      el.style.overflow = ''
      busy = false
    }
  }

  return { switchLang }
}
