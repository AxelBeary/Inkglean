// B-1 配套：web/src/utils/hash.ts 的同步 sha256 与派生幂等键口径。
// 黄金向量取自 Node crypto（服务端同一算法，离线算出后写死）——纯实现一旦写错，这里先红。
// 为什么不在测试里直接 `import { createHash } from 'node:crypto'`：web 的类型域是 `types: ["vite/client"]`，
// 没有 @types/node（tsconfig 也是 allowJs:false 的浏览器域），引入会让 vue-tsc 直接报 TS2307。
import { describe, it, expect } from 'vitest'
import { sha256Hex, deriveIdempotencyKey, IDEMPOTENCY_KEY_MAX_LENGTH, IDEMPOTENCY_KEY_PATTERN } from '../hash'

/** [输入, 期望 hex]；黄金向量由 node -e "createHash('sha256')…" 生成 */
const VECTORS: Array<[string, string]> = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['The quick brown fox jumps over the lazy dog', 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
  // 多字节：UTF-8 编码写错（比如把代理对拆成两个 3 字节）会立刻对不上
  ['幂等键-中文-😀-emoji', '2f3df67a2a2fdbec00fa6ba3edf02931d5bea8b8744749580e9f4b9752597c74'],
  ['a'.repeat(1000), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'],
  // 补位块边界（sha256 最容易写错的 55/56/63/64/65 字节）
  ['x'.repeat(55), 'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072'],
  ['x'.repeat(56), '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e'],
  ['x'.repeat(63), '75220b47218278e656f2013bb8f0c455a25eaf01e86c64924e9d48d89776d6f2'],
  ['x'.repeat(64), '7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c'],
  ['x'.repeat(65), '9537c5fdf120482f7d58d25e9ed583f52c02b4e304ea814db1633ad565aed7e9']
]

describe('sha256Hex（同步纯实现）', () => {
  it.each(VECTORS)('黄金向量：%j', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected)
  })

  it('输出恒为 64 位小写 hex', () => {
    const out = sha256Hex('c4f3b7a2-1111-4222-8333-944455556666')
    expect(out).toHaveLength(64)
    expect(out).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('deriveIdempotencyKey（服务端合规的派生键）', () => {
  const idemKey = 'c4f3b7a2-1111-4222-8333-944455556666'
  const uidA = 'ca-8f14e45f-ceea-467f-a1b2-3c4d5e6f7a8b'
  const uidB = 'ca-11111111-2222-4333-8444-555566667777'

  it('B-1：满足服务端契约（≤64 且 [A-Za-z0-9-]，无冒号）', () => {
    const key = deriveIdempotencyKey(idemKey, 'extra', uidA)
    expect(key.length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX_LENGTH)
    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(key).not.toContain(':')
  })

  it('回归钉住：naive 拼串（原 PR 写法）必然不合规，派生键合规', () => {
    const naive = `${idemKey}:extra:${uidA}`
    // 原写法 82 字符 + 含冒号 → 服务端 readIdempotencyKey 必 400
    expect(naive.length).toBe(82)
    expect(naive.length).toBeGreaterThan(IDEMPOTENCY_KEY_MAX_LENGTH)
    expect(IDEMPOTENCY_KEY_PATTERN.test(naive)).toBe(false)
    // 派生后合规
    expect(IDEMPOTENCY_KEY_PATTERN.test(deriveIdempotencyKey(idemKey, 'extra', uidA))).toBe(true)
  })

  it('确定性：同 (idemKey, uid) 恒同值', () => {
    expect(deriveIdempotencyKey(idemKey, 'extra', uidA)).toBe(deriveIdempotencyKey(idemKey, 'extra', uidA))
  })

  it('不同 uid 不碰撞；换 idemKey 也不碰撞', () => {
    expect(deriveIdempotencyKey(idemKey, 'extra', uidA)).not.toBe(deriveIdempotencyKey(idemKey, 'extra', uidB))
    expect(deriveIdempotencyKey(idemKey, 'extra', uidA)).not.toBe(deriveIdempotencyKey('another-key', 'extra', uidA))
  })

  it('分段边界无歧义：a-b|c 与 a|b-c 得到不同摘要', () => {
    expect(deriveIdempotencyKey('a-b', 'c')).not.toBe(deriveIdempotencyKey('a', 'b-c'))
  })

  it('批量：1000 个 uid 全合规且零碰撞', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const key = deriveIdempotencyKey(idemKey, 'extra', `ca-uid-${i}`)
      expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
      seen.add(key)
    }
    expect(seen.size).toBe(1000)
  })
})
