import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { migrateF5OldModelArtists } from '../src/db/init.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as artistService from '../src/features/artist/artist.service.js'

// ============================================
// v0.35 波1 测试 — 迁移 v37 + F5 旧模型迁移 + 尺寸新字段 + 多画风开关 + 作品档位标注
// REQ-024 (F1/F2/F5/F6 数据层与 API)
// ============================================

// ─── 辅助函数 ───

function seedOldTier(artistId, name, price, sortOrder = 0, visibility = 'visible') {
  const r = db.prepare(
    'INSERT INTO price_tiers (artist_id, name, price, sort_order, visibility) VALUES (?, ?, ?, ?, ?)'
  ).run(artistId, name, price, sortOrder, visibility)
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(r.lastInsertRowid)
}

function setMultiStyleEnabled(artistId, enabled) {
  db.prepare('UPDATE artists SET multi_style_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, artistId)
}

// ─── F5 旧模型迁移 ───

describe('F5 旧模型迁移 (migrateF5OldModelArtists)', () => {
  beforeEach(() => cleanDb())

  it('TC-F5-01: 旧模型画师 → 建「默认」画风 + visible 档位转尺寸（只搬 name/price/sort_order）', () => {
    const artist = seedArtist({ qq_number: '78001', subdomain: 'f5-carol' })
    seedOldTier(artist.id, '头像插画', 60, 1)
    seedOldTier(artist.id, '半身场景', 150, 2)
    seedOldTier(artist.id, '全身插画', 260, 3)

    migrateF5OldModelArtists(db)

    const styles = styleService.getArtStyles(artist.id)
    expect(styles).toHaveLength(1)
    expect(styles[0].name).toBe('默认')
    expect(styles[0].is_active).toBe(1)
    expect(styles[0].sort_order).toBe(0)
    expect(styles[0].sizes).toHaveLength(3)
    expect(styles[0].sizes[0].name).toBe('头像插画')
    expect(styles[0].sizes[0].base_price).toBe(60)
    expect(styles[0].sizes[2].name).toBe('全身插画')
    // 图/描述/天数不搬
    expect(styles[0].sizes[0].image).toBeNull()
    expect(styles[0].sizes[0].description).toBeNull()
    expect(styles[0].sizes[0].work_days).toBeNull()
    // 旧 price_tiers 数据保留（orders.tier_id 外键仍指向它）
    const oldTiers = db.prepare('SELECT COUNT(*) AS c FROM price_tiers WHERE artist_id = ?').get(artist.id).c
    expect(oldTiers).toBe(3)
  })

  it('TC-F5-02: showcase/hidden 档位直接丢弃，不迁移', () => {
    const artist = seedArtist({ qq_number: '78002', subdomain: 'f5-drop' })
    seedOldTier(artist.id, '普通档', 100, 1, 'visible')
    seedOldTier(artist.id, '展示档', 200, 2, 'showcase')
    seedOldTier(artist.id, '隐藏档', 300, 3, 'hidden')

    migrateF5OldModelArtists(db)

    const styles = styleService.getArtStyles(artist.id)
    expect(styles[0].sizes).toHaveLength(1)
    expect(styles[0].sizes[0].name).toBe('普通档')
  })

  it('TC-F5-03: 幂等复跑 — 不产生重复画风/尺寸', () => {
    const artist = seedArtist({ qq_number: '78003', subdomain: 'f5-idem' })
    seedOldTier(artist.id, '头像', 60, 1)
    seedOldTier(artist.id, '全身', 260, 2)

    migrateF5OldModelArtists(db)
    migrateF5OldModelArtists(db) // 复跑
    migrateF5OldModelArtists(db) // 再复跑

    const styles = styleService.getArtStyles(artist.id)
    expect(styles).toHaveLength(1)
    expect(styles[0].sizes).toHaveLength(2)
  })

  it('TC-F5-04: 已有画风的画师跳过（alice 场景）', () => {
    const artist = seedArtist({ qq_number: '78004', subdomain: 'f5-alice' })
    // alice 已被 v36 迁移过：有默认画风 + 厚涂画风
    styleService.createArtStyle(artist.id, { name: '默认' })
    styleService.createArtStyle(artist.id, { name: '厚涂插画' })
    seedOldTier(artist.id, '残留旧档', 999, 1)

    migrateF5OldModelArtists(db)

    const styles = styleService.getArtStyles(artist.id)
    expect(styles).toHaveLength(2) // 不新建
    expect(styles.every(s => s.name !== '默认' || s.id)).toBe(true)
    // 残留旧档不会被搬
    expect(styles[0].sizes).toHaveLength(0)
  })

  it('TC-F5-05: 多画师混合 — 只迁 art_styles 为零的画师', () => {
    const alice = seedArtist({ qq_number: '78005', subdomain: 'f5-mix-alice' })
    styleService.createArtStyle(alice.id, { name: '默认' })
    const carol = seedArtist({ qq_number: '78006', subdomain: 'f5-mix-carol' })
    seedOldTier(carol.id, '头像', 50, 1)

    migrateF5OldModelArtists(db)

    expect(styleService.getArtStyles(alice.id)).toHaveLength(1)
    expect(styleService.getArtStyles(alice.id)[0].name).toBe('默认')
    const carolStyles = styleService.getArtStyles(carol.id)
    expect(carolStyles).toHaveLength(1)
    expect(carolStyles[0].sizes).toHaveLength(1)
  })
})

// ─── 迁移 v37 结构 ───

describe('迁移 v37 结构验证', () => {
  beforeEach(() => cleanDb())

  it('TC-V37-01: style_sizes 新字段存在（image/image_artwork_id/description/work_days）', () => {
    const cols = db.prepare('PRAGMA table_info(style_sizes)').all().map(c => c.name)
    expect(cols).toContain('image')
    expect(cols).toContain('image_artwork_id')
    expect(cols).toContain('description')
    expect(cols).toContain('work_days')
  })

  it('TC-V37-02: artists.multi_style_enabled 存在且默认 0', () => {
    const artist = seedArtist({ qq_number: '78010', subdomain: 'v37-flag' })
    expect(artist.multi_style_enabled).toBe(0)
  })

  it('TC-V37-03: artworks.description 存在', () => {
    const cols = db.prepare('PRAGMA table_info(artworks)').all().map(c => c.name)
    expect(cols).toContain('description')
  })

  it('TC-V37-04: artwork_size_tags 表存在 + 双向 CASCADE', async () => {
    const artist = seedArtist({ qq_number: '78011', subdomain: 'v37-tags' })
    const style = styleService.createArtStyle(artist.id, { name: '默认' })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 100 })
    const artwork = await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/a.jpg` })

    artistService.setArtworkSizeTags(artist.id, artwork.id, [size.id])
    expect(artistService.getArtworkSizeTagIds(artwork.id)).toEqual([size.id])

    // 删尺寸 → 标注自动失效（F6 验收 8）
    styleService.deleteStyleSize(artist.id, style.id, size.id)
    expect(artistService.getArtworkSizeTagIds(artwork.id)).toEqual([])

    // 重新建尺寸测删作品级联
    const size2 = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 300 })
    artistService.setArtworkSizeTags(artist.id, artwork.id, [size2.id])
    artistService.deleteArtwork(artwork.id)
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM artwork_size_tags').get().c
    expect(remaining).toBe(0)
  })

  it('TC-V37-05: 删作品 → 引用它的尺寸 image_artwork_id 自动置空', async () => {
    const artist = seedArtist({ qq_number: '78012', subdomain: 'v37-ref' })
    const style = styleService.createArtStyle(artist.id, { name: '默认' })
    const artwork = await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/b.jpg` })
    const size = styleService.createStyleSize(artist.id, style.id, {
      name: '头像', base_price: 100, image_artwork_id: artwork.id
    })
    expect(size.image_artwork_id).toBe(artwork.id)

    artistService.deleteArtwork(artwork.id)
    const row = db.prepare('SELECT image_artwork_id FROM style_sizes WHERE id = ?').get(size.id)
    expect(row.image_artwork_id).toBeNull()
  })
})

