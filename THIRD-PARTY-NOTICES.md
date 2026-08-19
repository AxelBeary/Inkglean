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
| @sentry/vue | MIT |
| vite / vitest / eslint 等开发依赖 | MIT / Apache-2.0 等 |

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

*最后更新：2026-08-20（新增 chart.js 依赖与 oimimo-scheduler 设计参考致谢）*
