import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import type { WorkflowStage } from '../../types/entities.js'

// ============================================
// 流程与比例服务
// 不变式（每次写入事务内强制）：
//   I1. 至少 1 个收款节点
//   I2. 尾款（最后收款节点）basis_points = 10000 − Σ其他
//   I3. 所有收款节点 basis_points ≥ 500
//   I4. 收款节点数量 ∈ [1, 20]
// ============================================

const MIN_BP = 500
const MAX_BP = 10000
const TOTAL_BP = 10000
const MAX_INSTALLMENTS = 20
const DEFAULT_NEW_BP = 1000
const DEFAULT_SPEECH = '{客户名}，你的订单已{节点名}。'

/** 默认模板行（无 id/artist_id/speech_template） */
interface TemplateRow {
  name: string
  description: string | null
  sort_order: number
  takes_payment: number
  basis_points: number | null
}

/** 默认模板表行（含 id） */
interface DefaultTemplateRow extends TemplateRow {
  id: number
}

/** camelCase 输出 */
interface StageCamel {
  id: number
  name: string
  description: string | null
  sortOrder: number
  takesPayment: boolean
  basisPoints: number
  isFinal: boolean
  speechTemplate: string | null
  randomTemplate: boolean
}

// ─── 内部工具 ───

function getStages(artistId: number): WorkflowStage[] {
  return db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(artistId) as WorkflowStage[]
}

/** 统计画师存在分期快照的活跃订单数（批4 B10：收款结构变更守卫的命中条件） */
function countActivePaymentOrders(artistId: number): number {
  return (db.prepare(`
    SELECT COUNT(DISTINCT o.id) AS c
    FROM orders o
    JOIN order_payment_installments i ON i.order_id = o.id
    WHERE o.artist_id = ? AND o.status NOT IN ('delivered', 'cancelled')
  `).get(artistId) as { c: number }).c
}

function getStageById(id: number): WorkflowStage | undefined {
  return db.prepare('SELECT * FROM artist_workflow_stages WHERE id = ?').get(id) as WorkflowStage | undefined
}

/** 找到最后一个收款节点（尾款） */
function findFinal(stages: WorkflowStage[]): WorkflowStage | null {
  const payStages = stages.filter(s => s.takes_payment)
  return payStages.length > 0 ? payStages[payStages.length - 1] : null
}

/** 重算尾款基点并写入 */
function recalcFinal(artistId: number): void {
  const stages = getStages(artistId)
  const final = findFinal(stages)
  if (!final) return
  const othersSum = stages
    .filter(s => s.takes_payment && s.id !== final.id)
    .reduce((sum, s) => sum + s.basis_points, 0)
  const finalBp = TOTAL_BP - othersSum
  db.prepare('UPDATE artist_workflow_stages SET basis_points = ? WHERE id = ?')
    .run(finalBp, final.id)
}

/** 校验不变式 I1~I4，违反则抛错 */
function assertInvariants(artistId: number): void {
  const stages = getStages(artistId)
  const payStages = stages.filter(s => s.takes_payment)

  // I1
  if (payStages.length === 0) throw new AppError(E.NO_PAYMENT_NODE)
  // I4
  if (payStages.length > MAX_INSTALLMENTS) throw new AppError(E.MAX_INSTALLMENTS)
  // I3
  for (const s of payStages) {
    if (s.basis_points < MIN_BP) throw new AppError(E.BP_TOO_LOW, 400, { name: s.name })
  }
  // I2
  const sum = payStages.reduce((acc, s) => acc + s.basis_points, 0)
  if (sum !== TOTAL_BP) throw new AppError(E.SUM_NOT_100)
}

function toCamel(row: WorkflowStage | undefined): StageCamel | null {
  if (!row) return null
  const stages = getStages(row.artist_id)
  const final = findFinal(stages)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    takesPayment: !!row.takes_payment,
    basisPoints: row.basis_points,
    isFinal: final ? final.id === row.id : false,
    speechTemplate: row.speech_template ?? null,
    randomTemplate: !!row.random_template
  }
}

function listCamel(artistId: number): StageCamel[] {
  const stages = getStages(artistId)
  const final = findFinal(stages)
  return stages.map(s => ({
    id: s.id, name: s.name, description: s.description,
    sortOrder: s.sort_order, takesPayment: !!s.takes_payment,
    basisPoints: s.basis_points, isFinal: final ? final.id === s.id : false,
    speechTemplate: s.speech_template ?? null,
    randomTemplate: !!s.random_template
  }))
}

// ─── 公开 API ───

/** 获取画师的流程节点列表（含 isFinal 计算字段） */
export function getWorkflow(artistId: number): StageCamel[] {
  return listCamel(artistId)
}

