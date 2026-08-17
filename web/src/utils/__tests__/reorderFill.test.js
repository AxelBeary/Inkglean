// 818-D「同信息再来一单」一期：回填纯函数单测
// 覆盖：fill query 解析白名单；文字预填字段映射（QQ/昵称必带）；备注过滤系统备注/换行合并/截断；
//       款式尺寸目标匹配/缺失降级；deadline/startDate/priority 等新单字段绝不携带
import { describe, it, expect } from 'vitest'
import {
  parseReorderFill,
  buildReorderNoteText,
  buildReorderTextPrefill,
  buildReorderRefs,
  findReorderStyleTarget
} from '../reorderFill.js'
import { MAX_IMAGE_COUNT } from '../../constants/upload.js'

describe('parseReorderFill', () => {
  it('空/缺省 → 空集合', () => {
    expect([...parseReorderFill()]).toEqual([])
    expect([...parseReorderFill('')]).toEqual([])
  })

  it('逗号分隔按白名单解析，未知项/空白静默忽略', () => {
    expect([...parseReorderFill('desc,style,note,refs')].sort()).toEqual(['desc', 'note', 'refs', 'style'])
    expect([...parseReorderFill('desc, images, style,,note')].sort()).toEqual(['desc', 'note', 'style'])
    expect([...parseReorderFill('ref')]).toEqual([])
  })
})

describe('buildReorderNoteText', () => {
  it('只取非系统备注正文，按时间升序换行合并', () => {
    const order = {
      notes: [
        { id: 1, content: '系统改价备注', created_by: 'system' },
        { id: 2, content: '  画师沟通要点  ', created_by: 'artist' },
        { id: 3, content: '', created_by: 'artist' },
        { id: 4, content: '线下约定', created_by: 'artist' }
      ]
    }
    expect(buildReorderNoteText(order)).toBe('画师沟通要点\n线下约定')
  })

  it('无备注/全系统备注 → 空串', () => {
    expect(buildReorderNoteText(null)).toBe('')
    expect(buildReorderNoteText({ notes: [] })).toBe('')
    expect(buildReorderNoteText({ notes: [{ content: 'x', created_by: 'system' }] })).toBe('')
  })

  it('截断到 addNote 单条上限 1000 字（后端 content maxLength）', () => {
    const long = '长'.repeat(1500)
    expect(buildReorderNoteText({ notes: [{ content: long, created_by: 'artist' }] }).length).toBe(1000)
  })
})

describe('buildReorderTextPrefill', () => {
  const source = {
    client_qq: ' 123456789 ',
    client_name: ' 阿明 ',
    description: ' 一张全身立绘 ',
    notes: [{ id: 1, content: '备注A', created_by: 'artist' }],
    deadline: '2026-09-01',
    start_date: '2026-08-20',
    priority: 'high'
  }

  it('QQ/昵称无条件带上；未勾选描述/备注则留空', () => {
    const p = buildReorderTextPrefill(source, 'style')
    expect(p.clientQq).toBe('123456789')
    expect(p.clientName).toBe('阿明')
    expect(p.description).toBe('')
    expect(p.note).toBe('')
    // 新单从零：日期/优先级等字段不在预填返回值中
    expect('deadline' in p).toBe(false)
    expect('startDate' in p).toBe(false)
    expect('priority' in p).toBe(false)
  })

  it('勾选描述/备注时按字段带入', () => {
    const p = buildReorderTextPrefill(source, 'desc,note')
    expect(p.description).toBe('一张全身立绘')
    expect(p.note).toBe('备注A')
  })

  it('源单为空/缺字段不抛错', () => {
    const p = buildReorderTextPrefill(null, 'desc,style,note')
    expect(p).toEqual({ clientQq: '', clientName: '', description: '', note: '' })
  })
})

