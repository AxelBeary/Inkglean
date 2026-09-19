# 吸底 CTA 哨兵修复批复盘（2026-08-06）

## 施工图不精确的实证

派工施工图写 `el?.sentinelEl?.value || el`（认为 expose 的 ref 需要解 `.value`），实测发现：

- **Vue 3 的 expose proxy 会自动 unwrap ref**：`defineExpose({ sentinelEl })` 后，父组件拿到的组件实例 `el.sentinelEl` **直接就是 DOM 元素**（`instanceof HTMLElement === true`），`.value` 是 undefined。
- 照抄施工图 `el?.sentinelEl?.value || el` → `.value` undefined → fallback 到组件实例 → `IntersectionObserver.observe(组件实例)` 抛 `parameter 1 is not of type 'Element'` → 哨兵从不建立 → 功能静默失效。
- **正确写法**：`const sentinel = el?.sentinelEl || el` + `if (!sentinel || !(sentinel instanceof Element)) return`。

## 诊断路径（可复用的反馈循环）

1. 初版按施工图改 → 浏览器实测吸底条不出现 → console 有 `observe: parameter 1 is not of type 'Element'`
2. 在 useStickyCta setup 里 console.log 插桩，打印 `el.sentinelEl` 的 `typeof` / `instanceof HTMLElement` / `.value`
3. build + 重启 server + **全新 Playwright 实例**读 console（Hermes 浏览器 console 有历史缓冲，会混入旧日志误判）
4. 结论：`el.sentinelEl` 已是 DOM 元素（expose unwrap），`.value` 为 undefined → 修正取法
5. **移除插桩**再交付（grep `console.log` 自检）

## 测试数据误导案例（假警报）

- folio 模板按钮"点击不跳转"→ 排查三层（普通 click → force → 原生 dispatch + pushState hook）都无效
- 最终根因：seed 画师 Bob `status='full'`（已排满）→ TplStickyCta 按钮 `:disabled="artist.status !== 'open'"` 正确 disabled
- **业务正确行为不是 Bug**。改 Bob 为 open 后点击正常。
- 教训：测试数据影响 UI 状态（画师 status 决定按钮可用性），4 模板对照需 4 个 status=open 的画师。

## 验证结果

| 模板 | 初始 | 滚过 Hero | 回顶 | 按钮 | 点击进下单页 |
|------|------|----------|------|------|-------------|
| gallery | 无 ✅ | 出现 ✅ | 消失 ✅ | 可点 ✅ | `/order` ✅ |
| folio | 无 ✅ | 出现 ✅ | 消失 ✅ | 可点 ✅ | `/order` ✅ |
| atelier | 无 ✅ | 出现 ✅ | 消失 ✅ | 可点 ✅ | `/order` ✅ |
| classic | 无（对照）✅ | — | — | — | — |

## 交付要点

- 交付报告必须**显式标注施工图偏差**：派工方案 X 与实测不符，已改为 Y，原因 Z——让一号审核知道"照抄会踩坑"。
- vitest 215/215 + eslint 0 + build 通过 + 浏览器实测 4/4 PASS + ad-hoc 静态断言（哨兵取法、无插桩残留、computed import 清理正确）。
