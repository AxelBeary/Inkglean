import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { cleanDb } from './setup.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * 环境批 B1: SPA 静态资源缓存头测试
 *
 * app.js 的 SPA 静态路由在 buildApp 时按 WEB_DIST 是否存在决定是否注册，
 * 因此每个用例都自建临时 web/dist（含 assets/ 与 index.html），
 * 并重新 buildApp。测试默认不设 WEB_DIST，故默认实例不带 SPA 路由，无互相干扰。
 */

/** 建临时 dist 目录 + 造文件，返回 { dist, app } */
async function makeAppWithDist(): Promise<{ dist: string; app: FastifyInstance }> {
  const dist = mkdtempSync(join(tmpdir(), 'commission-web-dist-'))
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>test</title>')
  writeFileSync(join(dist, 'assets', 'app.abc123.js'), 'console.log(1)')
  writeFileSync(join(dist, 'assets', 'font.abc123.woff2'), 'font')

  process.env.WEB_DIST = dist
  const app = await buildApp({ logger: false })
  await app.ready()
  return { dist, app }
}

describe('SPA 静态资源缓存头 (B1)', () => {
  let app: FastifyInstance
  let dist: string

  beforeEach(async () => {
    cleanDb()
    const built = await makeAppWithDist()
    app = built.app
    dist = built.dist
  })

  afterEach(async () => {
    await app.close()
    delete process.env.WEB_DIST
    rmSync(dist, { recursive: true, force: true })
  })

  it('TC-ENV-06: /assets/* 长缓存 immutable', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.abc123.js' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers['content-type']).toContain('text/javascript')
  })

  it('TC-ENV-07: /assets/ 下 woff2 字体同样长缓存', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/font.abc123.woff2' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers['content-type']).toContain('font/woff2')
  })

  it('TC-ENV-08: index.html → no-cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('TC-ENV-09: SPA fallback（不存在路径）→ no-cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/artist/alice' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('TC-ENV-10: /assets/ 目录请求（非文件）走 SPA fallback no-cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('TC-ENV-11: /api/* 与 /uploads/* 不受 SPA 路由影响（404 JSON）', async () => {
    const apiRes = await app.inject({ method: 'GET', url: '/api/nonexistent' })
    expect(apiRes.statusCode).toBe(404)
    expect(apiRes.headers['content-type']).toContain('application/json')

    const upRes = await app.inject({ method: 'GET', url: '/uploads/images/1/nope.png' })
    expect(upRes.statusCode).toBe(404)
  })

  it('TC-ENV-12: index.html 走 mtime 缓存——mtime 未变不重读，mtime 变了下一次请求即生效', async () => {
    const indexFile = join(dist, 'index.html')
    const t0 = new Date('2021-01-01T00:00:00Z')
    const t1 = new Date('2021-06-01T00:00:00Z')
    const headers = { accept: 'text/html' }

    writeFileSync(indexFile, '<!doctype html><title>MARKER-A</title>')
    utimesSync(indexFile, t0, t0)
    const first = await app.inject({ method: 'GET', url: '/artist/alice', headers })
    expect(first.statusCode).toBe(200)
    expect(first.body).toContain('MARKER-A')

    // 内容换成 B，但把 mtime 拨回同一时刻：只有「每次请求都重读整份文件」才会看到 B
    // （U144 修复前正是如此），缓存命中则仍发 A
    writeFileSync(indexFile, '<!doctype html><title>MARKER-B</title>')
    utimesSync(indexFile, t0, t0)
    const cached = await app.inject({ method: 'GET', url: '/artist/alice', headers })
    expect(cached.body).toContain('MARKER-A')
    expect(cached.body).not.toContain('MARKER-B')

    // mtime 变了 → 下一次请求即读到新内容（Cache-Control: no-cache 的「发版即生效」不能丢）
    utimesSync(indexFile, t1, t1)
    const refreshed = await app.inject({ method: 'GET', url: '/artist/alice', headers })
    expect(refreshed.body).toContain('MARKER-B')
  })
})
