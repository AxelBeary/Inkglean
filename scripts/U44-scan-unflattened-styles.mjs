#!/usr/bin/env node
// U44-scan-unflattened-styles.mjs ｜ 全后台样式扫平清单（C-T07-08）
// 静态扫 web 源码，只出「哪些样式没扫平」的机械清单：选择器 / 属性 / 出现次数。
// 不改任何样式文件，不做审美判断；对比度、"太素"一类审美项一律不进本清单。
// 用法:
//   node U44-scan-unflattened-styles.mjs <src目录> [--enum 枚举事实源.ts] [--exclude dist,xx] [--emit 输出目录]
// 例:
//   node U44-scan-unflattened-styles.mjs "D:/Hermes Agent CN Desktop/workspace/artist-commission/web/src" \
//     --enum ".../web/src/utils/dashboard-prefs.ts" --emit "G:/.../out/U44/清单"
// 退出码: 0=正常出清单（清单是"可疑"，不是判死）; 1=参数/目录错误。
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
function flagVal(name, dflt = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const srcDir = args.find((a) => !a.startsWith('--'));
const enumFile = flagVal('--enum');
const emitDir = flagVal('--emit');
const excludeSet = new Set((flagVal('--exclude', '') || '').split(',').map((s) => s.trim()).filter(Boolean));
if (!srcDir || !fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
  console.error('用法: node U44-scan-unflattened-styles.mjs <src目录> [--enum file] [--exclude a,b] [--emit dir]');
  console.error('（src 目录不存在或不是目录: ' + srcDir + '）');
  process.exit(1);
}
const EXT_RE = /\.(vue|css|scss)$/i;

// ---------- 文件收集 ----------
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || excludeSet.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (EXT_RE.test(e.name)) files.push(p);
  }
})(path.resolve(srcDir));
if (!files.length) { console.error('NO_FILES: ' + srcDir + ' 下未找到 .vue/.css/.scss'); process.exit(1); }

const rel = (f) => path.relative(path.resolve(srcDir), f).replace(/\\/g, '/');

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function styleBlocksOf(file, text) {
  if (!/\.vue$/i.test(file)) return [text];
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
}
// 递归拆规则，保留 @media 等上下文；返回 {at, sel, body}
function collectRules(css, atPrefix) {
  const res = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const sel = css.slice(i, open).trim();
    let d = 1, j = open + 1;
    while (j < css.length && d > 0) {
      if (css[j] === '{') d++;
      else if (css[j] === '}') d--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports|layer|container)/i.test(sel)) {
      const tag = sel.replace(/\s+/g, ' ');
      res.push(...collectRules(body, atPrefix ? atPrefix + ' » ' + tag : tag));
    } else {
      for (const s of sel.split(',').map((x) => x.trim()).filter(Boolean)) res.push({ at: atPrefix, sel: s, body });
    }
    i = j;
  }
  return res;
}
function decls(body) {
  const out = [];
  for (const seg of body.split(/[;\n]/)) {
    const m = seg.trim().match(/^([-\w]+)\s*:\s*(.+)$/);
    if (m) out.push([m[1].toLowerCase(), m[2].trim()]);
  }
  return out;
}

// ---------- 装载 ----------
const loaded = files.map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
for (const o of loaded) {
  o.rules = [];
  for (const blk of styleBlocksOf(o.f, o.text)) {
    o.rules.push(...collectRules(stripComments(blk), null));
  }
  // 模板内联 style（去掉 <style> 块后的部分，近似模板/脚本区）
  o.template = /\.vue$/i.test(o.f) ? o.text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') : '';
}

