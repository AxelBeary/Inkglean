# 第三方资产与许可声明（THIRD-PARTY NOTICES）

本文件列出「拾绘 / Inkglean（原 Brushline-HuiYue）」项目中使用到的第三方字体、图标与其他资产的来源与许可。项目整体采用 **AGPL-3.0-only**（见 LICENSE），但以下第三方资产保留其各自许可。

---

## 一、字体（Fonts）

### 霞鹜文楷（LXGW WenKai）
- **用途**：画师主页/后台标题字体（`web/src/assets/fonts/wencai/`）
- **来源**：https://github.com/lxgw/LxgwWenKai
- **许可**：**SIL Open Font License 1.1（OFL-1.1）**
- **许可要点**：允许自由使用、修改、分发（含商用）；修改后的字体必须改名；不得单独出售字体文件；分发时必须附 OFL 许可文本。
- **OFL 许可文本**：https://openfontlicense.org/

### Noto Sans SC / Noto Serif SC（思源黑体/宋体的 Google 版）
- **用途**：正文与密集界面字体（`web/src/assets/fonts/noto/`）
- **来源**：https://fonts.google.com/noto
- **许可**：**SIL Open Font License 1.1（OFL-1.1）**
- 署名：Copyright (c) Google LLC / Noto Project Authors
- **OFL 许可文本**：https://openfontlicense.org/

> 说明：OFL 要求"分发字体时必须附上许可文本"。本仓库内字体为**字重子集化（subset）后的 woff2**，源字体来自上述开源项目。完整 OFL 文本见上方链接；如需随包分发，请将 OFL.txt 一并带上。

---

## 二、图标（Icons）

### simple-icons
- **用途**：画师社交平台图标（`web/src/utils/simpleIcons.ts` 白名单导入）
- **来源**：https://github.com/simple-icons/simple-icons
- **许可**：**CC0 1.0 Universal（公有领域）**
- **说明**：CC0 为完全公有领域授权，无署名要求，可自由商用。

### Element Plus Icons（@element-plus/icons-vue）
- **用途**：后台界面 UI 图标
- **来源**：https://github.com/element-plus/element-plus-icons
- **许可**：**MIT**

---

## 三、主要开源依赖（Dependencies）

**登记口径（2026-09-12 按交叉审计修正，此前本节口径自相矛盾：既称"所有 npm 包"又只列"主要依赖"）**：本节覆盖**五端 manifest 的运行时直接依赖 + Rust 侧直接 crate**——即 `web` / `server` / `desktop` / `shared` 四份 package.json 的 `dependencies`（shared 只有 `peerDependencies.vue`）、`desktop/src-tauri/Cargo.toml` 的直接 crate，外加仓库根 `package.json`（**只有 E2E 与 TS 工具链 devDependencies，无运行时直接依赖**）。**间接依赖与开发工具链不逐条列**（个别行以「等」合列），需要全量时用第六节的命令现生成。

表中许可**全部实测**：npm 侧读各端 `node_modules/<包名>/package.json` 的 `license` 字段，Rust 侧读 `desktop/src-tauri/Cargo.lock` 的锁定版本 + cargo registry 解包目录里 `Cargo.toml` 的 `license` 字段。版权归各包作者所有。

### 前端（web/package.json）
| 依赖 | 许可 |
|------|------|
| vue / vue-router / vue-i18n | MIT |
| element-plus / @element-plus/icons-vue | MIT |
| pinia | MIT |
| axios | MIT |
| dompurify | Apache-2.0 / MPL-2.0 双许可 |
| simple-icons | CC0-1.0 |
| vuedraggable | MIT |
| chart.js | MIT |
| tesseract.js | Apache-2.0 |
| @sentry/vue | MIT |
| qrcode | MIT（实测 1.5.4。**两端各一份**：后端 `server/package.json` 同为直接依赖，见下表） |
| vite / vitest / eslint 等开发依赖 | MIT / Apache-2.0 等 |

