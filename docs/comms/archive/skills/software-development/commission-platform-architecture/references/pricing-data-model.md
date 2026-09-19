# Pricing Data Model & API Reference

Full schema and endpoint specs for the commission pricing calculator.
Companion to the "Pricing Architecture" section in SKILL.md.
**Implemented**: migration v9, 103/103 tests, pricing.service.test.js (29 cases).

## Schema DDL (migration v9 — v8 was taken by template_id)

```sql
-- 增项目：画师自定义的加价项
CREATE TABLE IF NOT EXISTS price_addons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id   INTEGER NOT NULL,
  category    TEXT NOT NULL CHECK(category IN
              ('expression','outfit','background','weapon','other')),
  name        TEXT NOT NULL,
  price_type  TEXT NOT NULL DEFAULT 'fixed' CHECK(price_type IN ('fixed','percent')),
  price_value REAL NOT NULL,          -- fixed: ¥ amount; percent: 0.3 = 30%
  select_mode TEXT NOT NULL DEFAULT 'quantity'
              CHECK(select_mode IN ('quantity','toggle','inquiry')),
  max_qty     INTEGER DEFAULT 5,      -- only used when select_mode='quantity'
  description TEXT,                   -- client-facing explanation
  sort_order  INTEGER DEFAULT 0,
  enabled     INTEGER DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_addons_artist ON price_addons(artist_id, sort_order);

-- 增项 ↔ 档位 可见性关联（多对多）
CREATE TABLE IF NOT EXISTS addon_tiers (
  addon_id INTEGER NOT NULL,
  tier_id  INTEGER NOT NULL,
  PRIMARY KEY (addon_id, tier_id),
  FOREIGN KEY (addon_id) REFERENCES price_addons(id) ON DELETE CASCADE,
  FOREIGN KEY (tier_id)  REFERENCES price_tiers(id)  ON DELETE CASCADE
);

-- 倍率项：用途倍率 / 加急倍率
CREATE TABLE IF NOT EXISTS price_multipliers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id   INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('usage','rush')),
  name        TEXT NOT NULL,
  multiplier  REAL NOT NULL DEFAULT 1.0,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  enabled     INTEGER DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_multipliers_artist ON price_multipliers(artist_id, type);

-- 订单价格明细（下单时快照，不可变）
CREATE TABLE IF NOT EXISTS order_price_breakdown (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL,
  item_type    TEXT NOT NULL CHECK(item_type IN ('tier','addon','usage','rush')),
  item_name    TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,      -- contribution in cents
  multiplier   REAL DEFAULT 1.0,      -- records multiplier value for usage/rush lines
  quantity     INTEGER DEFAULT 1,     -- addon quantity
  sort_order   INTEGER DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- orders 表新增字段（ALTER in migration）
ALTER TABLE orders ADD COLUMN total_price_cents INTEGER;
ALTER TABLE orders ADD COLUMN usage_multiplier_id INTEGER;
ALTER TABLE orders ADD COLUMN rush_multiplier_id INTEGER;
```

## Calculation Logic (pricing.service.js)

```js
// calculatePrice(artistId, { tierId, addons, usageMultiplierId, rushMultiplierId })
// Returns { basePrice, addonTotal, subtotal, usageMultiplier, rushMultiplier,
//           totalPrice, totalPriceCents, installments, breakdown }

const base = tier.price
for (const sel of addons) {
  const addon = getAddon(sel.addonId)  // must be enabled + linked to tier
  if (addon.select_mode === 'inquiry') → amount = 0, skip
  const qty = addon.select_mode === 'toggle' ? 1 : sel.quantity
  if (qty > addon.max_qty) → throw ADDON_MAX_QTY
  const unit = addon.price_type === 'percent' ? base * addon.price_value : addon.price_value
  addonTotal += unit * qty
}
subtotal = base + addonTotal
usageMult = max(selected) or 1.0    // take HIGHEST
rushMult  = selected or 1.0         // stacks with usage
total = subtotal × usageMult × rushMult
installments = stages.filter(takes_payment).map(s => total × s.basis_points / 10000)
```

## API Endpoints (12 total)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/artist/addons` | artist | List own addons (with tierIds array) |
| POST | `/api/artist/addons` | artist | Create addon (body.tierIds optional; empty = all tiers) |
| PUT | `/api/artist/addons/:id` | artist | Update addon fields + tierIds |
| DELETE | `/api/artist/addons/:id` | artist | Delete addon |
| PUT | `/api/artist/addons/reorder` | artist | Drag-sort (orderedIds array) |
| PUT | `/api/artist/addons/:id/tiers` | artist | Update tier links only (drag-to-shelf) |
| GET | `/api/artist/multipliers` | artist | List own multipliers |
| POST | `/api/artist/multipliers` | artist | Create multiplier |
| PUT | `/api/artist/multipliers/:id` | artist | Update multiplier |
| DELETE | `/api/artist/multipliers/:id` | artist | Delete multiplier |
| GET | `/api/public/pricing/:subdomain` | none+RL | Tiers (with addons) + multipliers + installments |
| POST | `/api/public/calculate-price` | none+RL | **Stateless** calc: selections → breakdown |

