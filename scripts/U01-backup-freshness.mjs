#!/usr/bin/env node
// ============================================================
// U01-backup-freshness.mjs ｜ 备份新鲜度看门狗（本机 + 服务器两路读数）
// 单元号 C-T08-04 ｜ 批次 toolshop-2026-09-29 ｜ 负责人：artist-commission 项目组
//
// 一条命令回答三件事：
//   ① 最近一次「能用」的备份是哪天（含复用 scripts/verify-backup.mjs 的退出码）
//   ② 跨了几天没出成品（区分「跑了但失败」/「定时器根本没跑」/「保留窗口外被轮转清掉」）
//   ③ 本机与服务器两路是否都还在跑（服务器侧无读数时只给 WARN，绝不给绿灯 = 防假绿）
//
// 纪律：只读。不写别人目录、不删、不改、不重启、不注册计划任务、不联网、不 ssh、不 scp。
// 判据不清一律 WARN，不 FAIL。退出码：0=OK，1=FAIL，2=WARN（含"读数不足"）。
//
// 用法：
//   node U01-backup-freshness.mjs [选项]
//     --repo <dir>            本机仓库根（默认：脚本若放在 <repo>/scripts/ 下自动定位；
//                             否则取环境变量 U01_REPO；再否则 DEFAULT_REPO）
//     --max-age-hours <n>     新鲜度阈值，默认 36（与 server/scripts/patrol.sh 第 2 项同口径）
//     --lookback-days <n>     日志断档回溯窗口，默认 14
//     --keep-daily <n>        每日档留存份数，默认 7（backup-db.ts 拍板值，用于"轮转不算断档"）
//     --no-verify             跳过 verify-backup.mjs 退出码复用（离线/无 node 依赖时用）
//     --no-task               跳过 Windows 计划任务只读查询
//     --task <name>           计划任务名，默认 CommissionDailyBackup
//     --server-json <file>    服务器侧读数（由负责人在服务器上跑 U01-server-freshness.sh 存下的 JSON）
//     --server-dir <dir>      服务器 data/backups 的本机可读镜像目录（有则直接扫盘）
//     --verify-server         对 --server-dir 里最新的合规档也跑一次完整性校验（默认不跑，记 WARN）
//     --json <out>            另存机器可读结果（默认不写文件）
//     --html <out>            另存单页 HTML 看板（默认不写文件）
//     --quiet                 只打结论三行
// ============================================================
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO = process.env.U01_REPO || 'D:\\Hermes Agent CN Desktop\\workspace\\artist-commission'

// —— 命名口径（与 backup-db.ts / restore-db.ts / verify-backup.mjs / patrol.sh 等价）——
const RE_DAILY = /^commission\.db\.bak-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})Z$/
const RE_WEEKLY = /^commission\.db\.bak-weekly-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})Z$/
const RE_DEPLOY = /^commission\.db\.bak-deploy-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})Z$/
const RE_UPLOADS = /^uploads-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})Z\.tar\.gz$/
// server-backup.sh 的历史命名：恢复端与 patrol.sh 都不认（F-16），算"存在但不算每日档"
const RE_LEGACY_SERVER = /^commission\.db\.bak-daily-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/

const ST = { OK: 'OK', WARN: 'WARN', FAIL: 'FAIL' }
const RANK = { [ST.OK]: 0, [ST.WARN]: 1, [ST.FAIL]: 2 }

function parseArgs(argv) {
  const opt = {
    repo: null, maxAgeHours: 36, lookbackDays: 14, keepDaily: 7,
    verify: true, task: 'CommissionDailyBackup', useTask: true,
    serverJson: null, serverDir: null, verifyServer: false,
    json: null, html: null, quiet: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--repo') opt.repo = resolve(next())
    else if (a === '--max-age-hours') opt.maxAgeHours = Number(next())
    else if (a === '--lookback-days') opt.lookbackDays = Number(next())
    else if (a === '--keep-daily') opt.keepDaily = Number(next())
    else if (a === '--no-verify') opt.verify = false
    else if (a === '--no-task') opt.useTask = false
    else if (a === '--task') opt.task = next()
    else if (a === '--server-json') opt.serverJson = resolve(next())
    else if (a === '--server-dir') opt.serverDir = resolve(next())
    else if (a === '--verify-server') opt.verifyServer = true
    else if (a === '--json') opt.json = resolve(next())
    else if (a === '--html') opt.html = resolve(next())
    else if (a === '--quiet') opt.quiet = true
    else if (a === '--help' || a === '-h') { usage(); process.exit(0) }
    else { console.error(`未知参数: ${a}（--help 看用法）`); process.exit(3) }
  }
  if (!opt.repo) {
    // 脚本被放进 <repo>/scripts/ 时自动定位仓库根
    const guess = resolve(HERE, '..')
    opt.repo = existsSync(join(guess, 'data', 'backups')) ? guess : DEFAULT_REPO
  }
  if (!Number.isFinite(opt.maxAgeHours) || opt.maxAgeHours <= 0) {
    console.error('--max-age-hours 必须是正数'); process.exit(3)
  }
  return opt
}

