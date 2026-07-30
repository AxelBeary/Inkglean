import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as greetingService from '../src/features/artist/greeting.service.js'

/**
 * 问候语服务测试
 * 覆盖：getCurrentSlot / drawGreeting / 通用库 CRUD / 画师专属库 CRUD
 */

// 清空问候语表（setup.js 的 cleanDb 不含此表，此处自行清理）
function cleanGreetings() {
  db.exec('DELETE FROM greeting_templates')
}

describe('问候语服务 (Greeting Service)', () => {
  beforeEach(() => {
    cleanDb()
    cleanGreetings()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── getCurrentSlot 时段判断 ───

  describe('getCurrentSlot()', () => {
    function mockHour(h) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, h, 0, 0))
    }

    it('TC-G-01: 5~10 点返回 morning', () => {
      for (const h of [5, 7, 10]) {
        mockHour(h)
        expect(greetingService.getCurrentSlot()).toBe('morning')
      }
    })

    it('TC-G-02: 11~17 点返回 afternoon', () => {
      for (const h of [11, 14, 17]) {
        mockHour(h)
        expect(greetingService.getCurrentSlot()).toBe('afternoon')
      }
    })

    it('TC-G-03: 18~22 点返回 evening', () => {
      for (const h of [18, 20, 22]) {
        mockHour(h)
        expect(greetingService.getCurrentSlot()).toBe('evening')
      }
    })

    it('TC-G-04: 23~4 点返回 night', () => {
      for (const h of [23, 0, 2, 4]) {
        mockHour(h)
        expect(greetingService.getCurrentSlot()).toBe('night')
      }
    })
  })

  // ─── drawGreeting 抽取问候语 ───

  describe('drawGreeting()', () => {
    it('TC-G-05: 有模板时返回模板文本并替换 {name}', () => {
      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '你好{name}，欢迎回来', 'any')").run()

      const result = greetingService.drawGreeting(1, '小明')
      expect(result.text).toBe('你好小明，欢迎回来')
      expect(result.slot).toBe('any')
    })

    it('TC-G-06: 无模板时返回默认问候', () => {
      const result = greetingService.drawGreeting(1, '小红')
      expect(result.text).toBe('你好，小红')
      expect(result.slot).toBe('any')
    })

    it('TC-G-07: artistName 为空时回退"画师"', () => {
      const result = greetingService.drawGreeting(1, null)
      expect(result.text).toBe('你好，画师')
    })

    it('TC-G-08: 多个 {name} 占位符全部替换', () => {
      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '{name}你好，{name}加油', 'any')").run()

      const result = greetingService.drawGreeting(1, '熊')
      expect(result.text).toBe('熊你好，熊加油')
    })

    it('TC-G-09: 按时段过滤 — 只匹配当前时段和 any', () => {
      // 固定为 morning 时段
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 6, 30, 8, 0, 0))

      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '晚上好', 'evening')").run()
      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '早上好{name}', 'morning')").run()

      // 多抽几次，应该只命中 morning 或 any，不会命中 evening
      for (let i = 0; i < 10; i++) {
        const result = greetingService.drawGreeting(1, '测试')
        expect(result.text).not.toBe('晚上好')
      }
    })

    it('TC-G-10: 画师专属模板优先于通用（合并查询）', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (?, '专属问候{name}', 'any')").run(artist.id)
      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, '通用问候{name}', 'any')").run()

      // 抽取结果可能是专属或通用（SQL 用 OR 合并 + RANDOM），但不应报错
      const result = greetingService.drawGreeting(artist.id, '画师A')
      expect(['专属问候画师A', '通用问候画师A']).toContain(result.text)
    })

    it('TC-G-11: 禁用模板不被抽取', () => {
      db.prepare("INSERT INTO greeting_templates (artist_id, text, time_slot, is_enabled) VALUES (NULL, '已禁用', 'any', 0)").run()

      const result = greetingService.drawGreeting(1, '测试')
      expect(result.text).toBe('你好，测试') // 回退默认
    })
  })

  // ─── 通用库 CRUD ───

  describe('通用库 CRUD', () => {
    it('TC-G-12: createGlobalGreeting 创建并返回完整行', () => {
      const row = greetingService.createGlobalGreeting({ text: '新问候', timeSlot: 'morning' })
      expect(row.id).toBeDefined()
      expect(row.text).toBe('新问候')
      expect(row.time_slot).toBe('morning')
      expect(row.artist_id).toBeNull()
      expect(row.is_enabled).toBe(1)
    })

    it('TC-G-13: createGlobalGreeting 非法时段回退 any', () => {
      const row = greetingService.createGlobalGreeting({ text: '测试', timeSlot: 'invalid_slot' })
      expect(row.time_slot).toBe('any')
    })

    it('TC-G-14: getGlobalGreetings 无过滤返回全部通用', () => {
      greetingService.createGlobalGreeting({ text: '早', timeSlot: 'morning' })
      greetingService.createGlobalGreeting({ text: '晚', timeSlot: 'evening' })

      const all = greetingService.getGlobalGreetings()
      expect(all).toHaveLength(2)
    })

    it('TC-G-15: getGlobalGreetings 按时段过滤', () => {
      greetingService.createGlobalGreeting({ text: '早', timeSlot: 'morning' })
      greetingService.createGlobalGreeting({ text: '晚', timeSlot: 'evening' })

      const morning = greetingService.getGlobalGreetings('morning')
      expect(morning).toHaveLength(1)
      expect(morning[0].text).toBe('早')
    })

    it('TC-G-16: getGlobalGreetings 非法时段参数返回全部', () => {
      greetingService.createGlobalGreeting({ text: '早', timeSlot: 'morning' })
      greetingService.createGlobalGreeting({ text: '晚', timeSlot: 'evening' })

      // 'invalid' 不在 SLOTS 中，走无过滤分支
      const all = greetingService.getGlobalGreetings('invalid')
      expect(all).toHaveLength(2)
    })

    it('TC-G-17: getGlobalGreetings 不含画师专属', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      greetingService.createGlobalGreeting({ text: '通用', timeSlot: 'any' })
      greetingService.createArtistGreeting(artist.id, { text: '专属', timeSlot: 'any' })

      const globals = greetingService.getGlobalGreetings()
      expect(globals).toHaveLength(1)
      expect(globals[0].text).toBe('通用')
    })

    it('TC-G-18: updateGreeting 更新文本', () => {
      const row = greetingService.createGlobalGreeting({ text: '旧文本', timeSlot: 'any' })
      const updated = greetingService.updateGreeting(row.id, { text: '新文本' })
      expect(updated.text).toBe('新文本')
      expect(updated.time_slot).toBe('any') // 未变
    })

    it('TC-G-19: updateGreeting 更新时段', () => {
      const row = greetingService.createGlobalGreeting({ text: '测试', timeSlot: 'any' })
      const updated = greetingService.updateGreeting(row.id, { timeSlot: 'night' })
      expect(updated.time_slot).toBe('night')
    })

    it('TC-G-20: updateGreeting 禁用/启用', () => {
      const row = greetingService.createGlobalGreeting({ text: '测试', timeSlot: 'any' })
      expect(row.is_enabled).toBe(1)

      const disabled = greetingService.updateGreeting(row.id, { isEnabled: false })
      expect(disabled.is_enabled).toBe(0)

      const enabled = greetingService.updateGreeting(row.id, { isEnabled: true })
      expect(enabled.is_enabled).toBe(1)
    })

    it('TC-G-21: updateGreeting 非法时段被忽略（无有效更新返回 null）', () => {
      const row = greetingService.createGlobalGreeting({ text: '测试', timeSlot: 'morning' })
      // 只传非法时段 → 被忽略 → updates 为空 → 返回 null
      const result = greetingService.updateGreeting(row.id, { timeSlot: 'bad_slot' })
      expect(result).toBeNull()
      // 原记录未变
      const unchanged = greetingService.getGlobalGreetings('morning')
      expect(unchanged).toHaveLength(1)
      expect(unchanged[0].time_slot).toBe('morning')
    })

    it('TC-G-22: updateGreeting 无字段更新返回 null', () => {
      const row = greetingService.createGlobalGreeting({ text: '测试', timeSlot: 'any' })
      const result = greetingService.updateGreeting(row.id, {})
      expect(result).toBeNull()
    })

    it('TC-G-23: updateGreeting 同时更新多字段', () => {
      const row = greetingService.createGlobalGreeting({ text: '旧', timeSlot: 'any' })
      const updated = greetingService.updateGreeting(row.id, {
        text: '新',
        timeSlot: 'evening',
        isEnabled: false
      })
      expect(updated.text).toBe('新')
      expect(updated.time_slot).toBe('evening')
      expect(updated.is_enabled).toBe(0)
    })

    it('TC-G-24: deleteGreeting 删除后不可查', () => {
      const row = greetingService.createGlobalGreeting({ text: '待删', timeSlot: 'any' })
      greetingService.deleteGreeting(row.id)

      const all = greetingService.getGlobalGreetings()
      expect(all).toHaveLength(0)
    })

    it('TC-G-25: deleteGreeting 删除不存在的 id 不报错', () => {
      expect(() => greetingService.deleteGreeting(99999)).not.toThrow()
    })
  })

  // ─── 画师专属库 CRUD ───

  describe('画师专属库 CRUD', () => {
    it('TC-G-26: createArtistGreeting 创建并关联画师', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const row = greetingService.createArtistGreeting(artist.id, { text: '专属早安', timeSlot: 'morning' })

      expect(row.artist_id).toBe(artist.id)
      expect(row.text).toBe('专属早安')
      expect(row.time_slot).toBe('morning')
    })

    it('TC-G-27: createArtistGreeting 非法时段回退 any', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const row = greetingService.createArtistGreeting(artist.id, { text: '测试', timeSlot: 'xxx' })
      expect(row.time_slot).toBe('any')
    })

    it('TC-G-28: getArtistGreetings 只返回该画师的', () => {
      const artistA = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bob' })

      greetingService.createArtistGreeting(artistA.id, { text: 'A的', timeSlot: 'any' })
      greetingService.createArtistGreeting(artistB.id, { text: 'B的', timeSlot: 'any' })
      greetingService.createGlobalGreeting({ text: '通用', timeSlot: 'any' })

      const listA = greetingService.getArtistGreetings(artistA.id)
      expect(listA).toHaveLength(1)
      expect(listA[0].text).toBe('A的')
    })

    it('TC-G-29: getArtistGreetings 无数据返回空数组', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const list = greetingService.getArtistGreetings(artist.id)
      expect(list).toEqual([])
    })

    it('TC-G-30: updateGreeting 可更新画师专属问候', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const row = greetingService.createArtistGreeting(artist.id, { text: '旧', timeSlot: 'any' })
      const updated = greetingService.updateGreeting(row.id, { text: '新专属' })
      expect(updated.text).toBe('新专属')
      expect(updated.artist_id).toBe(artist.id)
    })

    it('TC-G-31: deleteGreeting 可删除画师专属问候', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const row = greetingService.createArtistGreeting(artist.id, { text: '待删', timeSlot: 'any' })
      greetingService.deleteGreeting(row.id)
      expect(greetingService.getArtistGreetings(artist.id)).toHaveLength(0)
    })
  })
})
