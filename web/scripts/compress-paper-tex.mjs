// compress-paper-tex.mjs - 把 ambientCG Paper001 原图压成 ≤1024px WebP tile 入 assets
// 用 Playwright 的 canvas 转码（不引入 sharp 依赖）；跑完即留档
// v0.47（用户反馈纹理看不见）：源图改仓内落档副本 + 提对比/质量，纤维在白卡上可见
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
/* playwright 解析回退：脚本所在处 → 当前工作目录（在主仓根运行即可，worktree 无 node_modules） */
let chromium;
for (const base of [import.meta.url, process.cwd() + '/package.json']) {
  try { chromium = createRequire(base)('playwright').chromium; break; } catch { /* 继续 */ }
}
if (!chromium) { console.error('PLAYWRIGHT_NOT_FOUND：请在含 playwright 依赖的目录（主仓根）运行'); process.exit(1); }

/* 源图优先仓内落档副本，Downloads 原图作回退 */
const CANDIDATES = [
  fileURLToPath(new URL('../../workspace/temp/prototype-login/paper001-color.jpg', import.meta.url)),
  'C:/Users/qly19/Downloads/Paper001_4K-JPG/Paper001_4K-JPG_Color.jpg'
];
const SRC = CANDIDATES.find(p => fs.existsSync(p));
if (!SRC) { console.error('SOURCE_NOT_FOUND：paper001-color.jpg 不在预期位置'); process.exit(1); }
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
  /* v0.47：纹理可见性修复。实测原图灰度仅 214-252（range 38），multiply 在白卡上隐形；
     ctx.filter 反而把 range 压到 11（Chromium 大源图 filter 失真）——改用像素级灰度拉伸：
     把原图 1% 百分位映射到 222-255（range≈0.13），配合 op .5 multiply → 卡面斑驳约 6.5%，可见不显脏 */
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const data = ctx.getImageData(0, 0, SIZE, SIZE);
  const px = data.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    hist[Math.round((px[i] + px[i + 1] + px[i + 2]) / 3)]++;
  }
  const total = px.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let g = 0; g < 256; g++) { acc += hist[g]; if (acc >= total * 0.01) { lo = g; break; } }
  acc = 0;
  for (let g = 255; g >= 0; g--) { acc += hist[g]; if (acc >= total * 0.01) { hi = g; break; } }
  const OUT_LO = 222, OUT_HI = 255;
  for (let i = 0; i < px.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const v = Math.max(lo, Math.min(hi, px[i + ch]));
      px[i + ch] = OUT_LO + ((v - lo) / (hi - lo || 1)) * (OUT_HI - OUT_LO);
    }
  }
  ctx.putImageData(data, 0, 0);
  return c.toDataURL('image/webp', 0.85);
}, srcDataUri);
await browser.close();

const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
fs.writeFileSync(OUT, buf);
console.log('SAVED', OUT, buf.length, 'bytes (src:', SRC + ')');
