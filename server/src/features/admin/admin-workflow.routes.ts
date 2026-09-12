import { requireAdmin } from '../../shared/middleware/auth.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { intId, intIdSid, requireExistingArtist } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 流程与比例管理（默认模板 + 画师流程代理）（从 admin.routes.ts 拆出）
// F-09 巨型文件清偿；纯搬移，端点与行为零变更
// ============================================

export async function adminWorkflowRoutes(fastify: FastifyInstance) {

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
                // L-11（审计 九#4）: 与 savePayment 严格口径统一（尾款保留 ≥500，单节点 ≤9500）
                basisPoints: { type: 'integer', minimum: 500, maximum: workflowService.MAX_NON_FINAL_BP }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    return workflowService.updateDefaultTemplate((request.body as { nodes: Array<{ name: string; description?: string | null; takesPayment?: boolean; basisPoints?: number }> }).nodes)
  })

  /** POST /api/admin/default-workflow/reset — 重置出厂模板 */
  fastify.post('/api/admin/default-workflow/reset', { preHandler: requireAdmin }, async () => {
    return workflowService.resetDefaultTemplate()
  })

  /** GET /api/admin/artists/:id/workflow — 查看画师流程 */
  // BUG-8 修复：补画师存在性校验（不存在时 404 而非空 stages）
  fastify.get('/api/admin/artists/:id/workflow', { preHandler: [requireAdmin, requireExistingArtist], schema: intId }, async (request: FastifyRequest) => {
    return { stages: workflowService.getWorkflow(Number((request.params as { id: string }).id)) }
  })

  /** POST /api/admin/artists/:id/workflow — 为画师添加节点 */
  fastify.post('/api/admin/artists/:id/workflow', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['name'], additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    return workflowService.addStage(Number((request.params as { id: string }).id), request.body as { name: string; description?: string | null })
  })

  /** PUT /api/admin/artists/:id/workflow/:sid — 编辑画师节点 */
  fastify.put('/api/admin/artists/:id/workflow/:sid', {
    preHandler: requireAdmin,
    schema: {
      ...intIdSid,
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
  }, async (request: FastifyRequest) => {
    return workflowService.updateStage(Number((request.params as { id: string }).id), Number((request.params as { sid: string }).sid), request.body as { name?: string; description?: string | null; takesPayment?: boolean; speechTemplate?: string | null; randomTemplate?: boolean })
  })

  /** DELETE /api/admin/artists/:id/workflow/:sid — 删除画师节点 */
  fastify.delete('/api/admin/artists/:id/workflow/:sid', { preHandler: requireAdmin, schema: intIdSid }, async (request: FastifyRequest) => {
    return workflowService.deleteStage(Number((request.params as { id: string }).id), Number((request.params as { sid: string }).sid))
  })

  /** PUT /api/admin/artists/:id/workflow/reorder — 画师节点排序 */
  fastify.put('/api/admin/artists/:id/workflow/reorder', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['orderedIds'], additionalProperties: false,
        properties: { orderedIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 } }
      }
    }
  }, async (request: FastifyRequest) => {
    return { stages: workflowService.reorderStages(Number((request.params as { id: string }).id), (request.body as { orderedIds: number[] }).orderedIds) }
  })

  /** PUT /api/admin/artists/:id/workflow/payment — 画师比例保存 */
  fastify.put('/api/admin/artists/:id/workflow/payment', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['nodes'], additionalProperties: false,
        properties: {
          nodes: {
            type: 'array', maxItems: 20,
            items: {
              type: 'object', required: ['id', 'basisPoints'], additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                basisPoints: { type: 'integer', minimum: 500, maximum: workflowService.MAX_NON_FINAL_BP }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    // 批4 B10（方案 b）：活跃订单存在时附 appliesToNewOrdersOnly，与画师端口径一致
    const result = workflowService.savePayment(Number((request.params as { id: string }).id), (request.body as { nodes: Array<{ id: number; basisPoints: number }> }).nodes)
    return { stages: result.stages, ...(result.appliesToNewOrdersOnly ? { appliesToNewOrdersOnly: true } : {}) }
  })
}
