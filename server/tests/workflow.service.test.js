import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as wf from '../src/features/artist/workflow.service.js'

/** 快速给画师种入默认 7 节点 */
function seed(artistId) {
  wf.seedArtistStages(artistId)
  return wf.getWorkflow(artistId)
}

describe('流程与比例服务 (Workflow Service)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  // TC-W-01: 新画师从模板初始化
  it('TC-W-01: 种子 7 节点，排期确认 3000，交付 7000 且 isFinal', () => {
    const stages = seed(artist.id)
    expect(stages).toHaveLength(7)
    expect(stages[0].name).toBe('定稿')
    expect(stages[0].takesPayment).toBe(false)

    const pay = stages.filter(s => s.takesPayment)
    expect(pay).toHaveLength(2)
    expect(pay[0].name).toBe('排期确认')
    expect(pay[0].basisPoints).toBe(3000)
    expect(pay[0].isFinal).toBe(false)
    expect(pay[1].name).toBe('交付')
    expect(pay[1].basisPoints).toBe(7000)
    expect(pay[1].isFinal).toBe(true)
  })

  // TC-W-02: 添加节点插入到倒数第二位
  it('TC-W-02: 添加节点插入到尾款之前', () => {
    seed(artist.id)
    wf.addStage(artist.id, { name: '细化确认' })
    const stages = wf.getWorkflow(artist.id)
    expect(stages).toHaveLength(8)
    // 细化确认应在交付之前
    const idx = stages.findIndex(s => s.name === '细化确认')
    const finalIdx = stages.findIndex(s => s.isFinal)
    expect(idx).toBeLessThan(finalIdx)
  })

  // TC-W-03: 删除尾款节点被拒绝
  it('TC-W-03: 删除尾款节点抛出错误', () => {
    const stages = seed(artist.id)
    const final = stages.find(s => s.isFinal)
    expect(() => wf.deleteStage(artist.id, final.id)).toThrow('FINAL_CANNOT_DELETE')
  })

  // TC-W-04: 删除收款节点，比例并入尾款
  it('TC-W-04: 删除收款节点后比例并入尾款', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal) // 排期确认 3000
    wf.deleteStage(artist.id, pay.id)
    const after = wf.getWorkflow(artist.id)
    const final = after.find(s => s.isFinal)
    expect(final.basisPoints).toBe(10000) // 3000 + 7000
    expect(after.filter(s => s.takesPayment)).toHaveLength(1)
  })

  // TC-W-05: 开启收款（尾款充足）
  it('TC-W-05: 开启收款默认 1000，尾款扣除', () => {
    const stages = seed(artist.id)
    const draft = stages.find(s => s.name === '草稿确认')
    wf.updateStage(artist.id, draft.id, { takesPayment: true })
    const after = wf.getWorkflow(artist.id)
    const d = after.find(s => s.id === draft.id)
    const final = after.find(s => s.isFinal)
    expect(d.takesPayment).toBe(true)
    expect(d.basisPoints).toBe(1000)
    expect(final.basisPoints).toBe(6000) // 7000 - 1000
  })

  // TC-W-06: 开启收款（尾款仅让出 500）
  it('TC-W-06: 尾款仅够让出 500 时以 500 开启', () => {
    const stages = seed(artist.id)
    // 排期确认 9000 → 尾款 1000（刚好能让出 500，自己保留 500）
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 9000 }])
    const draft = stages.find(s => s.name === '草稿确认')
    wf.updateStage(artist.id, draft.id, { takesPayment: true })
    const after = wf.getWorkflow(artist.id)
    const d = after.find(s => s.id === draft.id)
    const final = after.find(s => s.isFinal)
    expect(d.basisPoints).toBe(500)
    expect(final.basisPoints).toBe(500)
  })

  // TC-W-07: 开启收款（尾款让不出 500）被拒绝
  it('TC-W-07: 尾款仅 500 时无法再开启新收款', () => {
    const stages = seed(artist.id)
    // 排期确认 9000 → 尾款 1000
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 9000 }])
    // 先开草稿确认（500），尾款剩 500
    const draft = stages.find(s => s.name === '草稿确认')
    wf.updateStage(artist.id, draft.id, { takesPayment: true })
    // 再开线稿确认 → 尾款只有 500，让不出 → 拒绝
    const line = stages.find(s => s.name === '线稿确认')
    expect(() => wf.updateStage(artist.id, line.id, { takesPayment: true })).toThrow()
  })

  // TC-W-08: 开启第 21 期被拒绝
  it('TC-W-08: 超过 20 期拒绝', () => {
    seed(artist.id)
    // 直接用 SQL 插入 18 个收款节点（加上原有 2 个 = 20）
    for (let i = 0; i < 18; i++) {
      db.prepare(
        'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, 1, 500)'
      ).run(artist.id, `节点${i}`, 100 + i)
    }
    // 再加一个非收款节点
    wf.addStage(artist.id, { name: '第21个' })
    const stages = wf.getWorkflow(artist.id)
    const nonPay = stages.find(s => s.name === '第21个')
    expect(() => wf.updateStage(artist.id, nonPay.id, { takesPayment: true })).toThrow('MAX_INSTALLMENTS')
  })

  // TC-W-09: 关闭收款（非尾款）
  it('TC-W-09: 关闭收款后比例并入尾款', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.updateStage(artist.id, pay.id, { takesPayment: false })
    const after = wf.getWorkflow(artist.id)
    const p = after.find(s => s.id === pay.id)
    const final = after.find(s => s.isFinal)
    expect(p.takesPayment).toBe(false)
    expect(p.basisPoints).toBeNull()
    expect(final.basisPoints).toBe(10000)
  })

  // TC-W-10: 关闭尾款收款被拒绝
  it('TC-W-10: 关闭尾款收款抛出错误', () => {
    const stages = seed(artist.id)
    const final = stages.find(s => s.isFinal)
    expect(() => wf.updateStage(artist.id, final.id, { takesPayment: false })).toThrow('FINAL_CANNOT_DISABLE')
  })

  // TC-W-11: 批量保存比例，尾款重算
  it('TC-W-11: 保存比例后总和恒 10000', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 1500 }])
    const after = wf.getWorkflow(artist.id)
    const sum = after.filter(s => s.takesPayment).reduce((a, s) => a + s.basisPoints, 0)
    expect(sum).toBe(10000)
    expect(after.find(s => s.isFinal).basisPoints).toBe(8500)
  })

  // TC-W-12: 单期 < 500 被拒绝
  it('TC-W-12: 比例低于 5% 拒绝', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    expect(() => wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 400 }])).toThrow('BP_TOO_LOW')
  })

  // TC-W-13: reorder 使收款节点成为最后收款节点
  it('TC-W-13: 排序后尾款易主，基点重算', () => {
    const stages = seed(artist.id)
    // 把排期确认拖到最后 → 它变成尾款
    const ids = stages.map(s => s.id)
    const payIdx = ids.indexOf(stages.find(s => s.name === '排期确认').id)
    ids.splice(payIdx, 1)
    ids.push(stages.find(s => s.name === '排期确认').id)
    wf.reorderStages(artist.id, ids)
    const after = wf.getWorkflow(artist.id)
    const newFinal = after.find(s => s.isFinal)
    expect(newFinal.name).toBe('排期确认')
    // 总和仍 10000
    const sum = after.filter(s => s.takesPayment).reduce((a, s) => a + s.basisPoints, 0)
    expect(sum).toBe(10000)
  })

  // TC-W-14: 改名后 GET 返回新名
  it('TC-W-14: 改名即时生效', () => {
    const stages = seed(artist.id)
    const s = stages[0]
    wf.updateStage(artist.id, s.id, { name: '需求确认' })
    const after = wf.getWorkflow(artist.id)
    expect(after.find(x => x.id === s.id).name).toBe('需求确认')
  })

  // TC-W-15: 存量画师迁移幂等
  it('TC-W-15: 重复种子不重复插入', () => {
    seed(artist.id)
    wf.seedArtistStages(artist.id) // 第二次调用
    expect(wf.getWorkflow(artist.id)).toHaveLength(7)
  })

  // TC-W-16: 管理员编辑画师 workflow 与自操作一致
  it('TC-W-16: 管理员操作结果一致', () => {
    const stages = seed(artist.id)
    const s = stages[0]
    // 管理员改名（走同一个 service 函数）
    wf.updateStage(artist.id, s.id, { name: '管理员改名' })
    expect(wf.getWorkflow(artist.id).find(x => x.id === s.id).name).toBe('管理员改名')
  })

  // TC-W-17: 默认模板 CRUD + reset
  it('TC-W-17: 模板修改后 reset 恢复出厂', () => {
    wf.resetDefaultTemplate()
    const tpl = wf.getDefaultTemplate()
    expect(tpl).toHaveLength(7)

    // 修改
    wf.updateDefaultTemplate([
      { name: 'A', takesPayment: true, basisPoints: 5000 },
      { name: 'B', takesPayment: true, basisPoints: 5000 }
    ])
    expect(wf.getDefaultTemplate()).toHaveLength(2)

    // reset
    wf.resetDefaultTemplate()
    expect(wf.getDefaultTemplate()).toHaveLength(7)
  })

  // TC-W-18: 定金即全款（1 期 100%）
  it('TC-W-18: 唯一收款节点 isFinal 且 10000', () => {
    seed(artist.id)
    const stages = wf.getWorkflow(artist.id)
    // 关闭排期确认的收款
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.updateStage(artist.id, pay.id, { takesPayment: false })
    const after = wf.getWorkflow(artist.id)
    const payStages = after.filter(s => s.takesPayment)
    expect(payStages).toHaveLength(1)
    expect(payStages[0].isFinal).toBe(true)
    expect(payStages[0].basisPoints).toBe(10000)
  })

  // TC-W-19: 尾款不在列表末尾
  it('TC-W-19: 尾款后有非收款节点，isFinal 正确', () => {
    seed(artist.id)
    const stages = wf.getWorkflow(artist.id)
    // 把交付（尾款）拖到中间
    const ids = stages.map(s => s.id)
    const finalId = stages.find(s => s.isFinal).id
    ids.splice(ids.indexOf(finalId), 1)
    ids.splice(3, 0, finalId) // 插到第 4 位
    wf.reorderStages(artist.id, ids)
    const after = wf.getWorkflow(artist.id)
    const final = after.find(s => s.isFinal)
    const finalIdx = after.findIndex(s => s.isFinal)
    // 尾款后面应该还有节点
    expect(finalIdx).toBeLessThan(after.length - 1)
    expect(final.isFinal).toBe(true)
  })
})
