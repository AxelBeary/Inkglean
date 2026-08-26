// 本地核心环波7 测试：F5 图缓存纯函数与逃生门（缓存层口径哨兵）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { hashUrl, extOfUrl, useImageCacheStore, MAX_CACHE_ENTRIES } from '../stores/imageCache'
import { cacheDir, deleteCacheFile } from '../bridge/files'
import { BridgeUnavailableError } from '../bridge'

const win = window as unknown as Record<string, unknown>

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => { delete win.__TAURI_INTERNALS__ })

describe('hashUrl / extOfUrl（缓存文件名纯函数）', () => {
  it('同 url 同哈希、不同 url 不同哈希', () => {
    expect(hashUrl('a')).toBe(hashUrl('a'))
    expect(hashUrl('a')).not.toBe(hashUrl('b'))
  })

  it('哈希为十六进制无符号整数', () => {
    expect(hashUrl('https://x.test/uploads/references/1.png')).toMatch(/^[0-9a-f]+$/)
  })

  it('扩展名白名单：白名单内保留、剥 query、其余落 .png', () => {
    expect(extOfUrl('x/a.jpg')).toBe('.jpg')
    expect(extOfUrl('x/a.JPEG?w=100')).toBe('.jpeg')
    expect(extOfUrl('x/a.webp')).toBe('.webp')
    expect(extOfUrl('x/a.php?e=.png')).toBe('.png')
    expect(extOfUrl('x/noext')).toBe('.png')
  })
})

describe('图缓存 store（纯浏览器环境降级）', () => {
  it('resolve 在浏览器环境直接返 null（不走网络不落盘）', async () => {
    const cache = useImageCacheStore()
    expect(await cache.resolve('http://x/a.png')).toBeNull()
  })

  it('空 url 返 null', async () => {
    const cache = useImageCacheStore()
    expect(await cache.resolve('')).toBeNull()
  })

  it('cacheDir 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(cacheDir()).rejects.toThrow(BridgeUnavailableError)
  })

  it('deleteCacheFile 在浏览器环境抛 BridgeUnavailableError（波15 淘汰桥）', async () => {
    await expect(deleteCacheFile('x')).rejects.toThrow(BridgeUnavailableError)
  })

  it('缓存上限常量口径哨兵（改动需同步评估磁盘占用）', () => {
    expect(MAX_CACHE_ENTRIES).toBeGreaterThan(0)
  })
})
