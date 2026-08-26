# 第三方资产与许可声明（THIRD-PARTY NOTICES）

本文件列出「拾绘 / Inkglean（原 Brushline-HuiYue）」项目中使用到的第三方字体、图标与其他资产的来源与许可。项目整体采用 **AGPL-3.0**（见 LICENSE），但以下第三方资产保留其各自许可。

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
- **用途**：画师社交平台图标（`web/src/utils/simpleIcons.js` 白名单导入）
- **来源**：https://github.com/simple-icons/simple-icons
- **许可**：**CC0 1.0 Universal（公有领域）**
- **说明**：CC0 为完全公有领域授权，无署名要求，可自由商用。

### Element Plus Icons（@element-plus/icons-vue）
- **用途**：后台界面 UI 图标
- **来源**：https://github.com/element-plus/element-plus-icons
- **许可**：**MIT**

---

## 三、主要开源依赖（Dependencies）

本项目依赖的所有 npm 包均为各自作者按开源许可发布，版权归其各自作者所有。主要依赖及其许可：

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
| @tauri-apps/plugin-dialog / @tauri-apps/plugin-updater | Apache-2.0 OR MIT 双许可 |
| vue / vite / typescript / vue-tsc | MIT（与网页端同栈） |
| pinia / vue-router | MIT（桌面端路由与状态，与网页端同款） |
| windows（Rust crate，仅 Windows） | Apache-2.0 OR MIT 双许可（DPAPI 凭证保险箱用） |
| Windows WebView2 运行时 | Microsoft 专有（系统组件，随 Windows 分发，非本项目依赖包） |

> **桌面端运行时说明**：桌面端渲染依赖系统已安装的 Microsoft Edge WebView2 运行时（Windows 10/11 默认自带）。后续引入 tauri-plugin-sql（本地 SQLite）等插件时按本登记纪律逐条补登。

---

## 四、其他

- **SQLite**：公有领域（public domain），作者 D. Richard Hipp。
- **游戏内/页面截图**（`docs/audit-screenshots/`）：项目自身界面的截图，归本项目所有。
- **Logo / favicon**（`web/src/assets/logo.webp`、`web/public/favicon.svg`）：本项目原创，归 AxelBeary 所有。

---

## 五、设计参考与致谢

### oimimo-scheduler（画师排单助手）
- **来源**：https://github.com/mimo9708/oimimo-scheduler
- **许可**：**MIT**
- **说明**：2026-08 本项目在功能设计阶段研读并借鉴了该开源项目的若干产品思路（日历订阅、价目表导出、收入图表、小票打印、截稿临期预警等方向），并全部结合本项目架构与纸墨设计语言**重新实现**，未复制其源代码。感谢作者的公开分享。

---

## 六、完整依赖许可清单

完整依赖许可可通过以下命令生成：

```bash
cd web && npx license-checker --json > /tmp/web-licenses.json
cd server && npx license-checker --json > /tmp/server-licenses.json
```

如您分发本项目，建议同时附上 node_modules 中各包的 LICENSE 文件（npm 安装时已自动附带）。

---

*最后更新：2026-08-26（桌面端壳层商业化批新增 tauri-plugin-notification / tauri-plugin-global-shortcut / tauri-plugin-single-instance 登记；此前：2026-08-26 新增 tauri-plugin-window-state 与 tauri-plugin-autostart；2026-08-20 新增 tesseract.js 依赖与运行时 CDN 说明、chart.js 依赖与 oimimo-scheduler 设计参考致谢）*
