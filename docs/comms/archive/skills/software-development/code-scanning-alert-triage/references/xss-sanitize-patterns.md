# HTML 清洗正则完整坑清单（sanitize.ts 实战，2026-08-14）

来源：artist-commission `server/src/shared/sanitize.ts` 连续两个 CodeQL 报警（#18/#19/#21）暴露的
后端入库最小清洗（存储型 XSS 纵深防御，渲染层主防线是前端 DOMPurify）完整绕过面。

## 目标语义（三件事，刻意保守不动正常富文本）
1. 去 `<script>/<style>` 标签对（含属性、大小写、换行、自闭合）
2. 去内联事件属性（`on*`，大小写不敏感，保留属性名前空白/斜杠避免标签粘连）
3. 去 `javascript:` 协议（大小写、字母间空白混淆均命中）

## 坑 1：结束标签带属性（CodeQL #19 js/bad-tag-filter）
- 攻击：`<script>alert(1)</script foo="bar">`
- 原因：浏览器容错解析把 `</script foo="bar">`、`</script/foo>` 当结束标签，正则 `<\s*\/\s*(script|style)\s*>`（要求紧跟 `>`）匹配不到 → 整对残留入库
- 修复：结束标签放宽 `<\s*\/\s*(script|style)\b[^>]*>`（与开始标签同构；`\b` 防 `</scriptx>` 误匹配）

## 坑 2：嵌套拼出孤立开始标签（CodeQL #21 js/incomplete-multi-character-sanitization）
- 攻击：`<scr<script></script>ipt>` → 删除内层 `<script></script>` 后外层拼出**无闭合** `<script>`
- 原因：标签对正则要求成对匹配，循环 10 次也删不掉孤立开始标签
- 危害比成对标签更重：浏览器遇无闭合 `<script>` 把后续内容当脚本**直到文档尾**
- 修复：链式 replace 末尾加兜底
  ```
  .replace(/<\s*(script|style)\b[^>]*>/gi, '')        // 残留开始标签
  .replace(/<\s*\/\s*(script|style)\b[^>]*>/gi, '')   // 残留结束标签
  ```
  此时剩余 script/style 标签必为孤立（成对已被第一条删除），正常富文本不含 script/style 字样不受影响

## 坑 3：嵌套还原（js/incomplete-multi-character-sanitization 另一形态）
- 攻击：`javajavascript:script:` 内层删后外层拼回可执行协议；`<scr<script></script>ipt>alert(1)</script>` 双层嵌套
- 修复：**全链路循环洗到不动点（上限 10 次）**，非单次替换；上限防恶意超长串卡死

## 坑 4：单字符 vs 多字符清洗
- 事件属性 `onerror` 正则：`([\s/])on[a-z][a-z0-9_]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?` 用 `$1` 保留前置空白/斜杠避免标签粘连
- javascript 协议混淆：`j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:`

## 通用原则
1. **循环到不动点**（嵌套/拼回绕过的唯一可靠解法），但要理解：循环只解决"删了还能拼回"，
   解决不了"正则本身匹配不到"（坑 1/坑 2 是正则形状问题，必须改正则）
2. **多删无害、少删有害**（纵深防御方向）：兜底删除残留标签不影响正常富文本，因为正常富文本
   不含 script/style 字样
3. 每次修完补「CodeQL 防再犯」测试（TC 编号 + 中文注释说明攻击构造），独立复跑验证修复前残留/修复后干净

## 验证方法
```powershell
# 临时脚本 %TEMP%/hermes-verify-*.mjs，跑完即删
node --experimental-strip-types "$env:TEMP\hermes-verify-xxx.mjs"
```
用例矩阵：正常对 / 大小写 / 结束标签带属性 / 结束标签带斜杠 / 结束标签换行 / 嵌套绕过 / 孤立开始无闭合 / 正常富文本保留。
断言含残留检测（`/<script/i.test(out)`）+ 精确输出比对（`toBe('')` 或 `toBe('xy')`）。
