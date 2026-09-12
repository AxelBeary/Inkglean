// check-file-size.mjs — 巨型文件再生长防阀（T-08，深度分析报告 2026-08-20 拍板施工）
// 用法：node scripts/check-file-size.mjs [仓库根路径]（accept.ps1 已挂载为门禁）
//
// 规则：
//   1. server/src 与 web/src 源码文件（排除 tests/__tests__/locales）总行数（含空行）上限 800；
//   2. ALLOWLIST 登记的历史巨型文件豁免上限，但行数冻结在登记值——只许拆小不许再长；
//   3. 文件拆到 800 以下后，应从 ALLOWLIST 移除（机械强制，忘了会报「可移除」提醒）。
//
// 背景：05G 三拆后 OrderDetail/QueueBoardCalendar 回胀（检验报告 S-01/T-08），
//       口头纪律拦不住功能回灌，改机械拦截。
// 口径注：登记值为总行数（含空行，node 实测）；报告 S-01 曾用 PowerShell 非空行口径，
//       两者不混用（PowerShell Measure-Object -Line 跳空行会低估）。

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = process.argv[2] || '.'
const LIMIT = 800

// 历史巨型文件豁免名单（登记日 2026-08-20，冻结值＝实测总行数，只许拆小不许再长；
// 调高冻结值须一号裁决并在此注明出处）
// 格式：相对仓库根的 POSIX 路径 → 冻结行数
//
// ✅ 2026-09-12 **全部清偿归零**（用户拍板口径：「大文件只要长胖了就拆掉。拆了就移除豁免，
//    老的幽灵豁免也必须清理好」）。原 13 项已全部拆至 800 行以下并逐条从本表删除：
//      server/src/features/admin/admin.routes.ts      1103 → 44   （拆为 8 个子路由模块 + 组合入口）
//      server/src/features/artist/artist.service.ts    816 → 18   （拆为 5 个职责子模块 + barrel）
//      server/src/features/pricing/style.service.ts   1041 → 479  （拆出增项库/公开读模型/共用类型三块）
//      web/src/api/types.ts                           1904 → 37   （拆为 27 个域文件 + barrel，下游 import 零改动）
//      web/src/api/index.ts                            865 → 17   （拆为 9 个模块 + barrel，227 个端点方法）
//      web/src/views/admin/ArtistManage.vue           1254 → 748  （拆出邀请码/回收站/已移除/TOTP 四弹窗）
//      web/src/components/artist/ArtStyleManager.vue   967 → 629  （拆出 StyleCard + 共用类型）
//      web/src/components/ArtistLayout.vue             997 → 767  （拆出 LayoutTools/MobileTopbar/公告弹窗/菜单注册表）
//      web/src/components/templates/TplGallery.vue     902 → 758  （拆出 TplLightbox）
//      web/src/components/artist/order/ManualOrderRight.vue 924 → 705（拆出价格预览/增项/移动底栏三件）
//      web/src/components/artist/queue/QueueBoardList.vue    880 → 775（拆出拖把手/操作区/左滑取消三件）
//      web/src/views/artist/ArtworkManage.vue          870 → 750  （拆出批量删除/编辑两弹窗）
//      web/src/views/artist/OrderDetail.vue            837 → 747  （拆出基本信息卡/修改记录卡）
//    另：幽灵豁免 `web/src/views/artist/PriceCard.vue`（冻结值 1022，实仅 156 行）——文件早已拆小
//    而豁免忘撤，本批随之清除；`server/src/features/artist/artist.service.ts` 等原表里的追认出处
//    注释（v144/v145/v152/822/823/824 各批调高记录）随条目一并移除，历史链见本文件 git blame。
//
// ⚠ 今后本表再新增条目的规则（自 2026-09-12 起收紧）：
//    1）只允许登记「暂时确实拆不动」的正当豁免，须一号裁决并在条目上注明出处；
//    2）**禁止用“调高冻结值”给长胖的文件续命**——胖了就拆，拆完必须回到本表删条目（规则 3 会报「可移除」提醒）。
const ALLOWLIST = {}

const SCOPES = ['server/src', 'web/src']
const EXCLUDE = /(__tests__|[\\/]tests?[\\/]|\.test\.|\.spec\.|[\\/]locales[\\/])/

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

function norm(p) {
  return p.replaceAll('\\', '/')
}

const violations = []
const removable = []
const files = SCOPES.flatMap(s => walk(join(ROOT, s))).filter(f => !EXCLUDE.test(norm(f)))

for (const f of files) {
  const rel = norm(f).replace(norm(ROOT) + '/', '')
  const lines = readFileSync(f, 'utf8').replaceAll('\r', '').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).length
  const frozen = ALLOWLIST[rel]
  if (frozen !== undefined) {
    if (lines > frozen) violations.push(`${rel}: ${lines} 行 > 冻结值 ${frozen}（豁免文件只许拆小不许再长）`)
    else if (lines <= LIMIT) removable.push(`${rel}: ${lines} 行已低于 ${LIMIT}，可从 ALLOWLIST 移除`)
  } else if (lines > LIMIT) {
    violations.push(`${rel}: ${lines} 行 > ${LIMIT} 行上限（新巨型文件，先拆分再合入）`)
  }
}

// ALLOWLIST 里的幽灵条目（文件已删/已改名）
for (const rel of Object.keys(ALLOWLIST)) {
  if (!files.some(f => norm(f).replace(norm(ROOT) + '/', '') === rel)) {
    removable.push(`${rel}: 文件不存在，ALLOWLIST 条目可移除`)
  }
}

if (removable.length) {
  console.log('⚠️ ALLOWLIST 维护提醒：')
  removable.forEach(r => console.log('  ' + r))
}
if (violations.length) {
  console.error(`\n🔴 巨型文件防阀失败（${violations.length} 项）：`)
  violations.forEach(v => console.error('  ' + v))
  console.error('\n处置：拆到 800 行以下；历史文件如确需豁免须一号裁决后调高冻结值。')
  process.exit(1)
}
console.log(`✅ 巨型文件防阀通过（扫描 ${files.length} 个源码文件，上限 ${LIMIT} 行，豁免 ${Object.keys(ALLOWLIST).length} 项）`)
