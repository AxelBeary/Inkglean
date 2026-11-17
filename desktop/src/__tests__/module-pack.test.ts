// 模块包测试（v0.4）：摘要/扫描/打验包的口径哨兵 + 比对 Node crypto 黄金向量。
// 只测纯逻辑（pack.ts）；zip 与落盘（packIo.ts）由组件/人工真机验。
import { describe, it, expect } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import {
  PACK_FORMAT, PACK_ALLOWED_NAMES, PACK_MAX_MANIFEST_BYTES,
  sha256Hex, utf8Encode, utf8Decode, stableStringify, manifestDigestOf,
  moduleFingerprint, stripStringsAndComments, scanModuleCode,
  buildPack, verifyPack, isSafeModuleDirName
} from '../modules/pack'

const MANIFEST = {
  spec: '1.0', api: 'panel@1', minHost: '0.1.0',
  id: 'mood-weather', name: '稿情气象台', version: '0.1.0',
  entry: 'panel.js',
  ui: { zone: 'aside', heightRule: 'fixed-rows', hideable: true, focusPolicy: 'fold' },
  data: { views: ['ledger'], write: { own: false, shared: 'none', reason: '' } },
  network: { scope: 'none', hosts: [], reason: '' },
  linkage: { subscribes: [], emits: [] },
  runtime: { lifecycle: 'on-view', wakeInterval: null, idlePolicy: 'afk-aware' },
  diagnostics: false
}
const MANIFEST_TEXT = JSON.stringify(MANIFEST, null, 2)
const ENTRY = 'var a = 1\nconsole.log(a)\nwindow.shihui.ready()\n'

function fileSet(manifest = MANIFEST_TEXT, entry = ENTRY, pack?: unknown): Record<string, Uint8Array> {
  const meta = pack ?? buildPack(manifest, entry)!
  return {
    'manifest.json': utf8Encode(manifest),
    'panel.js': utf8Encode(entry),
    'pack.json': utf8Encode(JSON.stringify(meta, null, 2))
  }
}

describe('SHA-256（对 Node crypto 黄金向量）', () => {
  it('标准向量', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('The quick brown fox jumps over the lazy dog'))
      .toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592')
  })

  it('随机字节 / 中文 / 长文本与 Node 逐条一致', () => {
    const samples: (string | Uint8Array)[] = [
      '稿情气象台 · 今日无事，不如画画',
      'a'.repeat(1000),
      new Uint8Array([]),
      randomBytes(65),
      randomBytes(1000)
    ]
    for (const s of samples) {
      const expected = createHash('sha256').update(s).digest('hex')
      expect(sha256Hex(s)).toBe(expected)
    }
  })
})

describe('UTF-8 编解码', () => {
  it('中文/emoji 往返一致；字节数按 UTF-8 而不是字符数', () => {
    const text = '稿情 ☀️ 台'
    expect(utf8Decode(utf8Encode(text))).toBe(text)
    expect(utf8Encode('稿').length).toBe(3)
  })

  it('坏字节返 null（不悄悄替换成 U+FFFD）', () => {
    expect(utf8Decode(Uint8Array.from([0xff, 0xfe, 0x41]))).toBe(null)
  })
})

describe('stableStringify（只对语义算摘要）', () => {
  it('键序不同 → 稳定化结果一致', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } }))
      .toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })

  it('format / 键序 / 空白不影响 manifest 摘要', () => {
    const compact = JSON.stringify(MANIFEST)
    const reordered = JSON.stringify({ ...MANIFEST, ui: { focusPolicy: 'fold', hideable: true, heightRule: 'fixed-rows', zone: 'aside' } })
    expect(manifestDigestOf(compact)).toBe(manifestDigestOf(MANIFEST_TEXT))
    expect(manifestDigestOf(reordered)).toBe(manifestDigestOf(MANIFEST_TEXT))
  })

  it('undefined 丢弃、数组顺序保留', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}')
    expect(stableStringify({ list: [2, 1] })).toBe('{"list":[2,1]}')
  })

  it('非法 JSON 返 null', () => {
    expect(manifestDigestOf('{oops')).toBe(null)
    expect(manifestDigestOf('[]')).toBe(null)
  })
})

