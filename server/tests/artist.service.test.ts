import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb } from './setup.js'
import type { ArtistRow } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'

describe('画师服务 (Artist Service)', () => {
  beforeEach(() => {
    cleanDb()
  })

  // TC-R-01: 创建画师 — 正常（含身份码自动生成）
  it('TC-R-01: 创建画师并自动初始化须知和身份码', async () => {
    const artist = (await artistService.createArtist({
      qqNumber: '111',
      name: '测试',
      subdomain: 'test'
    }))!

    expect(artist.name).toBe('测试')
    expect(artist.subdomain).toBe('test')
    expect(artist.artist_code).toBe('TEST') // 默认子域名大写

    const rules = artistService.getRules(artist.id)
    expect(rules).not.toBeNull()
    expect(rules!.content).toBe('')
  })

  // TC-R-01b: 创建画师 — 自定义身份码
  it('TC-R-01b: 自定义身份码', async () => {
    const artist = (await artistService.createArtist({
      qqNumber: '111',
      name: '测试',
      subdomain: 'test',
      artistCode: 'QY'
    }))!

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
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '旧名', subdomain: 'test' }))!
    const updated = artistService.updateArtist(artist.id, { name: '新名', hack: 'x' }) as ArtistRow

    expect(updated.name).toBe('新名')
    expect(updated.hack).toBeUndefined()
  })

  // TC-R-03b: 更新画师 — 修改身份码
  it('TC-R-03b: 更新身份码', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const updated = artistService.updateArtist(artist.id, { artist_code: 'NEWCODE' })

    expect(updated!.artist_code).toBe('NEWCODE')
  })

  // TC-R-04: 价格档位 CRUD（SPEC-PRICE-2 v50：price_tiers 已清退，用例退役；
  // 画风/尺寸/增项 CRUD 覆盖见 tests/style.test.js）

  // TC-R-05: 作品 CRUD
  it('TC-R-05: 作品创建、读取、删除', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!

    const a1 = (await artistService.createArtwork(artist.id, { imagePath: 'img/1.png', title: '作品1' }))!
    const a2 = (await artistService.createArtwork(artist.id, { imagePath: 'img/2.png', title: '作品2' }))!

    expect(a1.sort_order).toBe(1)
    expect(a2.sort_order).toBe(2)

    const artworks = artistService.getArtworks(artist.id)
    expect(artworks).toHaveLength(2)

    artistService.deleteArtwork(a1.id)
    expect(artistService.getArtworks(artist.id)).toHaveLength(1)
  })

  // ─── REQ-022 F2: 外链列表（custom_links，新结构 [{platformId, url}]） ───

  // TC-R-06: custom_links 写入（归一化 + platformId 后端推导）与读取
  it('TC-R-06: updateArtist 写入 custom_links 并读回（新结构）', async () => {
    // 建平台行（service 层重推导依赖 social_platforms）
    const p = db.prepare(`
      INSERT INTO social_platforms (name, icon_key, match_domains, sort_order, enabled)
      VALUES ('微博', 'sinaweibo', ?, 1, 1)
    `).run(JSON.stringify(['weibo.com']))
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const links = [
      { platformId: 99999, url: 'https://weibo.com/xxx' }, // 前端传的 platformId 被忽略
      { url: 'https://example.com/yyy' }
    ]
    const updated = artistService.updateArtist(artist.id, { custom_links: links })
    const parsed = JSON.parse(updated!.custom_links as string)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({ platformId: p.lastInsertRowid, url: 'https://weibo.com/xxx' })
    expect(parsed[1]).toEqual({ platformId: null, url: 'https://example.com/yyy' })
  })

  // TC-R-06b: custom_links 超 8 条被拒绝（派工上限 8）
  it('TC-R-06b: 外链超 8 条抛出 LINKS_TOO_MANY', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const links = Array.from({ length: 9 }, (_, i) => ({ url: `https://example.com/${i}` }))

    expect(() => {
      artistService.updateArtist(artist.id, { custom_links: links })
    }).toThrow('LINKS_TOO_MANY')
  })

  // TC-R-06c: custom_links 非法协议被拒绝
  it('TC-R-06c: 外链 url 非 http/https 抛出 LINK_URL_INVALID', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!

    expect(() => {
      artistService.updateArtist(artist.id, {
        custom_links: [{ url: 'javascript:alert(1)' }]
      })
    }).toThrow('LINK_URL_INVALID')
  })

  // TC-R-06d: 旧列 weibo_url/bilibili_url 冻结（updateArtist 不再接受写入）
  it('TC-R-06d: 旧列 weibo_url/bilibili_url 被冻结', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!

    // 尝试通过 updateArtist 写旧列 — 应被忽略（不在 allowed 白名单）
    const updated = artistService.updateArtist(artist.id, { weibo_url: 'https://weibo.com/new' })
    expect(updated!.weibo_url).toBeNull() // 未被写入
  })

  // TC-R-06e: platform_urls 写入分支已删除（updateArtist 不再接受该字段）
  it('TC-R-06e: platform_urls 字段被冻结（不在 allowed 白名单）', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const updated = artistService.updateArtist(artist.id, {
      platform_urls: [{ url: 'https://pixiv.net/users/1' }]
    })
    expect(updated!.platform_urls).toBeNull() // 未被写入
  })

  // TC-R-07: getCustomLinks 旧列回退已删除（REQ-022 F2 拍板：直接删，无迁移）
  it('TC-R-07: custom_links=NULL 时返回空数组（不回退旧列）', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    // 模拟旧列残留值——新读路径不回退
    db.prepare('UPDATE artists SET weibo_url = ?, bilibili_url = ? WHERE id = ?')
      .run('https://weibo.com/old', 'https://bilibili.com/old', artist.id)
    const fresh = artistService.getArtistById(artist.id)

    expect(artistService.getCustomLinks(fresh!)).toEqual([])
  })

  // TC-R-07b: getCustomLinks 空数组照常返回空数组
  it('TC-R-07b: custom_links 空数组返回空数组', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    db.prepare("UPDATE artists SET custom_links = '[]' WHERE id = ?").run(artist.id)
    const fresh = artistService.getArtistById(artist.id)

    const links = artistService.getCustomLinks(fresh!)
    expect(links).toHaveLength(0)
  })

  // TC-R-07c: getCustomLinks JSON 解析失败时返回空数组
  it('TC-R-07c: custom_links 非法 JSON 返回空数组', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    db.prepare("UPDATE artists SET custom_links = 'not-json' WHERE id = ?").run(artist.id)
    const fresh = artistService.getArtistById(artist.id)

    const links = artistService.getCustomLinks(fresh!)
    expect(links).toEqual([])
  })

  // ─── v0.15 R49: 强调色 ───

  // TC-R-08: updateArtist 设置合法强调色
  it('TC-R-08: updateArtist 设置 accent_color', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const updated = artistService.updateArtist(artist.id, { accent_color: '#356b69' })
    expect(updated!.accent_color).toBe('#356b69')
  })

  // TC-R-08b: updateArtist 清除强调色（null）
  it('TC-R-08b: updateArtist 清除 accent_color', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    artistService.updateArtist(artist.id, { accent_color: '#5e5494' })
    const cleared = artistService.updateArtist(artist.id, { accent_color: null })
    expect(cleared!.accent_color).toBeNull()
  })

  // TC-R-08c: updateArtist 拒绝非法强调色
  it('TC-R-08c: updateArtist 拒绝非法 accent_color', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    expect(() => {
      artistService.updateArtist(artist.id, { accent_color: '#ff0000' })
    }).toThrow('INVALID_ACCENT_COLOR')
  })

  // TC-R-08d: 5 色全部合法
  it('TC-R-08d: 5 色预设全部可设置', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const colors = ['#356b69', '#3f5e80', '#5e5494', '#346edb', '#3445db']
    for (const c of colors) {
      const updated = artistService.updateArtist(artist.id, { accent_color: c })
      expect(updated!.accent_color).toBe(c)
    }
  })

  // ─── v0.16 R58-7: 下单页模板 ───

  // TC-R-09: 迁移 v16 — 新画师默认 order_template_id = 'default'
  it('TC-R-09: 新画师 order_template_id 默认值为 default', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    expect(artist.order_template_id).toBe('default')
  })

  // TC-R-09b: updateArtist 设置合法模板
  it('TC-R-09b: updateArtist 设置 order_template_id = default', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    const updated = artistService.updateArtist(artist.id, { order_template_id: 'default' })
    expect(updated!.order_template_id).toBe('default')
  })

  // TC-R-09c: updateArtist 拒绝非法模板
  it('TC-R-09c: updateArtist 拒绝非法 order_template_id', async () => {
    const artist = (await artistService.createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' }))!
    expect(() => {
      artistService.updateArtist(artist.id, { order_template_id: 'hacked' })
    }).toThrow('INVALID_ORDER_TEMPLATE')
  })

  // ─── P1-6: 重复 qq/subdomain 注册 ───

  // TC-R-10: 重复 qq_number 注册抛出 QQ_TAKEN
  it('TC-R-10: 重复 qq_number 注册抛出 QQ_TAKEN', async () => {
    await artistService.createArtist({ qqNumber: '77001', name: 'A', subdomain: 'aaa' })

    await expect(
      artistService.createArtist({ qqNumber: '77001', name: 'B', subdomain: 'bbb' })
    ).rejects.toThrow('QQ_TAKEN')
  })

  // TC-R-10b: 重复 subdomain 注册抛出 SUBDOMAIN_TAKEN
  it('TC-R-10b: 重复 subdomain 注册抛出 SUBDOMAIN_TAKEN', async () => {
    await artistService.createArtist({ qqNumber: '77002', name: 'A', subdomain: 'dupsub' })

    // 指定不同 artistCode，跳过 CODE_TAKEN 检查，命中 subdomain 唯一性
    await expect(
      artistService.createArtist({ qqNumber: '77003', name: 'B', subdomain: 'dupsub', artistCode: 'OTHER' })
    ).rejects.toThrow('SUBDOMAIN_TAKEN')
  })

  // d2 P2: 保留词 system 与 getAllArtists 的隐身排除冲突，服务层兜底拒绝
  it('TC-R-10c: 保留词 system 被服务层兜底拒绝', async () => {
    await expect(
      artistService.createArtist({ qqNumber: '77004', name: '系统', subdomain: 'system' })
    ).rejects.toThrow('SUBDOMAIN_FORMAT')
  })
})
