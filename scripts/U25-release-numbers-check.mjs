#!/usr/bin/env node
// U25 发版数字自检 ｜ 版本号三源比对 + 迁移号磁盘真值比对
// 全程只读：不写、不删、不改任何文件。
// 退出码：0=一致 1=有不一致 2=无不一致但有提醒 3=工具判不了（路径/参数问题）

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VERSION_FILES = ['package.json', 'server/package.json', 'web/package.json'];
const DEFAULT_MIGRATIONS_DIR = 'server/src/db/migrations';
const DEFAULT_DOC_PATTERNS = ['README.md', 'docs/*.md'];

// 现态声称锚：只有这些词紧挨着 vNN，才认为文档在声明"现在是多少"
const STRONG = ['当前', '应为', '已到', '最新', '升至', '升到', '更新到'];
const STRONG_WINDOW = 6;
// 弱候选：只用来做"同一行自相矛盾"检查，单独出现不判
const WEAK = ['迁移', '版本', '数据库'];
const WEAK_WINDOW = 8;
// 历史/起始注记：这些字紧贴数字，说明写的是过去时点或范围，不是现态
const HIST_BEFORE = ['写于', '停在', '始于', '退役', '保留'];
const SKIP_AFTER = ['+', '起', '以来', '之后', '以后', '时代', '前'];
// 区间/列举符号：紧贴数字才算范围写法。逗号不算——"迁移 v74，Node 22" 里那是句子分隔，不是范围
const RANGE_AFTER = ['~', '～', '-', '–', '—', '→', '至', '到', '、', '/', '或'];
const RANGE_BEFORE = ['~', '～', '-', '–', '—', '→', '至', '到', '、', '/', '从', '自'];
const IGNORED_MIGRATION_FILES = new Set(['index.ts', 'types.ts', 'index.js', 'README.md']);

function parseArgs(argv) {
  const opts = {
    root: null,
    versionFiles: DEFAULT_VERSION_FILES,
    migrationsDir: DEFAULT_MIGRATIONS_DIR,
    docPatterns: DEFAULT_DOC_PATTERNS,
    json: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--version-files') opts.versionFiles = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--migrations-dir') opts.migrationsDir = argv[++i];
    else if (a === '--docs') opts.docPatterns = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--json') opts.json = true;
    else if (a === '-v' || a === '--verbose') opts.verbose = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts.unknown = (opts.unknown || []).concat(a);
  }
  return opts;
}

const HELP = `U25 发版数字自检 ｜ 用法
  node U25-release-numbers-check.mjs --root <项目根> [选项]

  --root <路径>       项目根。不给就从当前目录逐级往上自动找（判据：同时存在 package.json 与 server/src/db/migrations）
  --version-files     逗号分隔，参与版本号比对的包文件。默认 package.json,server/package.json,web/package.json
  --migrations-dir    迁移目录。默认 server/src/db/migrations（磁盘文件名最大序号＝迁移号唯一事实源）
  --docs              逗号分隔，扫描"当前 vNN"式声称的文档。默认 README.md,docs/*.md（只看顶层，不递归子目录）
  -v, --verbose       把按口径剔除的历史注记、范围写法逐条列出
  --json              输出机器可读 JSON，不出人话表

退出码：0 一致 / 1 有不一致 / 2 有提醒 / 3 判不了`;

function looksLikeProject(dir) {
  return (
    fs.existsSync(path.join(dir, 'package.json')) &&
    fs.existsSync(path.join(dir, 'server', 'src', 'db', 'migrations'))
  );
}