> **tesseract.js 运行时说明（本地图片识别，手动录单「识别图片」功能）**：识别本身在用户浏览器本地完成，图片不上传任何服务器；但首次使用时会从公共 CDN 懒加载识别引擎与中文/英文语言数据（约几 MB，浏览器缓存后不再重复下载）。语言数据基于 Google 主导的 Tesseract OCR 项目（Apache-2.0）。如需离线/自托管，可将引擎与语言文件改为随部署包分发（web/src/utils/ocr.ts 头部注释有切换指引）。

### 后端（server/package.json）
| 依赖 | 许可 |
|------|------|
| fastify 及其插件（cookie/cors/multipart/static） | MIT |
| better-sqlite3 | MIT |
| sharp | Apache-2.0（底层 libvips 含 LGPL-3.0-or-later 声明，仅链接调用） |
| @sentry/node | MIT |
| nanoid | MIT |
| qrcode | MIT |
| @simplewebauthn/server | MIT（实测 13.3.2；Passkey/WebAuthn 服务端验证——登录安全组件） |
| isomorphic-dompurify | MIT（实测 3.22.0；服务端 HTML 净化——XSS 防线。**其内嵌依赖 dompurify 3.4.13 为 MPL-2.0 / Apache-2.0 双许可**，实测 license 字段 `(MPL-2.0 OR Apache-2.0)`，随本包一起分发时须连带体现） |
| ajv | MIT（实测 8.20.0；JSON Schema 校验） |
| dotenv | BSD-2-Clause |
| tsx / typescript | MIT / Apache-2.0 |

### 桌面端（desktop/package.json + desktop/src-tauri/Cargo.toml）
| 依赖 | 许可 |
|------|------|
| tauri / tauri-build / @tauri-apps/cli / @tauri-apps/api | Apache-2.0 OR MIT 双许可 |
| tauri-plugin-opener | Apache-2.0 OR MIT 双许可 |
| tauri-plugin-dialog / tauri-plugin-updater | Apache-2.0 OR MIT 双许可 |
| tauri-plugin-window-state | Apache-2.0 OR MIT 双许可（窗口几何记忆：主窗口尺寸/位置重启还原） |
| tauri-plugin-autostart | Apache-2.0 OR MIT 双许可（开机自启：Windows 走注册表，macOS 走 LaunchAgent） |
| tauri-plugin-notification / @tauri-apps/plugin-notification | Apache-2.0 OR MIT 双许可（系统通知：留言待审提醒等） |
| tauri-plugin-global-shortcut | Apache-2.0 OR MIT 双许可（全局快捷键：Ctrl+Alt+S 唤隐主窗口） |
| tauri-plugin-single-instance | Apache-2.0 OR MIT 双许可（单实例常驻：二次拉起唤起既有窗口） |
| tauri-plugin-sql / @tauri-apps/plugin-sql | Apache-2.0 OR MIT 双许可（本地数据层：SQLite，内置 rusqlite/sqlite；存本地记账等仅存本机数据） |
| @tauri-apps/plugin-dialog / @tauri-apps/plugin-updater | Apache-2.0 OR MIT 双许可 |
| vue / vite / typescript / vue-tsc | MIT（与网页端同栈） |
| pinia / vue-router | MIT（桌面端路由与状态；**与网页端同款许可、版本不同**，实测 desktop pinia 4.0.3 / web pinia 2.3.1） |
| jszip（桌面端） | MIT 或 GPLv3 双许可（本地数据导出打包：数据包 zip 生成） |
| windows（Rust crate，仅 Windows） | Apache-2.0 OR MIT 双许可（DPAPI 凭证保险箱用；还用于前台窗口枚举与键鼠空闲检测——`bridge/monitor.rs` 的 GetForegroundWindow / GetLastInputInfo） |
| serde / serde_json（Rust crate） | MIT OR Apache-2.0 双许可（实测 registry 锁定 serde 1.0.229 / serde_json 1.0.151；tauri 命令 IPC 与本地数据层的序列化底座） |
| base64（Rust crate） | Apache-2.0 OR MIT 双许可（工具箱导出落盘：PNG base64 解码） |
| Windows WebView2 运行时 | Microsoft 专有（系统组件，随 Windows 分发，非本项目依赖包） |

