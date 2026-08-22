import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist, type ArtistRow } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'
import type { Artist } from '../src/types/entities.js'

// ============================================
// 审计批 F-4（P3-17）: template_id / dashboard_default_panel 白名单
// 原状：仅 maxLength 50 后原样入库；同函数 order_template_id / palette_id 已有白名单
// 修法：与 web 侧实际消费枚举一致的白名单（来源注释），非法值抛 VALIDATION
// ============================================

describe('审计批 F-4 模板/面板白名单', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88410', subdomain: 'f4-wl' })
  })

  it('TC-F4-01: 合法 template_id 全部通过', () => {
    for (const tpl of ['atelier', 'classic', 'gallery', 'folio']) {
      const updated = artistService.updateArtist(artist.id, { template_id: tpl }) as Artist
      expect(updated.template_id).toBe(tpl)
    }
  })

  it('TC-F4-02: 非法 template_id 被拒（含历史遗留 default/dark-gallery/single-page）', () => {
    for (const tpl of ['evil', 'default', 'dark-gallery', 'single-page', 'CLASSIC']) {
      expect(() => artistService.updateArtist(artist.id, { template_id: tpl }))
        .toThrow('VALIDATION')
    }
  })

  it('TC-F4-03: 合法 dashboard_default_panel 通过（含 null 清除；822 批补 dashboard 档）', () => {
    for (const panel of ['dashboard', 'queue', 'orders', 'manual', 'tiers']) {
      const updated = artistService.updateArtist(artist.id, { dashboard_default_panel: panel }) as Artist
      expect(updated.dashboard_default_panel).toBe(panel)
    }
    const cleared = artistService.updateArtist(artist.id, { dashboard_default_panel: null }) as Artist
    expect(cleared.dashboard_default_panel).toBeNull()
  })

  it('TC-F4-04: 非法 dashboard_default_panel 被拒', () => {
    for (const panel of ['nope', 'queue\n', '', 'Dashboard']) {
      expect(() => artistService.updateArtist(artist.id, { dashboard_default_panel: panel }))
        .toThrow('VALIDATION')
    }
  })

  it('TC-F4-05: 混合更新——合法字段 + 非法模板 → 整体不写入（无半态）', () => {
    expect(() => artistService.updateArtist(artist.id, {
      name: '新名字',
      template_id: 'hack'
    })).toThrow('VALIDATION')

    const after = artistService.getArtistById(artist.id) as Artist
    expect(after.name).toBe('测试画师')
    expect(after.template_id).toBe('default') // 建库默认值未被动过
  })

  it('TC-F4-06: 合法值走路由层（camelCase → snake_case）行为不变', async () => {
    const { createSession } = await import('../src/features/auth/auth.service.js')
    const { buildApp } = await import('../src/app.js')
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: { templateId: 'gallery', dashboardDefaultPanel: 'orders' }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().template_id).toBe('gallery')
      expect(res.json().dashboard_default_panel).toBe('orders')
    } finally {
      await app.close()
    }
  })

  it('TC-F4-07: 非法值走路由层 → 400 VALIDATION', async () => {
    const { createSession } = await import('../src/features/auth/auth.service.js')
    const { buildApp } = await import('../src/app.js')
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: { templateId: 'hack' }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('VALIDATION')
    } finally {
      await app.close()
    }
  })
})