describe('buildReorderRefs（819-J 二期）', () => {
  const sourceRefs = [
    { id: 1, file_path: 'references/alice/a.png', original_name: 'a.png', url: '/signed/a' },
    { id: 2, file_path: '  references/alice/b.png  ', original_name: 'b.png', url: '/signed/b' },
    { id: 3, file_path: '', original_name: 'empty.png', url: '/signed/c' },
    { id: 4, file_path: 'references/alice/artist-shot.png', original_name: 'artist-shot.png', url: '/signed/d', source: 'artist' }
  ]

  it('只取有 file_path 的条目并 trim，保留原字段', () => {
    const { refs, truncated } = buildReorderRefs({ references: sourceRefs })
    expect(truncated).toBe(false)
    expect(refs).toEqual([
      { id: 1, file_path: 'references/alice/a.png', original_name: 'a.png', url: '/signed/a' },
      { id: 2, file_path: 'references/alice/b.png', original_name: 'b.png', url: '/signed/b' }
    ])
  })

  it('排除画师加图（source=artist，客户追踪页不可见，不随单带走）', () => {
    const { refs, truncated } = buildReorderRefs({
      references: [
        { id: 1, file_path: 'references/alice/c.png', source: 'client' },
        { id: 2, file_path: 'references/alice/artist.png', source: 'artist' },
        { id: 3, file_path: 'references/alice/legacy.png' }
      ]
    })
    expect(truncated).toBe(false)
    expect(refs.map(r => r.file_path)).toEqual([
      'references/alice/c.png',
      'references/alice/legacy.png'
    ])
  })

  it('源单无参考图/缺字段 → 空数组且不截断', () => {
    expect(buildReorderRefs(null)).toEqual({ refs: [], truncated: false })
    expect(buildReorderRefs({ references: [] })).toEqual({ refs: [], truncated: false })
    expect(buildReorderRefs({})).toEqual({ refs: [], truncated: false })
  })

  it(`超出上限截断为 ${MAX_IMAGE_COUNT} 张并标记 truncated`, () => {
    const many = Array.from({ length: MAX_IMAGE_COUNT + 3 }, (_, i) => ({
      id: i,
      file_path: `references/alice/f${i}.png`,
      original_name: `f${i}.png`
    }))
    const { refs, truncated } = buildReorderRefs({ references: many })
    expect(truncated).toBe(true)
    expect(refs).toHaveLength(MAX_IMAGE_COUNT)
    expect(refs[0].file_path).toBe('references/alice/f0.png')
    expect(refs[refs.length - 1].file_path).toBe(`references/alice/f${MAX_IMAGE_COUNT - 1}.png`)
  })

  it('非法 maxCount 回落默认上限', () => {
    const many = Array.from({ length: MAX_IMAGE_COUNT + 2 }, (_, i) => ({
      id: i,
      file_path: `references/alice/f${i}.png`
    }))
    const { refs, truncated } = buildReorderRefs({ references: many }, 0)
    expect(truncated).toBe(true)
    expect(refs).toHaveLength(MAX_IMAGE_COUNT)
  })
})

describe('findReorderStyleTarget', () => {
  const styles = [
    { id: 11, sizes: [{ id: 111, name: '头像' }, { id: 112, name: '全身' }] },
    { id: 12, sizes: [{ id: 121, name: '头像' }] }
  ]

  it('源单 style_size_id 存在 → 返回 styleId/sizeId', () => {
    expect(findReorderStyleTarget({ style_size_id: 112 }, styles)).toEqual({ styleId: 11, sizeId: 112 })
  })

  it('无尺寸（自定义单）/尺寸已删除/样式列表空 → null（降级只回填描述类）', () => {
    expect(findReorderStyleTarget({ style_size_id: null }, styles)).toBeNull()
    expect(findReorderStyleTarget({ style_size_id: 999 }, styles)).toBeNull()
    expect(findReorderStyleTarget({ style_size_id: 111 }, [])).toBeNull()
  })
})