// ---------- R1 字号跟随 ----------
// 口径：后台字号设置机制 = html[data-font-size='N'] 写 --font-scale=N/14 与 --el-font-size-*（artist-tokens.css L407+，实测 L439-445）。
// 因此：font-size 写死裸 px 字面值 → 不跟随设置，进待修清单；
//       calc(var(--font-scale…)*Npx) → scale跟随（随档位缩放，不判待修）；
//       rem/em/%/其余 calc → review（人工核验，不判死）；var(--*font*) → token跟随。
function classifyFs(v) {
  const tok = v.split(/\s+/)[0] || '';
  if (/^calc\s*\(\s*var\s*\(\s*--font-scale/i.test(v)) return 'scale跟随';
  if (/^var\s*\(\s*--[\w-]*(font|size)/i.test(tok) || /^var\s*\(\s*--el-font/i.test(v)) return 'token跟随';
  if (/^\d*\.?\d+px$/i.test(tok)) return '写死px';
  if (/^(?:\d*\.?\d+)(?:rem|em|%|pt|pc|vh|vw|vmin|vmax)$/i.test(tok) || /\bcalc\s*\(/i.test(v)) return 'review';
  return 'other';
}
const r1 = new Map(); // key sel||val||kind -> {sel,val,kind,files:Map(file->n)}
let r1Mech = 0, r1Inline = 0;
for (const o of loaded) {
  for (const r of o.rules) {
    for (const [prop, val] of decls(r.body)) {
      if (prop !== 'font-size') continue;
      if (/data-font-size/.test(r.sel)) { r1Mech++; continue; } // 缩放机制本体行，不算待修
      const kind = classifyFs(val);
      const key = (r.at ? r.at + ' » ' : '') + r.sel + ' || ' + val + ' || ' + kind;
      if (!r1.has(key)) r1.set(key, { sel: (r.at ? r.at + ' » ' : '') + r.sel, val, kind, files: new Map() });
      const e = r1.get(key);
      e.files.set(rel(o.f), (e.files.get(rel(o.f)) || 0) + 1);
    }
  }
  const inline = o.template.match(/style\s*=\s*"[^"]*font-size[^"]*"/gi) || [];
  r1Inline += inline.length;
  for (const s of inline) {
    const vm = s.match(/font-size\s*:\s*([^;"']+)/i);
    const val = vm ? vm[1].trim() : '(模板字符串动态)';
    const kind = val && /^\d*\.?\d+px$/i.test(val.split(/\s+/)[0]) ? '写死px' : 'review';
    const key = '(内联style) ' + path.basename(o.f) + ' || ' + val + ' || ' + kind;
    if (!r1.has(key)) r1.set(key, { sel: '(内联style)', val, kind, files: new Map() });
    const e = r1.get(key);
    e.files.set(rel(o.f), (e.files.get(rel(o.f)) || 0) + 1);
  }
}
const r1Px = [...r1.values()].filter((e) => e.kind === '写死px');
const r1Review = [...r1.values()].filter((e) => e.kind === 'review');
const r1Token = [...r1.values()].filter((e) => e.kind === 'token跟随');
const r1Scale = [...r1.values()].filter((e) => e.kind === 'scale跟随');
const total = (e) => [...e.files.values()].reduce((a, b) => a + b, 0);
const fmtFiles = (e, cap = 3) => {
  const arr = [...e.files.entries()].sort((a, b) => b[1] - a[1]);
  const head = arr.slice(0, cap).map(([f, n]) => f + ' x' + n).join(', ');
  return head + (arr.length > cap ? ' …+' + (arr.length - cap) + '文件' : '');
};

// ---------- R2 开关右置 ----------
const SWITCH_RE = /<el-switch|<van-switch|role="switch"|(?:class|:class)="[^"]*\b(?:switch|toggle)\b/gi;
const ALIGN_RE = /margin-left:\s*auto|justify-content:\s*(?:flex-end|end|space-between)|text-align:\s*right|flex-direction:\s*row-reverse|float:\s*right/gi;
const r2 = [];
for (const o of loaded) {
  const sw = (o.text.match(SWITCH_RE) || []).length;
  if (!sw) continue;
  const al = (o.text.match(ALIGN_RE) || []).length;
  r2.push({ file: rel(o.f), sw, al });
}

// ---------- R3 页宽统一 ----------
const PAGESEL_RE = /page|layout|container|wrapper|content|\bmain\b|dashboard|admin|panel/i;
const WIDTH_MIN_PX = 300; // 口径：px 字面 <300 视为部件尺寸不是页宽，不进清单（% /vw /rem /em 与 max-width 不受此限）
function widthWorthListing(prop, val) {
  if (/\d*\.?\d+px$/i.test(val)) {
    const n = Number(val.match(/^(\d*\.?\d+)px$/i)[1]);
    if (n < WIDTH_MIN_PX) return false;
  }
  return true;
}
const r3 = new Map(); // "prop: value" -> {prop,val,selCount Map, files Map}
let pageMaxDefault = null;
if (enumFile && fs.existsSync(enumFile)) {
  const m = fs.readFileSync(enumFile, 'utf8').match(/PAGE_MAX_DEFAULT\s*=\s*(\d+)/);
  if (m) pageMaxDefault = Number(m[1]);
}
for (const o of loaded) {
  for (const r of o.rules) {
    if (!PAGESEL_RE.test(r.sel)) continue;
    for (const [prop, val] of decls(r.body)) {
      if (prop !== 'max-width' && prop !== 'width') continue;
      if (!/^\d*\.?\d+(px|%|vw|rem|em)$/i.test(val.trim())) continue; // 只收静态字面值；var/calc 走 review 不重复列
      if (!widthWorthListing(prop, val.trim())) continue; // px<300 视为部件尺寸，不是页宽
      const key = prop + ': ' + val;
      if (!r3.has(key)) r3.set(key, { prop, val, sels: new Map(), files: new Map() });
      const e = r3.get(key);
      e.sels.set(r.sel, (e.sels.get(r.sel) || 0) + 1);
      e.files.set(rel(o.f), (e.files.get(rel(o.f)) || 0) + 1);
    }
  }
}
const r3Bound = new Map(); // 页面级容器用了绑定式宽度（:style maxWidth）的文件
for (const o of loaded) {
  const n = (o.template.match(/:style="[^"]*maxWidth/g) || []).length;
  if (n) r3Bound.set(rel(o.f), n);
}

// ---------- R4 款式枚举缺项 ----------
const r4 = { modules: [], picksKeys: [], optValues: [], cover: [], missingModules: [] };
if (enumFile && fs.existsSync(enumFile)) {
  const t = stripComments(fs.readFileSync(enumFile, 'utf8'));
  const idsBlock = t.match(/DASHBOARD_MODULE_IDS\s*=\s*\[([\s\S]*?)\]/);
  if (idsBlock) r4.modules = [...idsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const picksBlock = t.match(/MODULE_STYLE_PICKS[\s\S]*?\{([\s\S]*?)\n\}/);
  if (picksBlock) r4.picksKeys = [...picksBlock[1].matchAll(/(\w+)\s*:\s*\{\s*field/g)].map((m) => m[1]);
  r4.optValues = [...new Set([...t.matchAll(/\{\s*value:\s*'([^']+)'/g)].map((m) => m[1]))];
  for (const v of r4.optValues) {
    let hits = 0; const where = [];
    for (const o of loaded) {
      const re = new RegExp("['\"`]" + v + "['\"`]|\\bv(ariant)?\\s*===?\\s*['\"]" + v, 'g');
      const n = (o.text.match(re) || []).length;
      if (n) { hits += n; where.push(rel(o.f) + ' x' + n); }
    }
    r4.cover.push({ value: v, hits, where: where.slice(0, 4).join(', ') });
  }
  r4.missingModules = r4.modules.filter((m) => !r4.picksKeys.includes(m));
}

// ---------- 输出 ----------
const L = [];
const say = (s) => { L.push(s); console.log(s); };
say('== U44 全后台样式扫平清单（机械可疑清单，只报不改；判据不清一律 WARN）==');
say('扫描: ' + path.resolve(srcDir) + '（' + files.length + ' 个 .vue/.css/.scss；跳过 node_modules/点目录' + (excludeSet.size ? '/--exclude ' + [...excludeSet].join(',') : '') + '）');
say('枚举事实源: ' + (enumFile || '(未给 --enum，R4 跳过)'));
say('');
say('── R1 字号跟随（口径：后台字号设置写 html[data-font-size] 的 --font-scale/--el-font-size-*；font-size 裸 px 字面=写死px 待修；calc(var(--font-scale…)*Npx)=scale跟随；rem/em/%/其余 calc=review 人工核验；var(--*font*)=token跟随；data-font-size 机制行 ' + r1Mech + ' 条已白名单；模板内联 font-size ' + r1Inline + ' 处并入）');
say('  [WARN] 写死 px font-size —— 种数 ' + r1Px.length + '，出现次数合计 ' + r1Px.reduce((a, e) => a + total(e), 0) + '：');
for (const e of r1Px.sort((a, b) => total(b) - total(a))) {
  say('    font-size: ' + e.val + ' @ ' + e.sel + '  x' + total(e) + '  (' + fmtFiles(e) + ')');
}
say('  [review] rem/em/%/calc 字号 —— 种数 ' + r1Review.length + '，出现合计 ' + r1Review.reduce((a, e) => a + total(e), 0) + '（跟随与否取决于根字号接线，不自动判）：');
for (const e of r1Review.sort((a, b) => total(b) - total(a))) {
  say('    font-size: ' + e.val + ' @ ' + e.sel + '  x' + total(e) + '  (' + fmtFiles(e) + ')');
}
say('  [跟随] scale跟随 calc(var(--font-scale…)) —— 种数 ' + r1Scale.length + '，出现合计 ' + r1Scale.reduce((a, e) => a + total(e), 0) + '（随档位缩放，不计待修；其中乘数基数是否离群交 R1-px 同口径人工看）');
say('  [跟随] var(--…font…) —— 种数 ' + r1Token.length + '，出现合计 ' + r1Token.reduce((a, e) => a + total(e), 0) + '（不计待修）');
say('');
say('── R2 开关右置（口径：文件内 el-switch/van-switch/role=switch/class*=switch|toggle 记 1 次；同文件内出现 margin-left:auto / justify-content:flex-end|space-between / text-align:right / row-reverse / float:right 任一则记右置信号。无信号≠判死，只列 WARN 供浏览器确认；开关语义本身不在此判）');
const r2NoAlign = r2.filter((x) => x.al === 0);
say('  含开关的文件 ' + r2.length + ' 个；其中未见右置信号 [WARN] ' + r2NoAlign.length + ' 个：');
for (const x of r2.sort((a, b) => b.sw - a.sw)) {
  say('    ' + (x.al === 0 ? '[WARN] ' : '       ') + x.file + '  开关x' + x.sw + ' 右置信号x' + x.al);
}
say('');
say('── R3 页宽统一（口径：仅页面级选择器（名字含 page/layout/container/wrapper/content/main/dashboard/admin/panel）上的静态 max-width/width 字面值；px 字面 <' + WIDTH_MIN_PX + ' 视为部件尺寸不进清单；同一取值跨文件汇总。' + (pageMaxDefault ? '设置项默认档 PAGE_MAX_DEFAULT=' + pageMaxDefault + 'px，等值标 [默认档]，其余标 [分布] 交人比对，不判谁对谁错。' : '未给 --enum，无默认档标注。') + '）');
for (const e of [...r3.values()].sort((a, b) => {
  const ta = [...b.files.values()].reduce((x, y) => x + y, 0);
  const tb = [...a.files.values()].reduce((x, y) => x + y, 0);
  return ta - tb;
})) {
  const cnt = [...e.files.values()].reduce((a, b) => a + b, 0);
  const tag = pageMaxDefault && e.val === pageMaxDefault + 'px' ? '[默认档]' : '[分布]';
  const selEx = [...e.sels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => s + ' x' + n).join(' ; ');
  say('    ' + tag + ' ' + e.prop + ': ' + e.val + '  x' + cnt + '  例: ' + selEx + '  (' + fmtFiles(e, 3) + ')');
}
say('  绑定式宽度（模板 :style maxWidth，走 prefs 设置即统一）: ' + (r3Bound.size ? [...r3Bound.entries()].map(([f, n]) => f + ' x' + n).join(', ') : '无'));
say('');
say('── R4 款式枚举缺项（口径：枚举事实源里 DASHBOARD_MODULE_IDS=全部板块，MODULE_STYLE_PICKS=登记了款式选择的板块，{value:...}=各板块款式取值；取值须在扫描目录的源码里以引号字面量出现≥1 次，0 次=枚举有而实现无 hits 的缺项嫌疑）');
if (enumFile && fs.existsSync(enumFile)) {
  say('  板块清单 x' + r4.modules.length + '：' + r4.modules.join(', '));
  say('  已登记款式选择的板块 x' + r4.picksKeys.length + '：' + (r4.picksKeys.join(', ') || '无'));
  say('  [WARN] 未登记款式行（无可选款式）的板块 x' + r4.missingModules.length + '：' + r4.missingModules.join(', '));
  say('  款式取值实现命中（引号字面量口径）：');
  for (const c of r4.cover) {
    say('    ' + (c.hits === 0 ? '[缺项嫌疑] ' : '  [有实现] ') + c.value + '  hits x' + c.hits + (c.where ? '  (' + c.where + ')' : ''));
  }
} else say('  （跳过：未给 --enum）');
say('');
const summary = {
  扫描文件数: files.length,
  R1_写死px_种数: r1Px.length, R1_写死px_出现合计: r1Px.reduce((a, e) => a + total(e), 0),
  R1_review_种数: r1Review.length, R1_review_出现合计: r1Review.reduce((a, e) => a + total(e), 0),
  R1_token跟随_出现合计: r1Token.reduce((a, e) => a + total(e), 0),
  R1_scale跟随_出现合计: r1Scale.reduce((a, e) => a + total(e), 0),
  R1_机制白名单行: r1Mech, R1_内联font_size处: r1Inline,
  R2_含开关文件: r2.length, R2_未见右置信号WARN: r2NoAlign.length,
  R3_页面级静态宽度取值种数: r3.size, R3_绑定宽度文件: r3Bound.size,
  R4_板块数: r4.modules.length, R4_已登记款式板块: r4.picksKeys.length, R4_未登记款式的板块数: r4.missingModules.length,
  R4_款式取值缺项嫌疑数: r4.cover.filter((c) => c.hits === 0).length,
  说明: '本清单只列可疑项与出现次数，最终须人在浏览器确认；对比度/太素等审美项未纳入',
};
say('== 汇总 JSON ==');
say(JSON.stringify(summary, null, 0));

if (emitDir) {
  fs.mkdirSync(emitDir, { recursive: true });
  fs.writeFileSync(path.join(emitDir, 'U44-清单.json'), JSON.stringify({
    扫描目录: path.resolve(srcDir), 文件数: files.length,
    R1写死px: r1Px.map((e) => ({ sel: e.sel, val: e.val, 出现: total(e), fileMap: Object.fromEntries(e.files) })),
    R1review: r1Review.map((e) => ({ sel: e.sel, val: e.val, 出现: total(e), fileMap: Object.fromEntries(e.files) })),
    R2: r2, R3: [...r3.values()].map((e) => ({ prop: e.prop, val: e.val, 出现: [...e.files.values()].reduce((a, b) => a + b, 0), sels: Object.fromEntries(e.sels), fileMap: Object.fromEntries(e.files) })),
    R4: r4, 汇总: summary,
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(emitDir, 'U44-清单.md'), L.join('\n') + '\n', 'utf8');
  console.log('[emit] ' + path.join(emitDir, 'U44-清单.json') + ' / U44-清单.md');
}
