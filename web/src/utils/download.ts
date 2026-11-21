/**
 * 客户端文件下载（b2 收敛：DeliveryPage / TrackOrder 原 14 行逐字重复）
 *
 * 只负责「fetch → blob → a.click → revoke」的浏览器下载链路；
 * 错误处理由调用方负责（各页按自己的 i18n 文案提示，不在此处耦合 vue-i18n）。
 *
 * 关于 revoke 延迟 60 秒（issue #81 A 路）：**这不是对某条报障的根因修复**。
 * 已实测：本机无头 Chromium 下 1MB / 10MB / 50MB 三档，click() 后同步 revokeObjectURL
 * 均能完整落盘；服务端交付文件上限 50MB（server/src/features/upload/upload.routes.ts:20），
 * 不存在更大档位——所以「大文件必断」的结论不成立，链路语义保持原样。
 * 延迟的真实目的是消除「提前注销」在非 Chromium 内核（Firefox / 旧 Safari / WKWebView）
 * 上的已知脆弱面：那些实现里 click 触发的下载导航是异步消费 blob URL 的，同步注销可能让
 * 下载在导航消费前失去目标。60s 与 file-saver 一类库的既有口径对齐（留足慢速磁盘/沙箱落盘窗口）。
 *
 * @param {string} url 同源/可匿名访问的文件 URL
 * @param {string} [fileName] 下载文件名（缺省用浏览器默认名）
 * @throws {Error} HTTP 非 2xx 时抛出，由调用方提示
 */
/** 单次交付文件传输上限（服务端 upload.routes.ts:20 限制 50MB；超时按最慢可用带宽留足余量）。 */
const DOWNLOAD_TIMEOUT_MS = 120_000

export async function downloadAsset(url: string, fileName?: string): Promise<void> {
  // 无超时的 fetch 会让调用方的「下载中」标记永久为真：弱网/半开连接下按钮全站变灰且无法自愈。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  let blob: Blob
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    blob = await res.blob()
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error('DOWNLOAD_TIMEOUT', { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
  // 先取出 URL 存局部：延迟注销不再依赖 <a> 的存活与 a.href 的可读性（原实现读的就是 a.href）
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName || 'download'
  a.click()
  // 延迟释放（理由见文件头）：只注销自己的 objectUrl，不碰全局 URL 状态
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
