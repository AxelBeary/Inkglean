---
name: commission-platform-architecture
description: "Architecture patterns for multi-tenant commission/marketplace platforms — templated user pages, embeddable widgets, and custom page hosting. Covers the three-layer page system for offering hosted templates while allowing external-site integration."
version: 1.0.0
author: Hermes Agent
---

# Commission Platform Architecture

Multi-tenant commission platforms where each user (artist, creator, freelancer) has a public-facing page with ordering capabilities. This skill covers the architecture decision for offering **both** built-in hosted templates **and** allowing creators with their own sites to integrate.

## Three-Layer Page System

The central architecture pattern: support creators at three levels of technical ability and independence.

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Custom Page Hosting                   │
│  Upload your own HTML/CSS/JS → served at        │
│  /artist/alice (static files from uploads/)      │
├─────────────────────────────────────────────────┤
│  Layer 2: Embeddable Widget                     │
│  Paste one <script> tag on your existing site   │
│  → "Book Commission" button + order form         │
├─────────────────────────────────────────────────┤
│  Layer 1: Built-in Templates                    │
│  Pick a layout variant, zero setup             │
│  → Full page at /artist/alice                   │
└─────────────────────────────────────────────────┘
```

### Layer 1: Built-in Templates

**Who it's for**: Creators who don't have their own website or don't want to maintain one.

**Implementation**: Vue components with CSS Variables theming.

```js
// Route: /artist/:subdomain
routes.get('/artist/:subdomain', async (req, reply) => {
  const artist = await artistService.getBySubdomain(req.params.subdomain)
  
  if (artist.page_type === 'default') {
    // Render built-in Vue SPA (or SSR)
    // page_theme field controls which template variant
    return reply.sendFile('index.html')
  }
  // ... fall through to layers 2-3 handled elsewhere
})
```

**Template = Layout × Palette (orthogonal axes)** — the single most important modeling decision. If two "templates" differ mostly in color, they are NOT two templates — they are one layout wearing two colorways. Bundling color into the template dimension inflates template count with duplicated structure code (users will call this out: "these look like the same page in different colors"). Split into axes the artist picks independently:

| Axis | Who picks | Examples | Controls |
|------|-----------|----------|----------|
| **Layout** (structure) | Artist | classic (two-column studio) / gallery (full-screen museum) / folio (single-page landing) / atelier (book-style warm studio) | Opening treatment, column logic, gallery shape, navigation |
| **Palette** (mood) | Artist | paper / ink / dusk / moss — each defined with light AND dark variants | Page ground/surface/text colors (`--pal-*` CSS vars) |
| **Accent + mode** | Visitor | 5-color accent picker + light/dark preference | `--color-primary`, `html.dark` |

Key rules:
- A palette is a **mood with light+dark variants**, never "the dark theme". Artist picks `ink`; light-mode visitors see pale grey, dark-mode visitors see charcoal — mood stays consistent, brightness follows the visitor.
- Accent color (buttons/links/highlights) always uses the visitor's accent variable (`--color-primary`), never palette vars — the two systems stay orthogonal and both keep working.
- 4 layouts × 4 palettes = 16 distinct looks from 8 definitions.
- Layouts must differ **structurally** (different opening, different column logic) or they should be merged into one layout.

Layout archetypes that work — each opens with the artist's most distinctive asset (their art), not a generic centered name+bio+buttons hero:

| Layout | Opening | Signature move |
|--------|---------|----------------|
| gallery | Full-viewport artwork, name as small corner plaque | Editorial large/small alternating gallery, hover zoom, click preview |
| classic | Signature-work banner, name overlaid on the art | Desktop two-column, sticky info card with always-visible commission CTA |
| folio | Split screen: text left, stacked artworks right | Scroll-tracking nav highlight, mobile hamburger + sticky bottom CTA |
| atelier | Warm book-style spread, serif typography (Noto Serif SC) | Paper-texture ground, editorial margins, generous whitespace, art-forward with literary mood |

Shared-kit architecture (proven): templates never read backend field names directly — one adapter composable (`useArtistData(props)`) provides `imgUrl()`, `statusText()` (i18n), `socialLinks`, `heroArtwork`; reusable `Tpl*` components take variants via props (`TplHero variant="banner|fullscreen|split"`, `TplGallery layout="grid|editorial|masonry"`) with slots as extension points (`#addons` on the tier grid). See `references/template-system.md` for the full pattern including async-component timing fixes and legacy ID mapping.

**Artist-set accent color override (R49 pattern)**: The artist can set a persistent accent color (5-color whitelist, stored as `artists.accent_color TEXT`) that overrides the visitor's ThemePicker choice on their public page. Implementation in ArtistHome.vue:
```js
const ACCENT_INDEX = { '#34dbcb': '1', '#34c2db': '2', '#3498db': '3', '#346edb': '4', '#3445db': '5' }
const accentOverride = computed(() => {
  const raw = previewAccent.value || artist.value?.accentColor
  return raw ? (ACCENT_INDEX[String(raw).toLowerCase()] || null) : null
})
// watch(immediate) + onUnmounted: save/restore document.documentElement.dataset.accent
```
Key decisions: (1) Global `data-accent` attribute injection — NO per-template CSS variable changes needed (theme.css already has `data-accent="1"~"5"` selectors with light+dark variants). Adding accent support to all 4 templates = zero template file changes. (2) Artist accent takes priority over visitor ThemePicker while on the artist's page; visitor choice restored on `onUnmounted`. (3) Backend validates against 5-color whitelist + null (clear); `toLowerCase()` normalization on write. (4) Settings UI: circular swatch buttons (32px) with ✓ check on active + "默认" clear button. NOT el-color-picker (free-form color would break the whitelist). (5) C61 decision: accent only affects client-facing pages, NOT the artist dashboard.

**Preview mode via URL params (R50 pattern)**: Settings "预览主页" button opens `/artist/:subdomain?_tpl=X&_pal=Y&_accent=Z` in a new window. ArtistHome.vue reads `route.query._tpl/_pal/_accent` as render-layer overrides (never writes to data layer). A sticky warning banner ("预览模式 — 修改尚未保存") shows when any preview param is present. Template/palette/accent computeds fall through: `previewParam || artist.field || default`. Safe for public access — preview params only affect rendering, all data comes from the public API.

**Activity timeline replacing flat notes list (R40 pattern)**: When merging status-change records (system notes) and artist notes into a single chronological view, use `el-timeline` with type/hollow differentiation:
```html
<el-timeline-item :type="note.created_by === 'system' ? 'info' : (note.image_path ? 'success' : 'primary')"
  :hollow="note.created_by === 'system'" :timestamp="formatDate(note.created_at)" placement="top">
```
Type indicators: 🔄 status change / 📝 note / 🖼 note with image. System notes get `tl-item--system` class (muted color, smaller font). Delete button (R46) only shows for non-system notes, hover-reveal with `@media (hover: none)` touch fallback. Input box moves to timeline bottom. **Zero backend changes** — system notes already exist in `order_notes` with `created_by='system'`. The operation bar (advance/rollback/cancel) stays OUTSIDE the timeline card.

**Drag-replace with context-dependent confirm behavior (R53 vs R55)**: Two drag-to-replace features in the same app have DIFFERENT confirm requirements — do NOT unify them:
| | R53 Queue board focus image | R55 Tier example image |
|---|---|---|
| Overwrite confirm | **No** (old image stays in order gallery) | **Yes** — ElMessageBox.confirm (old image lost) |
| Reason | Replacing focus ≠ deleting the image | Overwriting example = old image unrecoverable |
Implementation: shared drag infrastructure (dragover.prevent/dragleave with `contains(relatedTarget)` anti-flicker/drop.prevent + hidden file input), but the upload function checks `if (row.example_image) { await ElMessageBox.confirm(...) }` only for R55. Both reuse existing upload APIs. The `el-image` `preview-src-list` must be removed from R53's focus image to prevent it swallowing the click event (same trap as R18).

**Order form composable extraction (R58-1 pattern)**: When the order form grows beyond ~400 lines (data loading + pricing + validation + upload + submit + draft recovery), extract ALL business logic into a shared composable (`useOrderForm.js`). The page component becomes pure layout (~300 lines of template + style, script is just `const of = useOrderForm(subdomain, formRef)` + destructuring). The composable returns a flat object of refs/reactives/methods grouped by concern: data loading (artist, tiers, rulesContent, loading), form state + validation rules, submit state (submitting, showSuccess, resultNo, submit), reference images (refFileList, handleRefUpload, handleRefRemove), pricing (addonSelections, pricePreview, pricingExpanded, selectedTier, onTierChange), and sanitized rules HTML. **Why this matters for multi-template**: when the order page supports multiple layout templates (step-by-step, receipt-style, magazine-style), each template is a thin layout shell that calls the SAME composable — zero logic duplication. The composable is the "core", templates are "skins". This is the same adapter pattern as `useArtistData` for the homepage, applied to the order form. Key implementation detail: the composable takes `formRef` (the el-form ref from the template) as a parameter because validation (`formRef.value.validate()`) must call into the template's form element — the composable owns logic but NOT the DOM.

**Step-by-step order form layout (R58-2 pattern, proven)**: The default order layout is a three-step guided flow built entirely on `useOrderForm()` (zero composable changes from R58-1 — validates the extraction):
- **Step indicator**: three numbered dots + connecting lines. Current: enlarged + primary. Done: ✓ + primary fill. Pending: grey hollow. Mobile (≤860px): dots only.
- **Step 1 — Pick tier**: responsive card grid (`repeat(auto-fill, minmax(240px, 1fr))`) replacing `el-select`. Selected: `--ease-bounce` transition + rotating stamp ✓ (`@keyframes tier-stamp-in`: scale 0→1.2→1, rotate -15°→0°). R14 progressive disclosure stays inside step 1.
- **Step 2 — Describe + upload**: textarea + **inspiration tags** (R58-4: hardcoded default chips, click appends with smart comma + 2000-char truncation) + reference upload (file + paste unchanged).
- **Step 3 — Contact**: QQ + name + rules agreement.
- **Sticky summary card**: wide-screen right column (280px sticky), real-time tier + breakdown + total + installments. Mobile: bottom of active step.
- **Receipt confirmation (R58-3)**: submit → validate → café-receipt `el-dialog` (teleported to body, global CSS `receipt-*` namespace in `templates.css`). Paper `#fdfbf5`, Courier monospace, zigzag edges (`repeating-conic-gradient`), dashed separators, barcode decoration, installment chips. Fixed light theme (paper metaphor). Cancel returns to step 3; confirm calls `submit()`.
- **Copy order info (R58-5)**: success dialog "复制约稿信息" → multi-line clipboard (order no + tier + addons + total).
- **Step navigation**: "下一步" validates current step before advancing; "上一步" always allowed; no skipping.

**Multi-template order page (R58 architecture)**: The order page supports artist-selectable layout templates, independent from the homepage template. **Backend (proven, migration v16)**: `artists.order_template_id TEXT DEFAULT 'default'` — service-layer whitelist validation (`ORDER_TEMPLATES = ['default']`, extend array when adding templates). `GET /api/artists/:subdomain` returns `orderTemplateId: artist.order_template_id || 'default'`. `PUT /api/artist/profile` accepts `orderTemplateId` (mapped via keyMap to `order_template_id`). Invalid values throw `INVALID_ORDER_TEMPLATE` (409). Empty string falls back to `'default'`. **Frontend**: Artist settings page shows a card-style template picker (same UI pattern as homepage template selection). Client-side routing: OrderForm.vue reads `artist.orderTemplateId` and renders the corresponding layout component via `<component :is="...">` or a template registry map. All layout components share `useOrderForm()` — they differ ONLY in visual arrangement (step indicators, card layout, confirmation dialog style). Adding a new order template = one new .vue file with a layout shell + one entry in the backend whitelist array, zero logic changes. Preview: reuse the `_tpl` URL param mechanism from homepage preview.

