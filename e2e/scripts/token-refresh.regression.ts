// TASK2-03 定向回归样例（F-02 与跨步恢复两场景都要保住）：
//   场景 A 持久拒绝（锁定/封禁）：只等一次边界即抛最后一次真实错误，不裸超时、不无限重试；
//   场景 B 窗口被消费（n-1/n/n+1 全被用掉）：等一次边界后拿新步的码成功恢复；
//   场景 C 非 TOTP 的 401（网关/其它）：立即抛，不空等、不换候选。
// 用注入的伪时钟（RefreshTiming）让跨步等待在测试里瞬时完成，同时精确断言等待次数与上界。
// 运行：npx tsx e2e/scripts/token-refresh.regression.ts
import { writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { refreshArtistTokenCache, type RefreshTiming } from '../global-setup.js'

// .tokens.json 归 e2e/ 目录（token-store.ts 以自身所在目录为基准），本脚本在 e2e/scripts/ 下需回退一级
const TOKENS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.tokens.json')

function makeTiming(startMs: number): { timing: RefreshTiming; waits: number[]; now: () => number } {
  let now = startMs
  const waits: number[] = []
  return {
    waits,
    now: () => now,
    timing: {
      now: () => now,
      sleep: async (ms: number) => { waits.push(ms); now += ms }
    }
  }
}

/** 构造一个与服务端五态统一同形的 401 TOTP_INVALID 响应 */
function totpInvalid401(): Response {
  return new Response(JSON.stringify({ code: 'TOTP_INVALID' }), { status: 401 })
}
/** 构造成功登录响应（带 artist_token cookie） */
function loginOk(token: string): Response {
  const res = new Response('', { status: 200 })
  res.headers.append('Set-Cookie', `artist_token=${token}; Path=/; HttpOnly`)
  return res
}

let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const originalFetch = globalThis.fetch
const hadTokens = existsSync(TOKENS_FILE)
// writeArtistToken 读回共享缓存，测试需一份最小合法 .tokens.json
writeFileSync(TOKENS_FILE, JSON.stringify({ artist: 'placeholder', admin: 'placeholder' }))

async function main(): Promise<void> {
  // ── 场景 A：持久 401 TOTP_INVALID → 一次边界等待后抛真实错误 ──
  {
    const { timing, waits } = makeTiming(1_700_000_000_000 + 10_000) // 落在某步内偏移 10s
    let calls = 0
    globalThis.fetch = async (): Promise<Response> => { calls++; return totpInvalid401() }
    let thrown: unknown = null
    try { await refreshArtistTokenCache('http://mock', '10001', timing) } catch (err) { thrown = err }
    const msg = thrown instanceof Error ? thrown.message : String(thrown)
    check('A 持久拒绝：抛出最后一次真实错误（含 TOTP_INVALID）', thrown !== null && msg.includes('TOTP_INVALID'), msg)
    check('A 持久拒绝：只等一次边界（不无限轮×30s）', waits.length === 1, `waits=${JSON.stringify(waits)}`)
    check('A 持久拒绝：单次等待有界（≤30s+余量）', waits[0] > 0 && waits[0] <= 30_100, `waitMs=${waits[0]}`)
    check('A 持久拒绝：鉴权请求有限（2 轮 ×3 候选 = 6）', calls === 6, `calls=${calls}`)
  }

  // ── 场景 B：窗口被消费 → 等一次边界拿新步的码，成功恢复 ──
  {
    const { timing, waits } = makeTiming(1_700_000_000_000 + 10_000)
    let calls = 0
    globalThis.fetch = async (): Promise<Response> => {
      calls++
      // 边界等待前都判为已消费（五态统一 401）；跨步后新码成功
      return waits.length === 0 ? totpInvalid401() : loginOk('fresh-step-token')
    }
    let token = ''
    let thrown: unknown = null
    try { token = await refreshArtistTokenCache('http://mock', '10001', timing) } catch (err) { thrown = err }
    check('B 跨步恢复：等一次边界后成功拿到 token', thrown === null && token === 'fresh-step-token', `token=${token} err=${String(thrown)}`)
    check('B 跨步恢复：确实等了一次边界', waits.length === 1, `waits=${JSON.stringify(waits)}`)
    check('B 跨步恢复：首轮 3 次全 401 后第二轮新码即成功（共 4 次）', calls === 4, `calls=${calls}`)
  }

  // ── 场景 C：非 TOTP 的 401 → 立即抛，不等待 ──
  {
    const { timing, waits } = makeTiming(1_700_000_000_000 + 10_000)
    let calls = 0
    globalThis.fetch = async (): Promise<Response> => {
      calls++
      return new Response(JSON.stringify({ code: 'OTHER_REASON' }), { status: 401 })
    }
    let thrown: unknown = null
    try { await refreshArtistTokenCache('http://mock', '10001', timing) } catch (err) { thrown = err }
    check('C 非 TOTP 错误：立即抛出', thrown !== null)
    check('C 非 TOTP 错误：零等待、零换候选', waits.length === 0 && calls === 1, `waits=${waits.length} calls=${calls}`)
  }

  globalThis.fetch = originalFetch
  console.log(`\n令牌刷新回归（TASK2-03）：${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
  if (failed > 0) process.exitCode = 1
}

void main().finally(() => {
  globalThis.fetch = originalFetch
  if (!hadTokens && existsSync(TOKENS_FILE)) unlinkSync(TOKENS_FILE)
})
