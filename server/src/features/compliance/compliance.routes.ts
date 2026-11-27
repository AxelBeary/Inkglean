import * as complianceService from './compliance.service.js'
// v86（事件流水幕布步 1）：举报提交落流水（匿名但有后果的动作）
import { recordEvent, ACTIONS } from '../activity/activity.service.js'
import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { E } from '../../shared/errors.js'
import * as artistService from '../artist/artist.service.js'
// R-2 抽取：CSV 出口口径（含公式注入中和）与收入导出共用 shared/csv.ts 单一事实源
import { csvHeader, csvLine, CSV_BOM, CSV_CONTENT_TYPE, CSV_CRLF } from '../../shared/csv.js'
import { localDateRangeToUtc } from '../../utils/date.js'
import { Readable } from 'stream'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 合规与内容安全路由（REQ-042）
// 公开：举报提交（限流对齐留言：同 IP 每分钟 2 条）
// 管理端：举报列表/处理、内容下架/恢复、主页下架/恢复、画师封禁/解封、留痕查看
//        （均写 admin_actions 留痕）
// v75（P4 后端批）：上述写动作一律把 request.ip 透传进 service 落 admin_ip / report_ip
//        （取 IP 口径见 docs/OPS.md §12.1 与 tests/cf-real-ip.test.ts：CF→Caddy 已在反代层
//         换算真实用户 IP，后端只信 request.ip，不读裸 CF-Connecting-IP 头）
// ============================================

/** 本地日历日的形态约束（R-2 导出时间范围用；历法合法性由 utils/date 的 assertLocalDateString 兜底） */
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$'

