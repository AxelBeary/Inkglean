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

// 历史巨型文件豁免名单（登记日 2026-08-20，冻结值=实测总行数，只许拆小不许再长；
// 调高冻结值须一号裁决并在此注明出处）
// 格式：相对仓库根的 POSIX 路径 → 冻结行数
const ALLOWLIST = {
  // 823 规则对齐批追认：1067→1068 = artistCode 上限 10→20 的出处注释 +1（等长替换外加一行注释，出处在案）；
  // 824 2FA 绑定完整性加固批追认：1068→1072 = 管理员 bind-init 路由层 token_version+1 与注释 +4（出处在案）
  'server/src/features/admin/admin.routes.ts': 1072,
  'server/src/features/pricing/style.service.ts': 1041,
  // 下两项为纯类型/接口契约聚集仓（深度分析报告「可接受暂缓」裁决），
  // 冻结值随 820 批两聚合接口追认调高（merge 76707e86 后实测，用户拍板合入）；
  // v144 自定义首页批一再追认：DashboardPrefs 契约类型 +21 / 读写两方法 +4（骨架批必需契约，出处在案）；
  // v145 批二再追认：IncomeOverview/DeadlineSoon 契约类型 +21 / 数据源两方法 +4（血肉批必需契约，出处在案）；
  // v152 追认：types.ts 1824→1859（邀请码批类型 +35）/ index.ts 837→842（邀请码批端点 +5），出处在案；
  // 823 登录留痕批再追认：types.ts 1859→1864（AdminArtistItem 登录留痕字段 +5，出处在案）；
  // 824 2FA 绑定完整性加固批追认：index.ts 842→849（TOTP_BIND_REQUIRED 401 拦截器带文案登出+旗标分流 +7，出处在案）
  'web/src/api/types.ts': 1864,
  'web/src/api/index.ts': 849,
  // v144 追认：ArtistLayout +43 = 页宽三档生效机制（prefs 拉取/pageWidthStyle/container-type 注释）；
  // PriceCard +1 = 页宽归一批注释行。另：计数口径修正（CRLF 归一）后冻结值统一按总行口径重钉；
  // v145 批二再追认：PriceCard +2 = 容器查询收尾批注释行（@media→@container 改造标记，出处在案）；
  // 822 布局重做批追认：ArtistLayout 993→995（container-name: page +2 注释）/
  // PriceCard 1011→1022（行栅格/容器命名/纸签化重做注释 +11，功能行均为等长替换，出处在案）；
  // 823 深度 Bug 挖掘 F-7 追认：ArtistLayout 995→997（骨架预拉 profile 失败留痕 +2，出处在案）
  'web/src/components/ArtistLayout.vue': 997,
  'web/src/views/artist/PriceCard.vue': 1022,
  // v152 追认四处（均为并行批已合入的正当增量，出处在案）：
  // artist.service.ts 800→802 = 开业门槛批就绪判定两函数（超限 2 行，拆分不经济，冻结只许拆小）；
  // api/types.ts 1824→1859 = 邀请码多次使用批类型 +35；
  // api/index.ts 837→842 = 邀请码批新端点方法 +5；
  // ArtistManage.vue 1109→1222 = 邀请码管理端筛选/分页/使用记录弹窗 +113（后续可拆弹窗组件瘦身）
  // Login.vue 977→1011 = 823 验证器 App 安装引导批 +34（入驻前置提醒 + 扫码页折叠引导模板/状态/样式，后续可抽引导组件瘦身）；
  // 823 登录留痕批追认四处（本批必需增量，拆分不经济，出处在案；api/types.ts 追认见上方条目注释）：
  // admin.routes.ts 1059→1067 = 管理端列表/档案接口重新附带 last_login_at/last_login_ip +8；
  // artist.service.ts 802→812 = recordLastLogin 函数与注释 + getAllArtists 显式列补两列 +10；
  // ArtistManage.vue 1222→1249 = 上次登录列模板 +6 与相对时间/悬浮展示函数 +21（后续可随邀请码弹窗一并拆组件瘦身）
  'server/src/features/artist/artist.service.ts': 812,
  'web/src/views/admin/ArtistManage.vue': 1249,
  // Login.vue 冻结值已移除（824 四步入驻批：叠加层抽为 InviteOverlay 组件，1011→661，回到 800 线内）
  'web/src/components/artist/ArtStyleManager.vue': 941,
  'web/src/components/artist/order/ManualOrderRight.vue': 924,
  'web/src/components/templates/TplGallery.vue': 896,
  'web/src/components/artist/queue/QueueBoardList.vue': 872,
  // v146 追认：ArtworkManage +1 = 页宽容器查询收尾批注释行（@media→@container 改造标记，出处在案）
  'web/src/views/artist/ArtworkManage.vue': 868
}

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
