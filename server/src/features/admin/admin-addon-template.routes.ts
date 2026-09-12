import { requireAdmin } from '../../shared/middleware/auth.js'
import * as adminAddonTemplatesService from './admin-addon-templates.service.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { intId } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 系统增项模板管理（从 admin.routes.ts 拆出）
// F-09 巨型文件清偿；纯搬移，端点与行为零变更
// ============================================

export async function adminAddonTemplateRoutes(fastify: FastifyInstance) {

  // ─── 系统增项模板管理（815 第三批 I 路；step-up 由 registerAdminStepUpHooks 自动覆盖） ───

  /** 系统模板 body 公共属性（与画师侧增项库字段对齐；artist_id 恒写 NULL） */
  const addonTemplateBodyProps = {
    name: { type: 'string', minLength: 1, maxLength: 50 },
    control_type: { type: 'string', enum: ['switch', 'quantity'] },
    price_mode: { type: 'string', enum: ['fixed', 'percent'] },
    // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
    default_price: { type: 'number', minimum: 0, maximum: 999999, moneyPrecision: true },
    unit_label: { type: ['string', 'null'], maxLength: 20 },
    sort_order: { type: 'integer', minimum: 0, maximum: 9999 },
    category: { type: 'string', enum: ['add', 'usage', 'rush'] },
    max_quantity: { type: ['integer', 'null'], minimum: 1, maximum: 999 }
  }

  /** GET /api/admin/addon-templates — 系统增项模板列表（仅 artist_id IS NULL，含引用数） */
  fastify.get('/api/admin/addon-templates', { preHandler: requireAdmin }, async () => {
    return adminAddonTemplatesService.listSystemAddonTemplates()
  })

  /** POST /api/admin/addon-templates — 新建系统增项模板（artist_id 写 NULL） */
  fastify.post('/api/admin/addon-templates', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: addonTemplateBodyProps
      }
    }
  }, async (request: FastifyRequest) => {
    return adminAddonTemplatesService.createSystemAddonTemplate(
      request.body as Parameters<typeof adminAddonTemplatesService.createSystemAddonTemplate>[0]
    )
  })

  /**
   * PUT /api/admin/addon-templates/:id — 更新系统模板
   * sync=true → 同步（NULL 引用行跟随新价）；sync=false/缺省 → 冻结（旧价写入 override）
   */
  fastify.put('/api/admin/addon-templates/:id', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...addonTemplateBodyProps,
          sync: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    return adminAddonTemplatesService.updateSystemAddonTemplate(
      Number((request.params as { id: string }).id),
      request.body as Parameters<typeof adminAddonTemplatesService.updateSystemAddonTemplate>[1]
    )
  })

  /**
   * DELETE /api/admin/addon-templates/:id — 删除系统模板（仅 artist_id IS NULL）
   * FK ON DELETE SET NULL：引用行保留为独立增项（快照列不丢数据），响应附 referenced 数
   */
  fastify.delete('/api/admin/addon-templates/:id', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest) => {
    return adminAddonTemplatesService.deleteSystemAddonTemplate(
      Number((request.params as { id: string }).id)
    )
  })
}
