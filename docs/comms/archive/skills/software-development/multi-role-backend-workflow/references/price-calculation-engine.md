# Multi-Model Price Calculation Engine Pattern

Demonstrated in v0.32 Phase 2 (REQ-023): `calculate-style-price` — stateless price calculator for the style×size×addon model.

## When to use

When a platform evolves from flat pricing (tier + addons) to a hierarchical model (style → size → addons with per-level overrides), and you need a new calculation endpoint that coexists with the old one during migration.

## Architecture

```
POST /api/public/calculate-style-price (new, stateless)
POST /api/public/calculate-price       (old, kept unchanged)
```

New service file: `style-pricing.service.ts` — imports `discount.service.ts` for reuse (validateDiscountCode + computeDiscountCents). Do NOT duplicate discount logic.

## 3-Level Price Priority Cascade

The core pattern: each addon's effective price resolves through a priority chain.

```
size_addon_overrides.price_override   (highest — per size×addon)
  ↓ null?
style_addons.price_override           (middle — per style)
  ↓ null?
addon_templates.default_price         (lowest — template default)
```

Implementation:
```ts
const override = db.prepare(
  'SELECT * FROM size_addon_overrides WHERE style_size_id = ? AND style_addon_id = ?'
).get(sizeId, styleAddonId)

let unitPrice: number
let source: 'size_override' | 'style_override' | 'template_default'
if (override?.price_override != null) {
  unitPrice = override.price_override; source = 'size_override'
} else if (sa.price_override != null) {
  unitPrice = sa.price_override; source = 'style_override'
} else {
  unitPrice = sa.tpl_default_price; source = 'template_default'
}
```

Return `source` in the response — frontend shows "尺寸覆盖" / "画风默认" badges.

## Control Type Pricing

Each addon control type has different pricing semantics:

| control_type | pricing_mode | Calculation | Input required |
|---|---|---|---|
| switch | fixed | price × 1 | (presence = selected) |
| quantity | per_unit | price × quantity | `quantity: 1-99` |
| radio | per_option | selected option's price | `optionLabel: string` |

Radio options come from `options_override ?? tpl_options` (JSON array `[{label, price}]`). Validate `optionLabel` exists in the parsed array.

## Validation Chain (order matters)

1. Size exists + belongs to artist's active style (`JOIN art_styles` check `is_active`)
2. Each addon: belongs to the style + `is_enabled=1` + NOT hidden at this size (`is_hidden`)
3. Dedup: reject duplicate `styleAddonId` in the addons array
4. Quantity range: 1-99 for quantity type
5. Radio: `optionLabel` must exist in options JSON
6. Multiplier: belongs to artist + `enabled=1` + correct type (usage/rush)
7. Discount: reuse `validateDiscountCode()` (checks enabled, exists, not expired, not exhausted)

## Formula

```
subtotal = basePrice + Σ(addon amounts)
multiplierTotal = subtotal × usageFactor × rushFactor
discountCents = computeDiscountCents(code, multiplierTotalCents)  // 先倍率后折扣
totalPriceCents = multiplierTotalCents - discountCents
```

Discount order is a product decision (REQ-023 已定: 先倍率后折扣). `computeDiscountCents` handles percent (floor) and fixed (min with total).

## Response Shape

```ts
{
  sizeName: string
  basePrice: number
  addonItems: Array<{ name, quantity, unitPrice, amount, source }>
  subtotal: number
  usageMultiplier: { name, factor } | null
  rushMultiplier: { name, factor } | null
  multiplierTotal: number
  discount: { code, type, value, amount } | null
  totalPrice: number        // 元
  totalPriceCents: number   // 分（后端存储用）
}
```

## Test Coverage Checklist

- [ ] Pure base price (no addons/multipliers/discount)
- [ ] Each control type (switch/quantity/radio)
- [ ] Radio: missing optionLabel → 400, invalid optionLabel → 400
- [ ] Size override price (source = 'size_override')
- [ ] Style override price (source = 'style_override')
- [ ] Hidden addon at size → 400
- [ ] Usage multiplier alone
- [ ] Usage + rush stacked
- [ ] Discount percent (先倍率后折扣)
- [ ] Discount fixed (capped at total)
- [ ] Full combo (size + addons + multiplier + discount)
- [ ] Size not found / wrong artist → 404
- [ ] Inactive style → 404
- [ ] Disabled addon → 404
- [ ] Duplicate addonId → 400
- [ ] Invalid multiplier → 404
- [ ] Discount disabled → DISCOUNT_DISABLED
- [ ] Route-level: 200 / 404 / 400 / additionalProperties strip
