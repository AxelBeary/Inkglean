import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'

describe('S5 额度池 (Monthly Quota)', () => {
  beforeEach(() => {
    cleanDb()
  })

  // ─── getMonthlyUsage 边界 ───

  it('TC-S5-01: quota=NULL → 不限，返回全 null', () => {
    const artist = seedArtist()
    const result = artistService.getMonthlyUsage(artist.id, null)
    expect(result).toEqual({ used: 0, quota: null, remaining: null })
  })

  it('TC-S5-02: quota=5，无订单 → remaining=5', () => {
    const artist = seedArtist()
    const result = artistService.getMonthlyUsage(artist.id, 5)
    expect(result).toEqual({ used: 0, quota: 5, remaining: 5 })
  })

  it('TC-S5-03: quota=5，3 个未取消订单 → remaining=2', () => {
    const artist = seedArtist()
    seedOrder(artist.id, { status: 'pending' })
    seedOrder(artist.id, { status: 'wip' })
    seedOrder(artist.id, { status: 'confirmed' })
    const result = artistService.getMonthlyUsage(artist.id, 5)
    expect(result.used).toBe(3)
    expect(result.remaining).toBe(2)
  })

  it('TC-S5-04: 已取消订单不计入额度', () => {
    const artist = seedArtist()
    seedOrder(artist.id, { status: 'pending' })
    seedOrder(artist.id, { status: 'cancelled' })
    const result = artistService.getMonthlyUsage(artist.id, 5)
    expect(result.used).toBe(1)
    expect(result.remaining).toBe(4)
  })

  it('TC-S5-05: 超额 → remaining=0（不为负数）', () => {
    const artist = seedArtist()
    for (let i = 0; i < 7; i++) seedOrder(artist.id, { status: 'pending' })
    const result = artistService.getMonthlyUsage(artist.id, 5)
    expect(result.used).toBe(7)
    expect(result.remaining).toBe(0)
  })

  it('TC-S5-06: quota=0 → remaining=0', () => {
    const artist = seedArtist()
    const result = artistService.getMonthlyUsage(artist.id, 0)
    expect(result).toEqual({ used: 0, quota: 0, remaining: 0 })
  })

  // ─── computeSlotDisplay 额度整合 ───

  it('TC-S5-07: 仅额度（无名额限制）→ 显示本月剩余', () => {
    const artist = seedArtist({ status: 'open' })
    db.prepare('UPDATE artists SET monthly_quota = 10 WHERE id = ?').run(artist.id)
    const fresh = artistService.getArtistById(artist.id)!
    seedOrder(artist.id, { status: 'pending' })
    seedOrder(artist.id, { status: 'wip' })
    const display = artistService.computeSlotDisplay(fresh)
    expect(display).toBe('开放中 · 本月剩 8 单')
  })

  it('TC-S5-08: 额度耗尽 → 本月已约满', () => {
    const artist = seedArtist({ status: 'open' })
    db.prepare('UPDATE artists SET monthly_quota = 2 WHERE id = ?').run(artist.id)
    const fresh = artistService.getArtistById(artist.id)!
    seedOrder(artist.id, { status: 'pending' })
    seedOrder(artist.id, { status: 'wip' })
    const display = artistService.computeSlotDisplay(fresh)
    expect(display).toBe('本月已约满')
  })

  it('TC-S5-09: 名额+额度同时启用，额度耗尽优先', () => {
    const artist = seedArtist({ status: 'open' })
    db.prepare('UPDATE artists SET batch_limit = 10, buffer_limit = 0, monthly_quota = 1 WHERE id = ?').run(artist.id)
    const fresh = artistService.getArtistById(artist.id)!
    seedOrder(artist.id, { status: 'pending', queue_zone: 'formal' })
    const display = artistService.computeSlotDisplay(fresh)
    // 名额还有 9 席，但额度已耗尽
    expect(display).toBe('本月已约满')
  })

  it('TC-S5-10: 名额+额度同时启用，额度充足 → 显示名额', () => {
    const artist = seedArtist({ status: 'open' })
    db.prepare('UPDATE artists SET batch_limit = 3, buffer_limit = 0, monthly_quota = 10 WHERE id = ?').run(artist.id)
    const fresh = artistService.getArtistById(artist.id)!
    seedOrder(artist.id, { status: 'pending', queue_zone: 'formal' })
    const display = artistService.computeSlotDisplay(fresh)
    expect(display).toBe('开放中 · 剩 2 席')
  })

  it('TC-S5-11: 无名额无额度 → null（不显示）', () => {
    const artist = seedArtist({ status: 'open' })
    const fresh = artistService.getArtistById(artist.id)!
    expect(artistService.computeSlotDisplay(fresh)).toBeNull()
  })

  it('TC-S5-12: break 状态 + 有额度 → 休息中', () => {
    const artist = seedArtist({ status: 'break' })
    db.prepare('UPDATE artists SET monthly_quota = 5 WHERE id = ?').run(artist.id)
    const fresh = artistService.getArtistById(artist.id)!
    expect(artistService.computeSlotDisplay(fresh)).toBe('休息中')
  })

  it('TC-S5-13: hidden 状态 + 有额度 → null', () => {
    const artist = seedArtist({ status: 'hidden' })
    db.prepare('UPDATE artists SET monthly_quota = 5 WHERE id = ?').run(artist.id)
    const fresh = artistService.getArtistById(artist.id)!
    expect(artistService.computeSlotDisplay(fresh)).toBeNull()
  })

  // ─── updateArtist 白名单 ───

  it('TC-S5-14: updateArtist 可设置 monthly_quota', () => {
    const artist = seedArtist()
    const updated = artistService.updateArtist(artist.id, { monthly_quota: 8 })!
    expect(updated.monthly_quota).toBe(8)
  })

  it('TC-S5-15: updateArtist 可清除 monthly_quota（设 null）', () => {
    const artist = seedArtist()
    artistService.updateArtist(artist.id, { monthly_quota: 8 })
    const updated = artistService.updateArtist(artist.id, { monthly_quota: null })!
    expect(updated.monthly_quota).toBeNull()
  })

  // ─── quick_actions DB 持久化（迁移 v26） ───

  it('TC-S5-16: 迁移 v26 — quick_actions 列存在且默认 NULL', () => {
    const artist = seedArtist()
    expect(artist.quick_actions).toBeNull()
  })

  it('TC-S5-17: updateArtist 可设置 quick_actions（字符串键数组）', () => {
    const artist = seedArtist()
    // 前端实际格式：字符串键数组（Settings.vue 发送 quickActions: ['queue', 'rules']）
    const updated = artistService.updateArtist(artist.id, { quick_actions: ['queue', 'rules'] })!
    expect((updated as ArtistRow).quick_actions).toBe(JSON.stringify(['queue', 'rules']))
    // 读回验证
    const fresh = artistService.getArtistById(artist.id)!
    expect(JSON.parse((fresh as ArtistRow).quick_actions as string)).toHaveLength(2)
  })

  it('TC-S5-18: updateArtist 可清除 quick_actions（设 null）', () => {
    const artist = seedArtist()
    artistService.updateArtist(artist.id, { quick_actions: '[]' })
    const updated = artistService.updateArtist(artist.id, { quick_actions: null })!
    expect((updated as ArtistRow).quick_actions).toBeNull()
  })

  // ─── #16 getMonthlyUsage 本地时区月初 ───

  it('TC-S5-19: getMonthlyUsage 使用本地时区月初（非 UTC）', () => {
    const artist = seedArtist()
    db.prepare('UPDATE artists SET monthly_quota = 10 WHERE id = ?').run(artist.id)

    // 插入一条"本月"订单（用本地时间计算月初，与修复后的逻辑一致）
    const now = new Date()
    const localMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    // 转为 SQLite UTC 格式（与 toSqliteDate 一致）
    const utcStr = localMonthStart.toISOString().replace('T', ' ').slice(0, 19)
    seedOrder(artist.id, { status: 'pending' })
    db.prepare('UPDATE orders SET created_at = ? WHERE artist_id = ?').run(utcStr, artist.id)

    const result = artistService.getMonthlyUsage(artist.id, 10)
    expect(result.used).toBe(1)
    expect(result.remaining).toBe(9)
  })
})