**QQ contact pattern (R58-6)**: Two affordances for QQ contact: "跳转QQ" (`window.open('tencent://message/?uin=' + encodeURIComponent(qq), '_self')`) + "复制QQ" (`navigator.clipboard.writeText(qq)` with toast). Clipboard fallback: on failure (permissions denied, non-HTTPS), show `ElMessage.warning(qq)` — the QQ number itself as the warning message, so the user can manually copy from the toast. Applied in two places: client-side success dialog (artist's contactQq) and artist-side order detail (client's qq). i18n: separate keys per context (`orderForm.jumpQq` vs `orderDetail.jumpQq`) because the toast message differs ("QQ号已复制" vs "客户QQ已复制").

**CSS craft upgrade patterns (v0.16 batch1, proven)**:
- **Global bounce easing**: `--ease-bounce: cubic-bezier(.34, 1.56, .64, 1)` in `:root`. Use for transform/box-shadow transitions ONLY (never opacity — can't overshoot 1.0). Fallback in consuming code: `var(--ease-bounce, cubic-bezier(0.22, 1, 0.36, 1))`.
- **Button three-state physical model**: `.el-button:hover:not(:disabled):not(.is-loading) { transform: translateY(-3px); box-shadow: deeper }` + `:active { transform: translateY(-1px) scale(0.98) }`. The `:not()` exclusions prevent disabled/loading buttons from animating.
- **`clamp()` fluid typography**: replace fixed px with `clamp(min, vw-preferred, max)` — e.g., `font-size: clamp(30px, 5vw, 40px)`. Apply to page titles, section headings, CTA text. Mobile overrides also use clamp (not a fixed smaller px).
- **`minmax(0, 1fr)` grid overflow prevention**: any grid column using bare `1fr` that may contain long URLs or unbreakable text → `minmax(0, 1fr)`. Allows the column to shrink below content's intrinsic width.
- **`prefers-reduced-motion` global kill switch**: one media query at the end of theme.css: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }`. Accessibility + performance fallback in 5 lines.

**Key design principles** for all templates:
- Works images as visual hero, not decorative elements
- Navigation ≤ 6 links, does not compete with visuals
- Price displayed openly on cards ("$20 — $50" not "DM for price")
- Open/Closed/Waitlist status prominently shown
- Dark mode as default for art portfolios (makes colors pop)
- Page weight < 200KB preferably (< ~50KB for single-page variants)
- Mobile-first (most traffic arrives from social media on phones)

### Layer 2: Embeddable Widget

**Who it's for**: Creators who already have a personal site (Carrd, Framer, custom HTML, Squarespace, etc.) and just need ordering capabilities.

**This is the highest-ROI layer** — it is the lowest-friction path for real artists who already have their own portfolio to use your platform.

**Architecture**:

```
┌─ Creator's existing site ──────────────────────┐
│  (their own design, untouched)                  │
│                                                  │
│  ┌─ <script src="platform.com/embed.js?artist=a"> ──┐
│  │  <div id="huiyue-commission"></div>               │
│  │  (renders as an overlay/toast/side-panel)        │
│  └──────────────────────────────────────────────────┘
└──────────────────────────────────────────────────┘
      │
      │ API calls
      ▼
┌─ Your platform backend ────────────────────────┐
│  GET /api/public/artist/alice/pricing           │
│  POST /api/public/orders (create order)         │
│  GET /api/public/orders/ALICE-003               │
└──────────────────────────────────────────────────┘
```

**Technical implementation**:

1. Build the widget as a **self-contained Vue component** compiled to:
   - UMD bundle for `script` tag inclusion (Vue 3 + Element Plus tree-shaken)
   - OR Web Component (no framework conflict)

2. The embed `<script>` fetches widget config from the server:
   ```js
   // embed.js
   (function() {
     const artist = document.currentScript.getAttribute('artist')
     const container = document.getElementById('huiyue-commission')
     // Load platform specific data & render
     // Available as UMD or Web Component
   })()
   ```

3. **Public API endpoints** (no auth required, rate-limited):
   - `GET /api/public/artist/:subdomain/pricing` — price tiers + open status
   - `GET /api/public/artist/:subdomain/info` — artist name, greeting, TOS summary
   - `POST /api/public/orders` — create order (need client QQ/contact)
   - `GET /api/public/orders/:orderNo` — status/queue tracking

**Embed CSP posture — `frame-ancestors *` is a phishing/clickjacking hole.** An embed page designed to be iframed onto artists' external sites is tempting to ship with `Content-Security-Policy: frame-ancestors *` so any site can embed it. But `*` lets a *malicious* site embed the legitimate order form too — wrapping it in fake context ("限时半价") or overlaying transparent clickjacking layers. **Decision rule**: if no artist is actually using the embed yet (feature just launched), tighten to `frame-ancestors 'self'` NOW and mark the UI "嵌入功能暂未开放，敬请期待" (disable the copy button). Reopen via a whitelist mechanism later (artist configures allowed domains → backend generates a dynamic `frame-ancestors` list), ideally tied to the custom-subdomain feature. Don't ship `*` "temporarily" — the temporary becomes permanent. A full embed CSP, not just frame-ancestors: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; connect-src 'self'`. Non-embed paths keep `X-Frame-Options: DENY` **and** get their own CSP (v0.15 audit fix): `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'`. **`'unsafe-eval'` in script-src is MANDATORY** — Vue 3's runtime template compiler uses `new Function()` to compile render functions; without it, the entire SPA white-screens with `EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive` (2026-07-30 production incident). The only way to avoid `unsafe-eval` is a full build-time template compilation (vue-tsc / @vitejs/plugin-vue with `template.compilerOptions`), which this project does NOT use. Note `blob:` in img-src (needed for client-side image previews) and `font-src 'self'` (self-hosted fonts). The embed CSP intentionally omits `blob:`, `font-src`, and `unsafe-eval` (tighter surface for iframed content — embed pages use pre-compiled render functions, no runtime compilation). Implementation: in the `onRequest` hook, the `if (url.startsWith('/embed'))` branch sets the embed CSP; the `else` branch sets X-Frame-Options + the main-site CSP. **CSP changes MUST be verified in a real browser after deployment** — test suites (`app.inject()`) do not exercise CSP enforcement; only a real browser will block `new Function()` and show the white screen. SRI on the embed `<script>` and CSRF on the public order POST are real but lower-priority — schedule them as a follow-up batch, don't block the frame-ancestors fix on them.

### Layer 3: Custom Page Hosting

**Who it's for**: Power users who understand HTML/CSS/JS or use Framer/Webflow and want full creative control.

**Implementation**: Serve uploaded static files at the artist's subdomain.

```
uploads/pages/alice/
  ├── index.html      ← main page (served at /artist/alice)
  ├── style.css
  └── assets/
      └── hero.png
```

**Route logic**:

```js
// Fastify route
if (artist.page_type === 'custom') {
  return reply.sendFile(`uploads/pages/${artist.subdomain}/index.html`)
}
```

**Security considerations**:
- Sanitize uploaded ZIPs (no server-side scripts, no symlinks)
- File extension whitelist: `.html`, `.css`, `.js`, `.png`, `.jpg`, `.webp`, `.woff2`
- Maximum upload size (e.g., 10MB)
- Use `helmet` CSP to restrict custom pages
- Custom page gets access to public API endpoints (same as embed widget)

## Decision Matrix

| Criterion | Built-in Templates | Embed Widget | Custom Page |
|-----------|-------------------|-------------|-------------|
| Development effort | Medium (2-3 templates) | **Medium** (one widget to build) | Low (static file serving) |
| Artist effort | Zero (pick a template) | **Low** (copy-paste one line) | High (design & upload) |
| Artist retains own site design | ❌ | ✅ | ✅ |
| Artist controls layout | Limited | ✅ | Full |
| Platform visibility / branding | ✅ Full | ✅ (button/badge) | ❌ (if artist removes it) |
| Order data integration | Automatic | Via API | Via API |
| Priority | 2nd (expand existing) | **1st (highest ROI)** | 3rd (defer) |

## Design Research Methodology

### Visual Prototype Workflow (for non-technical operators)

When the operator (non-programmer) wants to influence visual design (e.g., "约稿页太丑，我想改"), the correct workflow is NOT "copy someone's code" or "paste AI-generated HTML into the project". It's:

1. **Browse for visual language, not code**: look at other artist sites, Dribbble, AI-generated pages. Extract what you like: "这个间距舒服", "这个价格表交互好", "这个配色高级". Screenshots + annotations = the design brief.
2. **AI-generate prototypes as visual anchors**: use LLMs to generate 2-3 style variants of the target page (HTML, viewable in browser). Feed project constraints: existing color palette hex values, font (霞鹜文楷), framework feel (Element Plus), language (中文). Pick the closest match, annotate differences.
3. **Hand prototype to implementation team**: the prototype is a REFERENCE, not source code. The frontend agent implements it as Vue components with proper i18n, API integration, and responsive behavior. Static HTML ≠ Vue SFC — never try to directly convert.

**Why this works**: R30a accident lesson — verbal design decisions get misinterpreted without visual anchors. A screenshot/prototype gives the implementer a pixel-level target, dramatically reducing rework.

**F12 copying is forbidden**: legal risk (copyright), technical mismatch (static HTML vs Vue components), and the rework cost exceeds writing from scratch. Looking for inspiration is fine; copying code is not.

### Color Palette Design Principle (artist platform ≠ SaaS)

External reviewers may flag the 5-color cold-spectrum accent palette as "generic tech blue" or "lacks brand memory". **Do not change functional colors based on SaaS/AI aesthetic advice.** Rationale:

- **Domain mismatch**: advice optimized for "AI product / SaaS / 液态玻璃" is wrong for an artist commission platform. Artists evaluate "这个画师的主页好不好看", not "这个平台够不够科技".
- **Functional sufficiency**: 5 colors are distinguishable, work in light+dark mode, don't clash with artwork (the actual visual hero).
- **Change cost is non-trivial**: backend whitelist + frontend presets + theme.css selectors × light/dark + existing artist migration + 4 template regression.
- **Real visual impact comes from layout, not hue**: spacing, typography hierarchy, and information architecture matter 10× more than whether the blue is `#3498DB` or `#60A5FA`.

**When to revisit**: brand identity pass (Logo, landing page, marketing) can have a separate brand palette. Platform functional colors and brand colors coexist independently. v1.0+ concern.

### Benchmark Sources

When looking for design benchmarks for a commission/personal page:

1. **Search sources** (in order of utility):
   - Actual artist/creator personal websites (highest relevance)
   - Awwwards → Art category (highest design quality)
   - Dribbble / Behance → search "commission page", "artist portfolio", "pricing table"
   - Platform sites (VGen, Ko-fi commissions, Artistree) — for UX patterns

2. **Analysis dimensions** for each benchmark:
   - URL, tech stack (Squarespace/Framer/custom)
   - Page weight / load speed
   - Color palette (specific hex values)
   - Typography (font stack, size hierarchy)
   - Layout structure (navigation → hero → gallery → pricing → contact)
   - Information architecture (what sections, in what order)
   - One best-in-class detail to steal