function usage() {
  console.log([
    '用法: node U01-backup-freshness.mjs [选项]',
    '  --repo <dir>            本机仓库根（放 <repo>/scripts/ 下可自动定位）',
    '  --max-age-hours <n>     新鲜度阈值（默认 36，与 patrol.sh 第 2 项同口径）',
    '  --lookback-days <n>     日志断档回溯天数（默认 14）',
    '  --keep-daily <n>        每日档留存份数（默认 7，用于判"轮转清掉"不算断档）',
    '  --no-verify             不复用 verify-backup.mjs 退出码',
    '  --no-task / --task <n>  跳过 / 指定 Windows 计划任务只读查询',
    '  --server-json <file>    服务器侧读数 JSON（服务器上跑 U01-server-freshness.sh 存下）',
    '  --server-dir <dir>      服务器 data/backups 的本机可读镜像目录',
    '  --verify-server         对镜像目录最新合规档也做完整性校验',
    '  --json <out> --html <out>  机器可读结果 / 单页看板',
    '  --quiet                 只打结论三行',
    '退出码: 0=OK  1=FAIL  2=WARN（含读数不足）  3=参数/环境错误',
  ].join('\n'))
}

// —— 工具 ——
function isoFromStamp(stamp) { // "2026-09-16T19-30-14-507" → epoch ms (UTC)
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})$/.exec(stamp)
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7])
}
function pad(n, w = 2) { return String(n).padStart(w, '0') }
function localDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function localStamp(d) { return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
function localDayEpoch(s) { return new Date(`${s}T00:00:00`).getTime() }
function daysBetween(dayA, dayB) { return Math.round((localDayEpoch(dayB) - localDayEpoch(dayA)) / 86400000) }
function fmtAge(h) {
  if (h < 48) return `${Math.round(h)} 小时`
  return `${(h / 24).toFixed(1)} 天（${Math.floor(h / 24)} 个日历天）`
}
function worst(...sts) { return sts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), ST.OK) }

function scanDir(dir) {
  const out = { daily: [], weekly: [], deploy: [], uploads: [], legacy: [], logs: [], other: [] }
  if (!existsSync(dir)) return null
  for (const name of readdirSync(dir)) {
    let st
    try { st = statSync(join(dir, name)) } catch { continue }
    if (!st.isFile()) continue
    const stampM = RE_DAILY.exec(name) || RE_WEEKLY.exec(name) || RE_DEPLOY.exec(name) || RE_UPLOADS.exec(name)
    const rec = { name, bytes: st.size, mtimeMs: st.mtimeMs }
    if (RE_DAILY.test(name)) { rec.tsMs = isoFromStamp(stampM[1]); out.daily.push({ ...rec, kind: 'daily' }) }
    else if (RE_WEEKLY.test(name)) { rec.tsMs = isoFromStamp(stampM[1]); out.weekly.push({ ...rec, kind: 'weekly' }) }
    else if (RE_DEPLOY.test(name)) { rec.tsMs = isoFromStamp(stampM[1]); out.deploy.push({ ...rec, kind: 'deploy' }) }
    else if (RE_UPLOADS.test(name)) { rec.tsMs = isoFromStamp(stampM[1]); out.uploads.push({ ...rec, kind: 'uploads' }) }
    else if (RE_LEGACY_SERVER.test(name)) {
      const m = RE_LEGACY_SERVER.exec(name)
      rec.tsMs = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() // 服务器本地时区产生的名字
      out.legacy.push({ ...rec, kind: 'legacy-nonconform' })
    } else if (/\.(log|txt)$/i.test(name)) out.logs.push(rec)
    else out.other.push(rec)
  }
  const byTs = (a, b) => (b.tsMs ?? b.mtimeMs) - (a.tsMs ?? a.mtimeMs)
  for (const k of ['daily', 'weekly', 'deploy', 'uploads', 'legacy']) out[k].sort(byTs)
  return out
}

/** 一个成品档的"多大年纪"：优先用文件名里的 UTC 时间戳，文件名不可解时才用 mtime */
function ageOf(rec, nowMs) {
  const src = rec.tsMs != null ? 'name-utc' : 'mtime'
  const ms = rec.tsMs != null ? rec.tsMs : rec.mtimeMs
  return { hours: (nowMs - ms) / 3600000, source: src, tsMs: ms }
}

