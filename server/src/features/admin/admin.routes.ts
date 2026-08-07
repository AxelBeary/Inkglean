import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as platformService from '../platform/platform.service.js'
import * as adminService from './admin.service.js'
import * as orderService from '../order/order.service.js'
import { bindTotpInit, confirmTotpBind, resetTotp, verifyTotpLogin, isDevAuth } from '../auth/auth.service.js'
import { generateSecret, buildOtpAuthUri } from '../auth/totp.js'
import { publicArtistDTO } from '../../shared/dto.js'
import QRCode from 'qrcode'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { clamp } from '../../shared/validate.js'
import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 管理员路由 - 多画师管理
// ============================================

export default async function adminRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/admin/artists
   * 获取所有画师（含 isAdmin 标记）
   */
  fastify.get('/api/admin/artists', { preHandler: requireAdmin }, async () => {
    const adminQq = getAdminQq()
    // 安全加固批 F1: getAllArtists 已显式列（不含密钥），再经 DTO 双重防御
    return artistService.getAllArtists().map(a => ({
      ...publicArtistDTO(a),
      isAdmin: a.qq_number === adminQq
    }))
  })

  /**
   * POST /api/admin/artists
   * 添加新画师（可指定身份码）
   */
  fastify.post('/api/admin/artists', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'name', 'subdomain'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          subdomain: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[a-z0-9-]+$' },
          bio: { type: ['string', 'null'], maxLength: 500 },
          artistCode: { type: ['string', 'null'], maxLength: 10 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any, reply: any) => {
    const { qqNumber, name, subdomain, bio, artistCode } = request.body || {}

    // 子域名保留词黑名单（防止与系统路径冲突）
    const RESERVED = ['admin', 'api', 'www', 'uploads', 'static', 'login', 'assets', 'dashboard', 'app']
    if (RESERVED.includes(subdomain)) {
      return reply.code(400).send({ error: `子域名「${subdomain}」为系统保留词，请换一个` })
    }

    try {
      const artist = await artistService.createArtist({
        qqNumber,
        name: clamp(name, 'name')!,
        subdomain,
        bio: clamp(bio, 'bio'),
        artistCode
      })
      // F1 补全：createArtist 内部同样返回完整行（SELECT *）——响应壳走 DTO（前端零消费响应体）
      return publicArtistDTO(artist)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  /**
   * DELETE /api/admin/artists/:id
   * 移除画师（不能删除管理员账号）
   */
  fastify.delete('/api/admin/artists/:id', { preHandler: requireAdmin }, async (request: any, reply: any) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    if (artist.qq_number === getAdminQq()) {
      return reply.code(403).send({ error: '不能删除管理员账号。如需更换管理员，请使用「更换管理员」功能。' })
    }

    artistService.deleteArtist(request.params.id)
    return { success: true, message: `已移除画师 ${artist.name}` }
  })

  /**
   * GET /api/admin/artists/:id/orders
   * 查看指定画师的订单列表（支持分页）
   */
  fastify.get('/api/admin/artists/:id/orders', { preHandler: requireAdmin }, async (request: any, reply: any) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    const { page, pageSize } = request.query || {}
    const result = orderService.getArtistOrders(artist.id, undefined, {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize, 10) || 50, 200))
    })
    // B7: 补充 camelCase 付款字段 + 分期三态（管理端行展开用）
    result.items = result.items.map((o: any) => ({
      ...o,
      paidTotalCents: o.paid_total_cents ?? 0,
      finalPriceCents: o.final_price_cents ?? 0,
      installments: orderService.getOrderInstallments(o.id)
    }))
    return result
  })

  /**
   * PUT /api/admin/artists/:id/status
   * 修改画师主页状态
   */
  fastify.put('/api/admin/artists/:id/status', { preHandler: requireAdmin }, async (request: any, reply: any) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    const { status } = request.body || {}
    // BUG-8 第三项（用户拍板）：管理员可将画师设为 hidden（对外隐身）——与 updateArtist 白名单对齐
    if (!['open', 'full', 'break', 'hidden'].includes(status)) {
      return reply.code(400).send({ error: '无效状态' })
    }

    // F1 补全：写路径回显同样走 DTO——updateArtist 内部返回完整行（含 totp_secret）
    return publicArtistDTO(artistService.updateArtist(artist.id, { status }))
  })

  /**
   * POST /api/admin/artists/:id/totp/bind-init
   * REQ-027 R2 绑定第一步：生成 TOTP 密钥 + otpauth 二维码（管理员展示给画师扫码）
   * 密钥立即入库但未验证（verified=0）；重复调用 = 覆盖旧密钥，旧 App 绑定立即失效
   * DEV 模式（AUTH_DEV_MODE=true）附带 _dev_secret 明文辅助开发/测试/演示
   */
  fastify.post('/api/admin/artists/:id/totp/bind-init', { preHandler: requireAdmin }, async (request: any, reply: any) => {
    const artist = artistService.getArtistById(parseInt(request.params.id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    if (artist.deleted_at) return reply.code(400).send({ error: '画师已移除，无法绑定' })

    const secret = generateSecret()
    const otpauthUri = buildOtpAuthUri(secret, artist.qq_number)
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 })

    bindTotpInit(artist.id, secret)

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
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        },
        additionalProperties: false
      }
    }
  }, async (request: any, reply: any) => {
    const artist = artistService.getArtistById(parseInt(request.params.id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    if (!artist.totp_secret) return reply.code(400).send({ error: '请先生成绑定二维码' })

    try {
      confirmTotpBind(artist.id, request.body.code)
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
  fastify.post('/api/admin/artists/:id/totp/reset', { preHandler: requireAdmin }, async (request: any, reply: any) => {
    const artist = artistService.getArtistById(parseInt(request.params.id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    resetTotp(artist.id)
    return { success: true, message: `已重置画师「${artist.name}」的动态口令绑定，画师需重新绑定才能登录` }
  })

  /**
   * GET /api/admin/stats
   */
  fastify.get('/api/admin/stats', { preHandler: requireAdmin }, async () => {
    return adminService.getGlobalStats()
  })

  // ─── 回收站管理（事故修复：孤儿文件可恢复） ───

  /** GET /api/admin/recycle-bin — 列出回收站内容（REQ-022 F4：分页，movedAt 倒序） */
  fastify.get('/api/admin/recycle-bin', { preHandler: requireAdmin }, async (request: any) => {
    const { page, pageSize } = request.query || {}
    return adminService.listRecycleBinPaged(
      Math.max(1, parseInt(page, 10) || 1),
      Math.max(1, Math.min(parseInt(pageSize, 10) || 20, 100))
    )
  })

  /** DELETE /api/admin/recycle-bin — 清空回收站（不可恢复） */
  fastify.delete('/api/admin/recycle-bin', { preHandler: requireAdmin }, async () => {
    const count = adminService.emptyRecycleBin()
    return { success: true, deleted: count }
  })

  /**
   * POST /api/admin/transfer
   * 更换管理员账号（需要连续两次 TOTP 动态口令验证，REQ-027 替代旧登录码机制）
   * 1. 验证当前管理员的动态口令（证明你是管理员）
   * 2. 验证新管理员的动态口令（证明对方接受）
   * 双方均须已绑定 TOTP（未绑定 → 401 提示先绑定）
   * P1-F: 前置检查 + 整体事务化，任意一步失败全部回滚
   */
  fastify.post('/api/admin/transfer', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['newQq', 'currentCode', 'newCode'],
        additionalProperties: false,
        properties: {
          newQq: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          currentCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          newCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    const { newQq, currentCode, newCode } = request.body

    const currentAdminQq = getAdminQq()
    if (String(newQq) === currentAdminQq) {
      return reply.code(400).send({ error: '新管理员不能与当前管理员相同' })
    }

    // P1-F: 限流 + 画师存在性 + 不等于自己 —— 全部无副作用，放在验码前
    // P0-3 修复：增加 IP 维度限流，防止攻击者轮换 newQq 绕过单目标限流
    if (!rateLimit(`transfer-ip:${request.ip}`, 5, 15 * 60_000)) {
      return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
    }
    if (!rateLimit(`transfer:${newQq}`, 3, 15 * 60_000)) {
      return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
    }

    const newArtist = artistService.getArtistByQq(String(newQq))
    if (!newArtist) {
      return reply.code(404).send({ error: '该QQ号未注册为画师，请先添加画师' })
    }

    // 验码走 verifyTotpLogin（含防爆破计数，失败计数不被事务回滚）
    const currentResult = verifyTotpLogin(currentAdminQq, String(currentCode))
    if (!currentResult.valid) {
      return reply.code(401).send({ error: '验证失败，请确认当前管理员的动态口令' })
    }
    const newResult = verifyTotpLogin(String(newQq), String(newCode))
    if (!newResult.valid) {
      return reply.code(401).send({ error: '验证失败，请确认新管理员的动态口令（须先完成绑定）' })
    }
    // 两次验码均通过，原子更新配置
    db.transaction(() => {
      db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(String(newQq))
    })()

    return { success: true, newAdminName: newArtist.name, newAdminQq: String(newQq) }
  })

  // ─── 问候语管理 ───

  const greetingService = await import('../artist/greeting.service.js')

  /** GET /api/admin/greetings — 通用库列表 */
  fastify.get('/api/admin/greetings', { preHandler: requireAdmin }, async (request: any) => {
    return greetingService.getGlobalGreetings(request.query.slot)
  })

  /** POST /api/admin/greetings — 添加通用模板 */
  fastify.post('/api/admin/greetings', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] }
        }
      }
    }
  }, async (request: any) => {
    return greetingService.createGlobalGreeting(request.body)
  })

  /** PUT /api/admin/greetings/:id — 编辑通用模板 */
  fastify.put('/api/admin/greetings/:id', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] },
          isEnabled: { type: 'boolean' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    const result = greetingService.updateGreeting(parseInt(request.params.id), request.body)
    if (!result) return reply.code(404).send({ error: '模板不存在' })
    return result
  })

  /** DELETE /api/admin/greetings/:id — 删除通用模板 */
  fastify.delete('/api/admin/greetings/:id', { preHandler: requireAdmin }, async (request: any) => {
    greetingService.deleteGreeting(parseInt(request.params.id))
    return { success: true }
  })

  /** GET /api/admin/artists/:id/greetings — 画师专属库 */
  // BUG-8 修复：补画师存在性校验（与 POST 的 requireExistingArtist 对齐，不存在时 404 而非空列表）
  fastify.get('/api/admin/artists/:id/greetings', { preHandler: [requireAdmin, requireExistingArtist] }, async (request: any) => {
    return greetingService.getArtistGreetings(parseInt(request.params.id))
  })

  /** POST /api/admin/artists/:id/greetings — 为画师添加专属模板 */
  fastify.post('/api/admin/artists/:id/greetings', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] }
        }
      }
    }
  }, async (request: any) => {
    return greetingService.createArtistGreeting(parseInt(request.params.id), request.body)
  })

  /** PUT /api/admin/artists/:id/greetings/:gid — 编辑专属模板 */
  fastify.put('/api/admin/artists/:id/greetings/:gid', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] },
          isEnabled: { type: 'boolean' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    // H-6 修复：校验问候语归属 — 必须属于该画师
    const gid = parseInt(request.params.gid)
    const artistId = parseInt(request.params.id)
    const existing = db.prepare('SELECT id, artist_id FROM greeting_templates WHERE id = ?').get(gid) as { id: number; artist_id: number } | undefined
    if (!existing || existing.artist_id !== artistId) {
      return reply.code(404).send({ error: '模板不存在或不属于该画师' })
    }
    const result = greetingService.updateGreeting(gid, request.body)
    if (!result) return reply.code(404).send({ error: '模板不存在' })
    return result
  })

  /** DELETE /api/admin/artists/:id/greetings/:gid — 删除专属模板 */
  fastify.delete('/api/admin/artists/:id/greetings/:gid', { preHandler: requireAdmin }, async (request: any, reply: any) => {
    // H-6 修复：校验问候语归属 — 必须属于该画师
    const gid = parseInt(request.params.gid)
    const artistId = parseInt(request.params.id)
    const existing = db.prepare('SELECT id, artist_id FROM greeting_templates WHERE id = ?').get(gid) as { id: number; artist_id: number } | undefined
    if (!existing || existing.artist_id !== artistId) {
      return reply.code(404).send({ error: '模板不存在或不属于该画师' })
    }
    greetingService.deleteGreeting(gid)
    return { success: true }
  })

  // ─── 流程与比例管理 ───

  const workflowService = await import('../artist/workflow.service.js')

  /** GET /api/admin/default-workflow — 默认模板 */
  fastify.get('/api/admin/default-workflow', { preHandler: requireAdmin }, async () => {
    return workflowService.getDefaultTemplate()
  })

  /** PUT /api/admin/default-workflow — 更新默认模板 */
  fastify.put('/api/admin/default-workflow', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['nodes'], additionalProperties: false,
        properties: {
          nodes: {
            type: 'array', minItems: 1, maxItems: 30,
            items: {
              type: 'object', required: ['name'], additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 50 },
                description: { type: 'string', maxLength: 200 },
                takesPayment: { type: 'boolean' },
                basisPoints: { type: 'integer', minimum: 500, maximum: 10000 }
              }
            }
          }
        }
      }
    }
  }, async (request: any) => {
    return workflowService.updateDefaultTemplate(request.body.nodes)
  })

  /** POST /api/admin/default-workflow/reset — 重置出厂模板 */
  fastify.post('/api/admin/default-workflow/reset', { preHandler: requireAdmin }, async () => {
    return workflowService.resetDefaultTemplate()
  })

  /** GET /api/admin/artists/:id/workflow — 查看画师流程 */
  // BUG-8 修复：补画师存在性校验（不存在时 404 而非空 stages）
  fastify.get('/api/admin/artists/:id/workflow', { preHandler: [requireAdmin, requireExistingArtist] }, async (request: any) => {
    return { stages: workflowService.getWorkflow(parseInt(request.params.id)) }
  })

  /** POST /api/admin/artists/:id/workflow — 为画师添加节点 */
  fastify.post('/api/admin/artists/:id/workflow', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      body: {
        type: 'object', required: ['name'], additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 }
        }
      }
    }
  }, async (request: any) => {
    return workflowService.addStage(parseInt(request.params.id), request.body)
  })

  /** PUT /api/admin/artists/:id/workflow/:sid — 编辑画师节点 */
  fastify.put('/api/admin/artists/:id/workflow/:sid', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
          takesPayment: { type: 'boolean' },
          speechTemplate: { type: ['string', 'null'], maxLength: 500 },
          randomTemplate: { type: 'boolean' }
        }
      }
    }
  }, async (request: any) => {
    return workflowService.updateStage(parseInt(request.params.id), parseInt(request.params.sid), request.body)
  })

  /** DELETE /api/admin/artists/:id/workflow/:sid — 删除画师节点 */
  fastify.delete('/api/admin/artists/:id/workflow/:sid', { preHandler: requireAdmin }, async (request: any) => {
    return workflowService.deleteStage(parseInt(request.params.id), parseInt(request.params.sid))
  })

  /** PUT /api/admin/artists/:id/workflow/reorder — 画师节点排序 */
  fastify.put('/api/admin/artists/:id/workflow/reorder', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['orderedIds'], additionalProperties: false,
        properties: { orderedIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 } }
      }
    }
  }, async (request: any) => {
    return { stages: workflowService.reorderStages(parseInt(request.params.id), request.body.orderedIds) }
  })

  /** PUT /api/admin/artists/:id/workflow/payment — 画师比例保存 */
  fastify.put('/api/admin/artists/:id/workflow/payment', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['nodes'], additionalProperties: false,
        properties: {
          nodes: {
            type: 'array', maxItems: 20,
            items: {
              type: 'object', required: ['id', 'basisPoints'], additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                basisPoints: { type: 'integer', minimum: 500, maximum: 9500 }
              }
            }
          }
        }
      }
    }
  }, async (request: any) => {
    return { stages: workflowService.savePayment(parseInt(request.params.id), request.body.nodes) }
  })

  // ─── 画师全设置代理（管理员编辑任意画师） ───

  // H-5 修复：画师存在性校验 preHandler（4 个 POST 路由共用）
  async function requireExistingArtist(request: any, reply: any) {
    const a = artistService.getArtistById(request.params.id)
    if (!a || a.deleted_at) return reply.code(404).send({ error: '画师不存在' })
    request.targetArtist = a
  }

  // P2-7: 统一 params schema
  const intId = { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } }
  const intIdTid = { params: { type: 'object', properties: { id: { type: 'integer' }, tid: { type: 'integer' } }, required: ['id', 'tid'] } }
  const intIdAid = { params: { type: 'object', properties: { id: { type: 'integer' }, aid: { type: 'integer' } }, required: ['id', 'aid'] } }

  /** GET /api/admin/artists/:id/profile — 画师资料 */
  fastify.get('/api/admin/artists/:id/profile', { preHandler: requireAdmin, schema: intId }, async (request: any, reply: any) => {
    const a = artistService.getArtistById(request.params.id)
    if (!a) return reply.code(404).send({ error: '画师不存在' })
    // 安全加固批 F1: 完整行含 totp_secret，走 DTO 剔除敏感列
    return publicArtistDTO(a)
  })

  /** PUT /api/admin/artists/:id/profile — 更新画师资料（P1-2: 字段白名单） */
  fastify.put('/api/admin/artists/:id/profile', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          bio: { type: 'string', maxLength: 500 },
          status: { type: 'string', enum: ['open', 'full', 'break', 'hidden'] },
          artist_code: { type: 'string', maxLength: 10 },
          contact_qq: { type: 'string', maxLength: 15 },
          weibo_url: { type: 'string', maxLength: 300 },
          bilibili_url: { type: 'string', maxLength: 300 },
          notify_enabled: { type: 'boolean' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    const a = artistService.getArtistById(request.params.id)
    if (!a) return reply.code(404).send({ error: '画师不存在' })
    // F1 补全：写路径回显同样走 DTO——updateArtist 内部返回完整行（含 totp_secret）
    return publicArtistDTO(artistService.updateArtist(a.id, request.body))
  })

  /** GET /api/admin/artists/:id/tiers — 档位列表 */
  fastify.get('/api/admin/artists/:id/tiers', { preHandler: requireAdmin, schema: intId }, async (request: any) => {
    return artistService.getTiers(request.params.id)
  })

  /** POST /api/admin/artists/:id/tiers — 创建档位（P1-3: schema） */
  fastify.post('/api/admin/artists/:id/tiers', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['name', 'price'], additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          price: { type: 'number', minimum: 0 },
          description: { type: 'string', maxLength: 500 },
          work_days: { type: 'integer', minimum: 0 },
          example_image: { type: 'string', maxLength: 300 }
        }
      }
    }
  }, async (request: any) => {
    return artistService.createTier(request.params.id, request.body)
  })

  /** PUT /api/admin/artists/:id/tiers/:tid — 更新档位（P1-3 + P1-4） */
  fastify.put('/api/admin/artists/:id/tiers/:tid', {
    preHandler: requireAdmin,
    schema: {
      ...intIdTid,
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          price: { type: 'number', minimum: 0 },
          description: { type: 'string', maxLength: 500 },
          work_days: { type: 'integer', minimum: 0 },
          example_image: { type: 'string', maxLength: 300 },
          sort_order: { type: 'integer' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    // P1-4: 校验归属
    const tiers = artistService.getTiers(request.params.id)
    if (!tiers.some(t => t.id === request.params.tid)) return reply.code(404).send({ error: '档位不属于该画师' })
    return artistService.updateTier(request.params.tid, request.body)
  })

  /** DELETE /api/admin/artists/:id/tiers/:tid — 删除档位（P1-4） */
  fastify.delete('/api/admin/artists/:id/tiers/:tid', { preHandler: requireAdmin, schema: intIdTid }, async (request: any, reply: any) => {
    const tiers = artistService.getTiers(request.params.id)
    if (!tiers.some(t => t.id === request.params.tid)) return reply.code(404).send({ error: '档位不属于该画师' })
    artistService.deleteTier(request.params.tid)
    return { success: true }
  })

  /** GET /api/admin/artists/:id/artworks — 作品列表 */
  fastify.get('/api/admin/artists/:id/artworks', { preHandler: requireAdmin, schema: intId }, async (request: any) => {
    return artistService.getArtworks(request.params.id)
  })

  /** POST /api/admin/artists/:id/artworks — 添加作品（P1-3） */
  fastify.post('/api/admin/artists/:id/artworks', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['imagePath'], additionalProperties: false,
        properties: {
          imagePath: { type: 'string', minLength: 1, maxLength: 300 },
          title: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request: any) => {
    // H-3 修复：路径归属校验（对齐画师端 POST /api/artist/artworks）
    const { imagePath, title } = request.body
    if (imagePath.includes('..') || !imagePath.startsWith(`images/${request.params.id}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }
    return artistService.createArtwork(request.params.id, { imagePath, title })
  })

  /** DELETE /api/admin/artists/:id/artworks/:aid — 删除作品（P1-4） */
  fastify.delete('/api/admin/artists/:id/artworks/:aid', { preHandler: requireAdmin, schema: intIdAid }, async (request: any, reply: any) => {
    const artworks = artistService.getArtworks(request.params.id)
    if (!artworks.some(a => a.id === request.params.aid)) return reply.code(404).send({ error: '作品不属于该画师' })
    artistService.deleteArtwork(request.params.aid)
    return { success: true }
  })

  /** GET /api/admin/artists/:id/rules — 须知 */
  fastify.get('/api/admin/artists/:id/rules', { preHandler: requireAdmin, schema: intId }, async (request: any) => {
    return artistService.getRules(request.params.id)
  })

  /** PUT /api/admin/artists/:id/rules — 更新须知 */
  fastify.put('/api/admin/artists/:id/rules', {
    // BUG-8 修复：补画师存在性校验（不存在时 404，而非静默 0 行 UPDATE 返回 200 空 body）
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['content'], additionalProperties: false,
        properties: { content: { type: 'string', maxLength: 10000 } }
      }
    }
  }, async (request: any) => {
    return artistService.updateRules(request.params.id, request.body.content)
  })

  // ============================================
  // REQ-022 F2: 社交平台 CRUD（管理端）
  // ============================================

  /** 平台 body schema 公共属性（snake_case，与 admin 端其余接口一致） */
  const platformBodyProps = {
    name: { type: 'string', minLength: 1, maxLength: 30 },
    icon_key: { type: ['string', 'null'], maxLength: 50 },
    fallback_char: { type: ['string', 'null'], maxLength: 4 },
    match_domains: {
      type: 'array', maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 100 }
    },
    sort_order: { type: 'integer', minimum: 0, maximum: 9999 },
    enabled: { type: 'boolean' }
  }

  /** GET /api/admin/platforms — 全量平台（含停用） */
  fastify.get('/api/admin/platforms', { preHandler: requireAdmin }, async () => {
    return platformService.getAllPlatforms()
  })

  /** POST /api/admin/platforms — 新增平台 */
  fastify.post('/api/admin/platforms', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['name'], additionalProperties: false,
        properties: platformBodyProps
      }
    }
  }, async (request: any, reply: any) => {
    try {
      const platform = platformService.createPlatform(request.body || {})
      return reply.code(201).send(platform)
    } catch (err: any) {
      return reply.code(err.statusCode || 400).send({ code: err.code || 'UNKNOWN', error: err.message })
    }
  })

  /** PUT /api/admin/platforms/:id — 更新平台（部分字段合并语义） */
  fastify.put('/api/admin/platforms/:id', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object', additionalProperties: false,
        properties: platformBodyProps
      }
    }
  }, async (request: any, reply: any) => {
    try {
      return platformService.updatePlatform(request.params.id, request.body || {})
    } catch (err: any) {
      return reply.code(err.statusCode || 400).send({ code: err.code || 'UNKNOWN', error: err.message })
    }
  })

  /** DELETE /api/admin/platforms/:id — 删除平台（引用该平台的链接归「其他」，不级联删链接） */
  fastify.delete('/api/admin/platforms/:id', { preHandler: requireAdmin, schema: intId }, async (request: any, reply: any) => {
    try {
      const { reattributed } = platformService.deletePlatform(request.params.id)
      return { success: true, reattributed }
    } catch (err: any) {
      return reply.code(err.statusCode || 400).send({ code: err.code || 'UNKNOWN', error: err.message })
    }
  })
}