// ─── 尺寸新字段 CRUD（F1） ───

describe('尺寸新字段 CRUD (F1)', () => {
  let artist, style

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '78020', subdomain: 'f1-size' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
  })

  it('TC-SZ-01: 创建尺寸带图/描述/天数', () => {
    const size = styleService.createStyleSize(artist.id, style.id, {
      name: '头像', base_price: 200,
      image: `images/${artist.id}/size-head.jpg`,
      description: '正方形头像', work_days: 3
    })
    expect(size.image).toBe(`images/${artist.id}/size-head.jpg`)
    expect(size.description).toBe('正方形头像')
    expect(size.work_days).toBe(3)
  })

  it('TC-SZ-02: 从作品集挑图（image_artwork_id）', async () => {
    const artwork = await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/w1.jpg` })
    const size = styleService.createStyleSize(artist.id, style.id, {
      name: '半身', base_price: 400, image_artwork_id: artwork.id
    })
    expect(size.image_artwork_id).toBe(artwork.id)
    expect(size.image).toBeNull()
  })

  it('TC-SZ-03: 更新 — image 与 image_artwork_id 互斥（传一清一）', async () => {
    const artwork = await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/w2.jpg` })
    const size = styleService.createStyleSize(artist.id, style.id, {
      name: '头像', base_price: 200, image: `images/${artist.id}/old.jpg`
    })

    // 改挑作品集图 → image 清空
    const updated = styleService.updateStyleSize(artist.id, style.id, size.id, { image_artwork_id: artwork.id })
    expect(updated.image_artwork_id).toBe(artwork.id)
    expect(updated.image).toBeNull()

    // 改独立上传 → image_artwork_id 清空
    const updated2 = styleService.updateStyleSize(artist.id, style.id, size.id, { image: `images/${artist.id}/new.jpg` })
    expect(updated2.image).toBe(`images/${artist.id}/new.jpg`)
    expect(updated2.image_artwork_id).toBeNull()
  })

  it('TC-SZ-04: 全部可选 — 不带图/描述/天数也能保存', () => {
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    expect(size.image).toBeNull()
    expect(size.image_artwork_id).toBeNull()
    expect(size.description).toBeNull()
    expect(size.work_days).toBeNull()
  })

  it('TC-SZ-05: image 路径穿越 → ILLEGAL_PATH', () => {
    expect(() => styleService.createStyleSize(artist.id, style.id, {
      name: 'X', base_price: 100, image: '../etc/passwd'
    })).toThrow('ILLEGAL_PATH')
    expect(() => styleService.createStyleSize(artist.id, style.id, {
      name: 'X', base_price: 100, image: `images/${artist.id + 1}/someone.jpg`
    })).toThrow('ILLEGAL_PATH')
  })

  it('TC-SZ-06: image_artwork_id 不属于该画师 → 404', async () => {
    const other = seedArtist({ qq_number: '78021', subdomain: 'f1-other' })
    const otherArt = await artistService.createArtwork(other.id, { imagePath: `images/${other.id}/x.jpg` })
    expect(() => styleService.createStyleSize(artist.id, style.id, {
      name: 'X', base_price: 100, image_artwork_id: otherArt.id
    })).toThrow('ARTWORK_NOT_FOUND')
  })
})

