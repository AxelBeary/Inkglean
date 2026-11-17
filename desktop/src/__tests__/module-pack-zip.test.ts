// 模块包 zip 往返（v0.4）：组包 → 解包 → 验包走真 zip，覆盖 packIo 之外的字节层。
import { describe, it, expect } from 'vitest'
import { buildPack, verifyPack, utf8Encode } from '../modules/pack'
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
})
