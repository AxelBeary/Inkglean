/**
 * 参考图上传的匿名凭证统一链路（G-7 / F-10 契约）
 *
 * 背景（817-B2 调查结论）：参考图上传接口要求携带有效 x-anon-token，
 * 本地缓存的凭证可能已过期/被服务端回收（anon_tokens 30 天 TTL / GC / 库重建），
 * 直接上传会收到 INVALID_ANON_TOKEN——此前各调用方只 await 一次凭证就上传，
 * 失效凭证不会自动换新，公网用户便看到「缺少有效匿名凭证」。
 *
 * 本函数统一：
 * 1. 上传前 await 凭证（确保凭证先于请求就绪）；
 * 2. 服务端判 INVALID_ANON_TOKEN 时清缓存换新凭证并重试一次；
 * 3. 返回实际成功的 token（下单提交必须使用同一 token 才能通过归属校验）。
 */
import { getAnonToken, getFreshAnonToken } from './track.js'
import { uploadApi } from '../api/index.js'
import type { UploadImageResult } from '../api/types.js'

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
 * 携带有效匿名凭证上传参考图。
 * @param {Blob} file 上传文件
 * @returns {Promise<{ token: string, uploaded: import('../api/index.js').UploadImageResult }>}
 *   成功时返回 { token, uploaded }；token 为本次上传实际使用的凭证（下单归属校验同源）。
 * @throws {AnonTokenUnavailableError} 凭证获取失败（不发上传请求）
 * @throws {Error} 上传失败（INVALID_ANON_TOKEN 换新重试一次后仍失败则抛原始错误）
 */
export async function uploadReferenceWithAnonToken(file: Blob): Promise<{ token: string, uploaded: UploadImageResult }> {
  let token = await getAnonToken()
  if (!token) {
    throw new AnonTokenUnavailableError()
  }
  try {
    const uploaded = await uploadApi.reference(file, { headers: { 'x-anon-token': token } })
    return { token, uploaded }
  } catch (err) {
    // 缓存凭证失效：换新凭证重试一次（不重试其他错误，避免掩盖真实失败）
    const errCode = err instanceof Error ? (err as Error & { code?: unknown }).code : undefined
    if (!err || errCode !== 'INVALID_ANON_TOKEN') throw err
    const freshToken = await getFreshAnonToken()
    if (!freshToken) throw err
    const uploaded = await uploadApi.reference(file, { headers: { 'x-anon-token': freshToken } })
    return { token: freshToken, uploaded }
  }
}