// —— 日志三分法 ——
const FAIL_MARKS = [
  ['DB_BACKUP_FAILED', '数据库备份步骤失败'],
  ['BACKUP_ARTIFACT_NOT_FOUND', '备份产物未生成/解析不到 BACKUP_OK'],
  ['VERIFY_FAILED', '产物完整性校验未通过（损坏，不可用于恢复）'],
  ['UPLOADS_BACKUP_FAILED', 'uploads 备份失败'],
  ['VERIFY_SKIPPED', '宿主无 node，校验被跳过'],
  ['TIER_ARG_MISSING', '档位参数缺失'],
]
function scanLog(logPath, now) {
  // 日志是混合编码（早期 GBK 残渣），按 latin1 读才不会当成二进制
  const text = readFileSync(logPath, 'latin1')
  const lines = text.split(/\r?\n/)
  const runs = []
  let cur = null
  const TS_RE = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]\s?(.*)$/
  for (const raw of lines) {
    const m = TS_RE.exec(raw)
    const day = m ? m[1] : null
    const body = m ? m[3] : raw
    if (!raw.trim()) continue
    if (/===\s*daily-backup start\s*===/.test(body)) {
      if (cur) runs.push(cur)
      cur = { day: day || '(无日期·旧式写法)', time: m ? m[2] : null, tier: null, outcome: null, marks: [] }
      continue
    }
    if (!cur) continue
    const tm = /BACKUP_TIER=(\w+)/.exec(body)
    if (tm) cur.tier = tm[1]
    if (/VERIFY_OK_RECORDED/.test(body) || /^VERIFY_OK /.test(body)) cur.marks.push('VERIFY_OK')
    if (/^BACKUP_OK .*commission\.db\.bak-/.test(body)) cur.marks.push('ARTIFACT_DB')
    if (/^BACKUP_OK .*uploads-.*\.tar\.gz/.test(body)) cur.marks.push('ARTIFACT_UPLOADS')
    for (const [mark, why] of FAIL_MARKS) if (body.includes(mark)) cur.marks.push(mark)
    if (/WEEKLY_COPY_OK/.test(body)) cur.marks.push('WEEKLY_COPY_OK')
  }
  if (cur) runs.push(cur)
  for (const r of runs) {
    const fails = r.marks.filter((x) => x !== 'VERIFY_OK' && x !== 'ARTIFACT_DB' && x !== 'ARTIFACT_UPLOADS' && x !== 'WEEKLY_COPY_OK')
    if (fails.length) { r.outcome = 'FAIL'; r.failMarks = fails; r.failWhy = fails.map((f) => (FAIL_MARKS.find((x) => x[0] === f) || [f, f])[1]).join('; ') }
    else if (r.marks.includes('VERIFY_OK')) { r.outcome = 'OK'; r.failMarks = [] }
    else { r.outcome = 'UNKNOWN'; r.failMarks = [] }
  }
  const dated = runs.filter((r) => r.day !== '(无日期·旧式写法)')
  const runDays = new Set(dated.map((r) => r.day))
  const window = []
  for (let i = 0; i < (now.lookbackDays ?? 14); i++) {
    const d = new Date(now.ms - i * 86400000)
    const day = localDate(d)
    const expected = i > 0 || now.ms >= new Date(`${day}T03:30:00`).getTime() // 今天的跑点还没到就不算缺勤
    const r = dated.filter((x) => x.day === day).pop()
    window.push({
      day,
      expected,
      ran: !!r,
      outcome: r ? r.outcome : null,
      failWhy: r && r.failWhy ? r.failWhy : null,
      missing: expected && !r,
    })
  }
  return {
    runs: runs.length,
    logLines: lines.length,
    logPath,
    lastRun: dated.length ? dated[dated.length - 1] : null,
    lastSuccess: [...dated].reverse().find((r) => r.outcome === 'OK') || null,
    failStreakTail: (() => {
      let n = 0
      for (let i = dated.length - 1; i >= 0; i--) { if (dated[i].outcome === 'FAIL') n++; else break }
      return n
    })(),
    window,
    absentDays: window.filter((w) => w.missing).map((w) => w.day),
    failedDays: window.filter((w) => w.outcome === 'FAIL').map((w) => w.day),
    okDays: window.filter((w) => w.outcome === 'OK').map((w) => w.day),
    counts: FAIL_MARKS.map(([mark, why]) => ({
      mark, why,
      n: runs.reduce((a, r) => a + (r.marks.includes(mark) ? 1 : 0), 0),
    })).filter((x) => x.n > 0),
  }
}

