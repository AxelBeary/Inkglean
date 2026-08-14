---
name: code-scanning-alert-triage
description: "GitHub CodeQL/code scanning 报警处置：拉取→核对代码→实测复现→分类（真缺口/误报/设计豁免）→修或 dismiss。含 dismiss API 坑（won't fix 枚举带撇号、PowerShell 无 heredoc）、XSS 清洗正则坑清单。"
version: 1.0.0
author: agent
tags: [security, codeql, code-scanning, github, xss, triage]
---

# GitHub CodeQL / Code Scanning 报警处置

用户丢来 GitHub Security 页面链接/新报警时用本技能。核心纪律：**报警描述不可信，逐条对照代码核实；CodeQL 报 high 不代表真漏洞，报 warning 也可能是真缺口**。

## 工作流

1. **拉报警**（gh CLI 已认证，浏览器未登录页面 404 时用 API）：
   ```powershell
   gh api "repos/<owner>/<repo>/code-scanning/alerts?state=open" --jq '.[] | {number, rule: .rule.id, severity: .rule.security_severity_level, path: .most_recent_instance.location.path, line: .most_recent_instance.location.start_line, msg: .most_recent_instance.message.text, commit: .most_recent_instance.commit_sha[0:8]}'
   ```
   `state=all` 可看已 dismiss/fixed 的历史（处置前先查，**并行会话可能已处理过**——本会话 #20/#12 就已被并行 dismiss，再 PATCH 报 "Alert is already dismissed"）。

2. **逐条核对代码**：报警位置 + 上下文读源码，判断：
   - **真缺口**（报警有道理，可复现）→ 修
   - **误报**（开发脚本/无攻击面/静态分析不理解循环语义）→ dismiss `false positive`
   - **设计豁免**（限流不适合 health/静态文件等路由）→ dismiss `won't fix`

3. **实测复现**（关键！别信描述）：临时脚本放 `%TEMP%`、`hermes-verify-` 前缀、跑完即删；TS 直接 `node --experimental-strip-types` 跑；用例含「正常场景 + 报警场景 + 回归场景」，输出 PASS/FAIL 表。见 `multi-role-lead-review-workflow` 的验证纪律。

4. **修**：建独立 worktree → 改 → 补测试（CodeQL 防再犯 describe 块 + TC 编号）→ 全量 vitest + tsc → 独立复跑 → commit → 写 comms 转交一号。

5. **dismiss**（gh API）：
   ```powershell
   gh api -X PATCH repos/<owner>/<repo>/code-scanning/alerts/<N> --input <json文件> --jq '{number, state, reason: .dismissed_reason}'
   ```
   JSON 文件内容：`{"state":"dismissed","dismissed_reason":"...","dismissed_comment":"中文核验依据+日期"}`

## 坑（全踩过）

- **dismissed_reason 枚举值是 `won't fix`（带撇号），不是 `wont fix`**——写错报 422 `wont fix is not a member of ["false positive", "won't fix", "used in tests", "mitigated"]`。
- **PowerShell 不支持 heredoc `<<'EOF'`**（报 "Missing file specification after redirection operator"）；也不要用 `-f` 传含撇号值（会被 shell 转义搞坏）。**正确姿势：write_file 写临时 JSON → `--input 路径` → 用后删除**。
- gh api 报错时先看**原始输出**（可能不是 JSON），别 ConvertFrom-Json 直接挂。
- 响应字段经管道 Select-Object 可能显示 null，先 `--jq` 精简再验证。
- `severity=high` 的三类常见形态：正则/清洗不完整（真缺口）、开发脚本（误报）、missing-rate-limiting（多为设计豁免——先 grep 项目里已有 rateLimit 覆盖，业务路由已限流则报的是 health/静态/签名 hook 这类该放行的）。

## 分类实例（2026-08-14 Inkglean）

| 报警 | 判定 | 处置 |
|------|------|------|
| sanitize.ts 结束标签带属性 `</script foo>` | 真缺口（浏览器容错视为闭合，正则 `\s*>` 漏） | 修：放宽 `\b[^>]*>` |
| sanitize.ts 孤立开始标签（嵌套拼出无闭合 `<script>`） | 真缺口（比成对更危险，浏览器当脚本到文档尾） | 修：兜底删残留开始/结束标签 |
| check-i18n.js / verify-i18n-keys.mjs | 误报（开发脚本无攻击面） | dismiss false positive |
| app.ts 签名 hook / /api/health / SPA 静态通配 限流 | 设计豁免（HMAC 暴力无意义/探活放行/静态高频） | dismiss won't fix |

## 参考

- `references/xss-sanitize-patterns.md` — HTML 清洗正则完整坑清单（结束标签属性/斜杠/孤立开始/嵌套拼出/循环不动点）