function autoDetectRoot(start) {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 12; depth++) {
    if (looksLikeProject(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const STATE_TEXT = {
  missing: '文件不存在',
  nofield: '没有 version 字段',
  badjson: 'JSON 读不出',
  unreadable: '读不了',
};

function readVersionField(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return { rel, state: 'missing', value: null };
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return { rel, state: 'unreadable', value: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rel, state: 'badjson', value: null };
  }
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    return { rel, state: 'nofield', value: null };
  }
  return { rel, state: 'ok', value: parsed.version.trim() };
}

function scanMigrations(root, relDir) {
  const abs = path.join(root, relDir);
  const out = { abs, rel: path.relative(root, abs).replace(/\\/g, '/'), exists: fs.existsSync(abs), count: 0, unrecognized: [], diskMax: null, gaps: [] };
  if (!out.exists) return out;
  const seqs = [];
  for (const name of fs.readdirSync(abs)) {
    if (!fs.statSync(path.join(abs, name)).isFile()) continue;
    const m = /^v(\d{1,3})[-_.]/.exec(name);
    if (m) seqs.push(Number(m[1]));
    else if (!IGNORED_MIGRATION_FILES.has(name)) out.unrecognized.push(name);
  }
  out.count = seqs.length;
  if (seqs.length) {
    out.diskMax = Math.max(...seqs);
    const seen = new Set(seqs);
    for (let n = 1; n < out.diskMax; n++) if (!seen.has(n)) out.gaps.push(n);
  }
  return out;
}

function scanRegistered(root, relDir) {
  const abs = path.join(root, relDir, 'index.ts');
  if (!fs.existsSync(abs)) return { exists: false, max: null };
  const nums = [...fs.readFileSync(abs, 'utf8').matchAll(/\bv(\d{1,3})\b/g)].map((m) => Number(m[1]));
  return { exists: true, max: nums.length ? Math.max(...nums) : null };
}

function resolveDocFiles(root, patterns) {
  const files = [];
  for (const rel of patterns) {
    if (!rel.includes('*')) {
      const abs = path.join(root, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files.push(abs);
      continue;
    }
    const absDir = path.join(root, path.dirname(rel));
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) continue;
    const re = new RegExp('^' + path.basename(rel).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    for (const name of fs.readdirSync(absDir)) {
      const abs = path.join(absDir, name);
      if (re.test(name) && fs.statSync(abs).isFile()) files.push(abs);
    }
  }
  return [...new Set(files)].sort();
}

// 逐个 vNN 记号分类：hard＝文档在声明现态；weak＝同行冲突候选；skip＝按口径剔除的历史/范围写法
function classify(line, idx, len) {
  const prevChar = idx > 0 ? line[idx - 1] : '';
  const after = line.slice(idx + len, idx + len + 6).replace(/^\s+/, '');
  const nextChar = line[idx + len] || '';
  const winStrong = line.slice(Math.max(0, idx - STRONG_WINDOW - 3), idx);
  const winWeak = line.slice(Math.max(0, idx - WEAK_WINDOW - 3), idx);

  if (RANGE_BEFORE.includes(prevChar)) {
    return { skip: `前面紧贴区间/列举符号「${prevChar}」，属区间写法` };
  }
  if (RANGE_AFTER.includes(nextChar)) {
    return { skip: `后面紧跟「${nextChar}」，属区间/列举写法` };
  }
  const skipWord = SKIP_AFTER.find((w) => after.startsWith(w));
  if (skipWord) return { skip: `后面紧跟「${skipWord}」，属起始/时代注记` };
  const histWord = HIST_BEFORE.find((w) => winStrong.endsWith(w));
  if (histWord) return { skip: `前面是「${histWord}」，属历史时点注记` };

  const strong = STRONG.find((k) => winStrong.includes(k));
  if (strong) return { hard: true, anchor: strong };
  const weak = WEAK.find((k) => winWeak.includes(k));
  if (weak) return { weak: true, anchor: weak };
  return { ignore: true };
}

function extractClaims(root, docFiles) {
  const lines = [];
  const skipped = [];
  const tokenRe = /v(\d{1,3}(?:\.\d+){0,3}(?:-[0-9A-Za-z.]+)?)\b/g;
  for (const abs of docFiles) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    fs.readFileSync(abs, 'utf8').split(/\r?\n/).forEach((text, i) => {
      const found = [];
      let m;
      tokenRe.lastIndex = 0;
      while ((m = tokenRe.exec(text)) !== null) {
        const cls = classify(text, m.index, m[0].length);
        const rec = { rel, line: i + 1, token: m[0], value: m[1], idx: m.index, kind: m[0].includes('.') ? 'version' : 'migration', quote: text.trim().slice(0, 160) };
        if (cls.skip) skipped.push({ ...rec, why: cls.skip });
        else if (cls.hard) lines.push({ ...rec, hard: true, anchor: cls.anchor });
        else if (cls.weak) lines.push({ ...rec, weak: true, anchor: cls.anchor });
      }
    });
  }
  // 同行冲突：一行里既有现态声称，又有另一个数被写成"迁移/版本 vNN"
  const conflicts = [];
  const byLine = new Map();
  for (const c of lines) {
    const key = `${c.rel}:${c.line}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(c);
  }
  for (const [key, group] of byLine) {
    const hardMig = group.filter((c) => c.hard && c.kind === 'migration');
    if (!hardMig.length) continue;
    const others = group.filter((c) => c.kind === 'migration' && !hardMig.includes(c));
    for (const o of others) {
      for (const h of hardMig) {
        if (o.value !== h.value) {
          conflicts.push({ rel: h.rel, line: h.line, says: o.value, insteadOf: h.value, token: o.token, quote: h.quote });
        }
      }
    }
  }
  return { claims: lines, conflicts, skipped };
}

function buildReport(opts) {
  const root = opts.root ? path.resolve(opts.root) : autoDetectRoot(process.cwd());
  const r = { root, fails: [], warns: [], hardClaims: [], conflicts: [], skippedOnClaimLines: [], weakOnly: [] };
  if (!root || !fs.existsSync(root)) {
    r.fatal = '找不到项目根：加 --root <项目路径>，或到该项目的子目录里再跑';
    return r;
  }
  r.root = root;

  // 闸门一：版本号三源比对（只读 package.json 的 version 字段）
  r.versionFiles = opts.versionFiles.map(readVersionField.bind(null, root));
  const present = r.versionFiles.filter((v) => v.state === 'ok');
  const distinct = [...new Set(present.map((v) => v.value))];
  r.refVersion = distinct[0] || null;
  if (present.length === 0) r.warns.push('版本号：列出的包文件里一个 version 字段都没读到，这项判不了');
  else if (present.length === 1) r.warns.push(`版本号：只有 ${present[0].rel} 有 version 字段，凑不齐两源，比对不了`);
  else if (distinct.length > 1) r.fails.push(`版本号：${present.map((v) => `${v.rel}=v${v.value}`).join(' 与 ')} 不是同一个数`);
  for (const v of r.versionFiles) {
    if (v.state === 'nofield') r.warns.push(`版本号：${v.rel} 没有 version 字段（发版清单把它列为同步项，磁盘上却没这个字段——要么补字段，要么把它从清单划掉）`);
    else if (v.state !== 'ok') r.warns.push(`版本号：${v.rel} ${STATE_TEXT[v.state]}`);
  }

  // 闸门二：迁移号，磁盘文件名最大序号为唯一事实源
  const mig = scanMigrations(root, opts.migrationsDir);
  r.migrations = mig;
  if (!mig.exists) {
    r.fatal = `迁移目录不存在：${path.join(root, opts.migrationsDir)}（用 --migrations-dir 指对路径）`;
    return r;
  }
  if (mig.diskMax === null) {
    r.fails.push(`迁移号：${opts.migrationsDir} 里没有任何 vNN-名称 的文件，拿不到磁盘真值`);
    return r;
  }
  r.diskMax = mig.diskMax;
  if (mig.unrecognized.length) r.warns.push(`迁移号：目录里 ${mig.unrecognized.length} 个条目不符合 vNN-名称 命名，未参与取最大值：${mig.unrecognized.slice(0, 8).join(', ')}${mig.unrecognized.length > 8 ? ' …' : ''}`);
  if (mig.gaps.length) r.warns.push(`迁移号：v1~v${mig.diskMax} 之间断号 ${mig.gaps.length} 个：${mig.gaps.map((n) => 'v' + n).join(', ')}（多半是删过或改过名，值得确认）`);
  const reg = scanRegistered(root, opts.migrationsDir);
  r.registered = reg;
  if (!reg.exists) r.warns.push('迁移号：读不到 migrations/index.ts，登记链没法对照');
  else if (reg.max === null) r.warns.push('迁移号：index.ts 里没解析出 vNN，登记链没法对照');
  else if (reg.max !== mig.diskMax) r.warns.push(`迁移号：磁盘最大 v${mig.diskMax}，登记链 index.ts 最大 v${reg.max} —— 文档写着"以 index.ts 末尾为准"，两处一漂移就会把人带偏`);

  // 文档声称：只当被检对象，不作事实源
  const docFiles = resolveDocFiles(root, opts.docPatterns);
  r.docFiles = docFiles.map((f) => path.relative(root, f).replace(/\\/g, '/'));
  if (!docFiles.length) r.warns.push(`文档声称：按口径（${opts.docPatterns.join(', ')}）一份文档都没抓到，这项等于没检——用 --docs 换口径复跑再下结论`);
  const { claims, conflicts, skipped } = extractClaims(root, docFiles);
  r.hardClaims = claims.filter((c) => c.hard);
  r.versionClaims = r.hardClaims.filter((c) => c.kind === 'version');
  r.migrationClaims = r.hardClaims.filter((c) => c.kind === 'migration');
  r.conflicts = conflicts;
  r.weakOnlyCount = claims.filter((c) => c.weak && !conflicts.some((x) => x.rel === c.rel && x.line === c.line)).length;
  r.skipped = skipped;
  const claimLineKeys = new Set(r.hardClaims.map((c) => `${c.rel}:${c.line}`));
  r.skippedOnClaimLines = skipped.filter((s) => claimLineKeys.has(`${s.rel}:${s.line}`));

  for (const c of r.migrationClaims) {
    c.match = c.value === String(mig.diskMax);
    if (!c.match) r.fails.push(`迁移号：${c.rel}:${c.line} 现态声称写 v${c.value}，磁盘已经是 v${mig.diskMax}（差 ${Math.abs(mig.diskMax - Number(c.value))} 个迁移）`);
  }
  for (const c of r.versionClaims) {
    if (!r.refVersion) {
      c.match = null;
      r.warns.push(`版本号：${c.rel}:${c.line} 声称 v${c.value}，但包文件里没有可比对的 version`);
    } else {
      c.match = c.value === r.refVersion;
      if (!c.match) r.fails.push(`版本号：${c.rel}:${c.line} 写的是 v${c.value}，包文件是 v${r.refVersion}`);
    }
  }
  for (const x of r.conflicts) {
    r.fails.push(`迁移号：${x.rel}:${x.line} 同一行自相矛盾——一处说 v${x.insteadOf}，另一处又写「${x.token}」；磁盘真值 v${mig.diskMax}`);
  }
  return r;
}

function verdict(r) {
  if (r.fatal) return { code: 3, label: '判不了', why: r.fatal };
  if (r.fails.length) return { code: 1, label: '要动手', why: `${r.fails.length} 处数字不一致` };
  if (r.warns.length) return { code: 2, label: '不用动手，但有提醒', why: `${r.warns.length} 条提醒（判据不硬或口径盲区）` };
  return { code: 0, label: '不用动手', why: '版本号与迁移号在各份文档里都是同一个数' };
}

const RULE = (n) => '─'.repeat(n);

function printTable(r, opts) {
  const v = verdict(r);
  console.log(RULE(72));
  console.log(`【结论】${v.label} ｜ ${v.why}`);
  if (r.fatal) console.log(`        ${r.fatal}`);
  console.log(`项目根：${r.root}`);
  if (r.fatal) return;
  console.log(`磁盘事实源：迁移最大 v${r.diskMax}（${r.migrations.rel}，共 ${r.migrations.count} 个 vNN 文件）｜ 发布号 ${r.refVersion ? 'v' + r.refVersion : '读不到'}`);

  console.log(RULE(72));
  console.log('■ 闸门一 版本号（口径：只读各 package.json 的 version 字段）');
  for (const f of r.versionFiles) {
    if (f.state === 'ok') console.log(`  ${f.value === r.refVersion ? '✓' : '✗'} ${f.rel} = v${f.value}`);
    else console.log(`  · ${f.rel} → ${STATE_TEXT[f.state]}`);
  }

  console.log(RULE(72));
  console.log('■ 闸门二 迁移号（口径：磁盘 vNN 文件名最大序号＝唯一事实源，文档一律不认）');
  if (r.registered.exists) {
    console.log(`  参考  migrations/index.ts 登记最大 = v${r.registered.max}${r.registered.max === r.diskMax ? '（与磁盘一致）' : '（与磁盘不一致，见提醒）'}`);
  }
  if (!r.migrationClaims.length && !r.versionClaims.length) {
    console.log('  · 按现态关键词（当前/应为/已到/最新…），文档里没抓到任何"现在是多少"的声称——这项等于没检，别当成已通过');
  }
  for (const c of r.migrationClaims) {
    console.log(`  ${c.match ? '✓' : '✗'} ${c.rel}:${c.line} 声称 v${c.value}${c.match ? ' ＝磁盘' : ` ← 磁盘 v${r.diskMax}`}（锚词「${c.anchor}」）`);
    console.log(`      原话：${c.quote}`);
  }
  for (const c of r.versionClaims) {
    console.log(`  ${c.match ? '✓' : c.match === null ? '·' : '✗'} ${c.rel}:${c.line} 发布号声称 v${c.value}（锚词「${c.anchor}」）`);
    console.log(`      原话：${c.quote}`);
  }
  if (r.conflicts.length) {
    console.log(RULE(72));
    console.log('■ 同一行里两个数打架（这类最容易漏：改了一处、忘了同句另一处）');
    for (const x of r.conflicts) {
      console.log(`  ✗ ${x.rel}:${x.line} 说 v${x.insteadOf} 的同处又写了 ${x.token}`);
      console.log(`      原话：${x.quote}`);
    }
  }

  console.log(RULE(72));
  console.log(`■ 口径交代：扫了 ${r.docFiles.length} 份文档（${r.docFiles.join(', ')}）`);
  console.log(`  只认紧贴"当前/应为/已到/最新/升至/更新到"的 vNN 当现态声称；点分形制（v1.0.1）归版本号，裸形制（v76）归迁移号`);
  console.log(`  区间写法、"vNN 起/之后/时代"、"写于 vNN"一律按历史注记剔除：本次剔除 ${r.skipped.length} 处，另有 ${r.weakOnlyCount} 处"迁移/版本 vNN"是逐条 changelog 式历史注记，不参与判定${opts.verbose ? '' : '（加 -v 逐条列出）'}`);
  if (r.skippedOnClaimLines.length) {
    console.log('  ⚠ 下面这些被剔除的数字就写在现态声称同一行，请人扫一眼别是真漏刷：');
    for (const s of r.skippedOnClaimLines) console.log(`    · ${s.rel}:${s.line} ${s.token} ｜ ${s.why}`);
  }
  if (opts.verbose && r.skipped.length) {
    console.log('  verbose｜剔除明细：');
    for (const s of r.skipped) console.log(`    · ${s.rel}:${s.line} ${s.token} ｜ ${s.why}`);
  }

  if (r.fails.length) {
    console.log(RULE(72));
    console.log('✗ 不一致（发版前要对齐的）');
    r.fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  if (r.warns.length) {
    console.log(RULE(72));
    console.log('! 提醒（判据不硬或口径盲区，不判失败）');
    r.warns.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }
  if (!r.fails.length && !r.warns.length) console.log('\n没有不一致，也没有提醒。');
  console.log(RULE(72));
  console.log(`退出码 ${v.code}（0 一致 / 1 有不一致 / 2 有提醒 / 3 判不了）`);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}
const report = buildReport(opts);
if (opts.json) {
  const v = verdict(report);
  console.log(JSON.stringify({ exit: v.code, label: v.label, why: v.why, ...report }, null, 2));
} else {
  printTable(report, opts);
}
process.exit(verdict(report).code);
