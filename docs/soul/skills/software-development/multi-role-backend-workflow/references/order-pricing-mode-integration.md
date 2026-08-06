# 订单创建接入新计价模式（createOrder 双模型共存）

REQ-023 Phase 2 实例：POST /orders 接受 `styleSizeId` + `styleAddons`（新画风模型），与旧 `tierId` 模型共存互斥。旧路径一行不动。

## Schema 扩展（order.routes.ts）

**两个 POST 都要改**：客户端自助 `POST /api/orders` 和手动录单 `POST /api/artist/orders/manual`。漏一个 = 一条下单路径不支持新模式。

```json
"styleSizeId": { "type": ["integer", "null"] },
"styleAddons": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["styleAddonId"],
    "properties": {
      "styleAddonId": { "type": "integer" },
      "quantity": { "type": "integer", "minimum": 1, "maximum": 99 },
      "optionLabel": { "type": "string", "maxLength": 100 }
    },
    "additionalProperties": false
  },
  "maxItems": 20
}
```

handler 解构 + `createOrder({... styleSizeId: styleSizeId || null, styleAddons: styleAddons || [] })` 传参，两处同步。

## Service 层（order.service.ts createOrder）

1. **CreateOrderParams** 加可选字段 `styleSizeId?: number | null`、`styleAddons?: Array<{...}>`
2. **互斥防御**（价格计算分支最前面）：
   ```ts
   if (styleSizeId && tierId) throw new AppError(E.VALIDATION, 400, { reason: 'styleSizeId 与 tierId 互斥，只能传其一' })
   ```
3. **分支顺序：新模式在 `else if (tierId)` 之前**。新模式算价不含折扣（`discountCode: null` 传给引擎），折扣走现有统一块（先倍率后折扣，基于 totalPriceCents）——不重复实现折扣逻辑。
4. **totalPriceCents** 取引擎倍率后总价：`Math.round(styleCalc.multiplierTotal * 100)`

## 四个附属结构的新模式分支

| 结构 | 新模式做法 |
|------|-----------|
| `quote_snapshot` | 新写 `buildStyleQuoteSnapshot(sc, finalTotal)`。格式：`[日系 / 全身] 基础¥600 + 加人×2 ¥400 = ¥1150 × 商用2.0 = ¥2300 → 总价 ¥2070` |
| `price_snapshot` | 存新模式基础价：`styleCalc ? styleCalc.basePrice : (priceCalc ? priceCalc.basePrice : null)` |
| `order_price_breakdown` | **复用现有 `'tier'`/`'addon'` item_type**（语义兼容），避免改 CHECK 约束 → 省掉一次重建表迁移。item_name 写 `画风名 / 尺寸名` |
| `order_payment_installments` | 新模式没有 priceCalc.installments，从工作流节点现算：`SELECT name, basis_points FROM artist_workflow_stages WHERE artist_id=? AND takes_payment=1`，`amount_cents = round(totalPriceCents × bp / 10000)`。分期块结构改为 `if (queueZone==='formal') { if (styleCalc && total>0) {...} else if (priceCalc && ...) {...} }` |

其他字段：`tier_id` 传 null、`usage/rush_multiplier_id` 照常、`final_price_cents = totalPriceCents`（已含折扣）。

## 引擎侧小改动

引擎结果接口导出供订单侧引用：`export interface StylePriceResult`，并按需补展示字段（如 `styleName`，quote_snapshot 要用画风名——SELECT 里已有 `s.name AS style_name`，return 时带上即可）。

## 测试清单（style-order.test.js，15 用例）

Service 层：
- 新模式有价格 + quote_snapshot 含画风/尺寸/增项名
- quantity 增项计价（单价×数量）
- 倍率（quote_snapshot 含倍率名）
- 折扣码联动（total 减折、discount_amount_cents、discount_code_id）
- 分期生成（定金30%+尾款70% 金额精确到分）
- breakdown 写入（item_type='tier'/'addon'，item_name 含画风名）
- **旧档位模式回归**（total/tier_id/quote_snapshot 不变）
- 互斥：styleSizeId+tierId 同传 → VALIDATION
- 无效 styleSizeId → STYLE_SIZE_NOT_FOUND
- 纯基础价（无增项）

路由层：客户端 POST /api/orders 新模式 200+价格、手动录单 200、旧档位回归、互斥 400、无效 ID 404。

## 完整检查清单

1. 两个 POST 的 schema + handler 传参（4 处）
2. CreateOrderParams + 函数签名解构
3. 互斥防御
4. 分支顺序（新模式在前）
5. 折扣走统一块不重写
6. quote_snapshot 新 builder
7. price_snapshot 三元
8. breakdown 复用 item_type（不迁移）
9. 分期新模式分支
10. 全部 createOrder 调用方 grep 一遍（`createOrder({`）