3. **Common pitfalls** in design research:
   - Don't rely on search engines' featured snippets (they aggregate, not inspect)
   - Many real artist sites are on Squarespace/Wix — still valid to reference
   - Platform sites (VGen, Ko-fi) are good for UX patterns but NOT good substitutes for personal page design

## Pricing Architecture

Commission pricing is a **base + addons + multipliers** model. The client experience is a "store counter" metaphor: pick a base tier → enter a counter → select addons with quantities → see live total + installment breakdown.

### Data Model (3 tables)

```
price_addons          — artist-defined add-on items
  category            'expression'|'outfit'|'background'|'weapon'|'other'
  price_type          'fixed' (¥80) | 'percent' (+30% of base tier price)
  select_mode         'quantity' (×N stepper) | 'toggle' (on/off) | 'inquiry' (contact artist)
  max_qty             cap for quantity mode

addon_tiers           — many-to-many visibility filter
  addon_id + tier_id  addon only shown when client picks a linked tier

price_multipliers     — usage/rush multipliers
  type                'usage' | 'rush'
  multiplier          1.5, 2.0, etc.

order_price_breakdown — snapshot at order creation (immutable)
  item_type           'tier'|'addon'|'usage'|'rush'
  amount              contribution in cents
```

### Calculation Formula