/** 收款计划（SPEC-PRICE-2：公开报价页展示分期比例，仅收款节点） */
export function getPaymentPlan(artistId: number): Array<{ label: string; basisPoints: number }> {
  const stages = getStages(artistId)
  return stages
    .filter(s => s.takes_payment)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({ label: s.name, basisPoints: s.basis_points ?? 0 }))
}

/** 添加节点（插入到倒数第二位，R3） */
export function addStage(artistId: number, { name, description }: { name: string; description?: string | null }): StageCamel | null {
  return db.transaction(() => {
    const stages = getStages(artistId)
    const maxOrder = stages.length > 0 ? stages[stages.length - 1].sort_order : 0
    // 插入到最后一项之前
    const insertAt = stages.length > 1 ? stages[stages.length - 2].sort_order + 1 : maxOrder + 1
    // 把最后一项及之后的都往后挪
    db.prepare(
      'UPDATE artist_workflow_stages SET sort_order = sort_order + 1 WHERE artist_id = ? AND sort_order >= ?'
    ).run(artistId, insertAt)
    const result = db.prepare(
      "INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points, speech_template) VALUES (?, ?, ?, ?, 0, NULL, '{客户名}，你的订单已{节点名}。')"
    ).run(artistId, name, description || null, insertAt)
    return toCamel(getStageById(Number(result.lastInsertRowid)))
  })()
}

// 改名 / 改描述 / 切换收款开关 / 改话术
export function updateStage(artistId: number, stageId: number, fields: Record<string, unknown>): StageCamel | null {
  return db.transaction(() => {
    // P1-9: 在事务内获取 stage，避免 TOCTOU
    const stage = getStageById(stageId)
    if (!stage || stage.artist_id !== artistId) throw new AppError(E.STAGE_NOT_FOUND)

    const stages = getStages(artistId)
    const final = findFinal(stages)
    const isFinal = final && final.id === stageId

    // 改名/描述（无副作用）
    if (fields.name !== undefined) {
      if (!String(fields.name || '').trim()) throw new AppError(E.STAGE_NAME_EMPTY)
      db.prepare('UPDATE artist_workflow_stages SET name = ? WHERE id = ?')
        .run(String(fields.name).trim(), stageId)
    }
    if (fields.description !== undefined) {
      db.prepare('UPDATE artist_workflow_stages SET description = ? WHERE id = ?')
        .run(fields.description || null, stageId)
    }
    // plan-node-speech: 话术模板（可选，不传则不改）
    if (fields.speechTemplate !== undefined) {
      db.prepare('UPDATE artist_workflow_stages SET speech_template = ? WHERE id = ?')
        .run(fields.speechTemplate || null, stageId)
    }
    // v0.25 #8: 多模板随机开关
    if (fields.randomTemplate !== undefined) {
      db.prepare('UPDATE artist_workflow_stages SET random_template = ? WHERE id = ?')
        .run(fields.randomTemplate ? 1 : 0, stageId)
    }

    // 切换收款开关
    if (fields.takesPayment !== undefined) {
      // 批4 B10: 有活跃订单引用收款节点快照时禁止切换（锁定/状态推导读实时模板，只拦收款结构变更）
      const active = countActivePaymentOrders(artistId)
      if (active > 0) throw new AppError(E.WORKFLOW_PAYMENT_IN_USE, 400, { count: active })

      const wantOn = !!fields.takesPayment

      if (isFinal && !wantOn) {
        throw new AppError(E.FINAL_CANNOT_DISABLE)
      }

      if (wantOn && !stage.takes_payment) {
        // 开启收款
        const payCount = stages.filter(s => s.takes_payment).length
        if (payCount >= MAX_INSTALLMENTS) throw new AppError(E.MAX_INSTALLMENTS)
        // 从尾款扣除
        let newBp = DEFAULT_NEW_BP
        if (final && final.basis_points - newBp < MIN_BP) {
          newBp = final.basis_points - MIN_BP
          if (newBp < MIN_BP) throw new AppError(E.FINAL_TOO_LOW)
        }
        db.prepare('UPDATE artist_workflow_stages SET takes_payment = 1, basis_points = ? WHERE id = ?')
          .run(newBp, stageId)
        if (final) {
          db.prepare('UPDATE artist_workflow_stages SET basis_points = basis_points - ? WHERE id = ?')
            .run(newBp, final.id)
        }
      } else if (!wantOn && stage.takes_payment) {
        // 关闭收款 → 比例并入尾款
        if (isFinal) throw new AppError(E.FINAL_CANNOT_DISABLE)
        db.prepare('UPDATE artist_workflow_stages SET takes_payment = 0, basis_points = NULL WHERE id = ?')
          .run(stageId)
        if (final) {
          db.prepare('UPDATE artist_workflow_stages SET basis_points = basis_points + ? WHERE id = ?')
            .run(stage.basis_points, final.id)
        }
      }
    }

    assertInvariants(artistId)
    return toCamel(getStageById(stageId))
  })()
}

