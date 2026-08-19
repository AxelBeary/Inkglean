import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { cleanDb } from './setup.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
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
})
