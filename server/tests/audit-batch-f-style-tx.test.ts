import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import * as styleService from '../src/features/pricing/style.service.js'

// ============================================
// 审计批 F-1（P3-20）: 先写后校验无回滚
// updateArtStyle / updateAddonTemplate 写字段时若后置校验抛错，
// 已写入字段必须随事务整体回滚（无半态）
// ============================================

describe('审计批 F-1 更新事务回滚', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88301', subdomain: 'f1-tx' })
  })

  it('TC-F1-01: updateArtStyle 先写 name 后置 cover_image 非法 → name 不落库', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })

    expect(() => styleService.updateArtStyle(artist.id, style.id, {
      name: '被改的新名字',
      cover_image: '../evil.png'
    })).toThrow('ILLEGAL_PATH')

    const after = styleService.getArtStyle(artist.id, style.id)
    expect(after.name).toBe('日系')
    expect(after.cover_image).toBeNull()
  })

  it('TC-F1-02: updateArtStyle 多字段混合——先写字段与后置非法字段同批 → 全部回滚', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系', description: '旧描述' })

    expect(() => styleService.updateArtStyle(artist.id, style.id, {
      name: '新名',
      description: '新描述',
      cover_image: '../x.png'
    })).toThrow('ILLEGAL_PATH') // name/description 已写入后 cover_image 校验才抛错

    const after = styleService.getArtStyle(artist.id, style.id)
    expect(after.name).toBe('日系')
    expect(after.description).toBe('旧描述')
    expect(after.cover_image).toBeNull()
  })

  it('TC-F1-03: updateAddonTemplate 先写 name 后置跨字段校验失败 → name 不落库', () => {
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 50
    })

    expect(() => styleService.updateAddonTemplate(artist.id, tpl.id, {
      name: '改名',
      category: 'usage' // 与 price_mode=fixed 冲突 → 跨字段校验抛 VALIDATION
    })).toThrow('VALIDATION')

    const after = styleService.getAddonTemplate(artist.id, tpl.id)
    expect(after.name).toBe('背景')
    expect(after.category).toBe('add')
  })

  it('TC-F1-04: updateAddonTemplate 先写 default_price 后置 percent 越界 → 不落库', () => {
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '精细', control_type: 'switch', price_mode: 'percent', default_price: 20
    })

    expect(() => styleService.updateAddonTemplate(artist.id, tpl.id, {
      default_price: 300,
      max_quantity: 10000
    })).toThrow('VALIDATION')

    const after = styleService.getAddonTemplate(artist.id, tpl.id)
    expect(after.default_price).toBe(20)
  })

  it('TC-F1-05: 正常更新行为不变（事务外回归）', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const updated = styleService.updateArtStyle(artist.id, style.id, {
      name: '日系清新',
      is_active: false
    })
    expect(updated.name).toBe('日系清新')
    expect(updated.is_active).toBe(0)

    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 50
    })
    const tplUpdated = styleService.updateAddonTemplate(artist.id, tpl.id, {
      name: '加背景', default_price: 200
    })
    expect(tplUpdated.name).toBe('加背景')
    expect(tplUpdated.default_price).toBe(200)
  })

  it('TC-F1-06: 更新失败后原值仍在且可继续正常更新（无锁残留）', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    expect(() => styleService.updateArtStyle(artist.id, style.id, { name: '' })).toThrow('STYLE_NAME_EMPTY')
    expect(styleService.getArtStyle(artist.id, style.id).name).toBe('日系')

    // 回滚后可继续正常更新
    const updated = styleService.updateArtStyle(artist.id, style.id, { name: '日系清新' })
    expect(updated.name).toBe('日系清新')
  })

  it('TC-F1-07: 事务回滚后 id 序列与计数一致（无幽灵行）', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const before = (db.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = ?').get(artist.id) as { c: number }).c
    try {
      styleService.updateArtStyle(artist.id, style.id, { name: '坏', cover_image: '../x' })
    } catch { /* 预期抛错 */ }
    const after = (db.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = ?').get(artist.id) as { c: number }).c
    expect(after).toBe(before)
  })
})
