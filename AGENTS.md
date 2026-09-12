# AGENTS.md

AI 编码代理接手本仓库的入口文件。本文件刻意保持短：细节在下方事实源文档里，不在此复制。

## 事实源优先级（高 → 低）

1. **`docs/comms/STATUS.md`** — 主状态文档（自包含）：最新 HEAD、测试基线、已拍板规则、待办。接手工作前先读顶部最新一条；开发决策前先查 STATUS，避免返工。
2. **`docs/CONTEXT.md`** — 技术栈与模块结构速查。
3. **`desktop/docs/STATUS.md`** — 桌面端子项目（`desktop/` 目录）专属状态事实源：开工进度、桌面端专属拍板、安全三口径执行清单。接手桌面端工作先读其顶部最新条与 `docs/requirements/REQ-014-桌面端伴侣应用.md`（需求决策总书）。
4. **`docs/开发自参考.md`** — 开发自参考，仅作导航线索，内容时效性见下方「注意事项」。
5. **`docs/soul/AGENTS-v2.md`** — 虚拟团队编制与派工流程（2026-08-28 拍板）：主代理调度+门禁，常驻子代理（`.qoder/agents/huiyue-*`）执行；派工门槛、标准流程、啄虫员触发条件见该文档。

安装、启动与完整命令入口见 **`README.md`**。文档之间冲突时以高优先级者为准；文档与代码不符时以代码为准。

## STATUS 体例与归档纪律（2026-09-05 拍板）

STATUS 是每次开工的固定阅读成本（曾实测：单行最长 3900 字，长行占文件体量 89~96%），按三条控住：

1. **顶部看板置顶**：`docs/comms/STATUS.md` 第一屏是 ≤12 行看板（HEAD、四端基线、迁移号、有无在途施工、下一步 3~5 条）；多数接手只读这一块即可决策。
2. **单行不超 200 字**：新条目写成「短标题行 + `- ` 分组要点」，**禁止把整批结论塞进一个长行**。三条理由均实测踩过：超长行会让 ripgrep 漏报（假阴性）、让 diff 不可读（等于没防线）、让精确替换易错。
3. **正文只留最新 5 条**：落档时数一下，第 6 条起整段搬进 `docs/comms/archive-YYYYMMDD/`（桌面端同法），原位留一行指针。文本搬动属高风险迁移：**单独一批做**，完事后用“字符总量前后差 + 逐条比对”校验零丢失，不与代码施工混批。

同一批的细节只写一份：桌面端专属内容归 `desktop/docs/STATUS.md`，主 STATUS 该条只留摘要 + 指针，**不互抄全文**（曾同一批在两份文件各写一个 2000+ 字巨行）。

## 改动后最小验证清单

按改动类型跑最小验证（路由：`README.md`「改动后最小验证」一节；均为仓库既有脚本，不发明新命令）：

| 改动类型 | 交付前必须跑通 |
| --- | --- |
| 后端改动 | `cd server && npm run typecheck && npm run lint && npm test` |
| 前端改动 | `cd web && npm run lint && npm run test:web && npm run check:i18n && npm run build` |
| 涉及端到端流程 | 仓库根目录 `npm run test:e2e` |
| 桌面端改动 | `cd desktop && npm run lint && npm run test && npm run build` + `cd desktop/src-tauri && cargo check`（已进 CI `desktop` job） |
| 共享层改动（`shared/`） | `cd shared && npm run lint && npm run test && npm run typecheck`，并回 `web`、`desktop` 各跑一次 build |

门禁输出必须完整贴出（测试数、lint 零错误）；门禁输出不完整 = 交付作废。

「门禁全绿」专指 `pwsh scripts/accept.ps1` 十七道全过（server 3 + web 4 + desktop 3 + shared 3 + E2E 2 + 测试同改标红 1 + 巨型文件防阀 1；带 `-SkipE2E` 时为十五道）；仅跑 CI 四 job 时须写「CI 四 job 全绿」，**不得简称「门禁全绿」**。

## 注意事项

- `docs/开发自参考.md` 中的数字（用例数、行数等）与目录描述可能已过时，**不可直接引用**；引用前先对代码/实测核实。
- 拍板类决策须记录在 STATUS，不落到其他文档：平台级/跨端拍板 → `docs/comms/STATUS.md` 的「已拍板规则」章节；桌面端专属拍板 → `desktop/docs/STATUS.md`。