// ─── 多画风开关（F2） ───

describe('多画风开关 (F2 公开接口行为)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '78030', subdomain: 'f2-switch' })
    // alice 场景：2 个启用画风
    const s1 = styleService.createArtStyle(artist.id, { name: '默认' })
    styleService.createArtStyle(artist.id, { name: '厚涂插画' })
    styleService.createStyleSize(artist.id, s1.id, { name: '头像', base_price: 50 })
  })

  it('TC-MS-01: 开关关闭（默认）→ 公开接口只返回默认画风', () => {
    expect(artist.multi_style_enabled).toBe(0)
    const result = styleService.getPublicStyles(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('默认')
  })

  it('TC-MS-02: 开关打开 → 全部启用画风可见', () => {
    setMultiStyleEnabled(artist.id, 1)
    const result = styleService.getPublicStyles(artist.id)
    expect(result).toHaveLength(2)
  })

  it('TC-MS-03: 开关关 + 默认画风停用 → 动态顺延到下一个启用画风', () => {
    const styles = styleService.getArtStyles(artist.id)
    styleService.updateArtStyle(artist.id, styles[0].id, { is_active: false }) // 停用「默认」
    const result = styleService.getPublicStyles(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('厚涂插画') // F2 验收 5
  })

  it('TC-MS-04: 开关往返不丢数据（关→开→关画风数据完整）', () => {
    setMultiStyleEnabled(artist.id, 1)
    setMultiStyleEnabled(artist.id, 0)
    const styles = styleService.getArtStyles(artist.id) // 后台列表不受开关影响
    expect(styles).toHaveLength(2)
  })
})

