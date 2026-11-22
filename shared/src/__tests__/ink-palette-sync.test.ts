// F0171: INK_PALETTE 与两端 CSS 色值事实源同步校验
// 本包是双端 canvas 导出色值单源，宣纸档 slT/th/zhe 须与 web/desktop 的 CSS 变量一致；
// 此前仅靠注释约定「无测试钉死」，改色漏改一端不会报错，故加此回归测试。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { INK_PALETTE } from '../utils/ink-palette'

// 从 shared/src/__tests__ 回到仓库根（shared/src/__tests__ → shared/src → shared → 根）
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** 取 CSS 中某变量第一次声明的 hex 值（宣纸主题，跳过后面的墨黑档 rgba） */
function firstCssVar(cssPath: string, varName: string): string {
  const css = readFileSync(resolve(repoRoot, cssPath), 'utf8')
  const match = css.match(new RegExp(`${varName}\\s*:\\s*(#[0-9A-Fa-f]{3,8})\\s*;`))
  if (!match) throw new Error(`${cssPath} 未找到 ${varName} 的 hex 声明`)
  return match[1].toUpperCase()
}

const CSS_SOURCES = [
  'web/src/styles/artist-tokens.css',
  'desktop/src/styles/paper-ink.css'
]

describe('F0171: INK_PALETTE 宣纸档色值与两端 CSS 同步', () => {
  const pairs: Array<[keyof typeof INK_PALETTE, string]> = [
    ['slT', '--sl-t'],
    ['th', '--th'],
    ['zhe', '--zhe']
  ]
  for (const [paletteKey, cssVar] of pairs) {
    it(`INK_PALETTE.${paletteKey} 与两端 CSS ${cssVar} 一致`, () => {
      const expected = String(INK_PALETTE[paletteKey]).toUpperCase()
      for (const src of CSS_SOURCES) {
        expect(firstCssVar(src, cssVar), `${src} 的 ${cssVar}`).toBe(expected)
      }
    })
  }
})
