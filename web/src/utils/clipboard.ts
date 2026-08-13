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
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    return typeof document.execCommand === 'function' ? document.execCommand('copy') : false
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}