/** 删除节点（尾款拒绝；收款节点比例并入尾款） */
export function deleteStage(artistId: number, stageId: number): { success: boolean } {
  const stage = getStageById(stageId)
  if (!stage || stage.artist_id !== artistId) throw new AppError(E.STAGE_NOT_FOUND)

  return db.transaction(() => {
    const stages = getStages(artistId)
    if (stages.length <= 1) throw new AppError(E.MIN_STAGES)

    const final = findFinal(stages)
    if (final && final.id === stageId) throw new AppError(E.FINAL_CANNOT_DELETE)

    // P1-5: 有活跃订单引用该节点时阻止删除
    const activeCount = (db.prepare(
      "SELECT COUNT(*) as c FROM orders WHERE current_stage_id = ? AND status NOT IN ('delivered', 'cancelled')"
    ).get(stageId) as { c: number }).c
    if (activeCount > 0) {
      throw new AppError(E.STAGE_IN_USE, 400, { count: activeCount })
    }

    // 收款节点：比例并入尾款
    if (stage.takes_payment && final) {
      db.prepare('UPDATE artist_workflow_stages SET basis_points = basis_points + ? WHERE id = ?')
        .run(stage.basis_points, final.id)
    }

    db.prepare('DELETE FROM artist_workflow_stages WHERE id = ?').run(stageId)
    // 压缩 sort_order
    const remaining = getStages(artistId)
    remaining.forEach((s, i) => {
      if (s.sort_order !== i + 1) {
        db.prepare('UPDATE artist_workflow_stages SET sort_order = ? WHERE id = ?').run(i + 1, s.id)
      }
    })
    assertInvariants(artistId)
    return { success: true }
  })()
}

/** 拖拽排序（尾款可能易主，自动重算） */
export function reorderStages(artistId: number, orderedIds: number[]): StageCamel[] {
  return db.transaction(() => {
    const stages = getStages(artistId)
    const idSet = new Set(stages.map(s => s.id))
    if (orderedIds.length !== stages.length) throw new AppError(E.REORDER_LENGTH)
    for (const id of orderedIds) {
      if (!idSet.has(id)) throw new AppError(E.REORDER_INVALID)
    }
    if (new Set(orderedIds).size !== orderedIds.length) throw new AppError(E.REORDER_DUPLICATE)

    // 批4 B10: 有活跃订单引用收款节点快照时禁止排序（收款相对顺序变化会漂移锁定/状态映射）
    const active = countActivePaymentOrders(artistId)
    if (active > 0) throw new AppError(E.WORKFLOW_PAYMENT_IN_USE, 400, { count: active })

    orderedIds.forEach((id, i) => {
      db.prepare('UPDATE artist_workflow_stages SET sort_order = ? WHERE id = ? AND artist_id = ?')
        .run(i + 1, id, artistId)
    })
    // 尾款可能易主 → 重算
    recalcFinal(artistId)
    assertInvariants(artistId)
    return listCamel(artistId)
  })()
}

/** 批量保存比例（比例条 [保存比例] 按钮） */
export function savePayment(artistId: number, nodes: Array<{ id: number; basisPoints: number }>): { stages: StageCamel[]; appliesToNewOrdersOnly: boolean } {
  return db.transaction(() => {
    const stages = getStages(artistId)
    const final = findFinal(stages)
    if (!final) throw new AppError(E.NO_FINAL)

    for (const n of nodes) {
      const stage = stages.find(s => s.id === n.id)
      if (!stage) throw new AppError(E.STAGE_NOT_FOUND)
      if (stage.id === final.id) throw new AppError(E.FINAL_READONLY)
      if (!stage.takes_payment) throw new AppError(E.NOT_PAYMENT_STAGE, 400, { name: stage.name })
      if (n.basisPoints < MIN_BP) throw new AppError(E.BP_TOO_LOW, 400, { name: stage.name })
      if (n.basisPoints > MAX_BP - MIN_BP) throw new AppError(E.BP_TOO_HIGH, 400, { name: stage.name })
    }

    // 批4 B10（方案 b）：有活跃订单时放行，但标注仅影响新订单（快照不变，不破坏既有订单）
    const appliesToNewOrdersOnly = countActivePaymentOrders(artistId) > 0

    for (const n of nodes) {
      db.prepare('UPDATE artist_workflow_stages SET basis_points = ? WHERE id = ?')
        .run(n.basisPoints, n.id)
    }
    recalcFinal(artistId)
    assertInvariants(artistId)
    return { stages: listCamel(artistId), appliesToNewOrdersOnly }
  })()
}

