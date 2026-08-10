// compress-paper-tex.mjs - 把 ambientCG Paper001 原图压成 ≤1024px WebP tile 入 assets
// 用 Playwright 的 canvas 转码（不引入 sharp 依赖）；一次性脚本，跑完即留档
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
/* playwright 解析回退：脚本所在处 → 当前工作目录（在主仓根运行即可，worktree 无 node_modules） */
let chromium;
for (const base of [import.meta.url, process.cwd() + '/package.json']) {
  try { chromium = createRequire(base)('playwright').chromium; break; } catch { /* 继续 */ }
}
if (!chromium) { console.error('PLAYWRIGHT_NOT_FOUND：请在含 playwright 依赖的目录（主仓根）运行'); process.exit(1); }

const SRC = 'C:/Users/qly19/Downloads/Paper001_4K-JPG/Paper001_4K-JPG_Color.jpg';
const OUT = fileURLToPath(new URL('../src/assets/paper-tex.webp', import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
/* 原图转 base64 data URI 传入，避开 file:// 跨源限制 */
const srcDataUri = 'data:image/jpeg;base64,' + fs.readFileSync(SRC).toString('base64');
const dataUrl = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const SIZE = 1024;
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  return c.toDataURL('image/webp', 0.72);
}, srcDataUri);
await browser.close();

const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
fs.writeFileSync(OUT, buf);
console.log('SAVED', OUT, buf.length, 'bytes');