```
base       = tier.price
addons     = Σ fixed + Σ (percent × base)     ← percent ALWAYS based on base tier price
subtotal   = base + addons
usage_mult = max(selected usage multipliers)   ← take HIGHEST, don't multiply
rush_mult  = selected rush multiplier          ← stacks with usage
total      = subtotal × usage_mult × rush_mult
installments = total × workflow_stage.basis_points / 10000
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Percent addon base | Always base tier price | Predictable, client can mental-math, avoids order-dependency bugs |
| Usage multipliers | Take highest | Multiplying makes prices explode, clients can't reason about ×3.0 |
| Rush + usage | Stack (multiply) | Both are real cost drivers; show as separate line items |
| Addon visibility | Global addons + per-tier checkbox | Avoids N×M configuration grid; artist creates addon once, checks applicable tiers |
| Addon select modes | quantity / toggle / inquiry | "表情×2" needs stepper; "复杂背景" is binary; "定制挂件" needs negotiation |

### UX Pattern: "Store Counter"

Client flow: pick tier → see only applicable addons (filtered by addon_tiers) → grouped by category (collapsed) → quantity steppers → live total + installment preview. Artist setup: create addons once (name, price, mode, check applicable tiers) ≈ 8 minutes total for a typical artist.

### Implementation Patterns (proven in production)

**Order integration**: `createOrder()` calls `calculatePrice()` inside the same DB transaction. The old manual `price_snapshot = tier.price` is replaced by the full pipeline: calculate → write `orders.total_price_cents` → insert `order_price_breakdown` rows → insert `order_payment_installments` rows. All atomic. If any addon/multiplier validation fails, the entire order creation rolls back.

**Frontend drag-and-drop (vuedraggable cross-list)**:
```html
<!-- Library (left): pull clones into shelf -->
<draggable :group="{ name: 'addons', pull: 'clone', put: false }" ...>
<!-- Shelf (right): accepts drops, no pull out -->
<draggable :group="{ name: 'addons', pull: false, put: true }" @add="onTierDrop" ...>
```
On drop, call `PUT /api/artist/addons/:id/tiers` with the new tierIds array. On chip ✕, remove tierId from array and PUT again. The library list itself uses `:sort="true"` with `@end` → `PUT /api/artist/addons/reorder`.

**Client-side real-time pricing**: OrderForm watches addon selections + multiplier radios with a 300ms debounce → calls `POST /api/public/calculate-price` → renders breakdown + installment chips. The submit button shows the live total. On submit, the same selections are passed to `POST /api/orders` which re-calculates server-side (never trust client math).

**Public pricing endpoint**: `GET /api/public/pricing/:subdomain` returns `{ tiers: [{...tier, addons: [...]}], multipliers, installments }` — one call gives the client page everything it needs to render tier cards with addon tags and the order form's selection UI.

### Order Price Lifecycle (v0.11+)

Orders carry three price representations with a clear precedence:

| Field | Set when | Unit | Mutable? |
|-------|----------|------|----------|
| `price_snapshot` | Order creation (base tier price) | yuan (REAL) | No |
| `total_price_cents` | Order creation (full calculation) | cents (INTEGER) | No |
| `final_price_cents` | Artist manually adjusts price | cents (INTEGER) | Yes (via PUT) |

**Revenue stats fallback chain**: `final_price_cents` → `total_price_cents` → `price_snapshot × 100`. SQL computes in cents internally (`total_cents`). **Canonical implementation (v0.16+)**: `server/src/utils/price.js` exports `PRICE_FALLBACK_SQL` (SQL CASE expression, alias prefix `o`) and `resolvePriceCents(order)` (JS ?? chain). All order queries must import from there — never inline the CASE/?? chain.

**Dual-field return pattern (proven)**: Always return BOTH `monthRevenue` (yuan, REAL — backward compat with existing frontend) and `monthRevenueCents` (cents, INTEGER — future-proof). Never rename an existing API field; add the new one alongside:
```js
return {
  monthRevenue: monthRevenueCents / 100,   // 元, 兼容现有 Dashboard.vue
  monthRevenueCents,                        // 分, R8 仪表盘重构时切换
}
```
⚠️ Renaming `monthRevenue` → `monthRevenueCents` is a **breaking API change** that blocks merge. The dual-field approach costs one line and avoids frontend coordination.

**Quote snapshot string**: Human-readable price summary generated at order creation from the calculation breakdown. Format: `"档位名 ¥X + 增项A×n ¥Y，倍率×z → 总价 ¥T"`. Null for manual orders without pricing. Stored in `orders.quote_snapshot` (TEXT). The artist can override it when changing final price via `PUT /api/artist/orders/:id/price`.

**Final price initialization at creation (proven)**: `createOrder()` sets `final_price_cents = totalPriceCents` in the same INSERT when pricing is available. No pricing (manual order without tier) → `final_price_cents = NULL`. This means self-service orders and priced manual orders start with a final price already set; only unpriced manual orders show "未设置" in the detail page.

**Two-step manual order price override (proven)**: ManualOrder.vue creates the order with server-calculated price, then if the artist manually edited the final price field (different from calculated), calls `PUT /api/artist/orders/:id/price` as a second step. This avoids duplicating price calculation logic in the frontend — the server always computes the canonical price, and the override is a separate explicit action.

**Manual order endpoint backward-compat pattern**: Adding optional fields (`references`, `addons`, `usageMultiplierId`, `rushMultiplierId`, `clientNotify`) to an existing `additionalProperties: false` schema is safe — old callers that don't send these fields get defaults. Always include the same security checks as the self-service endpoint (e.g., C-3 reference path validation).

**Final price modification**: `PUT /api/artist/orders/:id/price` with `{ finalPriceCents: int(1..99999999), quoteSnapshot?: string }`. Validation: positive integer in cents, max 99999999 (¥999,999.99). Auto-appends a system note: `"最终价格从 ¥A 改为 ¥B"` (reuses `addNote` with `created_by='system'`). Old price for the note uses the same fallback chain.

**Client progress timeline API (R11)**: `GET /api/orders/track/:orderNo` returns `workflowStages` (the artist's full workflow stage list via `getWorkflow(order.artist_id)`: `[{id, name, sortOrder, takesPayment, basisPoints, isFinal}]`) alongside `currentStageId` (the order's current stage, or `null`). This lets the client frontend render a progress timeline without a second API call. One lightweight query per track request (typically 3-6 rows).

**Timeline + existing progress display coexistence pattern (proven)**: When adding a workflow-based timeline to a page that already has a status-based progress display (e.g., `el-steps` showing pending→confirmed→wip→done→delivered), KEEP BOTH. The status-based display works immediately (derived from `order.status`); the workflow timeline depends on `current_stage_id` which may not be populated yet (column absent or never written). Removing the working display to replace it with an all-grey timeline is a regression. Layout: status steps first (always active), timeline below (activates when backend data arrives), hint text explaining "waiting for artist to confirm" when `currentStageId == null`.

**OrderTimeline component pattern**: Express-delivery tracking bar metaphor. Desktop horizontal / mobile vertical via CSS media query (640px). Node states: done (✓ + primary fill), current (highlight + pulse animation via `@keyframes tl-pulse`), pending (grey hollow). Payment nodes show 💰 + percentage. `currentStageId == null` → all pending. `prefers-reduced-motion: reduce` disables pulse. Props: `stages` (array), `currentStageId` (Number, default null), `vertical` (Boolean). Uses `computed` for sorted stages (defensive sort by `sortOrder`). Scoped styles with CSS variable fallbacks (`var(--el-color-primary)`, `var(--border-color, #dcdcdc)`).

**Frontend-computed progress from existing fields (S2 pattern)**: When a dispatch asks for a progress display ("节点名 X/Y" + progress bar) and claims the data comes from a backend field (`stageProgress: { current, total }`), first check whether the frontend ALREADY receives enough to compute it. The client track API returns `workflowStages` (full stage list with `sortOrder`) + `currentStageId` — from which a `computed()` derives `{ name, current: idx+1, total: length, pct: Math.round((idx+1)/length*100) }` with zero backend changes. Decision rule: compute client-side when the raw data is present; only request a new backend field when it genuinely isn't available. Render with `el-progress :percentage="pct"` + a label using an i18n key with named params (`progress: '{name} {current}/{total}'`). For rollback state, show the rolled-back node NAME (`revisionAt: '已回退到「{name}」'`), never the raw status string "revision".

**Zero-style shared component + native form elements for multi-skin features (F4 guestbook pattern)**: When a feature must appear on all 4 templates with DISTINCT visuals (the "共享逻辑不共享皮肤" hard rule) and includes a FORM, use NATIVE `<input>`/`<textarea>`/`<button>` in the shared component — NOT Element Plus controls. EP controls render deep internal structure (`.el-input__wrapper`, `.el-textarea__inner`) that templates' `:deep()` skinning must fight through; native elements expose clean semantic classes the template styles directly. The shared component: zero `<style>` block, only semantic `gb-*` classes (`gb-form`/`gb-input`/`gb-textarea`/`gb-submit`/`gb-item`/`gb-nickname`/`gb-content`/`gb-reply`/`gb-empty`/`gb-load-more`), props for data (`subdomain`), and all logic (pagination, submit, 429 handling, empty state). Each template skins via `.classic-guestbook :deep(.gb-input) { ... }` — 4 genuinely different treatments (classic rounded card / gallery 展签 underline-only inputs + uppercase tracking / folio editorial borderless / atelier serif paper-note with `rotate(±0.4deg)`). Pagination: `PAGE_SIZE = 20` + `hasMore = messages.length < total` + load-more button; submit shows a `justSubmitted` pending hint; 429 → `ElMessage.warning(rateLimited)`.

**Missing backend endpoint: build UI + silent fallback + flag (F4 admin pattern)**: A dispatch contract may list an endpoint the backend never implemented (admin guestbook had public/artist/DELETE routes but no `GET /api/admin/messages`). Correct response: build the UI per contract (table columns, delete action), wrap the initial load in `try/catch` with a silent empty-state fallback (no error toast — the endpoint arrives soon), add the API method to `api/index.js` so it's ready, and flag prominently in comms (⚠️ "后端缺 X 端点，前端已按契约构建，加载失败静默降级，三号补端点即激活"). Not a submission blocker — the frontend is correct; the gap belongs to the backend role. Distinct from contract-first parallel work (branch exists but unmerged): here the endpoint was never written at all.

**Admin system health-check page (HC pattern)**: A self-service diagnostics page for the admin (`/admin/health`, `requiresAdmin`). Backend `GET /api/admin/health` returns `{ checks: [{ id, name, status: 'ok'|'warn'|'fail', summary, detail }], timestamp }`. Frontend: "开始检查" button → list rows with status icon (✅/⚠️/❌) + name + `el-tag` (success/warning/danger) + summary; each row expandable via `el-collapse` showing `JSON.stringify(detail, null, 2)` in a `<pre>`. Diagnostic-package download: `window.location = '/api/admin/health/download'` — the httpOnly auth cookie rides the same-origin GET automatically, browser triggers the file download (no fetch/blob needed). Results live in a `ref` only — NOT persisted (refresh clears), per spec. Tag the disk-space check "仅供参考" (Docker disk values are unreliable). Empty state before first run.

**Dashboard grid extension for a new module (F4 pattern)**: The artist dashboard uses a `dash-grid` (3fr/2fr dual-column, explicit `grid-row`/`grid-column` per module, DOM order = narrow-screen order). Adding a module = a new `<div class="area area-<name>">` + one media-query line (`.area-guestbook { grid-column: 2; grid-row: 5; }`). When the dispatch authorizes ONLY the parent Dashboard.vue (not new component files), implement the module INLINE in Dashboard.vue (template block + script refs/methods + scoped styles) rather than extracting a component — respect the authorization boundary. Load it independently (`loadGuestbook()` with its own try/catch) so its failure doesn't block other modules. Filter out admin-deleted rows client-side (`!m.deleted_by_admin`) if the list endpoint returns them.

**Migration-gated API fields pattern**: When a new API field depends on a DB migration that requires lead approval (high-risk gate), ship the API with a `?? null` fallback BEFORE the migration is approved. The field returns `null` until the column exists, then returns real values after migration — zero breaking change, no frontend coordination needed. Example: `currentStageId: order.current_stage_id ?? null` works both pre-migration (column absent → `undefined` → `null`) and post-migration (column present → real value). Include a test asserting the pre-migration behavior (`expect(order.current_stage_id).toBeUndefined()`). Report the migration plan alongside the API submission so the lead can approve both in sequence.

**Progressive disclosure for complex pricing (R14 pattern)**: When a pricing UI has many optional controls (addons, multipliers, breakdown, installments), don't show them all at once. Pattern: (1) after tier selection, show a compact summary row: tier name + base price + "详细计价 ▸" button; (2) clicking expands the full addon/multiplier/breakdown panel with a `<Transition>` animation; (3) only show the expand button when extras exist (`hasPricingExtras = computed(() => availableAddons.length > 0 || multipliers.length > 0)`); (4) reset `pricingExpanded = false` in `onTierChange()` alongside clearing selections. This reduces cognitive load for clients who just want the base price, while keeping full transparency one click away. The pricing calculation logic is untouched — only the presentation rhythm changes.

**Per-entity display mode → global viewer preference (R20 pattern)**: When a per-entity setting (e.g., `focus_image_mode` per order: off/small/large) is refactored into a global viewer preference (localStorage `queue_focus_display`), the backend schema may still require the field. Pattern: (1) frontend passes a dummy valid value (`mode: 'small'`) to satisfy the backend's `required: ['mode']` schema constraint; (2) actual display is controlled by the global localStorage preference, ignoring the per-entity field; (3) the backend field becomes vestigial but can't be removed without a migration — flag it as a future cleanup item, don't block the UI refactor. The detail page keeps "select which image" (writes `focus_image_path`), the list/board page reads the global preference for display size. This separates "what to show" (per-entity, backend-persisted) from "how big to show it" (viewer preference, client-local).

**Element Plus per-option colored radio buttons (R17 pattern)**: `el-radio-button` doesn't natively support per-option colors. Pattern: add a class per option (`class="prio-high"`), then override the checked state via `:deep()`:
```css
.priority-group :deep(.prio-high.is-checked .el-radio-button__inner) {
  background: var(--el-color-danger);
  border-color: var(--el-color-danger);
  box-shadow: -1px 0 0 0 var(--el-color-danger); /* overrides EP's left-border shadow */
}
```
The `box-shadow` override is essential — Element Plus uses `box-shadow: -1px 0 0 0 var(--el-color-primary)` for the left border of non-first buttons; without overriding it, a colored button still shows the default primary-color left edge. For click-to-save with rollback: snapshot `prevPriority` on load, on `@change` call the API, on error restore `order.priority = prevPriority`.

**Custom links with text-badge icons (R15 pattern)**: When the platform needs per-link brand icons (weibo/bilibili/pixiv/x/xiaohongshu/lofter/douyin/generic), do NOT build an SVG icon library. Proven decision (一号): pure text badges — one character per platform (`微`=weibo, `B`=bilibili, `P`=pixiv, `X`=x, `红`=xiaohongshu, `L`=lofter, `抖`=douyin, `🔗`=generic fallback). Implementation: a `LINK_ICON_BADGE` map in the adapter composable (`useArtistData`), each socialLink item gets a `badge` field; templates render `<span class="...-badge">{{ link.badge }}</span>` (22×22px rounded square, border, 11px bold). Lowest long-term maintenance cost — adding a platform = one map entry.

**Backend-assembled field, frontend reads only the new field (R15 pattern)**: When replacing legacy columns (`weibo_url`/`bilibili_url`) with a JSON column (`custom_links`), the backend service assembles the merged result (`getCustomLinks()`: parse JSON column; NULL → fall back to legacy columns; set-but-empty → no fallback) and returns it as a camelCase array (`customLinks: [{name, url, icon}]`). The frontend adapter composable reads ONLY `customLinks` — it never touches the legacy fields, never does its own fallback logic. Settings form reads the raw DB row (`profile.custom_links` JSON string, `JSON.parse` with try/catch) and writes via the camelCase API. This keeps fallback policy in exactly one place (backend service) where it can be tested.

**camelCase API migration is a breaking change that MUST sync frontend in the same release (R15)**: When the backend flips a write endpoint from snake_case to camelCase + `additionalProperties: false` (e.g., PUT /api/artist/profile), the old frontend sending snake_case fields gets 400 on EVERY save. The frontend task list for such a migration: (1) rename ALL form state fields to camelCase; (2) rename ALL payload keys; (3) keep onMounted READS in snake_case if the GET endpoint still returns raw DB rows (GET profile returns `...artist` spread = snake_case columns — reading `profile.template_id` is correct, not a leftover); (4) delete removed fields (weibo_url/bilibili_url → customLinks). Verification pitfall: an automated "no snake_case in file" check will false-positive on the legitimate read-side `profile.xxx_yyy` accesses — scope the check to the form definition + save payload, not the whole file.

**Order gallery upload tile (R18 pattern)**: Reference-image grid gains an in-grid upload tile (dashed border, `+` icon, hover/drag-over highlight via `dragover.prevent`/`dragleave`/`drop.prevent` + hidden `<input type="file" multiple>`). Three upload paths share one pipeline: drag-drop → `handleGalleryDrop`, click → file input → `handleGalleryFileSelect`, Ctrl+V → `usePasteUpload({ onFiles })` (the composable already supports multi-file arrays — no extension needed, just pass `maxCount`). Each file: frontend validate (image/* + ≤10MB) → `uploadApi.reference(file)` → `artistApi.addReference(orderId, { filePath, fileName, fileSize })` (backend auto-marks `source='artist'` and returns the full signed order — assign the response directly to `order.value`). Sequential `for...of` upload loop with a `galleryUploading` status line; on partial failure, `loadOrder()` to resync. Source badge: absolute-positioned bottom-left chip (`客户` = semi-transparent black, `画师` = primary color). Focus selection: click the image = set focus (replaces the old per-image "设为焦点" button). ⚠️ **`@click.stop` on `el-image` is a trap**: if `selectFocusImage` is on the parent `.ref-img-wrap` and `el-image` has `@click.stop` (to prevent preview bubbling), the image fills the entire wrap → clicking the image ONLY opens the preview, NEVER triggers focus selection. The R18 acceptance criterion "click any image = set focus" silently fails. **Correct pattern**: put `@click.stop="selectFocusImage(reference)"` directly on the `el-image` (click = set focus, stop prevents double-fire on wrap); move preview to a separate affordance (double-click, or a small 🔍 icon overlay). Alternatively, remove `@click.stop` from el-image and let clicks bubble to the wrap handler, but then disable el-image's built-in preview (`:preview-src-list="[]"`) and handle preview separately. Delete button always gets `@click.stop` to avoid triggering focus on delete. **Review checklist**: when a parent has a click handler AND a child has `@click.stop`, verify the child doesn't fill 100% of the parent — if it does, the parent handler is dead code. **Adopted fix (v0.12 review, 一号 flagged as 必修项)**: the second alternative won — remove `preview-src-list`/`initial-index`/`@click.stop` from `el-image` entirely so clicks bubble to the wrapper (`selectFocusImage`), and move preview into a hover action group: `.ref-hover-actions` (absolute top-right, `opacity: 0` → `1` on `.ref-img-wrap:hover`) holding two circle buttons — 🔍 `@click.stop="openGalleryViewer(index)"` (opens a shared `<el-image-viewer :url-list="all ref urls" :initial-index @close>` declared once at card level, so preview still supports left/right navigation) and ✕ delete. Interaction semantics become unambiguous: single-click = set focus, hover 🔍 = preview, hover ✕ = delete. Focus indicator: `✓` circle top-left when `focus_image_path === reference.file_path`. Counter in card header: `N / 20`.

**Paste focus-routing for dual paste targets (R18+R19 pattern)**: When one page has two paste-upload targets (gallery = multi-image, note attachment = single image), do NOT register two `usePasteUpload` instances (both would fire on every paste). Register ONE and route by focus: `if (document.activeElement?.closest('.note-input')) { single-note path } else { gallery path }`. For multi-image paste into the note target, take `files[0]` and show an info toast ("备注仅支持 1 张附图，已使用第一张"). ⚠️ Flagged for human verification: `document.activeElement` inside an `el-input` may not be a `.note-input` descendant depending on Element Plus internals — if paste routing misfires, this is the first thing to check.

**Note attachment pending-preview flow (R19 pattern)**: Single-attachment UX: upload button (or focused paste) → `uploadApi.noteImage(file)` → store `{ filePath, url }` in `pendingNoteImage` ref → render a dashed-border preview strip (48px thumb + ✕ cancel) below the input row → on "添加" submit `{ content, imagePath: pendingNoteImage?.filePath || null }` → clear both on success. In the notes stream, `note.imageUrl` (signed by backend's `signOrderUrls`) renders as an 80px `object-fit: cover` thumbnail with `cursor: zoom-in`; click opens `<el-image-viewer :url-list="[noteImageViewerUrl]" @close="...">` (Element Plus is globally registered in this project, so the viewer component needs no import). Notes max-height raised 200→300px to accommodate thumbs.

**Dead i18n key cleanup after UI refactors (proven)**: When a refactor removes UI elements (R18 removed the per-image focus button; R20 moved display-mode controls to the board toolbar), the orphaned locale keys (`setFocus`, `focusSelected`, `focusSelectFirst`, `focusMode`, `focusOff/Small/Large` under the wrong namespace) survive silently. Before submitting: grep all `.vue`/`.js` files for each candidate key; delete from BOTH locale files only when zero consumers remain; commit as a separate `style(client): 清理死键` commit so the functional diff stays clean. Watch namespace collisions — `queue.focusOff` (used by QueueBoard) vs `orderDetail.focusOff` (dead) are different keys.

**Cross-template feature rollout with per-template visual language (R34 pattern)**: When a feature (e.g., social links) exists in only one of N templates and must be added to the rest, keep the DATA path identical (all templates destructure `const { socialLinks } = useArtistData(props)` — same composable, same `badge` field, same `v-if="socialLinks.length"` guard so empty state renders nothing) but give each template its own visual treatment matching its design language. Proven treatments: gallery = 展签式 (square-cornered 1px-border chips, uppercase + `letter-spacing: 0.08em`, square badges); folio = 胶囊 (999px radius pills, circular badges, `translateY(-2px)` hover lift matching its CTA button); atelier = 画册式 (no border, hover reveals a `--atelier-accent` brush-stroke gradient underline via `::after`, badge `rotate(-3deg)` → `rotate(0)` on hover). Each template's link block is ~45 lines of scoped CSS — do NOT extract a shared component here; the whole point is that each treatment is native to its template's idiom. Shared extraction only applies to the data layer.

**Queue board wide-screen enhancement patterns (R30a/b/c/e)**: Four independent upgrades to a single-column draggable card list:
- **R30a wide-screen space — KEEP THE BOARD SINGLE-COLUMN (`grid-template-columns: 1fr`).** ⚠️ User decision (2026-07-30, overrides an earlier multi-column attempt): the queue/scheduling board **must stay one card per row** — "排期看板必须保持一行一条，不做多列". Wide-screen space is consumed by expanding card CONTENT horizontally (focus image + description + price + progress side-by-side, no truncation), NOT by splitting the list into multiple columns. Do NOT use `repeat(auto-fill, minmax(360px, 1fr))` for this board — it was implemented that way once and reverted as a regression. **Verification lesson**: after merging a UI-layout change, visually confirm the user's acceptance criterion (here "一行一条") in the running app — a green build and passing tests will NOT catch a layout that violates a design decision. This multi-column slipped through review once; the lead now screenshots/verifies key UI decisions before merge.
- **R30b exposed next-action**: a `NEXT_ACTION` status→action map (`pending→confirmed/primary`, `confirmed→wip/warning`, `wip|revision→done/success`, `done→delivered/success`) renders ONE primary button directly on the card (`v-if="nextAction(element.status)"`); the dropdown menu stays for secondary/destructive actions. Statuses with no next step (delivered/cancelled) render nothing.
- **R30c touch-only swipe navigation**: pointer events on the card — `onPointerDown` records start coords only when `e.pointerType === 'touch'` AND `!e.target.closest('button, .drag-handle, .slide-cancel, .el-dropdown, .el-image')`; `onPointerUp` navigates when `dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5` (left-swipe, horizontal-dominant). Desktop gets no equivalent (user decision C43 — desktop already has a 详情 button). The target-exclusion list is essential to avoid hijacking button taps and drag handles.
- **R30e slide-to-confirm cancel**: destructive cancel replaces `ElMessageBox.confirm` with an inline slider row that expands inside the card (`cancellingId === element.id`). Track = danger-light pill (999px radius, `overflow: hidden`); fill width = `calc(progress * 100%)`; thumb = 36px danger circle positioned `left: calc(2px + progress * (100% - 40px))` with `touch-action: none` + `setPointerCapture` on pointerdown; progress = `(clientX - trackLeft - 20) / (trackWidth - 40)` clamped 0..1; release at `>= 0.9` fires the cancel API, otherwise snaps back to 0. A ✕ button closes the slider without action. Scope decision (C45): slider ONLY for cancel (irreversible); other actions stay one-click.

### Flow State Machine: Connecting Custom Workflow to Order Status (R30d pattern)

When a platform has BOTH a fixed order status machine (pending→confirmed→wip→done→delivered) AND user-defined workflow stages (artist customizes: 定稿→排期确认→草稿→线稿→上色→完稿→交付), the R30d pattern connects them:

**Data model**: `orders.current_stage_id INTEGER` (nullable FK to workflow stages). NULL = old mode (fixed status machine), non-NULL = flow-tracked order.

**Position-based status mapping** (fixed rules, user-confirmed):
```
stageIndex == 0                    → pending
stageIndex == 1 && takes_payment   → confirmed
stageIndex == last                 → done
otherwise                          → wip
rollback (any)                     → revision
POST /deliver                      → delivered (unchanged)
cancel                             → cancelled (from any state)
```

**Two separate operations** (never one "set stage" that goes both directions):
- `advanceStage(orderId, stageId)` — forward only. Validates target is after current. `stageId=null` = opt out (sets current_stage_id back to NULL, order reverts to old status machine).
- `rollbackStage(orderId, stageId)` — backward only. Sets status='revision' + appends system note `↩ 从「X」打回到「Y」` (client has right to know).

**Auto-enrollment**: `createOrder()` queries the artist's first workflow stage and sets `current_stage_id` in the same transaction. If artist has no workflow stages, `current_stage_id` stays NULL (graceful degradation).

**Old interface isolation**: `PUT /api/artist/orders/:id/status` (the legacy fixed-status endpoint) rejects orders that have `current_stage_id` set — EXCEPT for `cancelled` (cancel is always allowed from any mode). Error message directs to the stage endpoint.

**API surface**:
- `PUT /api/artist/orders/:id/stage` — body `{ stageId: int|null }` (advance or opt-out)
- `PUT /api/artist/orders/:id/stage-back` — body `{ stageId: int }` (rollback)
- `GET /api/artist/orders/:id` — response gains `currentStageId`, `currentStageName`, `stageProgress: {current, total}`
- `GET /api/orders/track/:orderNo` — response gains `currentStageName` (client sees node name only, NOT progress numbers — user decision)

**Backward compatibility**: Old orders (current_stage_id=NULL) continue using the fixed STATUS_TRANSITIONS map unchanged. If an artist deletes a workflow node that an order points to, use `ON DELETE SET NULL` on the FK → order gracefully reverts to old mode.

**Migration**: Simple `ALTER TABLE orders ADD COLUMN current_stage_id INTEGER` (nullable, no DEFAULT needed). All existing rows get NULL = old mode.

### Queue Zone System: Formal + Buffer (SPEC-004, v0.17+)

When artists want to limit how many commissions they accept per batch while still allowing a waitlist:

**Data model**: `orders.queue_zone TEXT DEFAULT 'formal'` (`'formal'` | `'buffer'`). Artists configure `batch_limit` (N, NULL=unlimited), `buffer_limit` (M), `auto_promote` (0/1).

**Order creation partitioning** (inside `createOrder()` transaction):
```
if artist.batch_limit IS NOT NULL:
  formal_count < N  → queue_zone = 'formal'
  buffer_count < M  → queue_zone = 'buffer'
  else              → 400 BATCH_FULL
```

**Key rules**:
- `pending` occupies a slot immediately (user decision). delivered/cancelled release.
- Buffer orders do NOT generate payment installments at creation. On promote → generate from workflow template's payment stages.
- Auto-promote (when enabled): fires on delivered/cancelled status change AND on batch_limit increase. Loops until formal is full or buffer is empty.
- Manual promote always allowed even if formal exceeds N (artist's choice).
- Artist status (open/full/break) is NEVER changed by order completion/promotion — artist must manually toggle.

**Trigger paths for auto-promote** (must cover ALL):
1. `updateOrderStatus()` → delivered/cancelled
2. `deliverOrder()` in order-gallery.service.js → delivered
3. `PUT /api/artist/profile` with batchLimit change → tryAutoPromote

**Client-facing display** (`computeSlotDisplay(artist)`):
- open + formal < N → "开放中 · 剩 X 席"
- open + formal ≥ N, buffer < M → "可候补"
- open + both full → "已接满"
- full + has active orders → "已接满"
- full + all delivered → "暂停接单"
- break → "休息中"
- batch_limit=NULL → null (feature disabled, no display)

**Track endpoint extensions**: `queueZone`, `queueDisplay` (respects `hide_queue_position`), `installments` (name+amountCents+paid).

### Focus Image Pattern (v0.11+)

Orders can designate one reference image as the "focus image" for prominent display:

- `orders.focus_image_path` (TEXT, nullable) — must match an existing `order_references.file_path` for that order
- `orders.focus_image_mode` (TEXT, default `'off'`) — `'off'` | `'small'` | `'large'`

**Ownership validation**: Setting a focus image requires the path to exist in `order_references` for that specific order. Reject with `FOCUS_IMAGE_NOT_OWNED` otherwise.

**⚠️ Upload-then-focus MUST insert the reference row first (v0.14 bug).** Any flow that uploads a NEW image and immediately sets it as focus must call `addReference` BEFORE `setFocusImage`: `uploadApi.reference(file)` → `artistApi.addReference(orderId, { filePath })` (writes the `order_references` row) → `artistApi.setFocusImage(orderId, { imagePath, mode })`. Skipping `addReference` makes the ownership check fail with "该参考图不属于此订单" (`FOCUS_IMAGE_NOT_OWNED`) — the file is on disk but not associated with the order. The OrderDetail gallery gets this right; the QueueBoard empty-state upload shipped without the middle step and every upload errored. When adding ANY new "upload + set focus" affordance, copy the full three-step chain.

**Cleanup on deletion**: When a reference image is deleted (`DELETE /api/artist/orders/:id/references/:refId`), check if it's the current focus image. If so, reset `focus_image_path = NULL, focus_image_mode = 'off'`. Deleting a non-focus reference leaves focus fields untouched.

**Signed-URL requirement for display**: `focus_image_path` points into `references/` (a non-public, signed directory). Any endpoint that surfaces the focus image for display (queue board, order list) must return a signed URL — map `focusImageUrl = signedUrl(focus_image_path)` in the route — NOT the raw path. Rendering `/uploads/${focus_image_path}` directly will 403. The single-order endpoint already signs `references[].url`; queue/list endpoints need the same treatment for the focus field. Frontend consuming a raw `focus_image_path` for `<img src>` is a guaranteed-403 bug — always check whether the API returns a signed variant first.

**Proven fix pattern — extract a shared signing helper.** When multiple route handlers return order data (GET detail, PUT focus-image, GET queue, GET list, PUT price, POST deliver, POST notes, POST references), extract `signOrderUrls(order)` at the top of the routes file and call it in every handler that returns references/deliverables/notes. Observed bug: PUT focus-image returned the raw service result (unsigned) while GET detail signed correctly — the frontend replaced `order.value` with the PUT response and all images broke. The helper eliminates this class of inconsistency. For list endpoints that return raw DB rows with `focus_image_path`, add `focusImageUrl: signedUrl(...)` per row (only when the field is non-null).

**signOrderUrls must cover ALL file-path fields (R19 lesson).** When adding a new file-path field to orders (e.g., `order_notes.image_path`), extend `signOrderUrls()` to sign it AND audit every route that returns order data. Routes that return orders include: GET detail, PUT focus-image, PUT price, POST deliver, POST notes, POST references. Missing any one = frontend gets a raw path → 403. The notes signing pattern:
```js
if (order.notes) {
  order.notes = order.notes.map(n =>
    n.image_path ? { ...n, imageUrl: signedUrl(n.image_path) } : n
  )
}
```

**List-thumbnail fallback needs a references field the list API doesn't return (R16 gap)**: A thumbnail column with "focus image → else first reference image → else '—'" fallback (C28) cannot be fully implemented when the list endpoint returns `SELECT o.*` only — no `references` array, so the first-reference fallback has no data source. Two clean resolutions: (a) backend adds a `first_reference_path` (or `thumbnail_url`) column to the list response via a LEFT JOIN on `order_references` (min `id` per order); (b) frontend ships focus-only + "—" and flags the fallback as a backend follow-up. Don't silently drop the fallback requirement — report the data gap explicitly so the lead can dispatch the backend change. The frontend `el-image` thumbnail pattern (40×40, `fit="cover"`, `preview-teleported`, click-to-preview, mobile 32×32 via media query) is ready to consume whichever field the backend provides.

### Backend Utils Module Architecture (v0.16+)

`server/src/utils/` holds cross-cutting constants and helpers extracted from service files. All service/route files import from here — never inline duplicated logic.

| File | Exports | Used by |
|------|---------|---------|
| `price.js` | `PRICE_FALLBACK_SQL` (SQL CASE, alias `o`), `resolvePriceCents(order)` | order.service (stats×3, updateFinalPrice) |
| `order-status.js` | `ACTIVE_ORDER_SQL`, `COMPLETED_ORDER_SQL`, `TERMINAL_STATUSES`, `COMPLETED_STATUSES` | order.service (queue×4, stats×3, deadlines×1), admin.service (globalStats×1) |
| `date.js` | `toSqliteDate(date)`, `nowSqlite()`, `localDayStartSqlite(now)`, `localDayEndSqlite(now)`, `localMonthStartSqlite(now)` | order.service (deadline normalize, upcoming deadlines, stats×4) |

**Rules for extending**:
- SQL fragment constants use bare column names (no alias prefix) when the query's table has no alias, or prefix `o.` when the query aliases orders as `o`. Check the consuming query before adding new fragments.
- Date helpers always produce `YYYY-MM-DD HH:MM:SS` (space separator, UTC). Never `T` — see SQLite date pitfall below.
- `resolvePriceCents` returns `null` (not 0) when all three fields are null — callers distinguish "unpriced" from "¥0".

**order.service.js split (PROVEN v0.16, 五号 audit → 三号 executed)**: When the order service grows past ~800 lines / 20+ exports, split by responsibility into 4 sub-modules. Result: 852→**341 lines** (better than ~400 target).

| Order | New file | Functions | Risk |
|-------|----------|-----------|------|
| 1 | `order-stats.service.js` (89 lines) | getArtistStats, getUpcomingDeadlines | Low |
| 2 | `order-queue.service.js` (59 lines) | getArtistQueue, reorderQueue, updatePriority | Low |
| 3 | `order-gallery.service.js` (91 lines) | addReference, removeReference, setFocusImage, addDeliverable, deliverOrder | Med |
| 4 | `order-workflow.service.js` (123 lines) | advanceStage, rollbackStage, enableTracking, getStageInfo, mapStageToStatus | Med |

Kept in `order.service.js` (~14 fns): createOrder, getOrder, getOrderByNo, updateOrderStatus, updateDeadline, addNote, deleteNote, updateFinalPrice, getArtistOrders, getClientQueuePosition, getClientOrdersByQq, hasClientOrders, getPlatformConfig, generateOrderNo, **compactQueue** (exported).

**Implementation lessons (proven)**:
1. **`compactQueue` stays in parent and is exported** — both `updateOrderStatus` (parent) and `deliverOrder` (gallery module) call it. Moving it to the queue module would create a gallery→queue cross-dependency; keeping it in the parent means gallery→parent only (simpler graph).
2. **`getClientQueuePosition` inlines the queue query** — it needs active-order IDs sorted by position. Importing `getArtistQueue` from order-queue.service.js would create a parent→child circular import. A 5-line inline SQL query is cleaner than restructuring the dependency graph.
3. **`mapStageToStatus` becomes exported** — was a private function in the parent; the workflow module exports it for testability and potential reuse.
4. **Each step is a separate commit**: create module → remove functions from parent → update route imports → update test imports → run full test suite → commit. Tests green after EACH step (262/262 at every stage).
5. **Test files need import updates** — `orderService.getArtistStats` → `orderStatsService.getArtistStats` etc. Use `replace_all: true` for bulk renames within the test file.
6. **Route file gets N import lines** — one per sub-module (`import * as orderStatsService from './order-stats.service.js'`). Each call site changes from `orderService.X` to `orderXxxService.X`.

**Two hard constraints**: (1) **No circular imports** — `order.service.js` must NEVER import from its sub-modules; sub-modules import `getOrder`/`compactQueue` from the parent in one direction only. (2) **Update route + test imports at each step** — `order.routes.js` has ~20 call sites; each split step must update them and run the full test suite before the next step.

### SQLite Migration Best Practices (proven pattern)

Every migration in the MIGRATIONS array must be **idempotent** — safe to run multiple times:

```js
{
  version: 11,
  name: 'descriptive_name',
  up(database) {
    // 1. Auto-backup (file DB only, skip :memory:)
    const dbPath = process.env.DB_PATH || './data/commission.db'
    if (dbPath !== ':memory:' && existsSync(dbPath)) {
      copyFileSync(dbPath, `${dbPath}.bak.v11`)
    }
    // 2. PRAGMA table_info check before each ALTER
    const cols = database.prepare('PRAGMA table_info(orders)').all()
    if (!cols.some(c => c.name === 'new_column')) {
      database.exec('ALTER TABLE orders ADD COLUMN new_column TEXT')
    }
  }
}
```

Rules:
- **ADD COLUMN only** — never DROP/RENAME in production migrations (SQLite limitations + data safety)
- **All new columns nullable or with DEFAULT** — existing rows must not break
- **PRAGMA check per column** — not per table, because a partially-applied migration may have added some columns
- **Backup before migration** — `cp db db.bak.vN`, log success/failure, continue even if backup fails (warn)
- **Update CREATE TABLE DDL too** — fresh installs must get the same schema as migrated installs
- **Sync test helpers** — `cleanDb()` in `tests/setup.js` must DELETE from any new table; `seedArtist()` may need new column defaults if tests assert on them. Forgetting cleanDb causes FK-constraint failures or stale data leaking between tests
- **JSON TEXT columns** — store as TEXT, parse in service layer with try-catch, default NULL (not `'[]'`). Never use `json_extract()` in queries (performance + SQLite version dependency). Follow the `getCustomLinks()` defensive pattern
- **Test idempotency** — call `initDatabase(db)` twice in a test, assert no throw

### Pitfalls

- **Don't let artists configure percent-base** — "based on base price" vs "based on subtotal" is a math concept non-coders won't grasp. Lock it to base price, show a small hint text.
- **Don't build per-tier addon pricing in v1** — most artists use the same addon price across tiers. If needed later, add `price_override` to addon_tiers.
- **Calculate endpoint must be stateless** — `POST /api/public/calculate-price` takes selections, returns breakdown, writes nothing. Only order creation snapshots to `order_price_breakdown`.
- **Frontend must show multiplier line items separately** — "商用 ×1.5" and "加急 ×2.0" as distinct rows, not a merged "×3.0". Clients need to see where money goes.
- **Percent/fixed mode switch resets value** — When a form input switches between "fixed ¥" and "percent %" modes, the numeric value from one mode is nonsensical in the other (e.g., `10` fixed = `1000%` percent). Always `watch` the mode toggle and reset to a sensible default (0.3 for percent, 10 for fixed). Without this, users see terrifying numbers like "1000%".
- **Dialog must pre-fill from inline input** — If the UI has an inline text input + "Create" button that opens a dialog containing the same field, the dialog MUST pre-fill from the inline input. Otherwise the user types the name twice and files a bug report.
- **Check existing migration versions before assigning** — Plans may say "v8" but v8 might already exist. Always `SELECT version FROM schema_migrations` or read the MIGRATIONS array before choosing a version number. Off-by-one here means a silent no-op or a crash.
- **Consolidate scattered admin panels into one tabbed page** — When features grow (tiers, addons, multipliers, workflow ratios), don't spread them across Settings + separate pages. Merge into a single "价格管理" page with lazy-loaded tabs. Each tab is its own component (`AddonManager`, `MultiplierManager`, `WorkflowPaymentEditor`), the parent page just provides the tab shell. Remove the old scattered entry points to avoid confusion about "where do I configure X". **Flip side: actively remove duplicate entry points.** When the same component (e.g., `WorkflowPaymentEditor`) appears in both Settings and TierManage, remove the less-intuitive one. "Where does the artist expect to find this?" is the test — workflow payment ratios are about money, so they belong in 价格管理, not in 主页设置 (which should only control "what the page looks like"). The removal is a 2-line change (delete `<el-tab-pane>` + delete `import`), but forgetting to remove the duplicate causes user confusion ("which one do I use?").
- **Cross-template section restructuring must be atomic across ALL templates.** When moving a section from standalone to inline (e.g., "flow preview" from its own `<section>` into the pricing section), every template that has that section must be updated in the same commit. The pattern: (1) change the guard from `v-if="workflowStages.length"` to `v-if="tiers.length || workflowStages.length"` on the parent section; (2) wrap the original content in `<template v-if="tiers.length">`; (3) add the moved content below with its own `v-if`; (4) delete the old standalone section; (5) if any template has scroll-spy navigation referencing the deleted section's `id`, remove that nav item too. Missing step 5 leaves a dead nav link. Missing step 1 means the section disappears entirely when there are no tiers but there ARE workflow stages. All N templates must follow the identical restructuring pattern — divergence between templates creates maintenance burden and visual inconsistency.

See `references/pricing-data-model.md` for full schema DDL and API endpoint specs.

## Pitfalls

- **Renaming template IDs requires legacy mapping in TWO places** — when template IDs change (`default`→`classic`), old values persist in the database. Map them in (1) the render registry (`LEGACY_TEMPLATE_MAP[raw] || raw` before the `TEMPLATES[id]` lookup, with a safe fallback) AND (2) the settings form load (so the selector highlights the correct card). Missing the first gives broken pages for existing artists; missing the second gives a settings page where nothing appears selected.
- **Templates must never read backend field names directly** — put one adapter composable between props and templates (`useArtistData`): `imgUrl(path)`, `statusText(status)` via i18n, `socialLinks`, `heroArtwork`. When the API renames `image_path`, you fix one file instead of N templates. This adapter is also the single place to surface future backend data (addons, multipliers) without touching template files.
- **Hardcoded display strings in templates survive locale-file audits** — zh/en locale files can be perfectly aligned (key-tree diff = 0 missing) while templates still contain hardcoded English AND `$t()` calls referencing keys that don't exist (which render the raw key name on screen, e.g. `artistHome.about`). Verify both: key-tree diff of locale files + regex scan of `<template>` blocks for likely hardcoded words.
- **`defineAsyncComponent` children mount after the parent's `onMounted`** — any composable that scans the DOM at mount (IntersectionObserver scroll-reveal, sticky-CTA sentinel watching, scroll-spy) silently misses nodes inside lazily-loaded templates. Fix: scroll-reveal adds a `MutationObserver` to catch late insertions; sentinel watchers use `watch(ref, setup, { immediate: true })` instead of a one-time read. Elements exposed via `defineExpose` need double unwrapping (`heroRef.value?.sentinelEl?.value`).
- **@fastify/static major-version upgrades change callback parameter types.** In v8, the `setHeaders` callback receives a raw Node `http.ServerResponse` (use `res.setHeader()`). In v10, it receives a Fastify `Reply` object (use `res.header()`). The old code compiles fine and tests pass (tests use `app.inject()` which may not exercise the static-serving code path), but at runtime every static file request crashes with `TypeError: res.setHeader is not a function` → all images/CSS/JS return 500. **After ANY major-version upgrade of @fastify/static, verify the `setHeaders` callback signature against the new version's docs, and test with a real HTTP request to a static file (not just the test suite).** Check container logs for `setHeaders` errors after deployment.
- **@fastify/static `wildcard: false` + `sendFile()` in notFoundHandler serves index.html for EVERYTHING.** When you register `@fastify/static` with `wildcard: false` (to avoid its catch-all route conflicting with SPA fallback) and then call `reply.sendFile('assets/main.js')` inside `setNotFoundHandler`, Fastify returns the SPA `index.html` for every asset request — the browser loads the HTML shell but no JS/CSS, so the page is a white screen. `reply.send(createReadStream(path))` inside the notFoundHandler also misbehaves. **Working pattern**: register a manual `app.get('/*', ...)` route that resolves the file under `WEB_DIST`, streams it with `createReadStream` + an explicit MIME map, and falls back to `index.html` only when the file doesn't exist. Keep `setNotFoundHandler` for non-GET 404s only. Verify with a real HTTP check that `/assets/*.js` returns `text/javascript` and a non-trivial byte count (not the ~500B index.html).
- **Don't build a monolithic page** — artists have wildly different needs. The template/embed/custom split handles this gracefully without over-engineering.
- **Reinventing the CMS wheel** is not worth it. Layer 3 (custom upload) should be pure static file serving, not a WYSIWYG editor.
- **Widget framework choice matters**. Vue UMD bundle can conflict if the host site also uses Vue. Web Component is safer but more work to set up.
- **Rate-limit public API endpoints**. Embed widgets and custom pages both call unauthenticated APIs — they are the most attackable surface.
- **Embed widgets that use `$t()` without mounting i18n will white-screen.** If the embed entry (`embed/main.js`) creates a Vue app without `app.use(i18n)`, any template using `$t('key')` throws `TypeError: $t is not a function` at render → blank page. Two valid fixes: (a) mount a minimal i18n instance in the embed entry; (b) use a local `t()` function with an inline dictionary (no vue-i18n dependency). Option (b) is better for embeds — keeps the bundle tiny and avoids version coupling with the main app's i18n.
- **Embed `v-for` loop variable can shadow the local `t()` method.** In Vue Options API, `v-for="t in tiers"` creates a template-scope variable `t` that shadows `methods: { t }` — every `{{ t('key') }}` inside that loop calls the tier object instead of the translation function → silent wrong output or TypeError. Fix: name loop variables after their domain (`v-for="tier in tiers"`), never single letters that collide with method names. Audit all `v-for` aliases in embed components that use local `t()`.
- **Embed widget API payloads must match the backend schema exactly.** The main SPA's order form may send `{ subdomain, agreeRules, ... }` while the embed widget sends `{ artistId, source, ... }`. If the backend schema has `required: ['subdomain', 'agreeRules']` with `additionalProperties: false`, the embed's payload is silently stripped → 400 validation error. When building an embed widget, read the target endpoint's JSON Schema and match field names precisely. Test the embed's submit flow end-to-end, not just the render.
- **Don't promise "zero change" for embed** — some sites (Carrd free tier, some Squarespace plans) can't inject arbitrary `<script>` tags. Have fallback = provide a direct link artists can put as a button.
- **Docker Compose `environment:` block silently overrides `env_file:`.** If `.env` sets `AUTH_DEV_MODE=*** but `docker-compose.yml` has `AUTH_DEV_MODE=*** in the `environment:` list, the container always gets `false`. Docker's priority: `environment` > `env_file`. For dev/prod toggle variables, do NOT hardcode them in `environment:` — let them flow from `.env` via `env_file:`. Only put truly immutable values (like `DB_PATH=/app/data/commission.db`) in `environment:`.
- **URL-decode BEFORE path-prefix security checks.** If `isPublicUploadPath(url)` checks `url.startsWith('/uploads/images/')` on the raw request URL, an attacker can bypass with `/uploads/images/%2E%2E%2Fdeliverables/secret.pdf` — the prefix matches, the request is treated as public, then `@fastify/static` decodes the path and serves the file from `deliverables/`. Always `decodeURIComponent()` first (with try/catch for malformed encoding → reject), then check for `..`, then check the prefix.
- **Fastify `setErrorHandler` must be set BEFORE `app.register()` calls.** Fastify's plugin encapsulation means child scopes only inherit hooks/handlers that exist at registration time. If you call `app.setErrorHandler(...)` after all `app.register(featureRoutes)`, the error handler only applies to root-level routes (like `/api/health`). All business routes get Fastify's default error format (leaking `statusCode`, `message`, potentially SQL errors). Move `setErrorHandler` above all `register` calls.
- **Admin proxy routes must match service-layer field naming.** If `admin.routes.js` schema uses `image_path` (snake_case) but `artist.service.js` destructures `{ imagePath }` (camelCase), the field arrives as `undefined` → SQLite binds NULL → silent data loss or 500. Either: (a) admin schema uses camelCase to match service, or (b) service has a keyMap like `updateTier` does. Audit all create/update pairs for symmetry.
- **DB transactions roll back security side-effects too.** If `verifyLoginCode()` increments `attempts` inside a transaction (e.g. admin transfer wrapping verify + config update), a failed verification throws → entire transaction rolls back → `attempts+1` undone → brute-force protection defeated. Fix: perform verification (with side-effects) OUTSIDE the transaction; only wrap the state-changing operation inside it.
- **SQLite string comparison: ISO 8601 `T` vs space separator.** `datetime('now')` → `2026-07-28 19:44:44` (space); JS `toISOString()` → `2026-07-28T19:44:44.237Z` (T). Lexicographic: `'T'`(0x54) > `' '`(0x20), so ISO timestamps are always "greater than" SQLite-format at the same instant. `WHERE expires_at < datetime('now')` never matches ISO values → cleanup permanently broken. Fix: store Unix ms as INTEGER, or use `strftime` on both sides. **v0.15 deadline pattern (proven)**: normalize on write — `new Date(input).toISOString().slice(0, 19).replace('T', ' ')` → stores `YYYY-MM-DD HH:MM:SS` UTC. All range queries (`deadline >= ? AND deadline <= ?`) use the same format for comparison values. Frontend date-picker sends `YYYY-MM-DD` (value-format), backend `new Date()` parses it fine.
- **Fastify route registration order: specific paths before parametric.** `GET /api/artist/orders/upcoming-deadlines` MUST be registered BEFORE `GET /api/artist/orders/:id`, otherwise `:id` swallows "upcoming-deadlines" as a parameter → parseInt → NaN → 400. Fastify matches routes in registration order within the same method. Always place literal path segments before `:param` segments.
- **seed.js `INSERT OR IGNORE` loses to init.js's earlier insert.** If `initDatabase()` inserts `admin_qq = ''` first, seed's `INSERT OR IGNORE admin_qq = '10003'` is silently ignored (row exists). Fix: seed uses `INSERT OR REPLACE` for config values it must control.
- **Admin proxy POST routes need existence checks.** `POST /api/admin/artists/:id/*` must verify target artist exists AND is not soft-deleted. Without this: nonexistent `:id` → silent empty result or FK constraint 500. Extract shared `requireExistingArtist` preHandler checking `getArtistById(id)` + `deleted_at`.
- **Resource ownership validation on update/delete.** `PUT/DELETE /api/admin/artists/:id/greetings/:gid` must verify `greeting.artist_id === :id`. Without this, admin editing artist A can delete artist B's or global library entries. Pattern: query resource row, compare owner FK to URL param, 404 on mismatch.
- **Frontend "save profile" must diff against initial values.** Sending ALL form fields on save causes unmodified falsy fields (e.g. `bio: ''`) to overwrite real data. Fix: snapshot initial values on load, diff on save, only send changed keys.
- **Signed URLs must be returned for ALL non-public file references.** If the client-facing track endpoint signs deliverable URLs but the artist-facing detail endpoint returns raw `file_path`, the artist's frontend renders `/uploads/references/...` → 403. Every endpoint that surfaces `references/` or `deliverables/` paths must map through `signedUrl()`. Check both client AND artist endpoints when adding signing.
- **GC (orphan file cleanup) must collect ALL file-path columns.** When adding a new file-path column (e.g., `order_notes.image_path`), the `gcUploads` function's `collect()` list MUST include it. Without this, in-use files are treated as orphans and deleted after 24h — **data loss, not disk bloat**. This is a hard prerequisite, not a nice-to-have. Pattern: `collect(db.prepare('SELECT image_path FROM order_notes').all(), 'image_path')`. Audit checklist when adding any new upload directory: (1) signOrderUrls covers it, (2) gcUploads collects it, (3) isPublicUploadPath does NOT include it (unless intentionally public).
- **Fastify `removeAdditional: true` (default) silently strips unknown fields — tests expecting 400 get 200.** When a JSON Schema has `additionalProperties: false`, Fastify's default AJV config uses `removeAdditional: true`, which silently removes unknown properties BEFORE validation. The request succeeds (200) with the unknown field stripped — it does NOT return 400. Tests asserting "unknown field → 400" will fail. Correct test: assert 200 + verify the field was NOT written to DB. To get 400 on unknown fields, explicitly set `ajv: { customOptions: { removeAdditional: false } }` in the schema config — but this is a project-wide behavior change, so prefer adapting tests.
- **SQLite `ALTER TABLE ADD COLUMN ... DEFAULT` vs explicit INSERT NULL.** When a column has `DEFAULT 'client'`, existing rows read back `'client'` (not NULL). New INSERTs that omit the column also get `'client'`. But an explicit `INSERT ... (source) VALUES (NULL)` writes `null`, overriding the DEFAULT. Service layer must always pass the value explicitly — never rely on DEFAULT for business-critical fields. Test: insert without specifying the column → assert default value; insert with explicit NULL → assert null.
- **SQLite CHECK constraints block new enum values — always verify schema DDL before trusting instructions.** Task instructions may claim "no CHECK constraint" on a column, but the CREATE TABLE DDL may have one (e.g., `status TEXT CHECK(status IN ('open','full','break'))`). Adding a new value ('hidden') to the service-layer whitelist and JSON Schema is necessary but NOT sufficient — the DB-level CHECK rejects the UPDATE with `CHECK constraint failed`. SQLite cannot ALTER CONSTRAINT; the fix is a table rebuild migration (CREATE new → COPY → DROP → RENAME, same pattern as login_codes v13). **Always grep the schema DDL for CHECK before implementing enum extensions.** Test environments using `:memory:` rebuild from schema DDL each run, so updating the DDL makes tests pass — but production databases still have the old CHECK. Flag this explicitly in the handoff as a migration requirement.
- **Test isolation: `platform_config` survives `cleanDb()` and pollutes admin-filtered endpoints.** The standard `cleanDb()` deletes rows from entity tables but NOT `platform_config`. Tests that set `admin_qq` (e.g., TC-RT-06 sets it to '12345') leave it set for all subsequent tests in the same file. Any later test using QQ '12345' with `GET /api/artists/:subdomain` gets 404 (admin filter). **Fix pattern**: use unique QQ numbers (77777, 77778, etc.) for tests that hit public artist endpoints, OR reset `platform_config` in `beforeEach`. This bug hit twice across sessions (v0.12 TC-RT-12d, UI-8 TC-RT-16) — it's a structural gap in the test setup, not a one-off.
- **SQLite table rebuild migration pattern (for CHECK/constraint changes).** When a column's CHECK constraint must change (e.g., adding 'hidden' to status enum), SQLite requires a full table rebuild: (1) CREATE TABLE new_table with updated DDL; (2) INSERT INTO new_table SELECT ... FROM old_table (CAST if types change); (3) DROP TABLE old_table; (4) ALTER TABLE new_table RENAME TO old_table; (5) Recreate indexes. Idempotency: check PRAGMA table_info for the constraint condition before rebuilding (e.g., if column type is already correct, skip). Always wrap in a transaction. This pattern was used for login_codes v13 (DATETIME→INTEGER) and will be needed for artists status CHECK extension.
- **`seedArtist()` does NOT create workflow stages — stage-dependent tests must call `seedArtistStages(artist.id)` explicitly.** The test setup's `seedArtist()` creates the artist row + commission_rules but NOT `artist_workflow_stages` rows. Any test that depends on workflow stages (R30d stage machine, workflow service tests) must call `seedArtistStages(artist.id)` before `createOrder()`. Without this, `createOrder()` finds no first stage → `current_stage_id` stays NULL → all stage assertions fail with confusing errors (expected non-null, got null). Import: `import { seedArtistStages } from '../src/features/artist/workflow.service.js'`. This hit all 8 R30d tests on first run.
- **Test isolation must cover EVERY stateful resource, not just the DB.** Isolating `DB_PATH=:memory:` in `vitest.config.js` is necessary but NOT sufficient. In the permanent-image-loss incident the DB *was* isolated to `:memory:`, but `UPLOAD_DIR` was left unset, so upload tests wrote real files into the production `./uploads/`. Those leaked test files (4-13 byte junk) plus a transiently-wiped DB state let the orphan-file GC delete real images as "orphans". **Rule**: enumerate every external resource the server reads/writes (DB file, upload dir, temp/scratch dir, outbound network, caches) and redirect ALL of them to isolated test paths in the vitest `env` block. For uploads, set `UPLOAD_DIR` to a per-run temp dir (`join(os.tmpdir(), 'commission-test-uploads-' + process.pid)`) and delete it in an `afterAll` hook in `tests/setup.js`. A `:memory:` DB with a real uploads dir is still a production-data hazard. Audit the vitest `env` block against every `process.env.*` the server reads: if the server reads it and it touches disk or network, the test must override it.
- **GC orphan-cleanup COMPOUNDS a DB wipe into permanent file loss — guard it against an empty/anomalous DB.** The 2026-07-30 incident had two stages, and the second was the fatal one: (1) a test/seed run wiped the production DB (artists `name=NULL`, 0 orders) — *recoverable* from `commission.db.bak.v12`; (2) on container restart, the orphan-file GC ran against the WIPED DB, found image files with no matching DB record, and deleted them as "orphans" (container log: `孤儿文件回收: 删除 1 个，释放 0.5 MB`). We then restored the DB — but the files were already gone, so every artwork/tier-example showed "加载失败" permanently. **The GC trusts DB state as ground truth; when the DB is transiently empty, it deletes files that are very much in use.** Prevention rules: (a) GC must ABORT (skip the run, log a loud warning) if a sanity check fails — e.g. `artists` count == 0, or `orders` count == 0 while `uploads/` is non-empty; a healthy production DB is never fully empty, so an empty table is a "something is wrong" signal, not "everything is orphaned". (b) GC should require a file to be BOTH stale (older than N days) AND absent from the DB before deletion — never delete on DB-absence alone. (c) After ANY DB restore, run a file-integrity audit BEFORE declaring recovery complete (see `references/file-integrity-audit.md`) — records restored ≠ files present. The DB-wipe recovery pitfall below restores the *database*; this pitfall is why that restore can still leave a broken app.
- **GC solution: recycle bin instead of permanent delete (v0.16+ pattern).** After the 2026-07-30 permanent-image-loss incident, the GC was redesigned: `unlinkSync(absPath)` → `renameSync(absPath, recycleBinPath)`. Recycle bin directory: `UPLOAD_ROOT/.recycle-bin/YYYY-MM-DD/` (date-partitioned, preserves original relative path structure). The GC walk skips `.recycle-bin` entirely (never re-collects its own trash). Admin API: `GET /api/admin/recycle-bin` (list: name, originalPath, size, movedAt) + `DELETE /api/admin/recycle-bin` (purge: real deletion, returns count + freed bytes). Both require admin auth. Frontend: admin page shows recycle bin contents + "清空回收站" button with irreversible-action confirmation dialog. This makes GC errors **recoverable** — a wrong deletion is a rename, not a loss. The safety check (abort on empty DB) remains as the first line of defense; the recycle bin is the second.
- **Production data found wiped? Recover from the versioned migration backup — do NOT assume permanent loss.** Each migration auto-copies the DB to `commission.db.bak.vN` before applying (see migration pattern above), so `data/` always holds recent snapshots. Observed incident (2026-07-30): the live `commission.db` had 16 `artists` rows with `name=NULL, subdomain=NULL, created_at=NULL` and **0 orders**, while `commission.db.bak.v12` (a day old) had Alice/Bob/Admin + 9 orders intact. **Diagnosis → recovery** (run `templates/diagnose-sqlite.cjs` for step 1):
  1. Establish ground truth BEFORE touching anything — diagnose the live DB AND each `.bak.vN`. A WAL checkpoint returning `{log:0, checkpointed:0}` means the WAL holds nothing unflushed — the live DB really is empty; the data is only in the backup.
  2. `docker compose stop web` (the SERVICE name is `web`; the CONTAINER name is `commission-web` — `docker compose stop commission-web` fails with "no such service").
  3. On the HOST (DB is bind-mounted `./data:/app/data`, so host file ops == container file ops): `Copy-Item commission.db commission.db.bak.empty-<date>` (preserve the wiped DB for forensics) → `Copy-Item commission.db.bak.v12 commission.db` → `Remove-Item commission.db-shm, commission.db-wal` (stale WAL/index from the wiped DB must not replay onto the restored file).
  4. `docker compose up -d web`. Migrations auto-apply forward (backup at v12, live had reached v15 → restart re-runs v13/14/15 idempotently). Wait ~15s for the healthcheck.
  5. Verify at the API layer, not just the file: `Invoke-RestMethod http://localhost:3000/api/artists/alice` must return the full artist + tiers + artworks. (PowerShell `curl` is an `Invoke-WebRequest` alias with different params — use `Invoke-RestMethod`.)
- **Root-cause fingerprint of the wipe: test/seed data written to the production DB file AND uploads dir.** The wiped DB's 16 artists had `name=NULL` + tiny `qq_number` values (5, 11, 18, 45, 70…) — the shape of `seedArtist()`/test rows, not real data. Corroborating evidence: `uploads/images/` and `uploads/deliverables/` gained dozens of 4–13-byte junk files (fake PNGs/PSDs/zips) with timestamps matching the test run — tests were ALSO writing to the real `UPLOAD_DIR`. **Prevention**: test setup must isolate BOTH `DB_PATH` (use `:memory:` or a throwaway file) AND `UPLOAD_DIR` (point at `os.tmpdir()` or a per-run temp dir) — isolating only the DB still lets tests pollute real uploads. Confirm no script ever opens the production DB/uploads for writes; schedule a test-isolation hardening follow-up after any restore.
- **Never trust an agent's self-report of "done" — verify the actual files.** Agents routinely skip a sub-task or jump ahead to the more interesting one while reporting success. Observed: 三号 was told "fix BUG-3 THEN do R58-7" but submitted only R58-7 (errors.js had no `REFERENCE_DUPLICATE`, order.service.js unchanged); 二号 reported a batch "complete" that silently omitted BUG-1 and BUG-4. Before merging, independently confirm each claimed change landed — `search_files` for the new error code / function / CSS class / i18n key in the actual source, don't rely on the submission doc's checklist. The doc is a self-report, not evidence. Budget a verification pass per claimed item; it is far cheaper than merging a half-done batch and re-dispatching.
- **Branches cut from a stale master produce phantom diff noise — scope the review to authorized paths.** When an agent's branch was created before later merges landed on master, `git diff master..branch --stat` shows files the agent NEVER touched as "deleted" or "added" (e.g. docs/comms files and server files appearing as hundreds of phantom deletions). These are merge-timing artifacts, not real changes. Review discipline: (1) run `git diff master..branch --stat` first for the lay of the land, then (2) re-run the diff scoped to the agent's authorized directories only (`-- server/`, `-- web/src/...`) to see the genuine change. Mentally discard everything outside those paths. The clean fix is requiring agents to `git rebase master` immediately before submitting (the submission templates already list this), but reviewers must still expect noise because rebases get skipped.
- **Running a diagnostic Node script inside the container: use `.cjs` and run from `/app/server`.** The container's `server/package.json` has `"type": "module"`, so a `.js` script using `require()` throws `ReferenceError: require is not defined in ES module scope`. And `better-sqlite3` resolves only from `/app/server/node_modules` — a script dropped in `/app` or `/tmp` fails with `Cannot find module`. Reliable recipe: write the script as `.cjs` (CommonJS), `docker cp` it to `/app/server/`, then `docker exec commission-web sh -c "cd /app/server && node diag.cjs"`. Inline `node -e "..."` via PowerShell→sh double-quoting breaks on the quotes — always use a copied file. Clean up afterward (`docker exec ... rm`).

## Third-Party Audit Review Workflow (预研判)

When receiving an external code audit report for this project:

1. **Cross-reference against already-fixed items** — check if the audit baseline commit predates our fix branches. Map each audit item to our fix IDs (C-1, C-2, H-2, etc.) and mark overlaps.
2. **Independently verify a sample** — read the actual source files for at least all P0 items + a sample of P1. Confirm line numbers, code patterns, and claimed behavior match reality. Use subagents for parallel verification.
3. **Produce a structured 预研判 document** for 一号 containing: (a) overall credibility judgment, (b) overlap table with our fixes, (c) verified-unfixed items with evidence, (d) risk assessment grouped by attack surface, (e) recommended fix order, (f) explicit decision items for 一号 to approve.
4. **Key credibility signals**: runtime probe outputs (not just static analysis), minimal reproduction commands, acknowledgment of what's done well (§8 pattern), specific fix suggestions with line numbers.
5. **Watch for "performative fixes"** (表演性修复): code comments claiming "已修复" + plausible implementation that doesn't actually execute (wrong registration order, wrong time format, frontend never calling the endpoint). The audit's §6.5 pattern is the canonical example.

## See Also

- `references/multi-agent-collaboration.md` — 5-role AI collaboration rules for 绘约 (roles 一号–五号, branch naming, file ownership boundaries, risk levels, hard rules, 一号's structured review format). READ THIS before reviewing/merging/releasing in this project. Updated 2026-07-29 with soul-audit fixes (shared file ownership, hard rules, plan-*.md reassignment).
- `references/soul-audit-methodology.md` — How to audit soul/role-definition files against project reality: extract rules from changelog → cross-reference soul files → find ownership gaps → verify safety completeness. Run on handoff or after major releases.
- `references/artist-website-benchmarks.md` — 10 curated real-artist website cases with URLs, color schemes, and design analysis
- `references/file-integrity-audit.md` — post-restore file-integrity audit: walk every file-path column and confirm each file exists (records restored ≠ files present). Run after ANY DB restore or when images show 加载失败.
- `templates/diagnose-sqlite.cjs` — production DB diagnostic: WAL checkpoint, migration vintage, per-table row counts, and the test/seed wipe fingerprint. Run against live DB + each `.bak.vN` before any recovery.
- `fullstack-web-scaffold` — for initial project scaffolding (Vue3 + Fastify + SQLite)
- `web-app-design-review` — when reviewing an existing commission platform's UI
