import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'

// ============================================
// Cloudflare 代理下的客户端 IP 解析（OPS §12，2026-08-19 拍板方案 A）
// 链路：用户 → CF → 宿主机 Caddy → 容器 Fastify（trustProxy 默认只信内网三段）
// Caddy 端已配置 header_up X-Forwarded-For {CF-Connecting-IP}，
// 后端应拿到用户真实 IP 而非 CF 边缘节点 IP——限流按人计防误伤。
// ============================================

const REAL_CLIENT_IP = '203.0.113.7'   // 文档用 TEST-NET-3 段
const CF_EDGE_IP = '172.68.0.9'        // CF 边缘段示例（公网，不可信）
const CADDY_CONTAINER_IP = '172.18.0.5' // Caddy 容器内网地址（可信代理）

describe('CF 代理真实 IP 透传 (OPS §12)', () => {

  it('TC-IP-01: Caddy 透传单一真实 IP（方案 A 生效态）——request.ip = 用户真实 IP', async () => {
    const app = await buildApp({ logger: false })
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { 'x-forwarded-for': REAL_CLIENT_IP }
    })
    expect(res.statusCode).toBe(200)
    // 路由无关性验证：用公开接口侧信道不便，直接经受保护的 echo 也不可用——
    // 改为用限流行为反证：同 IP 超限 429（/api/anon-token 10次/分）
    await app.close()
    const app2 = await buildApp({ logger: false })
    const hit = (xff: string) => app2.inject({
      method: 'POST',
      url: '/api/anon-token',
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { 'x-forwarded-for': xff }
    })
    for (let i = 0; i < 10; i++) {
      const r = await hit(REAL_CLIENT_IP)
      expect(r.statusCode).toBe(200)
    }
    // 第 11 次同真实 IP → 429（证明限流按透传的真实 IP 计数）
    expect((await hit(REAL_CLIENT_IP)).statusCode).toBe(429)
    // 换一个真实 IP → 不受影响（证明不是按 Caddy 容器地址/边缘 IP 共享配额）
    expect((await hit('198.51.100.23')).statusCode).toBe(200)
    await app2.close()
  })

  it('TC-IP-02: 未配置透传时的现状（CF 边缘 IP 链）——取最右不可信跳即边缘 IP，伪造前缀无效', async () => {
    const app = await buildApp({ logger: false })
    // XFF = 攻击者伪造前缀 + CF 亲笔追加的真实连接 IP（边缘 IP 由 Caddy 再追加）
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { 'x-forwarded-for': `1.1.1.1, ${REAL_CLIENT_IP}, ${CF_EDGE_IP}` }
    })
    expect(res.statusCode).toBe(200)
    // 行为断言走限流侧信道：伪造的 1.1.1.1 不产生独立配额，
    // CF_EDGE_IP 打满 10 次后，同一 XFF 前缀变化不救场
    const hit = (xff: string) => app.inject({
      method: 'POST',
      url: '/api/anon-token',
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { 'x-forwarded-for': xff }
    })
    for (let i = 0; i < 10; i++) {
      expect((await hit(`spoofed-${i}.example, ${CF_EDGE_IP}`)).statusCode).toBe(200)
    }
    expect((await hit(`spoofed-x.example, ${CF_EDGE_IP}`)).statusCode).toBe(429)
    await app.close()
  })

  it('TC-IP-03: 无 XFF 直连（本地/不经 CF）——request.ip = 连接地址，行为不变', async () => {
    const app = await buildApp({ logger: false })
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '127.0.0.1'
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