// —— 复用 verify-backup.mjs 的退出码（裁判修正后的做法）——
function runVerify(repo, target, label) {
  const script = join(repo, 'scripts', 'verify-backup.mjs')
  if (!existsSync(script)) return { status: ST.WARN, exit: null, note: `找不到 ${script}，未做完整性校验` }
  const r = spawnSync(process.execPath, [script, target], { encoding: 'latin1', timeout: 120000 })
  const exit = r.status
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/)
  const tail = out.filter((l) => /VERIFY_(OK|FAILED|DETAIL)/.test(l)).slice(-2)
  if (r.error) return { status: ST.WARN, exit: null, note: `无法执行校验：${r.error.message}` }
  if (exit === 0) return { status: ST.OK, exit, note: `最新档完整性校验通过（VERIFY_OK）：${basename(target)}`, detail: tail }
  if (exit === 1) return { status: ST.FAIL, exit, note: `最新档完整性校验未通过（verify-backup.mjs 退出码 1）：${(tail[0] || out[out.length - 1] || '').slice(0, 160)}`, detail: tail }
  return { status: ST.WARN, exit, note: `verify-backup.mjs 退出码 ${exit}（非 0/1，判据不清，按 WARN 处理）`, detail: tail }
}

function readTask(taskName) {
  if (process.platform !== 'win32') return { status: ST.WARN, note: '非 Windows，跳过计划任务查询' }
  const ps = `$i = Get-ScheduledTaskInfo -TaskName '${taskName.replace(/'/g, '')}' -ErrorAction SilentlyContinue; if ($i) { ('{0}|{1}|{2}' -f [string]$i.LastRunTime, [string]$i.LastTaskResult, [string]$i.NextRunTime) } else { 'MISSING' }`
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 30000 })
  const line = (r.stdout ? Buffer.from(r.stdout).toString('utf8') : '').trim().split(/\r?\n/).pop() || ''
  if (r.status !== 0 || !line) return { status: ST.WARN, note: `计划任务读数不可用（powershell 退出码 ${r.status}；报错原文含中文乱码，不抄进产物——请人工在服务器上 Get-ScheduledTask 自查）` }
  if (line === 'MISSING') return { status: ST.WARN, note: `计划任务 ${taskName} 不存在（本机可能换了任务名或换机重建过）` }
  const [lastRun, lastResult, nextRun] = line.split('|')
  const code = Number(lastResult)
  return {
    status: Number.isFinite(code) && code !== 0 ? ST.WARN : ST.OK,
    lastRun: lastRun.replace('T', ' ').slice(0, 19),
    nextRun: nextRun && nextRun !== '0001-01-01T00:00:00' ? nextRun.replace('T', ' ').slice(0, 19) : null,
    lastResult: code,
    note: Number.isFinite(code) && code !== 0
      ? `计划任务上次退出码 ${code}（非 0；定时器在跑但脚本报错，具体看日志标记）`
      : '计划任务上次退出码 0',
  }
}

// —— 服务器侧读数 ——
function serverFromJson(path, nowMs, maxAgeHours) {
  let j
  try { j = JSON.parse(readFileSync(path, 'utf8')) } catch (e) {
    return { present: true, status: ST.WARN, source: `json:${path}`, items: [{ name: '服务器读数', status: ST.WARN, note: `读数不可解析（${e.message.slice(0, 80)}）——不判绿` }] }
  }
  const collectedMs = j.collected_at_epoch ? Number(j.collected_at_epoch) * 1000 : null
  const serverNowMs = j.epoch_now ? Number(j.epoch_now) * 1000 : collectedMs
  const items = []
  const src = `json:${basename(path)}`
  const freshOf = (rec, label) => {
    if (!rec || !rec.name) {
      items.push({ name: label, status: ST.FAIL, note: '服务器读数里这一路没有任何产物（字段缺失或目录为空）——不判绿' })
      return
    }
    const line = { name: label, status: ST.WARN, artifact: rec.name, bytes: rec.bytes, note: '' }
    const hours = rec.epoch != null && serverNowMs != null ? (serverNowMs - rec.epoch * 1000) / 3600000 : null
    if (hours == null) line.note = '读数缺服务器时钟或采集时间，无法算年龄（按 WARN，不判绿）'
    else if (hours > maxAgeHours) { line.status = ST.FAIL; line.ageHours = hours; line.note = `最新档已 ${fmtAge(hours)}没更新（阈值 ${maxAgeHours}h）` }
    else { line.status = ST.OK; line.ageHours = hours; line.note = `${fmtAge(hours)}前，阈值内` }
    items.push(line)
  }
  freshOf(j.official_newest, '服务器 DB 最新合规每日档')
  if (j.nonconform_newest && j.nonconform_newest.name) {
    items.push({
      name: '服务器 命名合规性', status: ST.WARN, artifact: j.nonconform_newest.name,
      note: `目录里还有 ${j.counts?.nonconform ?? 1} 份 server-backup.sh 旧命名档（bak-daily-*），restore-db.ts / verify-backup.mjs / patrol.sh 都不认——"有档"不等于"能恢复"（F-16）`,
    })
  }
  freshOf(j.uploads_newest, '服务器 uploads 最新档')
  if (collectedMs) {
    const readAgeH = (nowMs - collectedMs) / 3600000
    items.push({
      name: '读数采集时间', status: readAgeH > 24 ? ST.WARN : ST.OK, ageHours: readAgeH,
      note: readAgeH > 24
        ? `这份读数是 ${fmtAge(readAgeH)}前采集的，只代表那时的状态（别当现在）——要新读数请在服务器上重跑采集脚本`
        : `${fmtAge(readAgeH)}前采集`,
    })
  } else {
    items.push({ name: '读数采集时间', status: ST.WARN, note: '读数无采集时间，无法判断是否过期' })
  }
  if (j.container && j.container.running === 'false') {
    items.push({ name: '服务器容器状态', status: ST.WARN, note: '采集时 web 容器未 running：备份定时器就算挂着也出不了成品' })
  } else if (j.container) {
    items.push({ name: '服务器容器状态', status: j.container.running === 'true' ? ST.OK : ST.WARN, note: `容器 running=${j.container.running}` })
  }
  if (j.cron_log && j.cron_log.last_fail_line) {
    items.push({ name: '服务器 cron 日志', status: ST.WARN, artifact: j.cron_log.path, note: `最后一条失败行：${String(j.cron_log.last_fail_line).slice(0, 140)}` })
  }
  return { present: true, source: src, status: worst(...items.map((i) => i.status)), items }
}

