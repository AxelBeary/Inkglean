// 模块包 zip 往返（v0.4）：组包 → 解包 → 验包走真 zip，覆盖 packIo 之外的字节层。
import { describe, it, expect } from 'vitest'
import { buildPack, verifyPack, utf8Encode, PACK_MAX_ENTRY_BYTES } from '../modules/pack'
import { buildPackZip, readPackZip } from '../modules/packZip'

const MANIFEST = {
  spec: '1.0', api: 'panel@1', minHost: '0.1.0',
  id: 'mood-weather', name: '稿情气象台', version: '0.1.0', entry: 'panel.js',
  ui: { zone: 'aside', heightRule: 'fixed-rows', hideable: true, focusPolicy: 'fold' },
  data: { views: ['ledger'], write: { own: false, shared: 'none', reason: '' } },
  network: { scope: 'none', hosts: [], reason: '' },
  linkage: { subscribes: [], emits: [] },
  runtime: { lifecycle: 'on-view', wakeInterval: null, idlePolicy: 'afk-aware' },
  diagnostics: false
}
const MANIFEST_TEXT = JSON.stringify(MANIFEST, null, 2)
const ENTRY = 'var a = 1\nwindow.shihui.ready()\n'

describe('模块包 zip 往返', () => {
  it('导出的包能被自己解开并通过验包（中文/格式化都不影响）', async () => {
    const meta = buildPack(MANIFEST_TEXT, ENTRY, new Date('2026-11-17T00:00:00Z'))!
    const bytes = await buildPackZip(MANIFEST_TEXT, ENTRY, meta)
    expect(bytes.length).toBeGreaterThan(0)
    const { files, names } = await readPackZip(bytes)
    expect(names.sort()).toEqual(['manifest.json', 'pack.json', 'panel.js'])
    const verdict = verifyPack(null, files)
    expect(verdict.reasons).toEqual([])
    expect(verdict.ok).toBe(true)
    expect(verdict.id).toBe('mood-weather')
    expect(verdict.entryCode).toBe(ENTRY)
  })

  it('zip 里夹带第四个文件 → 解包后按「多余条目」拒装', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const meta = buildPack(MANIFEST_TEXT, ENTRY)!
    zip.file('manifest.json', MANIFEST_TEXT)
    zip.file('panel.js', ENTRY)
    zip.file('pack.json', JSON.stringify(meta, null, 2))
    zip.file('evil.js', 'steal()')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const { files } = await readPackZip(bytes)
    const verdict = verifyPack(null, files)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.some(r => r.includes('多余条目'))).toBe(true)
  })

  it('zip 里 panel.js 被换 → 摘要不符拒装', async () => {
    const { default: JSZip } = await import('jszip')
    const meta = buildPack(MANIFEST_TEXT, ENTRY)!
    const zip = new JSZip()
    zip.file('manifest.json', MANIFEST_TEXT)
    zip.file('panel.js', ENTRY + 'fetch("https://x")')
    zip.file('pack.json', JSON.stringify(meta, null, 2))
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const { files } = await readPackZip(bytes)
    const verdict = verifyPack(null, files)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.some(r => r.includes('panel.js 摘要不符'))).toBe(true)
  })

  it('坏 zip → 抛错（由页面接住落 toast）', async () => {
    await expect(readPackZip(utf8Encode('not a zip'))).rejects.toBeTruthy()
  })

  // F0019 复核返工：压缩炸弹必须在**解压前**按中央目录声明的 uncompressedSize 拒绝，
  // 不能等 entry.async 把炸弹解压进内存（可能 OOM）后才抛。
  // 手法：panel.js 用高度可压缩的重复串（远超 512KB 上限），打出来的 zip 本身极小（真炸弹形态）。
  // 旧实现（只查解压后实际字节）要先把 500KB+ 解压进内存再抛「解压后实际体积超限」；
  // 新实现读声明值即拒，抛「解压前拒绝」——用文案区分二者，钉死检查发生在解压前。
  it('F0019 复核返工：声明解压后体积超限 → 解压前拒绝（不等解压/OOM）', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const bomb = 'A'.repeat(PACK_MAX_ENTRY_BYTES + 1) // 超出 512KB 上限 1 字节
    zip.file('panel.js', bomb)
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })

    // zip 本体极小（高度可压缩），但中央目录声明的解压后体积已超限
    expect(bytes.length).toBeLessThan(bomb.length / 10)
    await expect(readPackZip(bytes)).rejects.toThrow(/解压前拒绝/)
  })

  // 反向哨兵：体积在限内的高度可压缩条目应正常解开（确认预检不会误伤合法大面板代码）
  it('F0019 复核返工：解压后体积未超限的高度可压缩条目正常解开', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const ok = 'B'.repeat(1024)
    zip.file('panel.js', ok)
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const { files } = await readPackZip(bytes)
    expect(new TextDecoder().decode(files['panel.js'])).toBe(ok)
  })
})
