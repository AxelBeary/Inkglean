// TASK2-02 定向回归样例：验证 needsWebBuild 的 mtime 判定纳入全部真实构建输入——
// web/src、shared/src、shared/package.json、根 .env/.env.local/.env.production。
// 关键回归：本批 SHR-02/SHR-04 只改 shared/src，旧实现漏算 → dist 被误判为最新 → E2E 跑旧 bundle 假绿。
// 做法：在临时目录搭建最小输入树，逐个把单个输入文件 mtime 顶到 dist 之后，断言 newestBuildInputMtime 捕获到。
// 运行：npx tsx e2e/scripts/build-freshness.regression.ts
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve, join } from 'path'
import { WEB_BUILD_INPUT_DIRS, WEB_BUILD_INPUT_FILES, newestBuildInputMtime } from '../global-setup.js'

const root = mkdtempSync(join(tmpdir(), 'e2e-build-fresh-'))
const T0 = 1_700_000_000_000
const stamp = (p: string, ms: number): void => { utimesSync(p, ms / 1000, ms / 1000) }

// 搭建输入树：dist 固定在 T0，所有输入初始早于 T0
for (const d of WEB_BUILD_INPUT_DIRS) mkdirSync(resolve(root, d), { recursive: true })
mkdirSync(resolve(root, 'web/dist'), { recursive: true })
const distIndex = resolve(root, 'web/dist/index.html')
writeFileSync(distIndex, 'built')
stamp(distIndex, T0)
const files: Array<[string, string]> = []
for (const d of WEB_BUILD_INPUT_DIRS) {
  const p = resolve(root, d, 'file.ts')
  writeFileSync(p, 'x'); stamp(p, T0 - 10_000); files.push([`${d}/file.ts`, p])
}
for (const f of WEB_BUILD_INPUT_FILES) {
  const p = resolve(root, f)
  mkdirSync(resolve(p, '..'), { recursive: true })
  writeFileSync(p, 'x'); stamp(p, T0 - 10_000); files.push([f, p])
}

let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const builtAt = T0
function newest(): number { return newestBuildInputMtime(root, WEB_BUILD_INPUT_DIRS, WEB_BUILD_INPUT_FILES) }
function touchAlone(target: string): number {
  // 先把所有输入复位到 dist 之前，再把唯一目标顶到 dist 之后
  for (const [, p] of files) stamp(p, T0 - 10_000)
  const p = resolve(root, target)
  stamp(p, T0 + 5_000)
  return newest()
}

try {
  check('输入清单含 shared/src', WEB_BUILD_INPUT_DIRS.includes('shared/src'))
  check('输入清单含 shared/package.json', WEB_BUILD_INPUT_FILES.includes('shared/package.json'))
  for (const env of ['.env', '.env.local', '.env.production']) {
    check(`输入清单含 ${env}`, WEB_BUILD_INPUT_FILES.includes(env))
  }

  check('全部输入早于 dist → 判定无需重建', newest() <= builtAt, `newest=${newest()} builtAt=${builtAt}`)

  const sharedSrcNewest = touchAlone('shared/src/file.ts')
  check('仅 shared/src 变更 → 捕获并判定需重建（旧实现在此假绿）', sharedSrcNewest > builtAt, `newest=${sharedSrcNewest}`)

  const sharedPkgNewest = touchAlone('shared/package.json')
  check('仅 shared/package.json 变更 → 需重建', sharedPkgNewest > builtAt)

  const envNewest = touchAlone('.env')
  check('仅根 .env 变更 → 需重建（vite envDir 指根）', envNewest > builtAt)

  const envLocalNewest = touchAlone('.env.local')
  check('仅根 .env.local 变更 → 需重建', envLocalNewest > builtAt)

  const webSrcNewest = touchAlone('web/src/file.ts')
  check('仅 web/src 变更 → 需重建（原能力不回退）', webSrcNewest > builtAt)
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n构建新鲜度回归（TASK2-02）：${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
if (failed > 0) process.exitCode = 1
