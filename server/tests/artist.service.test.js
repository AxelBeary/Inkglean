import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb } from './setup.js'
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

  // ─── v0.12 R15: 外链列表（custom_links） ───

  // TC-R-06: custom_links 写入与读取
  it('TC-R-06: updateArtist 写入 custom_links 并读回', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })
    const links = [
      { name: '我的Pixiv', url: 'https://pixiv.net/users/xxx', icon: 'pixiv' },
      { name: '微博', url: 'https://weibo.com/xxx', icon: 'weibo' }
    ]
    const updated = artistService.updateArtist(artist.id, { custom_links: links })
    const parsed = JSON.parse(updated.custom_links)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].name).toBe('我的Pixiv')
    expect(parsed[1].icon).toBe('weibo')
  })

  // TC-R-06b: custom_links 超 6 条被拒绝
  it('TC-R-06b: 外链超 6 条抛出 LINKS_TOO_MANY', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })
    const links = Array.from({ length: 7 }, (_, i) => ({
      name: `链接${i}`, url: `https://example.com/${i}`, icon: 'link'
    }))

    expect(() => {
      artistService.updateArtist(artist.id, { custom_links: links })
    }).toThrow('LINKS_TOO_MANY')
  })

  // TC-R-06c: custom_links 非法 url 被拒绝
  it('TC-R-06c: 外链 url 非 http/https 抛出 LINK_URL_INVALID', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })

    expect(() => {
      artistService.updateArtist(artist.id, {
        custom_links: [{ name: '恶意', url: 'javascript:alert(1)', icon: 'link' }]
      })
    }).toThrow('LINK_URL_INVALID')
  })

  // TC-R-06d: 旧列 weibo_url/bilibili_url 冻结（updateArtist 不再接受写入）
  it('TC-R-06d: 旧列 weibo_url/bilibili_url 被冻结', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })

    // 尝试通过 updateArtist 写旧列 — 应被忽略（不在 allowed 白名单）
    const updated = artistService.updateArtist(artist.id, { weibo_url: 'https://weibo.com/new' })
    expect(updated.weibo_url).toBeNull() // 未被写入
  })

  // TC-R-07: getCustomLinks 回退逻辑
  it('TC-R-07: getCustomLinks 老画师回退旧列', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })
    // 模拟老画师：custom_links=NULL，有旧列值
    db.prepare('UPDATE artists SET weibo_url = ?, bilibili_url = ? WHERE id = ?')
      .run('https://weibo.com/old', 'https://bilibili.com/old', artist.id)
    const fresh = artistService.getArtistById(artist.id)

    const links = artistService.getCustomLinks(fresh)
    expect(links).toHaveLength(2)
    expect(links[0]).toEqual({ name: '微博', url: 'https://weibo.com/old', icon: 'weibo' })
    expect(links[1]).toEqual({ name: 'Bilibili', url: 'https://bilibili.com/old', icon: 'bilibili' })
  })

  // TC-R-07b: getCustomLinks 已设置空数组时不回退
  it('TC-R-07b: custom_links 空数组不回退旧列', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })
    // 设置旧列 + 空 custom_links
    db.prepare("UPDATE artists SET weibo_url = ?, custom_links = '[]' WHERE id = ?")
      .run('https://weibo.com/old', artist.id)
    const fresh = artistService.getArtistById(artist.id)

    const links = artistService.getCustomLinks(fresh)
    expect(links).toHaveLength(0) // 空数组优先，不回退
  })

  // TC-R-07c: getCustomLinks JSON 解析失败时返回空数组
  it('TC-R-07c: custom_links 非法 JSON 返回空数组', async () => {
    const artist = await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })
    db.prepare("UPDATE artists SET custom_links = 'not-json' WHERE id = ?").run(artist.id)
    const fresh = artistService.getArtistById(artist.id)

    const links = artistService.getCustomLinks(fresh)
    expect(links).toEqual([])
  })
})
