import * as toolsService from './tools.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 画师工具路由（REQ-035 批A/批C + REQ-031 A1）
// 客户标记 / 老客召回 / 散单记账 / 收入导出
// ============================================

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$'

/**
 * CSV 字段转义（P2-9）：
 * 1) 公式注入——值以 = + - @ 或 \t \r 开头时前置单引号，Excel 按纯文本显示；
 * 2) 含逗号/引号/换行时用双引号包裹，内部引号翻倍。
 * 3) 9-8：负退款（-<整数>）是合法数值——用双引号包裹而非前置单引号，
 *    Excel 打开 CSV 时仍按数字解析可求和，同时不进入公式执行路径。
 */
const SAFE_NUMERIC_RE = /^-?\d+(?:\.\d+)?$/

function csvEscape(value: string): string {
  let out = value
  if (/^[=+\-@\t\r]/.test(out)) {
    // 纯数字（含负数）用双引号包住保留数值语义；非数字公式前缀仍前置单引号
    if (SAFE_NUMERIC_RE.test(out)) {
      return `"${out}"`
    }
    out = `'${out}`
  }
  if (/[",\n\r]/.test(out)) {
    out = `"${out.replace(/"/g, '""')}"`
  }
  return out
}

export default async function toolsRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/artist/tools/clients?qq=
   * 客户标记列表（qq 可选过滤）
   */
  fastify.get('/api/artist/tools/clients', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          qq: { type: 'string', maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const qq = (request.query as { qq?: string }).qq
    return { items: toolsService.listClientProfiles(request.artist.id, qq) }
  })

  /**
   * GET /api/artist/tools/clients/:qq
   * 客户详情（标记 + 汇总：共 N 单/累计金额/最近一单）
   */
  fastify.get('/api/artist/tools/clients/:qq', {
    preHandler: requireAuth,
    schema: {
      params: {
        type: 'object',
        required: ['qq'],
        additionalProperties: false,
        properties: {
          qq: { type: 'string', minLength: 1, maxLength: 20 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const qq = (request.params as { qq: string }).qq
    return {
      profile: toolsService.getClientProfile(request.artist.id, qq),
      summary: toolsService.getClientSummary(request.artist.id, qq)
    }
  })

  /**
   * PUT /api/artist/tools/clients/:qq
   * 保存客户标记（tags ≤20 项，每项 1-20 字符；note ≤200）
   */
  fastify.put('/api/artist/tools/clients/:qq', {
    preHandler: requireAuth,
    schema: {
      params: {
        type: 'object',
        required: ['qq'],
        additionalProperties: false,
        properties: {
          qq: { type: 'string', minLength: 1, maxLength: 20 }
        }
      },
      body: {
        type: 'object',
        required: ['tags', 'note'],
        additionalProperties: false,
        properties: {
          tags: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 20 }
          },
          note: { type: 'string', maxLength: 200 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const qq = (request.params as { qq: string }).qq
    const body = request.body as { tags: string[]; note: string }
    return { profile: toolsService.upsertClientProfile(request.artist.id, qq, body.tags, body.note) }
  })

  /**
   * DELETE /api/artist/tools/clients/:qq
   * 删除客户标记（标签清空）
   */
  fastify.delete('/api/artist/tools/clients/:qq', {
    preHandler: requireAuth,
    schema: {
      params: {
        type: 'object',
        required: ['qq'],
        additionalProperties: false,
        properties: {
          qq: { type: 'string', minLength: 1, maxLength: 20 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const qq = (request.params as { qq: string }).qq
    toolsService.deleteClientProfile(request.artist.id, qq)
    return { ok: true }
  })

  /**
   * GET /api/artist/tools/returning-clients?days=30|60|90
   * 老客召回列表（>days 未下单，按距最近一单天数倒序）
   */
  fastify.get('/api/artist/tools/returning-clients', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', enum: [30, 60, 90], default: 30 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const days = (request.query as { days?: number })?.days ?? 30
    return { items: toolsService.listReturningClients(request.artist.id, days) }
  })

  /**
   * GET /api/artist/tools/standalone-incomes?from=&to=
   * 散单记账列表（按收入日期倒序，可选时间段过滤）
   */
  fastify.get('/api/artist/tools/standalone-incomes', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', pattern: DATE_PATTERN },
          to: { type: 'string', pattern: DATE_PATTERN }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const q = request.query as { from?: string; to?: string }
    return { items: toolsService.listStandaloneIncomes(request.artist.id, q.from, q.to) }
  })

  /**
   * POST /api/artist/tools/standalone-incomes
   * 新增散单收入（amountCents>0；incomeDate YYYY-MM-DD）
   */
  fastify.post('/api/artist/tools/standalone-incomes', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['amountCents', 'incomeDate'],
        additionalProperties: false,
        properties: {
          // P2-11: 单笔散单金额上限（防 1e15 污染统计；服务层同步兜底）
          amountCents: { type: 'integer', minimum: 1, maximum: toolsService.MAX_STANDALONE_INCOME_CENTS },
          clientName: { type: 'string', maxLength: 50 },
          note: { type: 'string', maxLength: 200 },
          incomeDate: { type: 'string', pattern: DATE_PATTERN }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const body = request.body as { amountCents: number; clientName: string; note: string; incomeDate: string }
    return { item: toolsService.createStandaloneIncome(request.artist.id, {
      amountCents: body.amountCents,
      clientName: body.clientName ?? '',
      note: body.note ?? '',
      incomeDate: body.incomeDate
    }) }
  })

  /**
   * DELETE /api/artist/tools/standalone-incomes/:id
   * 删除散单（仅本人）
   */
  fastify.delete('/api/artist/tools/standalone-incomes/:id', {
    preHandler: requireAuth,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const id = (request.params as { id: number }).id
    const deleted = toolsService.deleteStandaloneIncome(request.artist.id, id)
    if (!deleted) throw new AppError(E.NOT_FOUND, 404, { id })
    return { ok: true }
  })

  /**
   * GET /api/artist/tools/export.csv?from=&to=
   * A1 收入导出 CSV（合并 order_payments + standalone_incomes）
   * 表头：date,client,amount_cents,type,order_id；UTF-8 with BOM
   */
  fastify.get('/api/artist/tools/export.csv', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        additionalProperties: false,
        properties: {
          from: { type: 'string', pattern: DATE_PATTERN },
          to: { type: 'string', pattern: DATE_PATTERN }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { from: string; to: string }
    const rows = toolsService.getExportRows(request.artist.id, q.from, q.to)

    const lines = [
      'date,client,amount_cents,type,order_id',
      ...rows.map(r => [
        // P2-9: 所有出口字段统一走 csvEscape（date/金额/type 虽非用户可控，统一防未来加字段漏网）
        csvEscape(r.date),
        csvEscape(r.client),
        csvEscape(String(r.amountCents)),
        csvEscape(r.type),
        csvEscape(r.orderId === null ? '' : String(r.orderId))
      ].join(','))
    ]

    // UTF-8 with BOM：Excel 打开中文不乱码
    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'
    const filename = `income-${q.from.replace(/-/g, '')}-${q.to.replace(/-/g, '')}.csv`
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(csv)
  })

  /**
   * GET /api/artist/tools/income-summary?from=&to=
   * 画师收入汇总（订单收款 + 散单收入，按区间）
   */
  fastify.get('/api/artist/tools/income-summary', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        additionalProperties: false,
        properties: {
          from: { type: 'string', pattern: DATE_PATTERN },
          to: { type: 'string', pattern: DATE_PATTERN }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const q = request.query as { from: string; to: string }
    return toolsService.getIncomeSummary(request.artist.id, q.from, q.to)
  })
}
