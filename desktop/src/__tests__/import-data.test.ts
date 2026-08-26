// 本地核心环波10 测试：数据导入——解包预检/设置恢复/字节转换 + 导出导入成环（zip 往返）。
import { describe, it, expect, beforeEach } from 'vitest'
import JSZip from 'jszip'
import { b64ToBytes, parseBackup, restorePrefs, runImport } from '../tools/importData'
import { backupFileName } from '../tools/exportData'

beforeEach(() => localStorage.clear())

describe('b64ToBytes / backupFileName（纯函数）', () => {
  it('base64 往返一致', () => {
    const src = new Uint8Array([0, 1, 2, 250, 255])
    const b64 = btoa(String.fromCharCode(...src))
    expect(Array.from(b64ToBytes(b64))).toEqual([0, 1, 2, 250, 255])
  })

  it('备份文件名带日期戳与 .zip', () => {
    const name = backupFileName(new Date(2026, 7, 26))
    expect(name).toBe('拾绘备份-20260826.zip')
  })
})

describe('restorePrefs（替换口径：先清后写）', () => {
  it('清掉现有前缀键再回写快照', () => {
    localStorage.setItem('shihui-desktop-prefs-v1', 'old')
    localStorage.setItem('huiyue_price_card_draft', 'old')
    localStorage.setItem('other-key', 'keep')
    restorePrefs({ 'shihui-desktop-prefs-v1': 'new' }, localStorage)
    expect(localStorage.getItem('shihui-desktop-prefs-v1')).toBe('new')
    expect(localStorage.getItem('huiyue_price_card_draft')).toBeNull() // 快照里没有即清除
    expect(localStorage.getItem('other-key')).toBe('keep') // 无关键不动
  })
})

describe('parseBackup（解包预检）', () => {
  it('缺 local.db 判非法并给原因', async () => {
    const zip = new JSZip()
    zip.file('prefs.json', '{}')
    const b64 = await zip.generateAsync({ type: 'base64' })
    const r = await parseBackup(b64)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('local.db')
  })

  it('坏 zip 判非法不抛', async () => {
    const r = await parseBackup(btoa('not-a-zip'))
    expect(r.ok).toBe(false)
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('有效包：取出 db/设置/清单条数', async () => {
    const zip = new JSZip()
    zip.file('local.db', 'sqlite-bytes')
    zip.file('prefs.json', JSON.stringify({ 'shihui-desktop-prefs-v1': '{}' }))
    zip.file('manifest.json', JSON.stringify([{ path: 'a' }, { path: 'b' }]))
    const b64 = await zip.generateAsync({ type: 'base64' })
    const r = await parseBackup(b64)
    expect(r.ok).toBe(true)
    expect(r.dbB64).toBeTruthy()
    expect(r.prefs?.['shihui-desktop-prefs-v1']).toBe('{}')
    expect(r.manifestCount).toBe(2)
  })
})

describe('runImport（校验顺序与纯浏览器环境降级）', () => {
  it('非法预览直接返原因（先于环境检查）', async () => {
    const r = await runImport([], [], { ok: false, reason: '包坏了', dbB64: null, prefs: null, manifestCount: null })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('包坏了')
  })

  it('合法预览但浏览器环境报壳层限制', async () => {
    const r = await runImport([], [], { ok: true, reason: '', dbB64: 'x', prefs: null, manifestCount: null })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('导入仅在桌面壳内可用')
  })
})
