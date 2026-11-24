// F-02/SCR-03 定向回归样例：mock 服务端持续返回 401 TOTP_INVALID，
// 验证 refreshArtistTokenCache 在调用方超时（120s）之前抛出「最后一次真实错误」，
// 而不是死等 30s 边界把 3 轮预算拖到 ~90s 触发 Playwright 裸超时。
// 运行：npx tsx e2e/scripts/token-refresh.regression.ts
import { refreshArtistTokenCache } from '../global-setup.js'

const originalFetch = globalThis.fetch
let authCalls = 0
globalThis.fetch = async (): Promise<Response> => {
  authCalls++
  // 与服务端五态统一后的 401 响应同形（server/src/shared/errors.ts 的 E.TOTP_INVALID）
  return new Response(JSON.stringify({ code: 'TOTP_INVALID' }), { status: 401 })
}

async function main(): Promise<void> {
  const started = Date.now()
  let thrown: unknown = null
  try {
    await refreshArtistTokenCache('http://mock-e2e.local', '10001')
  } catch (err) {
    thrown = err
  }
  const elapsedMs = Date.now() - started
  globalThis.fetch = originalFetch

  const msg = thrown instanceof Error ? thrown.message : String(thrown)
  const checks: Array<[string, boolean]> = [
    ['持续 401 TOTP_INVALID 时确实抛错', thrown !== null],
    ['抛出的是最后一次真实错误（含 TOTP_INVALID 响应体）', msg.includes('TOTP_INVALID')],
    ['在调用方超时前完成（< 20s，而非旧实现 ~90s）', elapsedMs < 20_000],
    ['尝试次数 = 轮数 × 每轮候选数（3×3=9，未提前静默退出）', authCalls === 9]
  ]
  let failed = 0
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
    if (!ok) failed++
  }
  console.log(`\n耗时 ${elapsedMs}ms，鉴权请求 ${authCalls} 次，错误消息：${msg}`)
  console.log(`令牌刷新回归：${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
  if (failed > 0) process.exitCode = 1
}

void main()