function serverFromDir(dir, nowMs, opt) {
  const sc = scanDir(dir)
  if (!sc) return { present: true, source: `dir:${dir}`, status: ST.FAIL, items: [{ name: '服务器镜像目录', status: ST.FAIL, note: `目录不存在或不可读：${dir}` }] }
  const items = []
  const newest = sc.daily[0]
  if (!newest) {
    items.push({ name: '服务器 DB 最新合规每日档', status: ST.FAIL, note: '镜像目录里没有任何官方 ISO 命名的每日档' })
  } else {
    const a = ageOf(newest, nowMs)
    items.push({
      name: '服务器 DB 最新合规每日档', status: a.hours > opt.maxAgeHours ? ST.FAIL : ST.OK, ageHours: a.hours, artifact: newest.name, bytes: newest.bytes,
      note: a.hours > opt.maxAgeHours ? `已 ${fmtAge(a.hours)}没更新（阈值 ${opt.maxAgeHours}h）` : `${fmtAge(a.hours)}前，阈值内`,
    })
  }
  if (sc.legacy.length) {
    const a = ageOf(sc.legacy[0], nowMs)
    items.push({
      name: '服务器 命名合规性', status: ST.WARN, artifact: sc.legacy[0].name,
      note: `${sc.legacy.length} 份旧命名档（bak-daily-*，最新 ${fmtAge(a.hours)}前），恢复端/巡检脚本都不认——"有档"不等于"能恢复"（F-16）`,
    })
  }
  const up = sc.uploads[0]
  if (!up) items.push({ name: '服务器 uploads 最新档', status: ST.FAIL, note: '没有 uploads 归档，恢复只能拿回数据库' })
  else {
    const a = ageOf(up, nowMs)
    items.push({
      name: '服务器 uploads 最新档', status: a.hours > opt.maxAgeHours ? ST.FAIL : ST.OK, ageHours: a.hours, artifact: up.name, bytes: up.bytes,
      note: a.hours > opt.maxAgeHours ? `已 ${fmtAge(a.hours)}没更新` : `${fmtAge(a.hours)}前，阈值内`,
    })
  }
  if (opt.verifyServer) {
    if (!newest) items.push({ name: '服务器 完整性校验', status: ST.WARN, note: '无合规档可校验' })
    else items.push({ ...runVerify(opt.repo, join(dir, newest.name), 'server'), name: '服务器 完整性校验' })
  } else {
    items.push({ name: '服务器 完整性校验', status: ST.WARN, note: '未做（镜像目录里的文件不在本机依赖链上，需要就在服务器上跑 verify-backup.mjs）' })
  }
  return { present: true, source: `dir:${dir}`, status: worst(...items.map((i) => i.status)), items }
}

