import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'

describe('画师服务 (Artist Service)', () => {
  beforeEach(() => {
    cleanDb()
  })

  // TC-R-01: 创建画师 — 正常（含身份码自动生成）
  it('TC-R-01: 创建画师并自动初始化须知和身份码', async () => {
    const artist = await artistService.createArtist({
      qqNumber: '111',
      name: '测试',
      subdomain: 'test'
    })

    expect(artist.name).toBe('测试')
    expect(artist.subdomain).toBe('test')
    expect(artist.artist_code).toBe('TEST') // 默认子域名大写

    const rules = artistService.getRules(artist.id)
    expect(rules).not.toBeNull()
    expect(rules.content).toBe('')
  })

  // TC-R-01b: 创建画师 — 自定义身份码
  it('TC-R-01b: 自定义身份码', async () => {
    const artist = await artistService.createArtist({
      qqNumber: '111',
      name: '测试',
      subdomain: 'test',
      artistCode: 'QY'
    })

    expect(artist.artist_code).toBe('QY')
  })

  // TC-R-01c: 创建画师 — 身份码重复
  it('TC-R-01c: 身份码重复抛出错误', async () => {
    await artistService.createArtist({ qqNumber: '111', name: 'A', subdomain: 'aaa', artistCode: 'QY' })

    await expect(
      artistService.createArtist({ qqNumber: '222', name: 'B', subdomain: 'bbb', artistCode: 'QY' })
    ).rejects.toThrow('CODE_TAKEN')
  })

  // TC-R-02: 创建画师 — 子域名格式非法
  it('TC-R-02: 非法子域名抛出错误', async () => {
    await expect(
      artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'AB CD!' })
    ).rejects.toThrow('SUBDOMAIN_FORMAT')
  })

  // TC-R-03: 更新画师 — 白名单字段
  it('TC-R-03: 只更新白名单字段，忽略非法字段', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '旧名', subdomain: 'test' })
    const updated = artistService.updateArtist(artist.id, { name: '新名', hack: 'x' })

    expect(updated.name).toBe('新名')
    expect(updated.hack).toBeUndefined()
  })

  // TC-R-03b: 更新画师 — 修改身份码
  it('TC-R-03b: 更新身份码', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })
    const updated = artistService.updateArtist(artist.id, { artist_code: 'NEWCODE' })

    expect(updated.artist_code).toBe('NEWCODE')
  })

  // TC-R-04: 价格档位 CRUD
  it('TC-R-04: 档位创建、读取、更新、删除', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })

    // 创建
    const tier = artistService.createTier(artist.id, { name: '头像', price: 50 })
    expect(tier.name).toBe('头像')
    expect(tier.price).toBe(50)
    expect(tier.sort_order).toBe(1)

    // 读取
    const tiers = artistService.getTiers(artist.id)
    expect(tiers).toHaveLength(1)

    // 更新（camelCase 和 snake_case 都支持）
    const updated = artistService.updateTier(tier.id, { price: 80, workDays: 5 })
    expect(updated.price).toBe(80)
    expect(updated.work_days).toBe(5)

    // 删除
    artistService.deleteTier(tier.id)
    expect(artistService.getTiers(artist.id)).toHaveLength(0)
  })

  // TC-R-05: 作品 CRUD
  it('TC-R-05: 作品创建、读取、删除', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })

    const a1 = artistService.createArtwork(artist.id, { imagePath: 'img/1.png', title: '作品1' })
    const a2 = artistService.createArtwork(artist.id, { imagePath: 'img/2.png', title: '作品2' })

    expect(a1.sort_order).toBe(1)
    expect(a2.sort_order).toBe(2)

    const artworks = artistService.getArtworks(artist.id)
    expect(artworks).toHaveLength(2)

    artistService.deleteArtwork(a1.id)
    expect(artistService.getArtworks(artist.id)).toHaveLength(1)
  })
})