// ─── 默认模板 ───

const DEFAULT_TEMPLATE: TemplateRow[] = [
  { name: '定稿', description: '双方确认稿件需求与规格', sort_order: 1, takes_payment: 0, basis_points: null },
  { name: '排期确认', description: '确认排期，收取定金', sort_order: 2, takes_payment: 1, basis_points: 3000 },
  { name: '草稿确认', description: null, sort_order: 3, takes_payment: 0, basis_points: null },
  { name: '线稿确认', description: null, sort_order: 4, takes_payment: 0, basis_points: null },
  { name: '上色确认', description: null, sort_order: 5, takes_payment: 0, basis_points: null },
  { name: '完稿确认', description: null, sort_order: 6, takes_payment: 0, basis_points: null },
  { name: '交付', description: '交付成品，收取尾款', sort_order: 7, takes_payment: 1, basis_points: 7000 },
]

/** 从默认模板复制到画师 */
export function seedArtistStages(artistId: number): void {
  const count = (db.prepare(
    'SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?'
  ).get(artistId) as { c: number }).c
  if (count > 0) return // 幂等

  // 优先从 default_workflow_template 读取（管理员可能已修改）
  const tpl = db.prepare('SELECT * FROM default_workflow_template ORDER BY sort_order ASC').all() as TemplateRow[]
  const source = tpl.length > 0 ? tpl : DEFAULT_TEMPLATE

  const insert = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points, speech_template) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const t of source) {
    insert.run(artistId, t.name, t.description || null, t.sort_order, t.takes_payment ? 1 : 0, t.basis_points, DEFAULT_SPEECH)
  }
}

/** 重置画师流程为默认模板（画师主动操作） */
export function resetArtistStages(artistId: number): StageCamel[] {
  // P0-1: 有活跃订单时禁止重置（防止 current_stage_id 悬挂引用）
  const activeCount = (db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')"
  ).get(artistId) as { c: number }).c
  if (activeCount > 0) {
    throw new AppError(E.STAGES_RESET_BLOCKED, 400, { count: activeCount })
  }

  return db.transaction(() => {
    db.prepare('DELETE FROM artist_workflow_stages WHERE artist_id = ?').run(artistId)
    const tpl = getDefaultTemplate()
    const insert = db.prepare(
      'INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points, speech_template) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    for (const t of tpl) {
      insert.run(artistId, t.name, t.description || null, t.sort_order, t.takes_payment ? 1 : 0, t.basis_points, DEFAULT_SPEECH)
    }
    assertInvariants(artistId)
    return listCamel(artistId)
  })()
}

// ─── 管理员：默认模板 CRUD ───

export function getDefaultTemplate(): DefaultTemplateRow[] {
  return db.prepare('SELECT * FROM default_workflow_template ORDER BY sort_order ASC').all() as DefaultTemplateRow[]
}

export function updateDefaultTemplate(nodes: Array<{ name: string; description?: string | null; takesPayment?: boolean; basisPoints?: number }>): DefaultTemplateRow[] {
  return db.transaction(() => {
    db.prepare('DELETE FROM default_workflow_template').run()
    const insert = db.prepare(
      'INSERT INTO default_workflow_template (name, description, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
    )
    let paySum = 0
    let payCount = 0
    nodes.forEach((n, i) => {
      const bp = n.takesPayment ? (n.basisPoints || 0) : null
      // P1-1: 收款节点必须满足最低比例
      if (n.takesPayment && bp! < MIN_BP) throw new AppError(E.BP_TOO_LOW, 400, { name: n.name })
      insert.run(n.name, n.description || null, i + 1, n.takesPayment ? 1 : 0, bp)
      if (n.takesPayment) { paySum += bp!; payCount++ }
    })
    // 校验
    if (payCount === 0) throw new AppError(E.NO_PAYMENT_NODE)
    if (payCount > MAX_INSTALLMENTS) throw new AppError(E.MAX_INSTALLMENTS)
    if (paySum !== TOTAL_BP) throw new AppError(E.SUM_NOT_100)
    return getDefaultTemplate()
  })()
}

export function resetDefaultTemplate(): DefaultTemplateRow[] {
  return db.transaction(() => {
    db.prepare('DELETE FROM default_workflow_template').run()
    const insert = db.prepare(
      'INSERT INTO default_workflow_template (name, description, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
    )
    for (const t of DEFAULT_TEMPLATE) {
      insert.run(t.name, t.description, t.sort_order, t.takes_payment, t.basis_points)
    }
    return getDefaultTemplate()
  })()
}
