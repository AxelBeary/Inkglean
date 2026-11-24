/**
 * 浏览器端 Blob 下载单源（尾巴批 pr-review-upstream-20261123：#102 PriceCard / ReceiptPrinter
 * web 宿主与 #99 desktop host.ts 纯浏览器降级路径三处同型 createObjectURL → a.click → 延迟 revoke 收口）。
 * 只负责下载链路本身；错误处理与文案由调用方负责（哑工具纪律，同 money/ink-palette 不耦合宿主）。
 *
 * 延迟 1s revoke 的理由（原三处口径原样保留）：click() 后同步注销会让非 Chromium 内核
 * （Firefox / 旧 Safari / WKWebView）来不及消费 blob URL 导致下载失败。
 * 注意：web/src/utils/download.ts 的 downloadAsset 是「fetch → blob」链路，其 60s 延迟
 * 服务大文件落盘余量，属另一档口径，不在本收口内。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
