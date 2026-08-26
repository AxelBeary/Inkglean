// 拾绘桌面版正式图标生成（826 图标批）：朱砂印章「拾」字印。
// 程序化路线：系统楷体渲染汉字（字形 100% 正确），色值取纸墨设计语言 token 真值，
// 扁平无渐变（anti-slop 纪律）。产出 1024 PNG 交 `npx tauri icon` 生成全尺寸。
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'

const SIZE = 1024
const ZS = '#BC3A2B'   // --zs 朱砂
const ZS_D = '#9E2F22' // --zs-d 深朱
const PAPER = '#F0E6CF' // --paper 宣纸底
const CARD = '#FBF7EC' // 近白宣纸（图标底比 UI 纸面略亮，提对比）

/** 楷体「拾」字（simkai.ttf = KaiTi，Windows 内置） */
function shi(char, fill, fontSize = 600, dy = 0.36) {
  return `<text x="512" y="${512 + fontSize * dy}" text-anchor="middle"
    font-family="KaiTi, KaiTi_GB2312, STKaiti, serif" font-weight="700"
    font-size="${fontSize}" fill="${fill}">${char}</text>`
}

/** 变体 A：满幅朱砂圆角方 + 白文「拾」（任务栏/托盘辨识度最高） */
const variantA = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="1024" height="1024" rx="224" fill="${ZS}"/>
  ${shi('拾', CARD, 600)}
</svg>`

/** 变体 B：深朱细边内框，印章感更重 */
const variantB = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="1024" height="1024" rx="224" fill="${ZS}"/>
  <rect x="72" y="72" width="880" height="880" rx="160" fill="none" stroke="${CARD}" stroke-width="26" stroke-opacity="0.55"/>
  ${shi('拾', CARD, 520)}
</svg>`

/** 变体 C：宣纸底 + 朱砂「拾」（浅色变体，留档对照） */
const variantC = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="1024" height="1024" rx="224" fill="${CARD}"/>
  <rect x="64" y="64" width="896" height="896" rx="168" fill="none" stroke="${ZS_D}" stroke-width="18"/>
  ${shi('拾', ZS, 560)}
</svg>`

const variants = { A: variantA, B: variantB, C: variantC }
for (const [name, svg] of Object.entries(variants)) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: true, defaultFontFamily: 'KaiTi' }
  }).render().asPng()
  const file = `app-icon-${name}-1024.png`
  writeFileSync(file, png)
  console.log('written:', file, png.length, 'bytes')
}