export default async function complianceRoutes(fastify: FastifyInstance) {

  // REQ-041 + d2 猎杀修复（2026-08-14）：本插件内 /api/admin/reports、/api/admin/content/* 补挂 step-up 入口级守卫
  //（onRoute 按 url 前缀过滤，/api/public/reports 不受影响）；此前漏挂致 basic 会话可直操举报处理/内容下架
  // v75/v76 新增的 /api/admin/admin-actions、/api/admin/artists/:id/home-takedown、
  // /api/admin/artists/:id/home-restore、/api/admin/content/artwork/:id/restore 同样写在本插件内，
  // 因此自动继承该守卫——registerAdminStepUpHooks 是 onRoute 钩子，按 routeOptions.url.startsWith('/api/admin')
  // 匹配（shared/middleware/step-up.ts:86）；新管理口若挪出本文件或不挂 requireAdmin，就会漏 step-up（d2 同类病）
  registerAdminStepUpHooks(fastify)

  /** 举报类型白名单 */
  const REPORT_TYPES = ['artist_home', 'artwork', 'message', 'other']

  /** 留痕 action 白名单（?action= 精确筛用；非法值忽略筛选返回全量，与全站列表惯例一致） */
  const ADMIN_ACTIONS = [
    'report_resolve', 'content_remove', 'content_restore',
    'artist_ban', 'artist_unban', 'home_takedown', 'home_restore',
    'artist_status_set', 'artist_remove',
    // GHSA-6pf3 S3：画师资料更新已写留痕，白名单漏它会让 ?action= 精确筛不到
    'artist_profile_update', 'delivery_link_reissue',
    // B7-F0111：更换管理员（admin_qq）已写留痕，同步登记白名单
    'admin_transfer',
    // R-2：导出留痕自身也写一条 admin_action，若不登记白名单，
    // ?action=admin_actions_export 精确筛不到「谁导出过」（同 GHSA-6pf3 S3 漏登教训）
    'admin_actions_export'
  ]

  /** 导出列序（表头与数据行同源，改列只改这一处） */
  const ADMIN_ACTIONS_EXPORT_COLUMNS = [
    'id', 'created_at', 'admin_id', 'action', 'target_type', 'target_id', 'admin_ip', 'reason'
  ] as const

  /**
   * 列表与导出共用的筛选构造（同口径才不会「列表看到的」和「导出的」对不上）。
   * 白名单外（含拼错）→ 忽略该筛选条件而非 400：管理页筛选器不该因为一个脏参数就整页报错。
   */
  function buildActionFilters(q: {
    action?: string; targetType?: string; targetId?: number
    adminId?: number; from?: string; to?: string
  }): complianceService.AdminActionFilters {
    const filters: complianceService.AdminActionFilters = {}
    if (q.action && ADMIN_ACTIONS.includes(q.action)) filters.action = q.action
    // targetType 单列即类型粗筛（issue #49-2）；与 targetId 同给则精确到对象。形态非法由 schema 直接 400，不静默忽略
    if (q.targetType) {
      filters.targetType = q.targetType
      if (Number.isFinite(q.targetId)) filters.targetId = q.targetId
    }
    if (Number.isFinite(q.adminId)) filters.adminId = q.adminId
    if (q.from && q.to) {
      // 时间区间在此**同步校验**（历法合法性 + 反向区间），不能等到流里才炸：
      // 导出是流式响应，一旦开始写头就晚了——错误会变成「响应中途被销毁」，
      // 调用方拿到的是半截连接而不是 400。故先校验、再写留痕、最后才开流。
      localDateRangeToUtc(q.from, q.to)
      filters.from = q.from
      filters.to = q.to
    }
    return filters
  }

  /** 导出留痕的 reason：写清筛选口径，事后复盘才知道「这次导出的是哪一段」 */
  function describeExportScope(q: {
    action?: string; targetType?: string; targetId?: number
    adminId?: number; from?: string; to?: string
  }): string {
    const parts: string[] = []
    if (q.from && q.to) parts.push(`时间 ${q.from}~${q.to}`)
    if (q.action) parts.push(`动作 ${q.action}`)
    if (q.targetType) parts.push(q.targetId != null ? `对象 ${q.targetType}#${q.targetId}` : `类型 ${q.targetType}`)
    if (q.adminId != null) parts.push(`管理员 #${q.adminId}`)
    return parts.length ? `导出留痕：${parts.join('，')}` : `导出留痕：全量`
  }

  /**
   * 导出流：BOM + 表头 + 逐批数据行，按需产出（``_read`` 拉一批吐一批）。
   *
   * 为什么用 Readable 而不是拼字符串/写 reply.raw：
   * - 拼字符串：命中数十万行时结果集与拼接副本同时在内存里，导出一次就是一次内存尖峰；
   * - 直写 reply.raw：绕过 fastify 的背压管理，慢客户端（下载到一半限速/挂起）会让
   *   Node 的写缓冲无限增长。
   * Readable 交给 fastify pipe 后由 socket 的 highWaterMark 反向施加背压，客户端慢则产得慢。
   *
   * 读库仍是同步 better-sqlite3——单批 500 行的查询是毫秒级，不构成事件循环压力；
   * 分页本身（而不是异步 IO）才是这里要解决的内存问题。
   */
  function csvRowsStream(filters: complianceService.AdminActionFilters): Readable {
    let cursor: { createdAt: string; id: number } | null = null
    let sentHeader = false
    let done = false
    return new Readable({
      read() {
        if (done) { this.push(null); return }
        try {
          if (!sentHeader) {
            sentHeader = true
            this.push(CSV_BOM + csvHeader(ADMIN_ACTIONS_EXPORT_COLUMNS) + CSV_CRLF)
          }
          const batch = complianceService.getAdminActionsPage(filters, cursor)
          if (batch.length === 0) {
            done = true
            this.push(null)
            return
          }
          this.push(batch.map(row => csvLine([
            row.id, row.created_at, row.admin_id, row.action,
            row.target_type, row.target_id, row.admin_ip, row.reason
          ])).join(CSV_CRLF) + CSV_CRLF)
          const lastRow = batch[batch.length - 1]
          cursor = { createdAt: lastRow.created_at, id: lastRow.id }
          // 不足一批 = 已到末尾；下一轮 read() 会走到 batch.length === 0 或这里提前收尾
          if (batch.length < complianceService.ADMIN_ACTIONS_EXPORT_BATCH) {
            done = true
            this.push(null)
          }
        } catch (err) {
          // 导出中途读库失败：把错误交给流销毁（fastify 会中断响应），
          // 不吞成「半份 CSV 当完整文件下发」——半份账本比没有更危险。
          this.destroy(err as Error)
        }
      }
    })
  }

  /** 导出文件名：带时间戳与筛选标记，避免多次导出互相覆盖（文件名只含安全字符，不进 header 注入面） */
  function buildExportFilename(q: {
    from?: string; to?: string
  }): string {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const range = q.from && q.to ? `-${q.from.replace(/-/g, '')}-${q.to.replace(/-/g, '')}` : ''
    return `admin-actions${range}-${stamp}.csv`
  }

  /**
   * POST /api/public/reports
   * 页脚统一举报入口（匿名可提交；targetId 可选）
   */
  fastify.post('/api/public/reports', {
    schema: {
      body: {
        type: 'object',
        required: ['targetType', 'description'],
        properties: {
          targetType: { type: 'string', enum: REPORT_TYPES },
          targetId: { type: ['integer', 'null'], minimum: 1 },
          description: { type: 'string', minLength: 1, maxLength: 1000 },
          contact: { type: ['string', 'null'], maxLength: 100 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // 对齐留言提交限流强度（同 IP 每分钟 2 条）
    if (!rateLimit(`report:${request.ip}`, 2, 60_000)) {
      return reply.code(429).send({ code: E.RATE_LIMITED, error: '操作过于频繁，请稍后再试' })
    }
    const body = request.body as { targetType: string; targetId?: number | null; description: string; contact?: string | null }
    const report = complianceService.createReport({
      targetType: body.targetType,
      targetId: body.targetId ?? null,
      description: body.description,
      contact: body.contact ?? null,
      // v75 取证 IP：同一个值刚用于限流（限流用完即丢，落库后才谈得上事后追溯），直接复用
      reportIp: request.ip
    })
    // v86（事件流水幕布步 1）：举报提交进交易/上传线流水。
    // actor_kind='anon'：举报匿名可提交，**这是「匿名但有后果」的动作**，不属于 D3=B 排除的
    // 访客浏览范围；actor_id 记 anon_id（未登录留 NULL，不伪造主体）。
    recordEvent({
      actorKind: 'anon',
      actorId: null,
      ip: request.ip,
      action: ACTIONS.reportSubmit,
      targetType: 'report',
      targetId: report?.id ?? null,
      meta: { targetType: body.targetType, targetId: body.targetId ?? null },
      outcome: 'ok'
    })
    return reply.code(201).send({ id: report?.id })
  })

  // ─── 管理端（requireAdmin） ───

  /** 统一整数路径参数 schema（对齐 admin.routes 范式） */
  const intId = { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } }

  /**
   * GET /api/admin/reports
   * 举报列表（?status=pending|resolved 筛选；不传 = 全部，时间倒序）
   */
  fastify.get('/api/admin/reports', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'resolved'] }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const { status } = (request.query as { status?: string }) || {}
    return complianceService.getReports(status)
  })

  /**
   * GET /api/admin/admin-actions
   * 管理动作留痕查看入口（v75 补 IP 后才算真正能用：账本可查来源）
   * ?limit=（默认 100，service 钳制 1~500）、?action=（白名单精确筛）、
   * ?targetType=（类型粗筛，形态受限）、?targetType= + ?targetId=（精确到对象，走索引 idx_admin_actions_target）
   * 鉴权边界：admin_ip 只在本前缀下出现，任何非 /api/admin 响应不得带出（P4-1 §5）
   */
  fastify.get('/api/admin/admin-actions', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          // 刻意不设 maximum：超上限由 service 钳制（传 9999 得到 500 条），与全站列表惯例一致
          limit: { type: 'integer' },
          action: { type: 'string' },
          targetType: { type: 'string', maxLength: 32, pattern: '^[A-Za-z0-9_-]*$' },
          targetId: { type: 'integer' },
          // R-2：列表与导出共用筛选口径（页面上筛什么，导出的就是什么）
          adminId: { type: 'integer', minimum: 1 },
          from: { type: 'string', pattern: DATE_PATTERN },
          to: { type: 'string', pattern: DATE_PATTERN }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const q = (request.query as {
      limit?: number; action?: string; targetType?: string; targetId?: number
      adminId?: number; from?: string; to?: string
    }) || {}
    const filters = buildActionFilters(q)
    if (Number.isFinite(q.limit)) filters.limit = q.limit
    return {
      rows: complianceService.getAdminActions(filters),
      total: complianceService.countAdminActions(filters)
    }
  })

  /**
   * GET /api/admin/admin-actions/export
   * 管理动作留痕导出（CSV）——R-2（2026-11-28）
   *
   * 查询参数与列表口同口径：action（白名单精确筛）/ targetType(+targetId) / adminId / from+to
   *（时间范围按**本地日历日**，闭区间两端；内部换算成 UTC 半开窗口）。
   *
   * 三重防线（缺一不可）：
   * 1) requireAdmin —— 非管理员 403，未登录 401；
   * 2) 本插件 registerAdminStepUpHooks 自动给 /api/admin 前缀挂 step-up（未升级 401 STEP_UP_REQUIRED）；
   * 3) **导出动作本身写一条 admin_action 留痕**——「谁把留痕导出去了」必须与被导出的动作同账本可查，
   *    否则导出就是一条绕过审计的数据外带通道。
   *
   * 流式实现：上游分页（keyset 游标，见 service.getAdminActionsPage），下行逐批写入 reply.raw。
   * 不一次性拼出整个字符串——命中数十万行时那样会把结果集和拼接副本同时堆在内存里。
   */
  fastify.get('/api/admin/admin-actions/export', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          targetType: { type: 'string', maxLength: 32, pattern: '^[A-Za-z0-9_-]*$' },
          targetId: { type: 'integer' },
          adminId: { type: 'integer', minimum: 1 },
          from: { type: 'string', pattern: DATE_PATTERN },
          to: { type: 'string', pattern: DATE_PATTERN }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query as {
      action?: string; targetType?: string; targetId?: number
      adminId?: number; from?: string; to?: string
    }) || {}
    // from/to 必须成对：只给一端会让「导出哪个区间」变成隐式推断（全表 or 端点），
    // 而这份文件是拿去举证用的，区间必须由调用者显式说清。
    if ((q.from && !q.to) || (!q.from && q.to)) {
      return reply.code(400).send({ code: E.VALIDATION, error: 'from 与 to 必须同时提供' })
    }
    const filters = buildActionFilters(q)

    // 留痕先写：即使后续导出中途失败，「有人尝试导出」这个事实也已入账。
    // reason 记录筛选口径而非一句「导出了」——事后复盘要知道导的是哪一段。
    complianceService.writeAdminAction(
      request.artist.id,
      'admin_actions_export',
      'admin_action',
      0,
      describeExportScope(q),
      request.ip
    )

    const filename = buildExportFilename(q)
    reply.header('Content-Type', CSV_CONTENT_TYPE)
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    // 审计类导出不允许被中间层缓存（CDN/反代），否则同一份留痕可能被非管理员从缓存取到
    reply.header('Cache-Control', 'no-store')

    // 响应体是 Readable：fastify 会把它 pipe 到 socket，批次产出 → 立刻发出，
    // 内存里任何时候只有一批（ADMIN_ACTIONS_EXPORT_BATCH 行）的字符串。
    // 不用 reply.send(大字符串)——那会把整份 CSV 连同中间拼接副本一起堆进常驻内存。
    return reply.send(csvRowsStream(filters))
  })

  /**
   * POST /api/admin/reports/:id/resolve
   * 标记举报已处理（写 admin_actions 留痕；reason 可选）
   */
  fastify.post('/api/admin/reports/:id/resolve', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: ['string', 'null'], maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const reportId = Number((request.params as { id: string }).id)
    const { reason } = (request.body as { reason?: string | null }) || {}
    const report = complianceService.resolveReport(reportId, request.artist.id, reason, request.ip)
    if (!report) return reply.code(404).send({ error: '举报不存在' })
    return { success: true, report }
  })

  /**
   * POST /api/admin/content/:type/:id/remove
   * 内容下架（v76 起 type=artwork = 置 takedown_at，行保留可恢复；type=message = 管理员软删除）；写留痕
   */
  fastify.post('/api/admin/content/:type/:id/remove', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['artwork', 'message'] },
          id: { type: 'integer' }
        },
        required: ['type', 'id']
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: ['string', 'null'], maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { type, id } = request.params as { type: 'artwork' | 'message'; id: string }
    const { reason } = (request.body as { reason?: string | null }) || {}
    const result = complianceService.removeContent(type, Number(id), request.artist.id, reason, request.ip)
    if (!result.success) return reply.code(404).send({ error: '内容不存在或已删除' })
    // already：幂等回显（已下架再点不重复记账），前端据此提示「该作品已处于下架态」
    return { success: true, ...(result.already ? { already: true } : {}) }
  })

  /**
   * POST /api/admin/content/artwork/:id/restore
   * 解除作品下架（v76 与 remove 成对；行一直在，恢复后直接回到公开端）；写留痕 content_restore
   */
  fastify.post('/api/admin/content/artwork/:id/restore', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: ['string', 'null'], maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artworkId = Number((request.params as { id: string }).id)
    const { reason } = (request.body as { reason?: string | null }) || {}
    const result = complianceService.restoreContent(artworkId, request.artist.id, reason, request.ip)
    if (!result.success) return reply.code(404).send({ error: '作品不存在' })
    return { success: true }
  })

  /**
   * POST /api/admin/artists/:id/home-takedown | /home-restore
   * 主页内容级下架/恢复（v76）：只动 artists.home_takedown_at/_reason，
   * **不 bump token_version、不动 is_banned / status**——处置阶梯「警告 → 内容下架 → 封禁」的中间格，
   * 画师要能登进后台看原因并整改（区别于 ban：ban 连人踢出且拒登录）
   */
  for (const [path, isTakedown, actionLabel] of [
    ['home-takedown', true, '下架'],
    ['home-restore', false, '恢复']
  ] as Array<[string, boolean, string]>) {
    fastify.post(`/api/admin/artists/:id/${path}`, {
      preHandler: requireAdmin,
      schema: {
        ...intId,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: ['string', 'null'], maxLength: 500 }
          }
        }
      }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const artistId = Number((request.params as { id: string }).id)
      const artist = artistService.getArtistById(artistId)
      if (!artist) return reply.code(404).send({ error: '画师不存在' })
      const { reason } = (request.body as { reason?: string | null }) || {}
      if (isTakedown) {
        if (artist.qq_number === getAdminQq()) {
          // 与 ban 同口径（见本文件 :160 附近的封禁守卫）：管理员账号不可被主页下架，防锁死平台
          return reply.code(403).send({ error: `不能${actionLabel}管理员账号` })
        }
        const result = complianceService.takedownArtistHome(artistId, request.artist.id, reason, request.ip)
        if (!result.success) return reply.code(404).send({ error: '画师不存在' })
        // 幂等：已是下架态回 200 + already，且不重复写留痕
        return result.already ? { success: true, already: true } : { success: true }
      }
      const result = complianceService.restoreArtistHome(artistId, request.artist.id, reason, request.ip)
      if (!result.success) return reply.code(404).send({ error: '画师不存在' })
      return { success: true }
    })
  }

  /**
   * POST /api/admin/artists/:id/ban | /unban
   * 封禁/解封（is_banned 独立态；封禁即踢下线）；写留痕
   */
  for (const [path, banned, actionLabel] of [
    ['ban', true, '封禁'],
    ['unban', false, '解封']
  ] as Array<[string, boolean, string]>) {
    fastify.post(`/api/admin/artists/:id/${path}`, {
      preHandler: requireAdmin,
      schema: {
        ...intId,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: ['string', 'null'], maxLength: 500 }
          }
        }
      }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const artistId = Number((request.params as { id: string }).id)
      const artist = artistService.getArtistById(artistId)
      if (!artist) return reply.code(404).send({ error: '画师不存在' })
      if (artist.qq_number === getAdminQq()) {
        // 与「不能删除管理员账号」同口径：管理员账号不可封禁，防锁死平台
        return reply.code(403).send({ error: `不能${actionLabel}管理员账号` })
      }
      const { reason } = (request.body as { reason?: string | null }) || {}
      complianceService.setArtistBanned(artistId, banned, request.artist.id, reason, request.ip)
      return { success: true, isBanned: banned ? 1 : 0 }
    })
  }
}