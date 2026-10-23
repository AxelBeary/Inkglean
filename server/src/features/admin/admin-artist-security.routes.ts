import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import { bindTotpInit, confirmTotpBind, resetTotp, isDevAuth } from '../auth/auth.service.js'
import { listDesktopDevices, revokeDesktopDevice } from '../auth/devices.service.js'
import { generateSecret, buildOtpAuthUri } from '../auth/totp.js'
import QRCode from 'qrcode'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { intId, intIdDid } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 画师二次因子与桌面设备（TOTP 绑定/确认/重置 + 桌面端设备清单/踢出）
// （从 admin.routes.ts 拆出，F-09 巨型文件清偿；纯搬移，端点与行为零变更）
// ============================================

export async function adminArtistSecurityRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/admin/artists/:id/totp/bind-init
   * REQ-027 R2 绑定第一步：生成 TOTP 密钥 + otpauth 二维码（管理员展示给画师扫码）
   * 密钥立即入库但未验证（verified=0）；重复调用 = 覆盖旧密钥，旧 App 绑定立即失效
   * DEV 模式（AUTH_DEV_MODE=true）附带 _dev_secret 明文辅助开发/测试/演示
   */
  fastify.post('/api/admin/artists/:id/totp/bind-init', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    if (artist.deleted_at) return reply.code(400).send({ error: '画师已移除，无法绑定' })

    // GHSA-6pf3-g4xq-854w Wave1（S3）自指守卫：管理员的 TOTP 是「平台是否已初始化」的判据本体
    //（isSetupCompleted 看 admin 行 totp_verified，setup.service.ts）——bind-init 置 verified=0 并
    // bump token_version，管理员若对自己行调用，isSetupCompleted() 即刻 false，生产环境 REQ-038
    // 守门（app.ts）全站 503；且管理员未绑定会话被 requireAdmin 先行 401，连 bind-confirm 都调不了
    // → 只能改库的死锁。守卫口径对齐删除/封禁自守卫（admin-artist.routes.ts / compliance.routes.ts），
    // 管理员换绑自己的验证器请走画师端自助重绑入口（/api/auth/totp/rebind-init|rebind-confirm）。
    if (artist.qq_number === getAdminQq()) {
      return reply.code(403).send({ code: 'ADMIN_TOTP_SELF_FORBIDDEN', error: '不能对管理员账号执行此操作，请走自助换绑入口' })
    }

    const secret = generateSecret()
    const otpauthUri = buildOtpAuthUri(secret, artist.qq_number)
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 })

    bindTotpInit(artist.id, secret)
    // 会话门禁批：重绑下发后画师即刻进入未绑定态（verified=0），未绑定画师不允许持有任何有效会话——
    // 对该画师 token_version +1 瞬间踢掉其全部既有会话。bump 故意放在路由层而非 bindTotpInit 函数内：
    // bindTotpInit 还被邀请注册/开箱设置/自助重绑复用，那些路径要么无会话、要么绝不能踢画师自己。
    artistService.bumpTokenVersion(artist.id)

    return {
      qrDataUrl,
      otpauthUri,
      ...(isDevAuth ? { _dev_secret: secret } : {})
    }
  })

  /**
   * POST /api/admin/artists/:id/totp/bind-confirm
   * REQ-027 R2 绑定第二步：管理员输入画师报的 6 位动态码，验证通过后完成绑定
   */
  fastify.post('/api/admin/artists/:id/totp/bind-confirm', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    // L-12（审计 九#5）: 与 bind-init 同款软删除检查——已移除画师不得走绑定确认
    if (artist.deleted_at) return reply.code(400).send({ error: '画师已移除，无法绑定' })
    if (!artist.totp_secret) return reply.code(400).send({ error: '请先生成绑定二维码' })

    try {
      confirmTotpBind(artist.id, (request.body as { code: string }).code)
    } catch (err) {
      if (err instanceof AppError && err.code === E.TOTP_BIND_INVALID) {
        return reply.code(400).send({ code: E.TOTP_BIND_INVALID, error: '动态口令错误，请让画师确认验证器上当前显示的 6 位码' })
      }
      throw err
    }

    return { success: true, message: `画师「${artist.name}」已绑定动态口令` }
  })

  /**
   * POST /api/admin/artists/:id/totp/reset
   * REQ-027 R5 恢复方案：管理员重置画师绑定，旧密钥立即失效，画师须重新绑定才能登录
   */
  fastify.post('/api/admin/artists/:id/totp/reset', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    // L-12（审计 九#5）: 与 bind-init 同款软删除检查——已移除画师不得重置 TOTP
    if (artist.deleted_at) return reply.code(400).send({ error: '画师已移除，无法绑定' })

    // GHSA-6pf3-g4xq-854w Wave1（S3）自指守卫：与 bind-init 同款。resetTotp 把 totp_secret 清 NULL
    // 且 verified=0——管理员对自己行调用是「先全站 503、后无法自助恢复」的双杀（reset 后连
    // rebind-init 的前置态都没有密钥可校验），只能改库。管理员自助通道一律禁用此端点。
    if (artist.qq_number === getAdminQq()) {
      return reply.code(403).send({ code: 'ADMIN_TOTP_SELF_FORBIDDEN', error: '不能对管理员账号执行此操作，请走自助换绑入口' })
    }

    resetTotp(artist.id)
    return { success: true, message: `已重置画师「${artist.name}」的动态口令绑定，画师需重新绑定才能登录` }
  })

  // ─── 桌面端设备管理（REQ-014 登录方案：后台可见已绑定设备清单，支持单台踢出） ───
  // 记账式会话（安全口径一/方案 A，v73）：清单=读账，踢人=撕账；
  // step-up 守卫由 registerAdminStepUpHooks 自动追加在 requireAdmin 之后（与全部 /api/admin 路由同口径）。

  /**
   * GET /api/admin/artists/:id/devices
   * 桌面设备账本清单（按最近活跃倒序）；含来源 IP（同登录留痕口径，仅管理端可见）
   */
  fastify.get('/api/admin/artists/:id/devices', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    return listDesktopDevices(artist.id)
  })

  /**
   * DELETE /api/admin/artists/:id/devices/:deviceId
   * 单台踢出（换机/被盗场景）= 撕账：桌面 token 下次请求即被门禁拒绝（DEVICE_REVOKED）。
   * 不动 token_version——网页会话与其余桌面设备不受影响（全端踢人另有 resetTotp/bumpTokenVersion 口径）。
   */
  fastify.delete('/api/admin/artists/:id/devices/:deviceId', { preHandler: requireAdmin, schema: intIdDid }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string; deviceId: string }
    const artist = artistService.getArtistById(Number(params.id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    if (!revokeDesktopDevice(artist.id, Number(params.deviceId))) {
      return reply.code(404).send({ error: '设备不存在或已被移除' })
    }
    return { success: true }
  })
}