### 共享层（shared/package.json）
| 依赖 | 许可 |
|------|------|
| vue（仅 peerDependency，运行时由宿主端 web/desktop 提供） | MIT |

> shared 以 `file:../shared` 源码形式被 web 与 desktop 直导，自身**没有第三方运行时直接依赖**（其余全为 eslint / vitest / vue-tsc 等开发工具链）。

> **桌面端运行时说明**：桌面端渲染依赖系统已安装的 Microsoft Edge WebView2 运行时（Windows 10/11 默认自带）。tauri-plugin-sql（本地 SQLite）已随本地核心环波1 引入并登记；后续新增插件按本登记纪律逐条补登。

---

## 四、其他

- **SQLite**：公有领域（public domain），作者 D. Richard Hipp。
- **界面截图（审计/终验留证）**：本项目自身界面的截图，归本项目所有。
- **Logo / favicon**（`web/src/assets/logo.webp`、`web/public/favicon.svg`）：本项目原创，归 AxelBeary 所有。

---

## 五、设计参考与致谢

### oimimo-scheduler（画师排单助手）
- **来源**：https://github.com/mimo9708/oimimo-scheduler
- **许可**：**MIT**
- **说明**：2026-08 本项目在功能设计阶段研读并借鉴了该开源项目的若干产品思路（日历订阅、价目表导出、收入图表、小票打印、截稿临期预警等方向），并全部结合本项目架构与纸墨设计语言**重新实现**，未复制其源代码。感谢作者的公开分享。

---

## 六、完整依赖许可清单

按第三节的登记口径现生成全量清单，**五端 npm + Rust 侧都要跑**（此前这段只写了 web 与 server 两端、且完全没有 Rust，照抄跑一遍就必然复现"漏登记"）：

```bash
# npm 侧：逐端在各自包目录跑（仓库根只有 E2E 工具链，跑不跑均可）
npx license-checker --json > /tmp/root-licenses.json
cd web    && npx license-checker --json > /tmp/web-licenses.json
cd server && npx license-checker --json > /tmp/server-licenses.json
cd desktop&& npx license-checker --json > /tmp/desktop-licenses.json
cd shared && npx license-checker --json > /tmp/shared-licenses.json
```

```bash
# Rust 侧：需先装工具（实测本机与 CI runner 默认都没有：cargo about --version → no such command）
cargo install cargo-about
cd desktop/src-tauri && cargo about list          # 只列 crate/version/license，不需模板文件
```

不想装 cargo 工具时的最小实测口径（本节新增行的来源就是这两条）：先取 `desktop/src-tauri/Cargo.lock` 里锁定的版本，再读 registry 解包目录中该 crate 的 `Cargo.toml` `license` 字段：

```powershell
Select-String -Path desktop/src-tauri/Cargo.lock -Pattern '^name = "serde"' -Context 0,1
Get-Content "$env:USERPROFILE\.cargo\registry\src\index.crates.io-*\serde-1.0.229\Cargo.toml" | Select-String '^license'
```

如您分发本项目，建议同时附上 node_modules 中各包的 LICENSE 文件（npm 安装时已自动附带）与 Rust 侧各 crate 的 LICENSE-MIT / LICENSE-APACHE。

---

*最后更新：2026-09-12（审计第 2 批 F-12：补登 @simplewebauthn/server / isomorphic-dompurify（含其内嵌 dompurify 的双许可）/ ajv / qrcode 前端侧 / serde 与 serde_json，全部许可实测；登记口径改为「五端 manifest 运行时直接依赖 + Rust 直接 crate」并写死实测方法；第六节重新生成命令补齐五端与 Rust；顺带修 simpleIcons 扩展名、幽灵截图目录、pinia 两端版本差异、windows crate 用途漏项。此前：2026-08-26 桌面端本地核心环波1 新增 tauri-plugin-sql 登记；同日正式图标批与 notification / global-shortcut / single-instance；2026-08-20 新增 tesseract.js 依赖与运行时 CDN 说明、chart.js 依赖与 oimimo-scheduler 设计参考致谢）*
