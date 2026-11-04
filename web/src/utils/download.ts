/**
 * 客户端文件下载（b2 收敛：DeliveryPage / TrackOrder 原 14 行逐字重复）
 *
 * 只负责「fetch → blob → a.click → 延迟 revoke」的浏览器下载链路；
 * 错误处理由调用方负责（各页按自己的 i18n 文案提示，不在此处耦合 vue-i18n）。
 *
 * @param {string} url 同源/可匿名访问的文件 URL
 * @param {string} [fileName] 下载文件名（缺省用浏览器默认名）
 * @throws {Error} HTTP 非 2xx 时抛出，由调用方提示
 */
export async function downloadAsset(url: string, fileName?: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const a = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  a.href = objectUrl
  a.download = fileName || 'download'
  a.click()
  // 延迟释放 ObjectURL，避免在部分浏览器或并发环境中 click 异步派发前 URL 提前失效
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
