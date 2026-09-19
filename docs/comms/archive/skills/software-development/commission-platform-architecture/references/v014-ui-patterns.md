# v0.14 Proven UI Patterns (画师端)

## Detail Page Status Architecture: Read-Only Status Card + Fixed Action Bar (R39 方案B)

When a detail page has TWO parallel status systems (fixed status steps + custom workflow timeline), 方案B resolves the conflict:

**Layout**: Status card (pure display) → Action bar (pure operations, FIXED position) → Content cards below.

```
┌─ 状态 ─────────────────────────────────────┐
│  [有工作流] 工作流进度条（唯一状态展示）      │  ← C52: el-steps 完全隐藏
│  [无工作流] 状态标签 + 最后活动时间 + 上下文  │  ← C53: 启用跟踪引导
│  [终态] 只读横幅（已交付/已取消）             │
└─────────────────────────────────────────────┘
┌─ 操作 ─────────────────────────────────────┐
│  [推进] [打回]              [取消订单]       │  ← 永远在这个位置
└─────────────────────────────────────────────┘
```

**Key rules:**
- Action bar position NEVER moves regardless of status mode (muscle memory)
- Terminal states (delivered/cancelled): action bar hidden entirely
- Cancel always uses slide-to-confirm (high-cost irreversible, R30e)
- "Enable tracking" for legacy orders: dedicated endpoint `PUT /orders/:id/track-on` sets `currentStageId = first node` WITHOUT changing `status` (reusing `advanceStage` resets status to pending — unacceptable)
- Client track page unaffected by detail page restructuring
- `useSlideConfirm` composable extracted for reuse (QueueBoard keeps its inline version untouched)

**Why not alternatives:** A (single card mode-switch) = buttons jump position between modes. C (command banner) = visually aggressive, clashes with el-card style, hard to maintain.

## Page Absorption Pattern (R42: merge standalone pages into existing ones)

When reducing navigation items by absorbing standalone pages:

1. **Convert page component to embeddable form**: remove layout wrapper (`ArtistLayout` shell → plain `<div>`), add `defineEmits(['created'])` for parent notification
2. **Host page integration**: drawer/dialog/tab in the host page (`OrderList.vue` gets a drawer for manual order, `Settings.vue` gets a tab for rules editor)
3. **Route redirect (mandatory)**: `{ path: '/old-path', redirect: '/new-path?action=x' }` — old links must not 404 (artists bookmark them)
4. **Sidebar cleanup**: remove menu item + icon import in the same commit
5. **Lazy-load absorbed components**: `defineAsyncComponent(() => import('./RulesEditorPanel.vue'))` — don't bloat host's initial chunk

**Verification**: auth guard still works on redirect targets (vue-router resolves `to` as the final target, so `requiresAuth` on `/orders` catches `/manual-order` → `/orders?action=manual`).

**Dashboard stale references**: after absorbing a page, grep for old route paths in Dashboard.vue and other files that link to the absorbed page. Update to new path.

## Interaction Swap Pattern (R44: click=preview, button=set-focus)

When swapping primary/secondary interactions on image grids:

- **Single click on image** → high-frequency action (fullscreen preview via `el-image-viewer`)
- **Small ✓ button** → low-frequency action (set focus image), with `@click.stop` to prevent bubbling to parent's preview handler
- **Mobile adaptation** (`@media (hover: none)`): action buttons (✓ + ✕) always visible (`opacity: 1`), not dependent on hover
- Remove the old affordance (🔍 button) when click now does the same thing — dead UI elements confuse users
- Clean up dead i18n keys after removing UI elements (grep for consumers before deleting)

**Event bubbling verification**: click ✓ → `@click.stop` truncates → only `selectFocusImage`; click elsewhere on image → bubbles to wrapper → `openGalleryViewer`. No conflict.

## Multi-Select Batch Operations Pattern (R45)

Adding batch operations to a grid/list:

- **Entry**: toolbar "管理" button toggles `manageMode` (not long-press/right-click — desktop+mobile universal, C58)
- **Selection**: `ref(new Set())` for selected IDs (immutable updates: `new Set(prev).add(id)`)
- **Visual**: `outline: 3px dashed var(--el-color-primary)` on selected items (doesn't affect layout, unlike border)
- **Selection layer**: absolute overlay with `z-index` blocks image preview clicks during manage mode
- **Batch bar**: fixed bottom bar showing "已选 N 项 | 删除 | 取消"
- **Confirmation tiering** (C59 方案C): single delete → standard `ElMessageBox.confirm`; batch ≥3 → slide-to-confirm; cancel order → slide (existing)
- **Loading guard**: `batchDeleting` ref prevents double-click during async deletion (`:loading="batchDeleting"` on button, try/finally)
- **Slide dialog reset**: `@closed="slideProgress = 0"` on el-dialog — without this, reopening shows stale progress bar
- **Serial deletion**: `for...of + await` per item (no batch API). Acceptable at current scale; add `Promise.allSettled` or batch endpoint when needed.

## Drag-Upload Anti-Flicker Pattern (R41)

When adding drag-upload to a container with child elements:

```js
// WRONG: child elements trigger dragleave as pointer crosses them
@dragleave="isDragOver = false"

// RIGHT: check if pointer moved to a child (still inside container)
function onDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return
  isDragOver.value = false
}
```

Also: `@dragover.prevent="isDragOver = true"` (preventDefault required to allow drop), `@drop.prevent="handleDrop"` (preventDefault stops browser opening the file).

## Image Loading Anti-Flash Pattern (R43)

For `el-image` grids that flash white on first load:

```html
<el-image :src="url" fit="cover" loading="lazy">
  <template #placeholder>
    <div class="img-skeleton"></div>
  </template>
</el-image>
```

```css
.img-skeleton {
  width: 100%; height: 100%;
  background: var(--bg-secondary, #f5f5f5);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

Plus: `.ref-img { background: var(--bg-secondary) }` as fallback for the brief moment before el-image renders its placeholder slot.
