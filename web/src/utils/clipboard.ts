/**
 * 剪贴板统一封装（波3-2：Quote/QuickNote/SocialReply/PriceCard/ScheduleSharePage/
 * OnboardingCard/DiscountCodeManager 7 处重复实现收敛）。
 *
 * 策略：navigator.clipboard.writeText 优先（HTTPS/localhost 安全上下文），
 * 失败回退隐藏 textarea + execCommand；两者均失败返回 false，不向上抛。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限拒绝/浏览器不支持等 → 降级到 execCommand
    }
  }

  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0' // F0262: 放进可视区域，iOS Safari 才会真正执行 execCommand('copy')
  ta.style.left = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  // F0262: iOS 需先 focus + setSelectionRange 选中，否则 execCommand 静默失败
  ta.focus()
  ta.setSelectionRange(0, ta.value.length)
  try {
    return typeof document.execCommand === 'function' ? document.execCommand('copy') : false
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}
