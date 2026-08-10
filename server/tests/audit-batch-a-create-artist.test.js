import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, cleanDb } from './setup.js'
import { createArtist } from '../src/features/artist/artist.service.js'

// audit-a P2-5: createArtist 三步写入事务
// seedArtistStages 由 artist.service 动态 import，vi.mock 可拦截同一模块实例
vi.mock('../src/features/artist/workflow.service.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    seedArtistStages: vi.fn(mod.seedArtistStages)
  }
})

describe('audit-a P2-5 createArtist 事务', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-P25-01: 创建成功后 artists + commission_rules + stages 三步数据齐全', async () => {
    const artist = await createArtist({
      qqNumber: '88881',
      name: '事务画师',
      subdomain: 'txartist',
      bio: 'hello'
    })
    expect(artist).toBeTruthy()

    const rules = db.prepare('SELECT * FROM commission_rules WHERE artist_id = ?').get(artist.id)
    expect(rules).toBeTruthy()
    const stages = db.prepare('SELECT * FROM artist_workflow_stages WHERE artist_id = ?').all(artist.id)
    expect(stages.length).toBe(7)
  })

  it('TC-P25-02: seedArtistStages 抛错 → 整个事务回滚（无半建画师）', async () => {
    const wf = await import('../src/features/artist/workflow.service.js')
    vi.mocked(wf.seedArtistStages).mockImplementationOnce(() => {
      throw new Error('mock seedArtistStages boom')
    })

    await expect(createArtist({
      qqNumber: '88882',
      name: '回滚画师',
      subdomain: 'txrollback'
    })).rejects.toThrow('mock seedArtistStages boom')

    // artists 与 commission_rules 均已回滚
    expect(db.prepare('SELECT COUNT(*) AS c FROM artists').get().c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM commission_rules').get().c).toBe(0)
  })

  it('TC-P25-03: 唯一性预检仍在事务外（错误码语义不变）', async () => {
    await createArtist({ qqNumber: '88883', name: 'A', subdomain: 'txdup', artistCode: 'AAA' })
    await expect(createArtist({ qqNumber: '88884', name: 'B', subdomain: 'txdup', artistCode: 'BBB' }))
      .rejects.toThrow('SUBDOMAIN_TAKEN')
    await expect(createArtist({ qqNumber: '88883', name: 'C', subdomain: 'txdup2' }))
      .rejects.toThrow('QQ_TAKEN')
  })
})
