/**
 * 参考图的匿名凭证统一链路（G-7 / F-10 契约）
 *
 * 背景（817-B2 调查结论）：参考图上传接口要求携带有效 x-anon-token，
 * 本地缓存的凭证可能已过期/被服务端回收（anon_tokens 30 天 TTL / GC / 库重建），
 * 直接上传会收到 INVALID_ANON_TOKEN——此前各调用方只 await 一次凭证就上传，
 * 失效凭证不会自动换新，公网用户便看到「缺少有效匿名凭证」。
 *
 * 本模块统一：
 * 1. 请求前 await 凭证（确保凭证先于请求就绪）；
 * 2. 服务端判 INVALID_ANON_TOKEN 时清缓存换新凭证并重试一次；
 * 3. 上传返回实际成功的 token（下单提交必须使用同一 token 才能通过归属校验）。
 */
import { getAnonToken, getFreshAnonToken } from './track'
import { uploadApi } from '../api/index'
import type { UploadImageResult } from '../api/types'

/** 凭证不可用（获取失败/签发被拒）时的业务错误：调用方按既有 i18n 提示展示 */
export class AnonTokenUnavailableError extends Error {
  declare readonly code: string
  constructor(message = 'anon token unavailable') {
    super(message)
    this.name = 'AnonTokenUnavailableError'
    this.code = 'ANON_TOKEN_UNAVAILABLE'
  }
}

/**
 * 带匿名凭证执行一次请求，凭证失效时换新重试一次。
 * 上传与现签共用这一份重试口径——两处各写一遍必然漂移（一边重试一边不重试）。
 * 不重试其他错误：网络/5xx 重试只会放大故障，也会掩盖真实失败。
 * @returns 实际成功的 token + 调用结果（上传类调用方要把 token 交给下单归属校验）
 */
async function withAnonToken<T>(call: (token: string) => Promise<T>): Promise<{ token: string, result: T }> {
  const token = await getAnonToken()
  if (!token) throw new AnonTokenUnavailableError()
  try {
    return { token, result: await call(token) }
  } catch (err) {
    const errCode = err instanceof Error ? (err as Error & { code?: unknown }).code : undefined
    if (!err || errCode !== 'INVALID_ANON_TOKEN') throw err
    const freshToken = await getFreshAnonToken()
    if (!freshToken) throw err
    return { token: freshToken, result: await call(freshToken) }
  }
}

/**
 * 携带有效匿名凭证上传参考图。
 * @param {Blob} file 上传文件
 * @returns 成功时返回 { token, uploaded }；token 为本次上传实际使用的凭证（下单归属校验同源）。
 * @throws {AnonTokenUnavailableError} 凭证获取失败（不发上传请求）
 * @throws {Error} 上传失败（INVALID_ANON_TOKEN 换新重试一次后仍失败则抛原始错误）
 */
export async function uploadReferenceWithAnonToken(file: Blob): Promise<{ token: string, uploaded: UploadImageResult }> {
  const { token, result } = await withAnonToken(t => uploadApi.reference(file, { headers: { 'x-anon-token': t } }))
  return { token, uploaded: result }
}

/**
 * 按 filePath 现签参考图预览 URL（issue #82 补：草稿恢复补缩略图）。
 * 草稿只存路径（签名 URL 5 分钟过期），恢复后列表没有缩略图——这里按路径重签。
 * @returns filePath → 预览 URL；**缺席的路径 = 服务端签不出来**（他人上传 / 已随订单提交 / 文件已被回收），
 *          调用方须按「已失效」处理，别拿 request 里的顺序或长度反推结果。
 * @throws {AnonTokenUnavailableError} 凭证获取失败
 * @throws {Error} 请求失败（INVALID_ANON_TOKEN 换新重试一次后仍失败则抛原始错误）
 */
export async function signReferenceUrlsWithAnonToken(filePaths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (!filePaths.length) return urls
  const { result } = await withAnonToken(t => uploadApi.signReferences(filePaths, { headers: { 'x-anon-token': t } }))
  for (const item of result.items) urls.set(item.filePath, item.url)
  return urls
}
