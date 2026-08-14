import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as greetingService from '../src/features/artist/greeting.service.js'

/**
 * E5 波 4：问候系统池扩展测试
 * 覆盖：抽取优先级链（特别日命中/miss 回落/深夜池/普通池/any 兜底）、
 *       范围隔离、日期格式校验、写入口消毒同口径、删除级联
 */

// 清空问候相关表（setup.js 的 cleanDb 不含 greeting_special_days，此处自行清理）
function cleanGreetingAll() {
  db.exec('DELETE FROM greeting_templates')
  db.exec('DELETE FROM greeting_special_days')
}

/** 直接插特别日（返回 id） */
function seedDay({ name = '测试日', dateKey = '08-14', artistId = null, enabled = 1 }) {
  const result = db.prepare(
    'INSERT INTO greeting_special_days (name, date_key, artist_id, is_enabled) VALUES (?, ?, ?, ?)'
  ).run(name, dateKey, artistId, enabled)
  return Number(result.lastInsertRowid)
}

/** 直接插文案（可挂特别日） */
function seedTemplate({ text, slot = 'any', artistId = null, specialDayId = null, enabled = 1 }) {
  const result = db.prepare(
    'INSERT INTO greeting_templates (artist_id, text, time_slot, is_enabled, special_day_id) VALUES (?, ?, ?, ?, ?)'
  ).run(artistId, text, slot, enabled, specialDayId)
  return Number(result.lastInsertRowid)
}

