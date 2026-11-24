/**
 * 浏览器端 Blob 下载单源（尾巴批 pr-review-upstream-20261123：#102 PriceCard / ReceiptPrinter
 * web 宿主与 #99 desktop host.ts 纯浏览器降级路径三处同型 createObjectURL → a.click → 延迟 revoke 收口）。
 * 只负责下载链路本身；文案由调用方负责（哑工具纪律，同 money/ink-palette 不耦合宿主）。
 *
 * SHR-02：原返回 void 且异常不外抛，desktop savePng 据此无条件报 'saved'（下载被拦截仍报成功）。
 * 改为异步回执 Promise<{ok,error?}>：链路同步异常（createObjectURL/a.click 抛错）如实收进
 * error 字段回传，不吞错误也不改变调用方成功/失败判定所需的信息。
 * 注意：浏览器对 a.click() 的下载拦截多为静默取消、不抛异常，ok 表示「链路无异常触发」，
 * 调用方据此给用户可见反馈即可，语义边界不夸大。
 *
 * 延迟 1s revoke 的理由（原三处口径原样保留）：click() 后同步注销会让非 Chromium 内核
 * （Firefox / 旧 Safari / WKWebView）来不及消费 blob URL 导致下载失败。
 * 注意：web/src/utils/download.ts 的 downloadAsset 是「fetch → blob」链路，其 60s 延迟
 * 服务大文件落盘余量，属另一档口径，不在本收口内。
 */
export interface DownloadResult {
  ok: boolean
  error?: string
}

export function downloadBlob(blob: Blob, filename: string): Promise<DownloadResult> {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return Promise.resolve({ ok: true })
  } catch (err) {
    return Promise.resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
