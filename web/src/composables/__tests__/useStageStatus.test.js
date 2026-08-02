// useStageStatus composable 测试（F4 录单设节点状态）
// 覆盖：mapStageToStatus 映射规则、findStageForStatus 查找、选项禁用逻辑、不可达回退
import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'

import { mapStageToStatus, findStageForStatus, useStageStatus } from '../useStageStatus.js'

// ─── 工具：构造工作流节点 ───

function stage(id, takesPayment = false) {
  return { id, name: `节点${id}`, takesPayment }
}

/** 典型 4 节点工作流：待确认 → 定金(收款) → 制作 → 尾款(收款) */
function typicalStages() {
  return [stage(1), stage(2, true), stage(3), stage(4, true)]
}

// ─── mapStageToStatus ───

describe('mapStageToStatus', () => {
  it('第 1 个节点 → pending', () => {
    expect(mapStageToStatus(typicalStages(), 0)).toBe('pending')
  })

  it('第 2 个节点且收款 → confirmed', () => {
    expect(mapStageToStatus(typicalStages(), 1)).toBe('confirmed')
  })

  it('第 2 个节点不收款 → wip', () => {
    const stages = [stage(1), stage(2), stage(3)]
    expect(mapStageToStatus(stages, 1)).toBe('wip')
  })

  it('中间节点 → wip', () => {
    expect(mapStageToStatus(typicalStages(), 2)).toBe('wip')
  })

  it('最后一个节点 → done', () => {
    expect(mapStageToStatus(typicalStages(), 3)).toBe('done')
  })

  it('不存在的索引 → wip（兜底）', () => {
    expect(mapStageToStatus(typicalStages(), 99)).toBe('wip')
  })

  it('只有 1 个节点：idx 0 既是第一个也是最后一个 → pending（idx===0 优先）', () => {
    expect(mapStageToStatus([stage(1)], 0)).toBe('pending')
  })

  it('只有 2 个节点：idx 1 是最后一个 → done（优先于 confirmed）', () => {
    const stages = [stage(1), stage(2, true)]
    expect(mapStageToStatus(stages, 1)).toBe('done')
  })
})

// ─── findStageForStatus ───

describe('findStageForStatus', () => {
  it('找到映射到 confirmed 的节点', () => {
    const stages = typicalStages()
    expect(findStageForStatus(stages, 'confirmed')?.id).toBe(2)
  })

  it('找到映射到 wip 的第一个节点', () => {
    const stages = typicalStages()
    expect(findStageForStatus(stages, 'wip')?.id).toBe(3)
  })

  it('找到映射到 pending 的节点', () => {
    const stages = typicalStages()
    expect(findStageForStatus(stages, 'pending')?.id).toBe(1)
  })

  it('无对应节点时返回 null（2 节点工作流无 confirmed/wip）', () => {
    const stages = [stage(1), stage(2, true)]
    expect(findStageForStatus(stages, 'confirmed')).toBeNull()
    expect(findStageForStatus(stages, 'wip')).toBeNull()
  })

  it('空工作流返回 null', () => {
    expect(findStageForStatus([], 'confirmed')).toBeNull()
  })
})

// ─── useStageStatus ───

describe('useStageStatus', () => {
  it('默认选中 pending', () => {
    const { initialStatus } = useStageStatus(ref(typicalStages()))
    expect(initialStatus.value).toBe('pending')
  })

  it('无工作流时三个选项全部可用', () => {
    const { options } = useStageStatus(ref([]))
    expect(options.value.every(o => !o.disabled)).toBe(true)
  })

  it('典型工作流：confirmed 和 wip 可用', () => {
    const { options } = useStageStatus(ref(typicalStages()))
    const confirmed = options.value.find(o => o.value === 'confirmed')
    const wip = options.value.find(o => o.value === 'wip')
    expect(confirmed.disabled).toBe(false)
    expect(wip.disabled).toBe(false)
  })

  it('2 节点工作流：confirmed 和 wip 禁用', () => {
    const stages = ref([stage(1), stage(2, true)])
    const { options } = useStageStatus(stages)
    expect(options.value.find(o => o.value === 'confirmed').disabled).toBe(true)
    expect(options.value.find(o => o.value === 'wip').disabled).toBe(true)
    expect(options.value.find(o => o.value === 'pending').disabled).toBe(false)
  })

  it('当前选项变为不可达时回退到 pending', async () => {
    const stages = ref(typicalStages())
    const { initialStatus, options } = useStageStatus(stages)

    // 选中 confirmed
    initialStatus.value = 'confirmed'
    expect(options.value.find(o => o.value === 'confirmed').disabled).toBe(false)

    // 工作流变为 2 节点 → confirmed 不可达 → 自动回退
    stages.value = [stage(1), stage(2, true)]
    await nextTick()
    expect(initialStatus.value).toBe('pending')
  })

  it('findTarget 返回当前状态对应的节点', () => {
    const stages = ref(typicalStages())
    const { initialStatus, findTarget } = useStageStatus(stages)

    initialStatus.value = 'confirmed'
    expect(findTarget()?.id).toBe(2)

    initialStatus.value = 'wip'
    expect(findTarget()?.id).toBe(3)
  })
})