describe('E5 问候池扩展：深夜池 + 特别日池', () => {
  beforeEach(() => {
    cleanDb()
    cleanGreetingAll()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── 日期工具 ───

  describe('getTodayDateKey / isValidDateKey', () => {
    it('TC-E5-01: date_key 为 MM-DD（月日补零）', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0))
      expect(greetingService.getTodayDateKey()).toBe('08-14')
      vi.setSystemTime(new Date(2026, 0, 5, 3, 0, 0))
      expect(greetingService.getTodayDateKey()).toBe('01-05')
    })

    it('TC-E5-02: 合法 MM-DD 通过校验', () => {
      for (const key of ['01-01', '08-14', '12-31', '02-29']) {
        expect(greetingService.isValidDateKey(key)).toBe(true)
      }
    })

    it('TC-E5-03: 非法日期被拒（月/日越界、格式残缺、非字符串）', () => {
      for (const key of ['13-01', '00-10', '08-00', '08-32', '8-14', '08/14', '08-1', '', null, 814]) {
        expect(greetingService.isValidDateKey(key)).toBe(false)
      }
    })
  })

  // ─── 抽取优先级链 ───

  describe('drawGreeting 优先级链', () => {
    it('TC-E5-04: 特别日命中优先于深夜池/时段池/any', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 23, 30, 0)) // 深夜时段
      const dayId = seedDay({ dateKey: '08-14' })
      seedTemplate({ text: '特别日文案{name}', specialDayId: dayId })
      seedTemplate({ text: '深夜池文案', slot: 'latenight' })
      seedTemplate({ text: '夜间文案', slot: 'night' })
      seedTemplate({ text: '全天文案', slot: 'any' })

      for (let i = 0; i < 10; i++) {
        const result = greetingService.drawGreeting(1, '小明')
        expect(result.text).toBe('特别日文案小明')
        expect(result.slot).toBe('special')
      }
    })

    it('TC-E5-05: 特别日停用 → 退出抽取链回落深夜池', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 23, 30, 0))
      const dayId = seedDay({ dateKey: '08-14', enabled: 0 })
      seedTemplate({ text: '特别日文案', specialDayId: dayId })
      seedTemplate({ text: '深夜池文案{name}', slot: 'latenight' })

      const result = greetingService.drawGreeting(1, '小明')
      expect(result.text).toBe('深夜池文案小明')
      expect(result.slot).toBe('latenight')
    })

    it('TC-E5-06: 特别日关联文案全部停用 → 回落普通链', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 8, 0, 0)) // morning
      const dayId = seedDay({ dateKey: '08-14' })
      seedTemplate({ text: '特别日文案', specialDayId: dayId, enabled: 0 })
      seedTemplate({ text: '早安文案{name}', slot: 'morning' })

      const result = greetingService.drawGreeting(1, '小明')
      expect(result.text).toBe('早安文案小明')
    })

    it('TC-E5-07: date_key 不是今天 → 不命中', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 8, 0, 0))
      const dayId = seedDay({ dateKey: '08-15' }) // 明天
      seedTemplate({ text: '特别日文案', specialDayId: dayId })
      seedTemplate({ text: '早安文案{name}', slot: 'morning' })

      const result = greetingService.drawGreeting(1, '小明')
      expect(result.text).toBe('早安文案小明')
    })

    it('TC-E5-08: 范围隔离——A 画师专属日不影响 B', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0))
      const artistA = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bob' })
      const dayId = seedDay({ dateKey: '08-14', artistId: artistA.id })
      seedTemplate({ text: 'A的特别日', specialDayId: dayId })

      // A 命中专属日
      expect(greetingService.drawGreeting(artistA.id, 'A').text).toBe('A的特别日')
      // B 不受影响（无任何普通文案 → 默认兜底）
      const resultB = greetingService.drawGreeting(artistB.id, 'B')
      expect(resultB.text).toBe('你好，B')
      expect(resultB.slot).toBe('any')
    })

    it('TC-E5-09: 全平台特别日对所有画师命中', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0))
      const artistA = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const dayId = seedDay({ dateKey: '08-14', artistId: null })
      seedTemplate({ text: '平台节日{name}', specialDayId: dayId })

      expect(greetingService.drawGreeting(artistA.id, '甲').text).toBe('平台节日甲')
      expect(greetingService.drawGreeting(9999, '乙').text).toBe('平台节日乙')
    })

    it('TC-E5-10: 深夜池优先——23:00~04:59 命中 latenight 池', () => {
      vi.useFakeTimers()
      for (const h of [23, 0, 4]) {
        vi.setSystemTime(new Date(2026, 7, 14, h, 30, 0))
        seedTemplate({ text: '深夜池{name}', slot: 'latenight' })
        seedTemplate({ text: '夜间池', slot: 'night' })
        seedTemplate({ text: '全天池', slot: 'any' })

        for (let i = 0; i < 5; i++) {
          const result = greetingService.drawGreeting(1, '夜猫')
          expect(result.text).toBe('深夜池夜猫')
          expect(result.slot).toBe('latenight')
        }
        db.exec('DELETE FROM greeting_templates')
      }
    })

    it('TC-E5-11: 深夜池空 → 回落普通时段池（night）与 any', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 23, 30, 0))
      seedTemplate({ text: '夜间池{name}', slot: 'night' })
      seedTemplate({ text: '全天池{name}', slot: 'any' })

      const seen = new Set()
      for (let i = 0; i < 20; i++) {
        const result = greetingService.drawGreeting(1, '夜猫')
        expect(['夜间池夜猫', '全天池夜猫']).toContain(result.text)
        seen.add(result.text)
      }
      expect(seen.size).toBeGreaterThanOrEqual(1)
    })

    it('TC-E5-12: 白天不抽深夜池（latenight 文案只在深夜窗口投放）', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 10, 0, 0)) // morning
      seedTemplate({ text: '深夜池文案', slot: 'latenight' })

      const result = greetingService.drawGreeting(1, '测试')
      expect(result.text).toBe('你好，测试') // 无可用文案 → 默认兜底
    })

    it('TC-E5-13: 挂特别日的文案不进普通池投放（日期不命中时等于不存在）', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0))
      const dayId = seedDay({ dateKey: '12-25' }) // 圣诞
      seedTemplate({ text: '圣诞文案', slot: 'any', specialDayId: dayId })

      const result = greetingService.drawGreeting(1, '测试')
      expect(result.text).toBe('你好，测试')
    })

    it('TC-E5-14: 全链路全空 → 默认兜底（既有行为不变）', () => {
      const result = greetingService.drawGreeting(1, '小红')
      expect(result.text).toBe('你好，小红')
      expect(result.slot).toBe('any')
    })
  })

  // ─── 特别日 CRUD ───

  describe('特别日 CRUD', () => {
    it('TC-E5-15: createSpecialDay 创建并返回完整行（全平台）', () => {
      const day = greetingService.createSpecialDay({ name: '生日', dateKey: '08-14', artistId: null })
      expect(day?.id).toBeDefined()
      expect(day?.name).toBe('生日')
      expect(day?.date_key).toBe('08-14')
      expect(day?.artist_id).toBeNull()
      expect(day?.is_enabled).toBe(1)
    })

    it('TC-E5-16: createSpecialDay 非法 dateKey 返回 undefined', () => {
      expect(greetingService.createSpecialDay({ name: 'x', dateKey: '13-01', artistId: null })).toBeUndefined()
      expect(greetingService.createSpecialDay({ name: 'x', dateKey: 'abc', artistId: null })).toBeUndefined()
    })

    it('TC-E5-17: createSpecialDay name 走 sanitizeStoredText 同口径消毒', () => {
      const day = greetingService.createSpecialDay({ name: '<script>alert(1)</script>生日', dateKey: '08-14', artistId: null })
      expect(day?.name).toBe('生日')
    })

    it('TC-E5-18: createSpecialDay 指定画师范围', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const day = greetingService.createSpecialDay({ name: '出道日', dateKey: '03-01', artistId: artist.id })
      expect(day?.artist_id).toBe(artist.id)
    })

    it('TC-E5-19: listSpecialDays 附带关联文案数', () => {
      const dayId = seedDay({ name: '有文案的日' })
      seedTemplate({ text: '文案1', specialDayId: dayId })
      seedTemplate({ text: '文案2', specialDayId: dayId })
      seedDay({ name: '空日', dateKey: '09-01' })

      const list = greetingService.listSpecialDays()
      expect(list).toHaveLength(2)
      expect(list.find(d => d.id === dayId)?.greeting_count).toBe(2)
    })

    it('TC-E5-20: setSpecialDayEnabled 启停切换', () => {
      const day = greetingService.createSpecialDay({ name: '测试', dateKey: '08-14', artistId: null })
      const off = greetingService.setSpecialDayEnabled(day.id, false)
      expect(off?.is_enabled).toBe(0)
      const on = greetingService.setSpecialDayEnabled(day.id, true)
      expect(on?.is_enabled).toBe(1)
    })

    it('TC-E5-21: setSpecialDayEnabled 不存在的 id 返回 undefined', () => {
      expect(greetingService.setSpecialDayEnabled(99999, true)).toBeUndefined()
    })

    it('TC-E5-22: deleteSpecialDay 级联删除关联文案', () => {
      const dayId = seedDay({ name: '待删' })
      seedTemplate({ text: '文案A', specialDayId: dayId })
      seedTemplate({ text: '文案B', specialDayId: dayId })
      seedTemplate({ text: '无关文案' })

      greetingService.deleteSpecialDay(dayId)
      expect(greetingService.getSpecialDay(dayId)).toBeUndefined()
      expect(greetingService.getSpecialDayGreetings(dayId)).toHaveLength(0)
      // 未挂该日的文案不受影响
      expect(db.prepare('SELECT COUNT(*) AS c FROM greeting_templates').get().c).toBe(1)
    })

    it('TC-E5-23: getSpecialDayGreetings 只返回该日的文案（含停用）', () => {
      const dayId = seedDay({})
      seedTemplate({ text: '启用文案', specialDayId: dayId })
      seedTemplate({ text: '停用文案', specialDayId: dayId, enabled: 0 })
      seedTemplate({ text: '普通文案' })

      const list = greetingService.getSpecialDayGreetings(dayId)
      expect(list).toHaveLength(2)
      expect(list.map(g => g.text).sort()).toEqual(['停用文案', '启用文案'])
    })
  })

  // ─── 文案 CRUD 挂特别日 ───

  describe('问候文案 specialDayId 入参', () => {
    it('TC-E5-24: createGlobalGreeting 挂特别日后不进通用库列表', () => {
      const dayId = seedDay({})
      const row = greetingService.createGlobalGreeting({ text: '节日文案', timeSlot: 'any', specialDayId: dayId })
      expect(row?.special_day_id).toBe(dayId)
      expect(greetingService.getGlobalGreetings()).toHaveLength(0)
      expect(greetingService.getSpecialDayGreetings(dayId)).toHaveLength(1)
    })

    it('TC-E5-25: createArtistGreeting 挂特别日后不进专属库列表', () => {
      const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const dayId = seedDay({ artistId: artist.id })
      const row = greetingService.createArtistGreeting(artist.id, { text: '专属节日文案', specialDayId: dayId })
      expect(row?.special_day_id).toBe(dayId)
      expect(greetingService.getArtistGreetings(artist.id)).toHaveLength(0)
    })

    it('TC-E5-26: 挂特别日的文案写入口同口径消毒', () => {
      const dayId = seedDay({})
      const row = greetingService.createGlobalGreeting({ text: '<b>加粗</b>你好<img src=x>', specialDayId: dayId })
      expect(row?.text).toBe('加粗你好')
    })

    it('TC-E5-27: updateGreeting 可换挂/解除特别日关联', () => {
      const dayA = seedDay({ name: '日A' })
      const dayB = seedDay({ name: '日B', dateKey: '09-01' })
      const row = greetingService.createGlobalGreeting({ text: '文案', specialDayId: dayA })

      const moved = greetingService.updateGreeting(row.id, { specialDayId: dayB })
      expect(moved?.special_day_id).toBe(dayB)

      const detached = greetingService.updateGreeting(row.id, { specialDayId: null })
      expect(detached?.special_day_id).toBeNull()
      // 解除关联后回到普通池列表
      expect(greetingService.getGlobalGreetings()).toHaveLength(1)
    })

    it('TC-E5-28: latenight 档可正常创建/过滤（SLOTS 扩展）', () => {
      const row = greetingService.createGlobalGreeting({ text: '午夜好', timeSlot: 'latenight' })
      expect(row?.time_slot).toBe('latenight')
      expect(greetingService.getGlobalGreetings('latenight')).toHaveLength(1)
    })
  })
})
