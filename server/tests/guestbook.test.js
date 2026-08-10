import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'

describe('F4 留言板 (Guestbook)', () => {
  let artist
  let otherArtist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88010', subdomain: 'gbtest', name: '留言板画师' })
    otherArtist = seedArtist({ qq_number: '88011', subdomain: 'gbother', name: '其他画师' })
  })

  // ─── 基础 CRUD ───

  it('TC-GB-01: 提交留言默认 pending', () => {
    const msg = guestbookService.createMessage(artist.id, '小明', '画得好好看！')
    expect(msg.id).toBeDefined()
    expect(msg.status).toBe('pending')
    expect(msg.nickname).toBe('小明')
    expect(msg.content).toBe('画得好好看！')
    expect(msg.deleted_by_admin).toBe(0)
  })

  it('TC-GB-02: 公开 API 只返回 approved 留言', () => {
    guestbookService.createMessage(artist.id, 'A', '待审核')
    const m2 = guestbookService.createMessage(artist.id, 'B', '已通过')
    guestbookService.approveMessage(artist.id, m2.id)

    const result = guestbookService.getPublicMessages(artist.id)
    expect(result.total).toBe(1)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].nickname).toBe('B')
  })

  it('TC-GB-03: 管理员删除后公开 API 不返回', () => {
    const msg = guestbookService.createMessage(artist.id, 'C', '被删了')
    guestbookService.approveMessage(artist.id, msg.id)
    guestbookService.adminDeleteMessage(msg.id)

    const result = guestbookService.getPublicMessages(artist.id)
    expect(result.total).toBe(0)
  })

  it('TC-GB-04: 通过留言', () => {
    const msg = guestbookService.createMessage(artist.id, 'D', '求通过')
    const approved = guestbookService.approveMessage(artist.id, msg.id)
    expect(approved.status).toBe('approved')
  })

  it('TC-GB-05: 拒绝留言', () => {
    const msg = guestbookService.createMessage(artist.id, 'E', '垃圾广告')
    const rejected = guestbookService.rejectMessage(artist.id, msg.id)
    expect(rejected.status).toBe('rejected')
  })

  it('TC-GB-06: 画师回复', () => {
    const msg = guestbookService.createMessage(artist.id, 'F', '加油！')
    const replied = guestbookService.replyMessage(artist.id, msg.id, '谢谢～')
    expect(replied.artist_reply).toBe('谢谢～')
    expect(replied.replied_at).not.toBeNull()
  })

  it('TC-GB-07: 管理员软删除', () => {
    const msg = guestbookService.createMessage(artist.id, 'G', '违规内容')
    const deleted = guestbookService.adminDeleteMessage(msg.id)
    expect(deleted.deleted_by_admin).toBe(1)
    // 物理行仍在
    const raw = guestbookService.getMessageById(msg.id)
    expect(raw).toBeDefined()
  })

  // ─── 归属校验 ───

  it('TC-GB-08: 不能通过别人的留言', () => {
    const msg = guestbookService.createMessage(artist.id, 'H', '别人的')
    const result = guestbookService.approveMessage(otherArtist.id, msg.id)
    expect(result).toBeNull()
  })

  it('TC-GB-09: 不能拒绝别人的留言', () => {
    const msg = guestbookService.createMessage(artist.id, 'I', '别人的')
    const result = guestbookService.rejectMessage(otherArtist.id, msg.id)
    expect(result).toBeNull()
  })

  it('TC-GB-10: 不能回复别人的留言', () => {
    const msg = guestbookService.createMessage(artist.id, 'J', '别人的')
    const result = guestbookService.replyMessage(otherArtist.id, msg.id, '冒充')
    expect(result).toBeNull()
  })

  // ─── 画师列表 ───

  it('TC-GB-11: 画师获取自己所有留言（含 pending/rejected，分页结构）', () => {
    guestbookService.createMessage(artist.id, 'K', '待审')
    const m2 = guestbookService.createMessage(artist.id, 'L', '拒绝')
    guestbookService.rejectMessage(artist.id, m2.id)
    // 别人的留言不应出现
    guestbookService.createMessage(otherArtist.id, 'M', '别人的')

    const list = guestbookService.getArtistMessages(artist.id)
    expect(list.total).toBe(2)
    expect(list.items).toHaveLength(2)
    expect(list.page).toBe(1)
    expect(list.pageSize).toBe(20)
  })

  // ─── 分页 ───

  it('TC-GB-12: 分页正确', () => {
    for (let i = 0; i < 5; i++) {
      const m = guestbookService.createMessage(artist.id, `用户${i}`, `留言${i}`)
      guestbookService.approveMessage(artist.id, m.id)
    }

    const p1 = guestbookService.getPublicMessages(artist.id, 1, 2)
    expect(p1.messages).toHaveLength(2)
    expect(p1.total).toBe(5)
    expect(p1.page).toBe(1)
    expect(p1.pageSize).toBe(2)

    const p3 = guestbookService.getPublicMessages(artist.id, 3, 2)
    expect(p3.messages).toHaveLength(1)
  })

  // ─── 边界 ───

  it('TC-GB-13: 不存在的留言返回 null/undefined', () => {
    expect(guestbookService.getMessageById(999999)).toBeUndefined()
    expect(guestbookService.adminDeleteMessage(999999)).toBeNull()
    expect(guestbookService.approveMessage(artist.id, 999999)).toBeNull()
  })

  // ─── REQ-022 F5: 管理员筛选 ───

  /** 造数：artist 两条（一条 approved + 已回复，一条 pending 未回复），otherArtist 一条 rejected */
  function seedFilterFixture() {
    const m1 = guestbookService.createMessage(artist.id, '甲', '赞一个')
    guestbookService.approveMessage(artist.id, m1.id)
    guestbookService.replyMessage(artist.id, m1.id, '谢谢')
    const m2 = guestbookService.createMessage(artist.id, '乙', '求画')
    const m3 = guestbookService.createMessage(otherArtist.id, '丙', '别人家的')
    guestbookService.rejectMessage(otherArtist.id, m3.id)
    return { m1, m2, m3 }
  }

  it('TC-GB-14: 管理员筛选——无参数返回全部', () => {
    seedFilterFixture()
    const all = guestbookService.getAdminMessages()
    expect(all).toHaveLength(3)
    // 保持 created_at DESC（artist_name 联查仍在）
    expect(all[0].artist_name).toBeDefined()
  })

  it('TC-GB-15: 管理员筛选——按画师 artistId 过滤', () => {
    seedFilterFixture()
    const mine = guestbookService.getAdminMessages({ artistId: artist.id })
    expect(mine).toHaveLength(2)
    expect(mine.every(m => m.artist_id === artist.id)).toBe(true)
    const theirs = guestbookService.getAdminMessages({ artistId: otherArtist.id })
    expect(theirs).toHaveLength(1)
    expect(theirs[0].nickname).toBe('丙')
  })

  it('TC-GB-16: 管理员筛选——按审核状态 status 过滤', () => {
    seedFilterFixture()
    expect(guestbookService.getAdminMessages({ status: 'approved' })).toHaveLength(1)
    expect(guestbookService.getAdminMessages({ status: 'pending' })).toHaveLength(1)
    expect(guestbookService.getAdminMessages({ status: 'rejected' })).toHaveLength(1)
    expect(guestbookService.getAdminMessages({ status: 'approved' })[0].nickname).toBe('甲')
  })

  it('TC-GB-17: 管理员筛选——按是否已回复 replied 两态过滤', () => {
    seedFilterFixture()
    const replied = guestbookService.getAdminMessages({ replied: 1 })
    expect(replied).toHaveLength(1)
    expect(replied[0].artist_reply).toBe('谢谢')
    expect(guestbookService.getAdminMessages({ replied: 0 })).toHaveLength(2)
  })

  it('TC-GB-18: 管理员筛选——组合条件（artistId + status + replied）', () => {
    seedFilterFixture()
    expect(guestbookService.getAdminMessages({ artistId: artist.id, status: 'approved', replied: 1 })).toHaveLength(1)
    expect(guestbookService.getAdminMessages({ artistId: artist.id, status: 'approved', replied: 0 })).toHaveLength(0)
    expect(guestbookService.getAdminMessages({ artistId: otherArtist.id, status: 'rejected' })).toHaveLength(1)
  })

  it('TC-GB-19: 管理员筛选——artistId 无匹配返回空数组', () => {
    seedFilterFixture()
    expect(guestbookService.getAdminMessages({ artistId: 999999 })).toHaveLength(0)
  })
})
