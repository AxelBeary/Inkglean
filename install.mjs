#!/usr/bin/env node
// ============================================
// 拾绘 Inkglean · 一键安装脚本
// 用法：node install.mjs          （小白模式，一路回车）
//       node install.mjs --help   （查看全部参数）
// 全平台通用：Windows / Linux / macOS
// ============================================
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = join(ROOT, '.env')
const IS_WIN = process.platform === 'win32'
const IS_LINUX = process.platform === 'linux'
const PID_FILE = join(ROOT, 'data', 'server.pid')
const LOG_FILE = join(ROOT, 'data', 'server.log')

// ─── 颜色（非 TTY 自动关闭）───
const useColor = process.stdout.isTTY === true
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = c('32')
const yellow = c('33')
const red = c('31')
const cyan = c('36')
const bold = c('1')

const ok = (msg) => console.log(green(`  ✓ ${msg}`))
const warn = (msg) => console.log(yellow(`  ⚠ ${msg}`))
const fail = (msg) => console.error(red(`  ✗ ${msg}`))

// ─── 参数解析 ───
const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(name)
function getArg(name) {
  const i = argv.indexOf(name)
  return i === -1 || i + 1 >= argv.length ? undefined : argv[i + 1]
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
拾绘 Inkglean · 一键安装脚本

用法：node install.mjs [参数]

不带任何参数 = 小白模式，一路按回车即可完成安装。

参数：
  --docker            强制使用 Docker 容器安装
  --native            强制直接安装到本机（不用 Docker）
  --start             不安装，直接启动已装好的网站（日常开机用）
  --domain <域名>     绑定域名（不传则交互询问；Docker 模式默认 localhost）
  --admin-qq <QQ号>   管理员 QQ 号（可跳过，之后在网页里设置）
  --port <端口>       网站端口，仅原生模式有效（默认 3000）
  --yes               全自动：所有问题一律用默认值，不做任何询问
  --help              显示本帮助
`)
  process.exit(0)
}

const AUTO_YES = hasFlag('--yes')

// ─── 交互询问（带默认值：直接回车 = 采用默认）───
let rl = null
function getRl() {
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout })
  return rl
}
async function ask(question, defaultValue, { skipIfAutoYes = true } = {}) {
  if (AUTO_YES && skipIfAutoYes) return defaultValue
  const suffix = defaultValue !== '' && defaultValue != null ? `（直接回车 = ${defaultValue}）` : '（直接回车 = 跳过）'
  const answer = (await getRl().question(`  ${question} ${suffix}\n  > `)).trim()
  return answer === '' ? defaultValue : answer
}

// ─── 命令执行工具 ───
// Windows 下 spawn 传 cwd 会原样保留小写盘符（如 d:），而 vite 内部 process.cwd()
// 返回大写盘符——两者大小写不一致会导致 html 内联样式代理缓存键失配、构建失败。
// 因此统一把盘符规范为大写。
const fixCwd = (dir) => (IS_WIN ? dir.replace(/^([a-z]):/, (m, d) => `${d.toUpperCase()}:`) : dir)

// 帮用户直接打开网页（打不开就只打印网址，不阻断流程）
function openUrl(url) {
  try {
    if (IS_WIN) spawnSync('cmd', ['/c', 'start', '""', url], { stdio: 'ignore' })
    else if (process.platform === 'darwin') spawnSync('open', [url], { stdio: 'ignore' })
    else spawnSync('xdg-open', [url], { stdio: 'ignore' })
  } catch {
    /* 网址已打印，用户可手动打开 */
  }
}

// 检测本机是否有 C++ 编译工具（有 = 新版 Node 缺预编译时可以现场编译原生依赖）
function hasBuildTools() {
  if (IS_WIN) {
    const vswhere = join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Microsoft Visual Studio', 'Installer', 'vswhere.exe'
    )
    if (existsSync(vswhere)) {
      const r = spawnSync(
        vswhere,
        ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
        { encoding: 'utf8', timeout: 10_000 }
      )
      if (r.status === 0 && (r.stdout || '').trim()) return true
    }
    return false
  }
  if (process.platform === 'darwin') {
    return spawnSync('xcode-select', ['-p'], { stdio: 'ignore' }).status === 0
  }
  return ['cc', 'gcc', 'clang'].some(
    (compiler) => spawnSync(compiler, ['--version'], { stdio: 'ignore' }).status === 0
  )
}
function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WIN, timeout: 30_000, ...opts })
  return { code: r.status ?? 1, out: ((r.stdout || '') + (r.stderr || '')).trim() }
}
function runStream(cmd, args, opts = {}) {
  const { cwd = ROOT, ...rest } = opts
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: IS_WIN, cwd: fixCwd(cwd), ...rest })
  return r.status === 0
}

// ─── .env 工具：只补缺失项，绝不覆盖已有值 ───
function envHasKey(content, key) {
  return new RegExp(`^${key}=`, 'm').test(content)
}
function ensureEnv(updates) {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '# 拾绘 Inkglean 环境配置（由 install.mjs 自动生成）\n'
  const added = []
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) continue
    if (envHasKey(content, key)) continue
    if (!content.endsWith('\n')) content += '\n'
    content += `${key}=${value}\n`
    added.push(key)
  }
  writeFileSync(ENV_FILE, content)
  return added
}
function envValue(key) {
  if (!existsSync(ENV_FILE)) return undefined
  const m = readFileSync(ENV_FILE, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
  return m ? m[1].trim() : undefined
}

// ─── 健康检查轮询 ───
async function waitHttpHealthy(url, timeoutSec = 90) {
  const deadline = Date.now() + timeoutSec * 1000
  process.stdout.write('  ')
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (body && body.status === 'ok') {
          console.log('')
          return true
        }
      }
    } catch {
      /* 还没起来，继续等 */
    }
    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, 2000))
  }
  console.log('')
  return false
}

function waitDockerHealthy(composeCmd, timeoutSec = 120) {
  const probe = "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(t=>{if(!t.includes('\"status\":\"ok\"'))process.exit(1)}).catch(()=>process.exit(1))"
  const deadline = Date.now() + timeoutSec * 1000
  process.stdout.write('  ')
  while (Date.now() < deadline) {
    const r = spawnSync(composeCmd[0], [...composeCmd.slice(1), 'exec', '-T', 'web', 'node', '-e', probe], {
      cwd: ROOT,
      shell: IS_WIN,
      encoding: 'utf8',
      timeout: 15_000,
    })
    if (r.status === 0) {
      console.log('')
      return true
    }
    process.stdout.write('.')
    spawnSync(IS_WIN ? 'timeout' : 'sleep', IS_WIN ? ['/t', '2'] : ['2'], { stdio: 'ignore', shell: IS_WIN })
  }
  console.log('')
  return false
}

// ─── 完成横幅 ───
function printDone(url, extraLines = []) {
  console.log('')
  console.log(cyan('╔════════════════════════════════════════╗'))
  console.log(cyan('║          安装完成！                    ║'))
  console.log(cyan('╚════════════════════════════════════════╝'))
  console.log('')
  console.log(`  你的约稿网站已就绪：${bold(green(url))}`)
  console.log('')
  console.log('  下一步：')
  console.log('  1. 用浏览器打开上面的地址')
  console.log('  2. 跟随开箱设置向导，设置管理员账号')
  console.log('  3. 开始使用拾绘！')
  for (const line of extraLines) console.log(line)
  console.log('')
}

// ─── systemd 服务模板（Linux 原生模式）───
function printSystemdTemplate() {
  const user = os.userInfo().username
  const nodePath = process.execPath
  console.log(yellow('─── 可选：设置为系统服务（开机自动启动）───'))
  console.log('')
  console.log('  复制以下命令到终端执行：')
  console.log('')
  console.log(`sudo tee /etc/systemd/system/inkglean.service << 'EOF'
[Unit]
Description=Inkglean Artist Commission Platform
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${ROOT}
ExecStart=${nodePath} server/node_modules/tsx/dist/cli.mjs server/src/index.ts
Restart=on-failure
RestartSec=5
Environment=DB_PATH=${join(ROOT, 'data', 'commission.db')}
Environment=UPLOAD_DIR=${join(ROOT, 'uploads')}
EnvironmentFile=${ENV_FILE}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now inkglean`)
  console.log('')
  console.log('  （上面命令里的路径已替你填好，直接整段复制即可）')
  console.log('')
}

// ─── 启动已安装的原生站点（安装流程与日常启动共用）───
async function launchNativeSite(port) {
  mkdirSync(join(ROOT, 'data'), { recursive: true })
  mkdirSync(join(ROOT, 'uploads'), { recursive: true })

  // 从项目根目录启动：dotenv 读根目录 .env，WEB_DIST 默认解析到 web/dist
  // DB/上传目录注入绝对路径，数据统一落在根目录 data/ 与 uploads/（与 Docker 部署一致）
  const serverEnv = {
    ...process.env,
    DB_PATH: join(ROOT, 'data', 'commission.db'),
    UPLOAD_DIR: join(ROOT, 'uploads'),
    PORT: String(port),
    NODE_ENV: envValue('NODE_ENV') || (IS_LINUX ? 'production' : 'development'),
  }
  const logFd = openSync(LOG_FILE, 'a')
  const child = spawn(process.execPath, ['server/node_modules/tsx/dist/cli.mjs', 'server/src/index.ts'], {
    cwd: fixCwd(ROOT),
    env: serverEnv,
    stdio: ['ignore', logFd, logFd],
    detached: !IS_WIN, // Linux/macOS 后台运行；Windows 跟随本窗口
  })

  if (!IS_WIN) {
    writeFileSync(PID_FILE, String(child.pid))
    child.unref()
  } else {
    console.log('  提示：接下来 Windows 可能弹出网络权限窗口，请勾选“专用网络”并点“允许访问”。')
  }

  const healthy = await waitHttpHealthy(`http://127.0.0.1:${port}/api/health`, 120)
  if (!healthy) {
    // 超时大概率是防火墙弹窗没人点“允许”或启动慢；带走子进程避免残留占端口
    try {
      child.kill('SIGTERM')
    } catch {
      /* 已退出 */
    }
    fail('网站启动超时')
    if (IS_WIN) {
      console.log('  最常见原因：刚才如果弹出过 Windows 网络权限窗口而你没来得及点，')
      console.log('  请重新启动，弹窗出现时勾选“专用网络”并点“允许访问”。')
    }
    console.log('  如果这个网站从没安装成功过，请先运行安装（双击 install.bat）。')
    console.log(`  运行日志：${LOG_FILE}`)
    process.exit(1)
  }
  ok('网站已就绪')

  const extra = []
  if (IS_WIN) {
    extra.push('')
    extra.push(yellow('  注意：请不要关闭这个窗口——关掉窗口网站就会停止。'))
    extra.push('  想停止网站：按 Ctrl+C。')
    extra.push('  以后每次开机开店：双击本文件夹里的【启动网站.bat】。')
    extra.push('  想开机自动启动：以后可在 Windows “任务计划程序”里添加本目录的 启动网站.bat。')
    printDone(`http://localhost:${port}`, extra)
    console.log('  （网站正在后台运行，本窗口保持打开即可。按 Ctrl+C 停止。）')
    console.log('')
    // 前台守候：窗口关闭或 Ctrl+C 时带走服务进程
    process.on('SIGINT', () => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* 已退出 */
      }
      process.exit(0)
    })
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(red(`网站进程意外退出（退出码 ${code}），请查看日志：${LOG_FILE}`))
      }
      process.exit(code ?? 0)
    })
    await new Promise(() => {}) // 永远等待，直到窗口关闭/Ctrl+C
  } else {
    extra.push('')
    extra.push(`  网站在后台运行（进程号 ${child.pid}，已记入 ${PID_FILE}）。`)
    extra.push(`  运行日志：${LOG_FILE}`)
    extra.push(`  停止网站：kill $(cat ${PID_FILE} 2>/dev/null || echo ${child.pid})`)
    printDone(`http://localhost:${port}`, extra)
    if (IS_LINUX) printSystemdTemplate()
  }
}

