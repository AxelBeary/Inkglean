/**
 * 草稿参考图缩略图补齐（issue #82 补）
 *
 * 背景：草稿只存 references/ 路径（签名 URL 5 分钟过期，落盘必裂图），恢复出来的
 * el-upload 条目有文件名却没有缩略图。这里按路径向服务端现签，把 url 补回条目。
 *
 * 分档处理，任何一档都不阻断表单：
 * - 请求失败（网络/5xx/凭证不可用）：条目原样保留。缩略图缺省不影响提交，filePath 仍然有效；
 * - 某条签不出来（他人上传 / 已随订单提交 / 文件已被回收）：它已不可能提交成功，
 *   就地摘掉并回调 onExpired 提示一次，避免用户填完表单才在提交时吃 ILLEGAL_PATH、
 *   还不知道是哪张图坏了；
 * - 全部签成功：只补 url，不动顺序（顺序即提交顺序）。
 *
 * 单独成模块而不是塞进 useOrderForm：该文件已顶到 800 行硬上限（F-44 防阀），
 * 而这段「网络 + 列表清洗 + 提示回调」与表单状态无关，独立后可直接单测。
 */
import type { Ref } from 'vue'
import type { RefFileItem } from '../views/client/order-form/types'
import { signReferenceUrlsWithAnonToken } from '../utils/anonUpload'

/**
 * @param refFileList 参考图列表（与下单共用同一 ref，直接原地补 url / 摘死条目）
 * @param paths       本次草稿恢复出来的 filePath（顺序即提交顺序）
 * @param onExpired   有条目失效时的回调（传失效张数，调用方决定文案与提示方式）
 */
export async function hydrateDraftRefUrls(
  refFileList: Ref<RefFileItem[]>,
  paths: string[],
  onExpired: (count: number) => void
): Promise<void> {
  if (!paths.length) return
  let urls: Map<string, string>
  try {
    urls = await signReferenceUrlsWithAnonToken(paths)
  } catch (err) {
    console.warn('[draftRefThumbs] 草稿参考图现签失败，缩略图缺省', err) // eslint-disable-line no-console
    return
  }
  const wanted = new Set(paths)
  const dead = new Set<string>()
  for (const item of refFileList.value) {
    if (!item.filePath || !wanted.has(item.filePath)) continue
    const url = urls.get(item.filePath)
    if (url) item.url = url
    else dead.add(item.filePath)
  }
  if (!dead.size) return
  refFileList.value = refFileList.value.filter(item => !item.filePath || !dead.has(item.filePath))
  onExpired(dead.size)
}
