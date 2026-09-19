# Template System Implementation Pattern (Layout × Palette)

Proven in artist-commission v0.10.0 (Vue 3 + Element Plus + vue-i18n).

## CSS variable layering (three orthogonal systems)

```
--pal-*        palette vars (page mood)     ← artist picks palette_id, html[data-palette="ink"]
--color-primary accent (buttons/links)      ← visitor picks, html[data-accent="1..5"]
html.dark      light/dark mode              ← visitor preference
```

Each palette defines BOTH light and dark sets, so mood survives the visitor's mode choice:

```css
html[data-palette='ink']       { --pal-bg:#f4f4f2; --pal-surface:#fff;    --pal-text:#1a1a1a; --pal-text-dim:#8c8c8c; --pal-border:#dcdcdc; }
html.dark[data-palette='ink']  { --pal-bg:#0e0e0e; --pal-surface:#1d1d1d; --pal-text:#e6e6e6; --pal-text-dim:#8a8a8a; --pal-border:#2c2c2c; }
```

Template CSS rule: surfaces/text/borders use `var(--pal-*)`; anything emphatic (CTA buttons, active states, price highlights, plaque accent bar) uses `var(--color-primary)`. Never hardcode hex in templates.

Palette lifecycle composable — set on mount, **clean up on unmount** or the palette leaks into admin/backend pages:

```js
export function usePalette(paletteIdRef) {
  const apply = (id) => { document.documentElement.dataset.palette = VALID.includes(id) ? id : 'paper' }
  onMounted(() => apply(paletteIdRef?.value))
  if (paletteIdRef) watch(paletteIdRef, apply)          // data arrives after mount
  onUnmounted(() => { delete document.documentElement.dataset.palette })
}
```

## Data adapter layer

```js
// composables/useArtistData.js — the ONLY place templates read data through
export function useArtistData(props) {
  const { t } = useI18n()
  const imgUrl = (path) => (path ? `/uploads/${path}` : '')
  const statusText = (s) => t(`artistHome.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)
  const socialLinks = computed(() => [/* filter empty weibo/bilibili */])
  const heroArtwork = computed(() => (props.artworks || [])[0] || null)
  const previewList = computed(() => (props.artworks || []).map(a => imgUrl(a.image_path)))
  return { artist: computed(() => props.artist || {}), imgUrl, statusText, socialLinks, heroArtwork, previewList }
}
```

Adding future backend data (price addons, multipliers): one new computed here + one optional prop with `default: () => []` on the shared component + `v-if` guard. Templates and container change minimally; no regression surface.

## Shared component kit

| Component | Variants via props | Notes |
|-----------|-------------------|-------|
| `TplHero` | `variant="banner\|fullscreen\|split"` | exposes `sentinelEl` via `defineExpose` for sticky-CTA watching |
| `TplGallery` | `layout="grid\|editorial\|masonry"` | always `el-image` with `preview-src-list` + `initial-index` (bare `<img>` = no click-to-zoom, the #1 client need on an art page) |
| `TplTierGrid` | `featured` bool | `#addons="{ tier }"` scoped slot = price-calculator extension point, renders nothing when empty |
| `TplStatusBadge` / `TplRules` / `TplStickyCta` | — | status text via i18n; rules via sanitized v-html |

Layouts compose the kit and keep only their own structural `<style scoped>`. Palette CSS lives globally (`palettes.css`), imported once in `main.js`.

## Async-component timing fixes (required, not optional)

Templates load via `defineAsyncComponent`, so their DOM appears AFTER the container's `onMounted`:

1. **Scroll reveal** — IntersectionObserver alone misses everything. Add a MutationObserver:
```js
io = new IntersectionObserver(entries => { /* add .tpl-visible, unobserve */ }, { threshold: 0.12 })
scan(root)                                              // initial pass
mo = new MutationObserver(() => scan(root))             // catch async insertions
mo.observe(root, { childList: true, subtree: true })
```
2. **Sticky CTA sentinel** — `watch(sentinelRef, setup, { immediate: true })` instead of reading once in `onMounted`; re-observes when the hero finally mounts. Exposed refs need double unwrap: `computed(() => heroRef.value?.sentinelEl?.value)`.
3. **Scroll-spy nav** (folio) — same MutationObserver trick, because sections gated on async data (`workflowStages`) render late.

All three respect `prefers-reduced-motion` (CSS-level: `.tpl-reveal { opacity:1; animation:none }`).

## Legacy template ID mapping (when renaming IDs)

```js
// container: render registry
const LEGACY_TEMPLATE_MAP = { 'default': 'classic', 'dark-gallery': 'gallery', 'single-page': 'folio' }
const templateComponent = computed(() => {
  const raw = artist.value?.templateId || 'classic'
  return TEMPLATES[LEGACY_TEMPLATE_MAP[raw] || raw] || TEMPLATES.classic
})

// settings page: form load (so the selector highlights correctly)
form.template_id = LEGACY[profile.template_id] || profile.template_id
```

## Backend: palette column

Migration: `ALTER TABLE artists ADD COLUMN palette_id TEXT DEFAULT 'paper'` (check the next free version in `schema_migrations` first — plans drift). Service whitelist + validation falls back to default on illegal values instead of throwing (palette is cosmetic; never block a profile save over it). Public profile endpoint returns `paletteId`; container passes it to `usePalette`.