// —— 主流程 ——
function main() {
  const opt = parseArgs(process.argv.slice(2))
  const nowMs = Date.now()
  const now = { ms: nowMs, local: localStamp(new Date(nowMs)), day: localDate(new Date(nowMs)) }
  const backupsDir = join(opt.repo, 'data', 'backups')
  const logPath = join(backupsDir, 'daily-backup.log')

  const res = { unit: 'C-T08-04', tool: 'U01-backup-freshness.mjs', generated_at: now.local, repo: opt.repo, threshold_hours: opt.maxAgeHours, lookback_days: opt.lookbackDays }

  // 本机：成品
  const sc = scanDir(backupsDir)
  const local = { channel: '本机（Windows 开发机）', source: backupsDir, items: [] }
  if (!sc) {
    local.items.push({ name: '成品目录', status: ST.FAIL, note: `不存在：${backupsDir}` })
    local.status = ST.FAIL
  } else {
    const d = sc.daily[0]
    const u = sc.uploads[0]
    if (!d) {
      local.items.push({ name: 'DB 最新每日档', status: ST.FAIL, note: '目录里没有任何官方 ISO 命名的每日档，一条命令无法回答"最近哪天"' })
    } else {
      const a = ageOf(d, nowMs)
      const cross = daysBetween(localDate(new Date(a.tsMs)), now.day)
      local.items.push({
        name: 'DB 最新每日档', status: a.hours > opt.maxAgeHours ? ST.FAIL : ST.OK, artifact: d.name, bytes: d.bytes,
        newest_at: localStamp(new Date(d.mtimeMs)), ageHours: a.hours, cross_days: cross,
        note: a.hours > opt.maxAgeHours
          ? `最新能查到的每日档是 ${d.name}（落盘 ${localStamp(new Date(d.mtimeMs))}），距今 ${fmtAge(a.hours)}，跨了 ${cross} 天没出新成品（阈值 ${opt.maxAgeHours}h）`
          : `最新每日档 ${d.name}，距今 ${fmtAge(a.hours)}，阈值内`,
      })
      if (Math.abs(d.mtimeMs - a.tsMs) > 12 * 3600000) {
        local.items.push({ name: '档名与落盘时间一致性', status: ST.WARN, note: `文件名 UTC 戳与磁盘 mtime 差 ${Math.round(Math.abs(d.mtimeMs - a.tsMs) / 3600000)}h（时区所致，算年龄以文件名为准）` })
      }
    }
    if (!u) local.items.push({ name: 'uploads 最新档', status: ST.FAIL, note: '没有 uploads 归档：真出事只能恢复数据库，图全丢' })
    else {
      const a = ageOf(u, nowMs)
      local.items.push({
        name: 'uploads 最新档', status: a.hours > opt.maxAgeHours ? ST.FAIL : ST.OK, artifact: u.name, bytes: u.bytes, ageHours: a.hours,
        note: a.hours > opt.maxAgeHours ? `距今 ${fmtAge(a.hours)}，超阈值` : `距今 ${fmtAge(a.hours)}，阈值内`,
      })
    }
    local.items.push({ name: '档数（保留窗口口径）', status: ST.OK, note: `合规每日档 ${sc.daily.length} 份 / 每周档 ${sc.weekly.length} 份 / 部署档 ${sc.deploy.length} 份 / uploads ${sc.uploads.length} 份 / 旧命名 ${sc.legacy.length} 份 / 异名备份 ${sc.other.length} 份 / 日志与文本 ${sc.logs.length} 份；每日档留存拍板值 ${opt.keepDaily} 份，比这更老的档缺失属轮转清理，不算断档` })
    // 本机：完整性（复用 verify-backup.mjs 退出码）
    if (opt.verify && sc.daily[0]) {
      const v = runVerify(opt.repo, join(backupsDir, sc.daily[0].name), 'verify')
      res.local_verify_exit = v.exit
      local.items.push({ name: '完整性校验（复用 verify-backup.mjs 退出码）', status: v.status, exit: v.exit, note: v.note, detail: v.detail })
    } else if (!sc.daily[0]) {
      local.items.push({ name: '完整性校验（复用 verify-backup.mjs 退出码）', status: ST.WARN, note: '无合规档可校验' })
    } else {
      local.items.push({ name: '完整性校验（复用 verify-backup.mjs 退出码）', status: ST.WARN, note: '按 --no-verify 跳过' })
    }
  }

  // 本机：日志三分法（跑了失败 / 没跑 / 轮转）
  if (existsSync(logPath)) {
    const lg = scanLog(logPath, { ...now, lookbackDays: opt.lookbackDays })
    res.local_log = {
      runs_total: lg.runs, last_run_day: lg.lastRun && lg.lastRun.day, last_success_day: lg.lastSuccess && lg.lastSuccess.day,
      fail_streak_tail: lg.failStreakTail, absent_days: lg.absentDays, failed_days: lg.failedDays, marker_counts: lg.counts,
    }
    const tail = lg.lastRun
    local.items.push({
      name: '定时器是否在跑（按日志启动标记）',
      status: tail && tail.outcome === 'OK' ? ST.OK : ST.WARN,
      note: tail ? `最后一次运行 ${tail.day} ${tail.time || ''} → ${tail.outcome === 'OK' ? '成功' : tail.outcome === 'FAIL' ? `失败（${tail.failWhy}）` : '结果无法判定'}` : '日志里找不到任何带日期的启动标记',
    })
    if (lg.failStreakTail > 0) {
      local.items.push({ name: '连续失败', status: ST.FAIL, note: `尾部连续 ${lg.failStreakTail} 次运行失败，最近失败日 ${lg.lastRun.day}` })
    }
    if (lg.absentDays.length) {
      local.items.push({ name: '缺勤（计划任务根本没跑）', status: ST.WARN, note: `近 ${opt.lookbackDays} 天里有 ${lg.absentDays.length} 天连启动标记都没有：${lg.absentDays.join(', ')}——这比失败更隐蔽，光 grep 失败标记会全漏` })
    }
    if (lg.lastSuccess) {
      const gap = daysBetween(lg.lastSuccess.day, now.day)
      local.items.push({ name: '最近一次带 VERIFY_OK 的运行', status: gap > 1 ? ST.WARN : ST.OK, note: `${lg.lastSuccess.day} ${lg.lastSuccess.time || ''}（距今 ${gap} 天）` })
    } else {
      local.items.push({ name: '最近一次带 VERIFY_OK 的运行', status: ST.WARN, note: '日志里没有成功标记' })
    }
  } else {
    local.items.push({ name: '备份日志', status: ST.WARN, note: `找不到 ${logPath}，断档三分法无法判定（只能靠成品年龄兜底）` })
  }

  // 本机：计划任务（只读）
  if (opt.useTask) {
    const t = readTask(opt.task)
    local.items.push({ name: `计划任务 ${opt.task}（只读查询）`, status: t.status, note: t.note, lastRun: t.lastRun, nextRun: t.nextRun, lastResult: t.lastResult })
  }
  local.status = worst(...local.items.map((i) => i.status))

  // 服务器
  let server
  if (opt.serverJson) server = serverFromJson(opt.serverJson, nowMs, opt.maxAgeHours)
  else if (opt.serverDir) server = serverFromDir(opt.serverDir, nowMs, opt)
  else {
    server = {
      present: false, source: '未提供', status: ST.WARN,
      items: [{
        name: '服务器读数', status: ST.WARN,
        note: '没给 --server-json 也没给 --server-dir：服务器路一条数据都没有。整体只给 WARN 封顶，不给绿灯——这就是工单点名的"假绿"风险。要出数：在服务器上跑 U01-server-freshness.sh，把打印的 JSON 存成本地文件，再用 --server-json 指过来',
      }],
    }
  }
  server.channel = '服务器（公网生产机，本工具不连它，只读它交回来的读数）'

  const channels = [local, { ...server }]
  const hasServerReading = server.present
  let overall = worst(local.status, server.status)
  if (!hasServerReading && overall === ST.OK) overall = ST.WARN // 防假绿：服务器无读数时永不 OK

  // 三问三答
  const newestArtifact = sc && sc.daily[0] ? sc.daily[0] : null
  const cross = newestArtifact ? daysBetween(localDate(new Date(newestArtifact.tsMs ?? newestArtifact.mtimeMs)), now.day) : null
  const answers = [
    {
      q: '① 最近一次能用的备份是哪天',
      a: newestArtifact
        ? `本机 ${localStamp(new Date(newestArtifact.mtimeMs))}（档名 ${newestArtifact.name}，${newestArtifact.bytes} B）` +
          (res.local_verify_exit != null ? ` · 完整性校验退出码 ${res.local_verify_exit}` : '')
        : '本机没有任何可用每日档',
    },
    { q: '② 跨了几天没出成品', a: newestArtifact ? `本机跨 ${cross} 天（阈值 ${Math.round(opt.maxAgeHours)}h 内属正常）` : '无档可比' },
    {
      q: '③ 本机与服务器两路是否还在跑',
      a: `${(res.local_log && res.local_log.last_run_day) ? `本机：日志最后启动 ${res.local_log.last_run_day}，尾部连续失败 ${res.local_log.fail_streak_tail} 次` : '本机：无日志读数'}` +
        `｜服务器：${hasServerReading ? `有读数，最新档年龄见下` : '无读数（未接，别当它在跑）'}`,
    },
  ]

  const verdict = overall === ST.FAIL
    ? 'FAIL — 要动手：见下面标 FAIL 的条目'
    : overall === ST.WARN ? 'WARN — 判据不足或有隐患，先补齐读数/确认隐患，暂不判死' : 'OK — 两路都在跑且成品在阈值内'

  if (!opt.quiet) {
    console.log(`=== U01 备份新鲜度看门狗 · ${now.local} · 阈值 ${opt.maxAgeHours}h ===`)
    console.log(`仓库根：${opt.repo}`)
    console.log('')
    for (const a of answers) console.log(`${a.q}  ${a.a}`)
    console.log('')
    console.log(`结论：${verdict}`)
    console.log('')
    for (const ch of channels) {
      console.log(`── ${ch.channel} ── [${ch.status}]  读数来源：${ch.source}`)
      for (const it of ch.items) {
        const art = it.artifact ? ` <${it.artifact}>` : ''
        console.log(`  [${it.status}] ${it.name}${art}: ${it.note}`)
      }
      console.log('')
    }
  } else {
    console.log(answers[0].a)
    console.log(answers[1].a)
    console.log(answers[2].a)
    console.log(`结论：${verdict}`)
  }

  res.verdict = overall
  res.exit = overall === ST.FAIL ? 1 : overall === ST.WARN ? 2 : 0
  res.answers = answers
  res.channels = channels.map((c) => ({ channel: c.channel, status: c.status, source: c.source, items: c.items }))
  if (opt.json) { mkdirSync(dirname(opt.json), { recursive: true }); writeFileSync(opt.json, JSON.stringify(res, null, 2), 'utf8'); console.log(`已写 JSON：${opt.json}`) }
  if (opt.html) { writeHtml(opt.html, res, answers, channels, verdict); console.log(`已写单页看板：${opt.html}`) }
  process.exit(res.exit)
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function writeHtml(path, res, answers, channels, verdict) {
  const color = { [ST.OK]: '#1a7f37', [ST.WARN]: '#9a6700', [ST.FAIL]: '#b3261e' }
  const rows = channels.map((ch) => `
    <section><h2>${esc(ch.channel)} <span class="badge" style="background:${color[ch.status]}">${ch.status}</span></h2>
    <p class="src">读数来源：${esc(ch.source)}</p>
    <table><tr><th>判据</th><th>档位</th><th>说明</th></tr>
    ${ch.items.map((it) => `<tr><td>${esc(it.name)}${it.artifact ? `<br><code>${esc(it.artifact)}</code>` : ''}</td><td><span class="badge" style="background:${color[it.status]}">${it.status}</span></td><td>${esc(it.note)}</td></tr>`).join('')}
    </table></section>`).join('')
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>U01 备份新鲜度看门狗 · ${esc(res.generated_at)}</title>
<style>
body{font-family:"Microsoft YaHei",system-ui,sans-serif;margin:24px;max-width:1080px;color:#1b1f24;background:#fbfbf9}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 6px}
.meta{color:#57606a;font-size:13px;margin-bottom:14px}
.verdict{font-size:18px;font-weight:700;padding:10px 14px;border-radius:8px;background:#fff;border-left:6px solid ${color[res.verdict]}}
.qa{display:grid;grid-template-columns:190px 1fr;gap:6px 14px;background:#fff;border:1px solid #d8dee4;border-radius:8px;padding:14px;margin:14px 0}
.qa b{font-weight:600}
table{border-collapse:collapse;width:100%;background:#fff;font-size:14px}
th,td{border:1px solid #d8dee4;padding:7px 9px;text-align:left;vertical-align:top}
th{background:#f0f2f4}
.badge{color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700}
code{font-family:Consolas,monospace;font-size:12px;color:#57606a;word-break:break-all}
.src{color:#57606a;font-size:12px;margin:2px 0 8px}
.foot{color:#57606a;font-size:12px;margin-top:18px;border-top:1px dashed #d8dee4;padding-top:10px}
</style></head><body>
<h1>备份新鲜度看门狗 · 一页看板</h1>
<div class="meta">生成时间 ${esc(res.generated_at)} ｜ 仓库根 ${esc(res.repo)} ｜ 新鲜度阈值 ${esc(res.threshold_hours)} 小时 ｜ 断档回溯 ${esc(res.lookback_days)} 天</div>
<div class="verdict">结论：${esc(verdict)}</div>
<div class="qa">${answers.map((a) => `<b>${esc(a.q)}</b><span>${esc(a.a)}</span>`).join('')}</div>
${rows}
<div class="foot">本页由 <code>U01-backup-freshness.mjs</code> 只读生成：不改文件、不删档、不连生产机。绘约（artist-commission）项目记忆库已按用户 2026-09-04 决定清档，本页只谈磁盘产物与日志，不引用记忆库。</div>
</body></html>`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html, 'utf8')
}

main()
