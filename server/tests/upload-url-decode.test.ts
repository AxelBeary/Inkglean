import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import http from 'http'
import type { AddressInfo } from 'net'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { buildApp } from '../src/app.js'
import { cleanDb } from './setup.js'
import { signFilePath, isPublicUploadPath, safeDecodeUploadPath } from '../src/shared/file-sign.js'

// ============================================
// U016 回归：/uploads/ 钩子的畸形百分号编码必须 4xx 收口，不得打 500
//
// 为什么用真实 HTTP 而不是 app.inject：触发条件是「请求行里带裸 #」——路由层在 # 处
// 把后半段当查询串，于是跳过 URL 合法性预检，畸形 % 序列才会漏进钩子。inject
// （light-my-request）会先按 URL 解析把 # 之后丢掉，复现不出来；必须走真 socket。
// 修复前：/uploads/a.png#%ZZ 与 /uploads/images/1/a.png#%ZZ 均为 500 INTERNAL。
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR as string

/** 以原始 request-target 发一个 GET（path 里的 # / % 原样送出，不经 URL 解析） */
function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('U016: /uploads/ 畸形 URL 不打 500', () => {
  let app: FastifyInstance
  let port: number

  beforeEach(async () => {
    cleanDb()
    mkdirSync(join(UPLOAD_DIR, 'references', '1'), { recursive: true })
    writeFileSync(join(UPLOAD_DIR, 'references', '1', 'ok.png'), 'png-bytes')
    app = await buildApp({ logger: false })
    await app.listen({ port: 0, host: '127.0.0.1' })
    port = (app.server.address() as AddressInfo).port
  })

  afterEach(async () => {
    await app.close()
    rmSync(UPLOAD_DIR, { recursive: true, force: true })
  })

  it('TC-U016-01: 签名目录 + 畸形编码（裸 # 后接 %ZZ）→ 400，不是 500', async () => {
    const res = await rawGet(port, '/uploads/references/1/ok.png#%ZZ')
    expect(res.status).toBe(400)
    const body = JSON.parse(res.body) as { error?: string; code?: string }
    // 走本仓 400 分支（而非 Fastify 的 FST_ERR_BAD_URL，也不是全局错误处理器的 INTERNAL）
    expect(body.error).toBe('文件链接无效或已过期')
    expect(body.code).not.toBe('INTERNAL')
  })

  it('TC-U016-02: 公开目录 + 畸形编码同样 400（公开前缀也要先能解码）', async () => {
    const res = await rawGet(port, '/uploads/images/1/ok.png#%ZZ')
    expect(res.status).toBe(400)
    expect((JSON.parse(res.body) as { error?: string }).error).toBe('文件链接无效或已过期')
  })

  it('TC-U016-03: 裸 %ZZ（路由层预检拦截）仍是 400，不是 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/%ZZ' })
    expect(res.statusCode).toBe(400)
    // Fastify 路由层已按非法 URL 拒绝（FST_ERR_BAD_URL），响应体仍带 error 字段
    expect((res.json() as { error?: string }).error).toBeTruthy()
  })

  it('TC-U016-04: 合法签名链接流程不变——200 且内容原样', async () => {
    const sig = signFilePath('references/1/ok.png')
    const res = await app.inject({ method: 'GET', url: `/uploads/references/1/ok.png?sig=${sig}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('png-bytes')
  })

  it('TC-U016-05: safeDecodeUploadPath——正常路径解码、畸形编码返回 null 不抛', () => {
    expect(safeDecodeUploadPath('references/1/a.png')).toBe('references/1/a.png')
    expect(safeDecodeUploadPath('references/1/a%20b.png')).toBe('references/1/a b.png')
    expect(safeDecodeUploadPath('%ZZ')).toBeNull()
    expect(safeDecodeUploadPath('a.png#%E0%A4%A')).toBeNull()
  })

  it('TC-U016-06: isPublicUploadPath 行为不变（解码失败仍按非公开处理）', () => {
    expect(isPublicUploadPath('/uploads/images/1/a.png')).toBe(true)
    expect(isPublicUploadPath('/uploads/references/1/a.png')).toBe(false)
    expect(isPublicUploadPath('/uploads/%ZZ')).toBe(false)
    expect(isPublicUploadPath('/uploads/images/%2e%2e/secret.png')).toBe(false)
  })
})