// ============================================
// 主流程
// ============================================
async function main() {
  console.log('')
  console.log(cyan('╔════════════════════════════════════════╗'))
  console.log(cyan('║   拾绘 Inkglean · 安装向导             ║'))
  console.log(cyan('╚════════════════════════════════════════╝'))
  console.log('')

  // ─── 启动模式：日常开门营业，跳过安装直接启动（启动网站.bat 用）───
  if (hasFlag('--start')) {
    if (!existsSync(join(ROOT, 'server', 'node_modules')) || !existsSync(join(ROOT, 'web', 'dist'))) {
      fail('这个文件夹里还没有安装过网站，请先双击 install.bat 完成安装')
      process.exit(1)
    }
    const startPort = Number(getArg('--port') || envValue('PORT') || 3000)
    console.log(bold('正在启动网站，请稍等...'))
    await launchNativeSite(startPort)
    rl?.close()
    return
  }

  // ─── Phase 1：环境检测 ───
  console.log(bold('[1/4] 检查你的电脑环境'))

  const nodeMajor = Number(process.versions.node.split('.')[0])
  // 支持 Node 22~26（数据库零件 better-sqlite3 v12 的预编译覆盖范围）；
  // 推荐 22（与 Docker 生产环境一致）；超出范围时需要现场编译，有编译工具的老手放行
  const NODE22_URL = 'https://nodejs.org/dist/latest-v22.x/'
  if (nodeMajor < 22) {
    fail(`当前 Node.js 版本是 ${process.versions.node}，太旧了（需要 22 或更新）`)
    console.log(`  已经帮你打开了推荐版本的下载页面：${NODE22_URL}`)
    console.log('  请下载安装后重新运行本脚本。')
    openUrl(NODE22_URL)
    process.exit(1)
  }
  if (nodeMajor > 26) {
    if (hasBuildTools()) {
      warn(`你的 Node.js 是 ${process.versions.node}，比支持的 22~26 更新`)
      console.log('  检测到你电脑上有编译工具，可以继续安装。')
      console.log('  如果接下来安装失败，请改装 Node 22 再试。')
    } else {
      fail(`当前 Node.js 版本是 ${process.versions.node}，太新了，而且你的电脑没有编译工具`)
      console.log('  程序里的数据库零件只支持到 Node 26，更新的版本需要现场编译，')
      console.log('  而现场编译需要一套专业的开发工具，你的电脑上没有。')
      console.log(`  已经帮你打开了推荐版本的下载页面：${NODE22_URL}`)
      if (IS_WIN) {
        console.log('  请在页面里点击 node-v22 开头、以 -x64.msi 结尾的文件下载，')
        console.log('  双击安装一路“下一步”。请先在“设置 → 应用”里把旧版 Node.js 卸载掉，')
        console.log('  再装新版，然后重新双击安装。')
      } else {
        console.log('  请下载对应你系统的安装包，安装后重新运行本脚本。')
      }
      openUrl(NODE22_URL)
      process.exit(1)
    }
  } else if (nodeMajor > 22) {
    warn(`你的 Node.js 是 ${process.versions.node}，比推荐的 22 版新，但在支持范围内，继续安装`)
  }
  ok(`Node.js ${process.versions.node}`)

  let dockerVersion = null
  const dockerProbe = runCapture('docker', ['--version'])
  if (dockerProbe.code === 0) {
    const m = dockerProbe.out.match(/(\d+\.\d+\.\d+)/)
    dockerVersion = m ? m[1] : '已安装'
    ok(`Docker ${dockerVersion}`)
  } else {
    warn('未检测到 Docker（不影响安装，下面可以选"直接安装到本机"）')
  }

  // 探测 docker compose 命令形态
  let composeCmd = null
  if (dockerVersion) {
    if (runCapture('docker', ['compose', 'version']).code === 0) composeCmd = ['docker', 'compose']
    else if (runCapture('docker-compose', ['--version']).code === 0) composeCmd = ['docker-compose']
    if (!composeCmd) warn('检测到 Docker 但缺少 Compose 组件，将改用"直接安装到本机"')
  }

  const envExisted = existsSync(ENV_FILE)
  if (envExisted) ok('检测到已有配置文件 .env（不会覆盖你的旧设置）')
  console.log('')

  // ─── Phase 2：安装方式 ───
  console.log(bold('[2/4] 选择安装方式'))
  let mode
  if (hasFlag('--docker')) mode = 'docker'
  else if (hasFlag('--native')) mode = 'native'
  else if (AUTO_YES) mode = composeCmd ? 'docker' : 'native'

  if (!mode) {
    const recommended = composeCmd ? '1' : '2'
    console.log('  (1) Docker 容器安装' + (composeCmd ? ' ← 推荐，更省心' : ''))
    console.log('  (2) 直接安装到本机' + (!composeCmd ? ' ← 推荐（你的电脑没有 Docker）' : ''))
    const choice = await ask('输入数字选择', recommended)
    mode = choice === '2' ? 'native' : 'docker'
  }

  if (mode === 'docker' && !composeCmd) {
    fail('Docker 模式需要 Docker + Compose，但你的电脑上没有可用的 Docker。')
    console.log('  办法一：安装 Docker（Windows/Mac 见 https://www.docker.com/products/docker-desktop ；')
    console.log('          Linux 可在终端执行：curl -fsSL https://get.docker.com | sh）')
    console.log('  办法二：重新运行本脚本，选择"直接安装到本机"。')
    process.exit(1)
  }
  ok(mode === 'docker' ? '将使用 Docker 容器安装' : '将直接安装到本机')
  console.log('')

  // ─── Phase 3：配置生成 ───
  console.log(bold('[3/4] 生成网站配置'))

  const sessionSecret = randomBytes(32).toString('hex')
  const cookieSecret = randomBytes(32).toString('hex')

  const envUpdates = {
    SESSION_SECRET: sessionSecret,
    COOKIE_SECRET: cookieSecret,
  }

  let domain = getArg('--domain')
  if (mode === 'docker') {
    if (domain == null) domain = await ask('你的网站要绑定域名吗？（没有就先默认，以后再改）', 'localhost')
    envUpdates.DOMAIN = domain
    envUpdates.NODE_ENV = 'production'
  }

  let adminQQ = getArg('--admin-qq')
  if (adminQQ == null && !AUTO_YES) {
    adminQQ = await ask('你的 QQ 号（用于管理员账号，也可以跳过以后在网页里填）', '')
  }
  if (adminQQ) envUpdates.ADMIN_QQ = adminQQ

  const port = Number(getArg('--port') || envValue('PORT') || 3000)
  if (mode === 'native' && !Number.isInteger(port)) {
    fail(`端口 "${getArg('--port')}" 不是有效数字`)
    process.exit(1)
  }

  const added = ensureEnv(envUpdates)
  if (added.length > 0) ok(`配置已写入 .env（${added.join('、')}）`)
  else ok('配置齐全，无需补充')
  console.log('')

  // ─── Phase 4：安装并启动 ───
  console.log(bold('[4/4] 正在安装，请稍等（首次安装需要几分钟）'))

  if (mode === 'docker') {
    // 全新机器上 data/uploads 不存在时，Docker 会替我们以 root 创建挂载点，
    // 容器内非 root 用户将写不进去（SQLite 打不开库）——所以先自己建好
    mkdirSync(join(ROOT, 'data'), { recursive: true })
    mkdirSync(join(ROOT, 'uploads'), { recursive: true })
    if (!runStream(composeCmd[0], [...composeCmd.slice(1), 'up', '-d', '--build'])) {
      fail('Docker 构建或启动失败')
      console.log('  排查办法：在终端执行 ' + [...composeCmd, 'logs', '--tail', '100', 'web'].join(' ') + ' 查看日志')
      process.exit(1)
    }
    ok('程序打包完成，正在等待网站就绪')
    if (!waitDockerHealthy(composeCmd)) {
      fail('安装未成功：等待两分钟后网站仍没有响应')
      console.log('  排查办法：')
      console.log(`  1. ${[...composeCmd, 'logs', '--tail', '100', 'web'].join(' ')}`)
      console.log(`  2. ${[...composeCmd, 'ps'].join(' ')}`)
      console.log('  3. 修复后重新运行 node install.mjs（已有配置不会丢）')
      process.exit(1)
    }
    ok('网站已就绪')
    const url = domain && domain !== 'localhost' ? `https://${domain}` : 'https://localhost（浏览器若提示"不安全"，点"继续访问"即可）'
    printDone(url)
  } else {
    // ── 原生模式 ──
    if (!runStream('npm', ['ci'], { cwd: join(ROOT, 'server') })) {
      fail('后端依赖下载失败')
      console.log('  可能原因一：网络不稳定——稍等片刻重新双击即可。')
      console.log('  可能原因二：如果上面出现了 Visual Studio 或 node-gyp 字样，')
      console.log('  说明 Node.js 版本不对（需要正好 22 版），请到 https://nodejs.org/dist/latest-v22.x/ 下载 22 版重装。')
      process.exit(1)
    }
    ok('后端依赖下载完成')

    if (!runStream('npm', ['ci'], { cwd: join(ROOT, 'web') })) {
      fail('前端依赖下载失败，请检查网络后重试')
      process.exit(1)
    }
    if (!runStream('npm', ['run', 'build'], { cwd: join(ROOT, 'web') })) {
      fail('前端构建失败')
      process.exit(1)
    }
    ok('网站前端构建完成')

    await launchNativeSite(port)
  }

  rl?.close()
}

main().catch((err) => {
  console.error(red(`安装过程出错：${err?.message || err}`))
  process.exit(1)
})