describe('静态扫描（先剥字符串与注释）', () => {
  it('剥字符串/注释后保留行号', () => {
    const code = 'var a = "fetch()"\n// fetch()\nvar b = 1\n/* eval */\nvar c = 2'
    expect(stripStringsAndComments(code).includes('fetch')).toBe(false)
    expect(stripStringsAndComments(code).includes('eval')).toBe(false)
    expect(stripStringsAndComments(code).split('\n').length).toBe(5)
  })

  it('命中禁用 API 并报行号；同形标识符不误报', () => {
    const code = 'var prefetch = 1\nvar x = fetch("/x")\nvar y = eval("1")\nvar z = window.__TAURI__'
    const findings = scanModuleCode(code)
    expect(findings.map(f => f.token)).toEqual(['fetch', 'eval', '__TAURI__'])
    expect(findings[0].line).toBe(2)
    expect(findings[1].line).toBe(3)
  })

  it('真实示例模块（只用桥 + token）零命中', () => {
    const sample = 'var body = document.body\nbody.style.cssText = "margin:0;color:var(--ink2)"\nwindow.shihui.getData("ledger", function (rows) { window.shihui.ready() })'
    expect(scanModuleCode(sample)).toEqual([])
  })

  it('已知边界：正则字面量不剥（扫描是提示不是判据，沙箱才是真闸）', () => {
    expect(scanModuleCode('var re = /eval/')[0]?.token).toBe('eval')
  })
})

describe('buildPack（组包）', () => {
  it('只列两件；size 是字节数；摘要与语义摘要齐备', () => {
    const pack = buildPack(MANIFEST_TEXT, ENTRY, new Date('2026-11-17T00:00:00Z'))!
    expect(pack.format).toBe(PACK_FORMAT)
    expect(pack.files.map(f => f.path)).toEqual(['manifest.json', 'panel.js'])
    expect(pack.files[0].size).toBe(utf8Encode(MANIFEST_TEXT).length)
    expect(pack.files[1].size).toBe(utf8Encode(ENTRY).length)
    expect(pack.manifestDigest).toBe(manifestDigestOf(MANIFEST_TEXT))
    expect(pack.module).toEqual({ id: 'mood-weather', name: '稿情气象台', version: '0.1.0' })
    expect(pack.generatedAt).toBe('2026-11-17T00:00:00.000Z')
  })

  it('确定性：同一模块两次组包，除 generatedAt 外逐字节一致（OFM #3 的单元级切片）', () => {
    const a = buildPack(MANIFEST_TEXT, ENTRY, new Date('2026-11-17T00:00:00Z'))!
    const b = buildPack(MANIFEST_TEXT, ENTRY, new Date('2026-11-18T12:34:56Z'))!
    const strip = (p: typeof a): string => JSON.stringify({ ...p, generatedAt: '' })
    expect(strip(a)).toBe(strip(b))
    expect(a.files).toEqual(b.files)
    expect(a.manifestDigest).toBe(b.manifestDigest)
  })

  it('manifest 坏 JSON → null', () => {
    expect(buildPack('{oops', ENTRY)).toBe(null)
  })
})