// ─── 公开接口尺寸新字段（F1 验收 2） ───

describe('公开接口尺寸新字段', () => {
  it('TC-PUB-F1: sizes 带出 image/artwork_image_path/description/work_days', async () => {
    cleanDb()
    const artist = seedArtist({ qq_number: '78040', subdomain: 'pub-f1' })
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const artwork = await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/ref.jpg` })
    styleService.createStyleSize(artist.id, style.id, {
      name: '头像', base_price: 100, image: `images/${artist.id}/sz.jpg`, description: '头像描述', work_days: 3
    })
    styleService.createStyleSize(artist.id, style.id, {
      name: '半身', base_price: 200, image_artwork_id: artwork.id
    })

    const result = styleService.getPublicStyles(artist.id)
    const sizes = result[0].sizes
    // 独立上传图
    expect(sizes[0].image).toBe(`images/${artist.id}/sz.jpg`)
    expect(sizes[0].artwork_image_path).toBeNull()
    expect(sizes[0].description).toBe('头像描述')
    expect(sizes[0].work_days).toBe(3)
    // 作品集引用图（实时解析路径）
    expect(sizes[1].image).toBeNull()
    expect(sizes[1].image_artwork_id).toBe(artwork.id)
    expect(sizes[1].artwork_image_path).toBe(`images/${artist.id}/ref.jpg`)
  })
})

// ─── 作品档位标注 + 画廊端点（F6 数据层） ───

describe('作品档位标注 (F6)', () => {
  let artist, style, sizeA, sizeB, artwork

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist({ qq_number: '78050', subdomain: 'f6-tags' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
    sizeA = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 100 })
    sizeB = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 300 })
    artwork = await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/p1.jpg` })
  })

  it('TC-TAG-01: 多选标注 + 替换语义', () => {
    let ids = artistService.setArtworkSizeTags(artist.id, artwork.id, [sizeA.id, sizeB.id])
    expect(ids.sort()).toEqual([sizeA.id, sizeB.id].sort())
    // 替换（不是追加）
    ids = artistService.setArtworkSizeTags(artist.id, artwork.id, [sizeB.id])
    expect(ids).toEqual([sizeB.id])
  })

  it('TC-TAG-02: 跨画师尺寸 → 404 且不留脏数据', () => {
    const other = seedArtist({ qq_number: '78051', subdomain: 'f6-other' })
    const otherStyle = styleService.createArtStyle(other.id, { name: '其他' })
    const otherSize = styleService.createStyleSize(other.id, otherStyle.id, { name: 'X', base_price: 1 })

    expect(() => artistService.setArtworkSizeTags(artist.id, artwork.id, [sizeA.id, otherSize.id]))
      .toThrow('STYLE_SIZE_NOT_FOUND')
    expect(artistService.getArtworkSizeTagIds(artwork.id)).toEqual([]) // 事务回滚
  })

  it('TC-TAG-03: 作品自由描述编辑', () => {
    const updated = artistService.updateArtwork(artwork.id, { description: '某某角色设定，画了 20 小时' })
    expect(updated.description).toBe('某某角色设定，画了 20 小时')
    const cleared = artistService.updateArtwork(artwork.id, { description: '' })
    expect(cleared.description).toBeNull()
  })

  it('TC-TAG-04: getPublicGallery — 标注 + 筛选标签 + 开关门控', () => {
    artistService.setArtworkSizeTags(artist.id, artwork.id, [sizeA.id, sizeB.id])
    const style2 = styleService.createArtStyle(artist.id, { name: '厚涂' })
    const sizeC = styleService.createStyleSize(artist.id, style2.id, { name: '半身', base_price: 200 })
    artistService.setArtworkSizeTags(artist.id, artwork.id, [sizeA.id, sizeC.id])

    // 开关关闭：只有默认画风的标注可见
    let gallery = styleService.getPublicGallery(artist.id)
    expect(gallery.filterSizes).toHaveLength(2) // 头像/全身
    expect(gallery.artworks[0].size_tags.map(t => t.size_name)).toEqual(['头像'])
    expect(gallery.artworks[0].size_tags[0].style_name).toBe('日系')

    // 开关打开：厚涂尺寸参与
    setMultiStyleEnabled(artist.id, 1)
    gallery = styleService.getPublicGallery(artist.id)
    expect(gallery.filterSizes).toHaveLength(3)
    expect(gallery.artworks[0].size_tags.map(t => t.size_name).sort()).toEqual(['半身', '头像'])
  })

  it('TC-TAG-05: 删尺寸 → 标注自动失效不残留（F6 验收 8）', () => {
    artistService.setArtworkSizeTags(artist.id, artwork.id, [sizeA.id, sizeB.id])
    styleService.deleteStyleSize(artist.id, style.id, sizeA.id)

    const gallery = styleService.getPublicGallery(artist.id)
    expect(gallery.artworks[0].size_tags.map(t => t.size_name)).toEqual(['全身'])
    expect(gallery.filterSizes.map(s => s.name)).toEqual(['全身'])
  })
})

