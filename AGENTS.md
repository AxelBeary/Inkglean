# AGENTS.md

AI 编码代理接手本仓库的入口文件。本文件刻意保持短：细节在下方事实源文档里，不在此复制。

## 事实源优先级（高 → 低）

1. **`docs/comms/STATUS.md`** — 主状态文档（自包含）：最新 HEAD、测试基线、已拍板规则、待办。接手工作前先读顶部最新一条；开发决策前先查 STATUS，避免返工。
2. **`docs/CONTEXT.md`** — 技术栈与模块结构速查。
3. **`desktop/docs/STATUS.md`** — 桌面端子项目（`desktop/` 目录）专属状态事实源：开工进度、桌面端专属拍板、安全三口径执行清单。接手桌面端工作先读其顶部最新条与 `docs/requirements/REQ-014-桌面端伴侣应用.md`（需求决策总书）。
4. **`docs/开发自参考.md`** — 开发自参考，仅作导航线索，内容时效性见下方「注意事项」。

安装、启动与完整命令入口见 **`README.md`**。文档之间冲突时以高优先级者为准；文档与代码不符时以代码为准。

## 改动后最小验证清单

按改动类型跑最小验证（路由：`README.md`「改动后最小验证」一节；均为仓库既有脚本，不发明新命令）：

| 改动类型 | 交付前必须跑通 |
| --- | --- |
| 后端改动 | `cd server && npm run typecheck && npm run lint && npm test` |
| 前端改动 | `cd web && npm run lint && npm run test:web && npm run check:i18n && npm run build` |
| 涉及端到端流程 | 仓库根目录 `npm run test:e2e` |
| 桌面端改动 | 脚手架未落地，暂无门禁；落地后登记至 `desktop/docs/STATUS.md`（此前 `desktop/` 仅限文档改动） |

门禁输出必须完整贴出（测试数、lint 零错误）；门禁输出不完整 = 交付作废。

## 注意事项

- `docs/开发自参考.md` 中的数字（用例数、行数等）与目录描述可能已过时，**不可直接引用**；引用前先对代码/实测核实。
- 拍板类决策须记录在 STATUS，不落到其他文档：平台级/跨端拍板 → `docs/comms/STATUS.md` 的「已拍板规则」章节；桌面端专属拍板 → `desktop/docs/STATUS.md`。