describe('verifyPack（验包）', () => {
  it('正常包通过；无拒因无告警', () => {
    const v = verifyPack('mood-weather', fileSet())
    expect(v.reasons).toEqual([])
    expect(v.ok).toBe(true)
    expect(v.warnings).toEqual([])
    expect(v.digests.entry).toBe(sha256Hex(ENTRY))
  })

  it('panel.js 被改 → 摘要不符拒装', () => {
    // 摘要按「原入口」组包，落盘的是被改过的入口：这正是传输损坏/事后篡改的形状
    const meta = buildPack(MANIFEST_TEXT, ENTRY)!
    const v = verifyPack('mood-weather', {
      'manifest.json': utf8Encode(MANIFEST_TEXT),
      'panel.js': utf8Encode(ENTRY + 'fetch("https://x")'),
      'pack.json': utf8Encode(JSON.stringify(meta, null, 2))
    })
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('panel.js 摘要不符'))).toBe(true)
  })

  it('夹带第三个文件 → 拒装', () => {
    const files = fileSet()
    files['evil.js'] = utf8Encode('x')
    const v = verifyPack('mood-weather', files)
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('多余条目'))).toBe(true)
  })

  it('目录名与 manifest id 不一致 → 拒装', () => {
    const v = verifyPack('another-id', fileSet())
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('目录名须与 manifest id 一致'))).toBe(true)
  })

  it('包格式版本不认 → 拒装', () => {
    const pack = { ...buildPack(MANIFEST_TEXT, ENTRY)!, format: 99 }
    const v = verifyPack('mood-weather', fileSet(MANIFEST_TEXT, ENTRY, pack))
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('包格式不支持'))).toBe(true)
  })

  it('manifest 语义摘要被换 → 拒装（声明与文件对不上）', () => {
    const pack = { ...buildPack(MANIFEST_TEXT, ENTRY)!, manifestDigest: 'x'.repeat(64) }
    const v = verifyPack('mood-weather', fileSet(MANIFEST_TEXT, ENTRY, pack))
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('语义摘要不符'))).toBe(true)
  })

  it('manifest 超上限 → 拒装', () => {
    const big = MANIFEST_TEXT + ' '.repeat(PACK_MAX_MANIFEST_BYTES)
    const v = verifyPack('mood-weather', fileSet(big, ENTRY))
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('超过上限'))).toBe(true)
  })

  it('入口含禁用 API → 仍可装，但列出告警（沙箱才是真闸）', () => {
    const risky = ENTRY + '\nvar url = location.href; fetch(url)'
    const v = verifyPack('mood-weather', fileSet(MANIFEST_TEXT, risky))
    expect(v.ok).toBe(true)
    expect(v.findings.map(f => f.token)).toContain('fetch')
    expect(v.warnings.length).toBeGreaterThan(0)
  })

  it('安装口径：dirName 传 null 时按 manifest id 定目录名', () => {
    const v = verifyPack(null, fileSet())
    expect(v.ok).toBe(true)
    expect(v.id).toBe('mood-weather')
  })

  it('pack.json 自报 id 与 manifest 不一致 → 拒装', () => {
    const pack = { ...buildPack(MANIFEST_TEXT, ENTRY)!, module: { id: 'other-id', name: 'x', version: '0.1.0' } }
    const v = verifyPack(null, fileSet(MANIFEST_TEXT, ENTRY, pack))
    expect(v.ok).toBe(false)
    expect(v.reasons.some(r => r.includes('自报的模块 id 与 manifest 不一致'))).toBe(true)
  })

  it('白名单常量与验包口径一致', () => {
    expect(PACK_ALLOWED_NAMES).toEqual(['manifest.json', 'panel.js', 'pack.json'])
  })
})

describe('目录名白名单（与 Rust is_safe_dir_name 对齐）', () => {
  it('合法/非法样例', () => {
    expect(isSafeModuleDirName('mood-weather')).toBe(true)
    expect(isSafeModuleDirName('稿情气象台')).toBe(true)
    expect(isSafeModuleDirName('a_b-1')).toBe(true)
    expect(isSafeModuleDirName('..')).toBe(false)
    expect(isSafeModuleDirName('.hidden')).toBe(false)
    expect(isSafeModuleDirName('a/b')).toBe(false)
    expect(isSafeModuleDirName('a b')).toBe(false)
    expect(isSafeModuleDirName('')).toBe(false)
    expect(isSafeModuleDirName('a'.repeat(65))).toBe(false)
  })
})

describe('moduleFingerprint（界面短指纹）', () => {
  it('短指纹取 manifest 语义摘要前 8 位', () => {
    const fp = moduleFingerprint(MANIFEST_TEXT, ENTRY)
    expect(fp.short.length).toBe(8)
    expect(fp.short).toBe(fp.manifestDigest.slice(0, 8))
    expect(fp.entryDigest).toBe(sha256Hex(ENTRY))
  })
})