// ─── 路由层集成 ───

describe('v0.37 路由层集成测试', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-V37-RT-01: 尺寸 CRUD 新字段完整链路 + additionalProperties', async () => {
    const artist = seedArtist({ qq_number: '78060', subdomain: 'v37-rt1' })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    const styleRes = await app.inject({
      method: 'POST', url: '/api/artist/art-styles', headers, payload: { name: '日系' }
    })
    const styleId = styleRes.json().id

    // 创建带新字段
    const createRes = await app.inject({
      method: 'POST', url: `/api/artist/art-styles/${styleId}/sizes`, headers,
      payload: { name: '头像', base_price: 100, image: `images/${artist.id}/s.jpg`, description: 'desc', work_days: 5 }
    })
    expect(createRes.statusCode).toBe(200)
    expect(createRes.json().work_days).toBe(5)

    // 更新（换图 + 清描述）
    const sizeId = createRes.json().id
    const updRes = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${styleId}/sizes/${sizeId}`, headers,
      payload: { image: null, description: null }
    })
    expect(updRes.json().image).toBeNull()
    expect(updRes.json().description).toBeNull()

    // 非法字段静默剥离（ajv removeAdditional）
    const evilRes = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${styleId}/sizes/${sizeId}`, headers,
      payload: { evil: 'hack' }
    })
    expect(evilRes.statusCode).toBe(200)
    expect(evilRes.json().evil).toBeUndefined()
  })

  it('TC-V37-RT-02: PUT /api/artist/profile multiStyleEnabled', async () => {
    const artist = seedArtist({ qq_number: '78061', subdomain: 'v37-rt2' })
    const token = createSession(artist.id, artist.token_version)

    const res = await app.inject({
      method: 'PUT', url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${token}` },
      payload: { multiStyleEnabled: true }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().multi_style_enabled).toBe(1)
  })

  it('TC-V37-RT-03: 公开接口开关行为（HTTP 层）', async () => {
    const artist = seedArtist({ qq_number: '78062', subdomain: 'v37-rt3' })
    styleService.createArtStyle(artist.id, { name: '默认' })
    styleService.createArtStyle(artist.id, { name: '厚涂' })

    const off = await app.inject({ method: 'GET', url: '/api/public/styles/v37-rt3' })
    expect(off.json()).toHaveLength(1)

    db.prepare('UPDATE artists SET multi_style_enabled = 1 WHERE id = ?').run(artist.id)
    const on = await app.inject({ method: 'GET', url: '/api/public/styles/v37-rt3' })
    expect(on.json()).toHaveLength(2)
  })

  it('TC-V37-RT-04: 作品编辑 + 档位标注完整链路', async () => {
    const artist = seedArtist({ qq_number: '78063', subdomain: 'v37-rt4' })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 100 })
    const artRes = await app.inject({
      method: 'POST', url: '/api/artist/artworks', headers,
      payload: { imagePath: `images/${artist.id}/art.jpg` }
    })
    const artworkId = artRes.json().id

    // 编辑描述
    const editRes = await app.inject({
      method: 'PUT', url: `/api/artist/artworks/${artworkId}`, headers,
      payload: { title: '星夜', description: '画了 10 小时' }
    })
    expect(editRes.statusCode).toBe(200)
    expect(editRes.json().title).toBe('星夜')

    // 设置标注
    const tagRes = await app.inject({
      method: 'PUT', url: `/api/artist/artworks/${artworkId}/tags`, headers,
      payload: { sizeIds: [size.id] }
    })
    expect(tagRes.statusCode).toBe(200)
    expect(tagRes.json().sizeIds).toEqual([size.id])

    // GET artworks 带 size_tag_ids
    const listRes = await app.inject({ method: 'GET', url: '/api/artist/artworks', headers })
    expect(listRes.json()[0].size_tag_ids).toEqual([size.id])

    // 跨画师标注 → 404
    const other = seedArtist({ qq_number: '78064', subdomain: 'v37-rt4b' })
    const otherStyle = styleService.createArtStyle(other.id, { name: '其他' })
    const otherSize = styleService.createStyleSize(other.id, otherStyle.id, { name: 'X', base_price: 1 })
    const crossRes = await app.inject({
      method: 'PUT', url: `/api/artist/artworks/${artworkId}/tags`, headers,
      payload: { sizeIds: [otherSize.id] }
    })
    expect(crossRes.statusCode).toBe(404)
  })

  it('TC-V37-RT-05: GET /api/public/gallery/:subdomain — 数据 + 404', async () => {
    const artist = seedArtist({ qq_number: '78065', subdomain: 'v37-rt5' })
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 100 })
    const artRes = await db.prepare(
      "INSERT INTO artworks (artist_id, image_path, description) VALUES (?, ?, '自由描述')"
    ).run(artist.id, `images/${artist.id}/g.jpg`)
    artistService.setArtworkSizeTags(artist.id, Number(artRes.lastInsertRowid), [size.id])

    const res = await app.inject({ method: 'GET', url: '/api/public/gallery/v37-rt5' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.artworks).toHaveLength(1)
    expect(body.artworks[0].description).toBe('自由描述')
    expect(body.artworks[0].size_tags[0].size_name).toBe('头像')
    expect(body.filterSizes).toHaveLength(1)

    const notFound = await app.inject({ method: 'GET', url: '/api/public/gallery/nonexistent' })
    expect(notFound.statusCode).toBe(404)
  })
})