`calculate-price` request:
```json
{
  "subdomain": "alice",
  "tierId": 3,
  "addons": [{ "addonId": 12, "quantity": 2 }],
  "usageMultiplierId": 7,
  "rushMultiplierId": null
}
```
Response:
```json
{
  "basePrice": 200,
  "addonTotal": 110,
  "subtotal": 310,
  "usageMultiplier": 1.5,
  "rushMultiplier": 1.0,
  "totalPrice": 465,
  "totalPriceCents": 46500,
  "installments": [
    { "label": "定金", "basisPoints": 3000, "amount": 139.5 },
    { "label": "尾款", "basisPoints": 7000, "amount": 325.5 }
  ],
  "breakdown": [
    { "type": "tier", "name": "全身像", "amount": 200, "quantity": 1, "multiplier": 1.0 },
    { "type": "addon", "name": "表情差分 ×2", "amount": 30, "quantity": 2, "multiplier": 1.0 },
    { "type": "addon", "name": "复杂背景", "amount": 80, "quantity": 1, "multiplier": 1.0 },
    { "type": "usage", "name": "商用授权 ×1.5", "amount": 155, "quantity": 1, "multiplier": 1.5 }
  ]
}
```

## Order Integration

`createOrder()` in order.service.js:
1. Calls `calculatePrice()` when tierId present
2. Writes `orders.total_price_cents`, `price_snapshot` (= basePrice), multiplier IDs
3. Generates `quote_snapshot` string from breakdown (format: "档位名 ¥X + 增项A×n ¥Y，倍率×z → 总价 ¥T"; null when no tierId)
4. Inserts `order_price_breakdown` rows (one per breakdown item)
5. Inserts `order_payment_installments` rows (one per payment stage)
6. All within the same DB transaction as order creation

## v0.11 Additions (migration v11)

### New orders columns

```sql
ALTER TABLE orders ADD COLUMN quote_snapshot TEXT;           -- human-readable price string
ALTER TABLE orders ADD COLUMN final_price_cents INTEGER;     -- artist-overridden final price (cents)
ALTER TABLE orders ADD COLUMN focus_image_path TEXT;         -- designated reference image path
ALTER TABLE orders ADD COLUMN focus_image_mode TEXT DEFAULT 'off';  -- 'off'|'small'|'large'
```

### New artists columns

```sql
ALTER TABLE artists ADD COLUMN dashboard_default_panel TEXT; -- artist dashboard default tab
ALTER TABLE artists ADD COLUMN revision_note TEXT;           -- public revision policy note
```

### New API endpoints (v0.11)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| PUT | `/api/artist/orders/:id/price` | artist | Set final_price_cents (1..99999999) + optional quoteSnapshot override. Auto-appends system note. |
| PUT | `/api/artist/orders/:id/focus-image` | artist | Set focus image (imagePath must be an existing order_reference) + mode |
| DELETE | `/api/artist/orders/:id/references/:refId` | artist | Delete reference image; auto-clears focus fields if it was the focus image |

### New error codes (v0.11, 4 new)

INVALID_PRICE, FOCUS_IMAGE_NOT_FOUND, FOCUS_IMAGE_NOT_OWNED, INVALID_FOCUS_MODE

### Revenue stats change (BREAKING)

`getArtistStats()` return field renamed: `monthRevenue` → `monthRevenueCents` (unit changed from yuan to cents). Fallback chain: `final_price_cents` → `total_price_cents` → `price_snapshot × 100`. Frontend must adapt.

## Frontend Components

**Unified admin page**: `TierManage.vue` is now the single "价格管理" page with 4 lazy tabs (档位 | 增项 | 倍率 | 流程与比例). Settings.vue no longer has addon/multiplier tabs.

| Component | Location | Interaction |
|-----------|----------|-------------|
| TierManage.vue | views/artist/ | **Hub page**: 4-tab layout hosting all pricing config |
| AddonManager.vue | components/artist/ | Left-right dual-column: addon library (vuedraggable sort) → tier shelf (cross-column drag to link). Chip ✕ to unlink. Inline edit dialog. **openCreate() pre-fills name from inline input.** |
| MultiplierManager.vue | components/artist/ | Two groups (usage/rush), number input, enable toggle. No drag. |
| OrderForm.vue | views/client/ | Tier select → category-collapsed addons → quantity stepper / switch / 面议 tag → usage/rush radio → debounced live total + installment chips |
| ArtistHomeDefault.vue | views/client/templates/ | Tier cards show addon tags; separate "附加费用" section for multipliers |

**Known fix**: percent/fixed mode toggle in AddonManager uses `watch(priceType)` to reset value (0.3 for percent, 10 for fixed) — prevents "1000%" display bug.

## Error Codes (15 pricing-related)

ADDON_NOT_FOUND, ADDON_NAME_EMPTY, ADDON_INVALID_PRICE, ADDON_INVALID_MODE,
ADDON_MAX_QTY, ADDON_NOT_FOR_TIER, MULTIPLIER_NOT_FOUND, MULTIPLIER_INVALID,
PRICING_TIER_REQUIRED, PRICING_CALC_FAILED, INVALID_PRICE, FOCUS_IMAGE_NOT_FOUND,
FOCUS_IMAGE_NOT_OWNED, INVALID_FOCUS_MODE (+ RATE_LIMITED reused)

All have ERROR_MESSAGES Chinese mappings. Total error codes in project: ~75.

## Design Decisions Log

- **Percent base locked to tier price**: non-coder artists can't reason about "base vs subtotal"; 5-7% difference not worth complexity.
- **Usage = take highest**: ×1.5 × ×2.0 = ×3.0 is unintuitive; highest is predictable.
- **Rush stacks with usage**: both genuine cost drivers; show as separate lines.
- **Visibility via junction table**: avoids N×M grid; artist creates addon once, checks tiers.
- **No per-tier price override in v1**: defer; add `price_override` to addon_tiers if demanded.
- **select_mode 'inquiry'**: custom items can't be auto-priced; flag for negotiation.
- **Cross-column drag (not checkbox matrix)**: user's "store counter" metaphor; vuedraggable `group: { pull: 'clone', put: true }`.
- **Debounced calculate (300ms)**: avoids API spam on stepper clicks.
