# Vue3 + Element Plus 前端技术库（二号）

可复用模式，来自 artist-commission（绘约）v0.12/v0.13 实战。每条都标注了出处任务，便于回溯需求背景。

---

## 1. 签名 URL 定时刷新 composable（R33）

签名 URL 有效期 15 分钟（`file-sign.js` `FILE_TTL_MS`），长停留页面图片会 403。后端提供 `POST /api/artist/refresh-signatures`（body `{ paths: string[] }` 1-50 条，返回 `{ urls: { [path]: signedUrl } }`，requireAuth + 限流 20次/5min）。前端用统一 composable 接入：

```js
// web/src/composables/useSignatureRefresh.js
import { onUnmounted } from 'vue'
import { artistApi } from '../api/index.js'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000 // 10min（TTL 15min，留 5min 余量）
const MAX_ERROR_RETRIES = 2                // BUG-1: @error 触发刷新的最大重试次数

export function useSignatureRefresh({ collect, apply, intervalMs = DEFAULT_INTERVAL_MS }) {
  let refreshing = false
  let debounceTimer = null
  let errorRetries = 0

  async function doRefresh() {             // 实际刷新（防重入）
    if (refreshing) return
    const paths = collect()
    if (!paths.length) return
    refreshing = true
    try {
      const { urls } = await artistApi.refreshSignatures(paths)
      apply(urls)
      errorRetries = 0                     // 成功后重置重试计数
    } catch { errorRetries++ }             // 静默失败；超限后 @error 不再触发，定时刷新仍兜底
    finally { refreshing = false }
  }

  /** BUG-1: @error 兜底入口——防抖 300ms（多图同时 error 合并一次）+ 重试上限 */
  function refreshNow() {
    if (errorRetries >= MAX_ERROR_RETRIES) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(doRefresh, 300)
  }

  const timer = setInterval(doRefresh, intervalMs)   // 定时刷新直调，不受重试上限限制
  onUnmounted(() => { clearInterval(timer); clearTimeout(debounceTimer) })
  return { refreshNow }
}
```

**⚠️ BUG-5 修复要点（v0.17，按图刷新治本）**：BUG-1 的防抖+重试上限治标不治本——根因是 `refreshNow()` 无参调用 → `collect()` 收集全部路径 → `apply()` 替换全部 URL → 所有 el-image src 变化 → 全部重新渲染 → 可能再次 error → 循环。BUG-5 改为**按图刷新**：

```js
// BUG-5 核心变化（useSignatureRefresh.js）
const pendingPaths = new Set()   // 等待刷新的出错图片（Set 去重）
const errorRetries = new Map()   // path → 重试次数（按图独立计数）

function refreshNow(path) {
  if (typeof path === 'string' && path) {
    if ((errorRetries.get(path) || 0) >= MAX_ERROR_RETRIES) return  // 按图忽略
    pendingPaths.add(path)
  }
  // 非字符串入参（OrderDetail 旧用法透传 event）→ 不进 pendingPaths → 全量刷新（向后兼容）
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(flushPending, 300)
}

function flushPending() {
  if (refreshing) { debounceTimer = setTimeout(flushPending, 300); return }
  const targets = pendingPaths.size ? [...pendingPaths] : null
  pendingPaths.clear()
  doRefresh(targets, targets != null)  // targets=null → collect() 全量（定时器/旧无参调用）
}

async function doRefresh(paths, fromError = false) {
  const targets = paths?.length ? paths : collect()  // 有指定路径只刷指定图
  // ... apply(urls) 只收到 API 返回的指定路径 URL
  // 成功后 errorRetries.delete(p) 按图清除计数
  // 失败时 errorRetries.set(p, count+1) 按图累加
}
```

消费端配套改动（QueueBoard.vue）：`@error="() => refreshNow(element.focus_image_path)"`（传路径字符串）。**向后兼容关键**：OrderDetail.vue 仍用 `@error="refreshNow"`（el-image 透传 event 对象），`typeof path === 'string'` 判断为 false → 不进 pendingPaths → flushPending 时 targets=null → doRefresh 走 collect() 全量——行为与旧版一致。**改共享 composable 前必须 grep 所有消费者**（含授权外文件），确认非字符串入参的回退路径不破坏旧行为。

**⚠️ BUG-1 修复要点（v0.16，排期看板焦点图闪烁）**：早期版本 `refreshNow` 直接执行刷新且无重试上限，导致两个问题——(1) 多张图同时 403 时各自触发一次刷新（无防抖），网络面板看到重复请求；(2) 刷新连续失败后 `@error` 无限重试（无上限）。修复：把"实际刷新"抽成 `doRefresh`，`@error` 绑定的 `refreshNow` 变成**防抖 300ms + 重试上限 2 次**的入口；**定时刷新（setInterval）直调 `doRefresh`，不走重试上限**——定期兜底不应被 @error 的失败计数阻断。成功后 `errorRetries = 0` 重置。`onUnmounted` 同时清理 interval 和 debounce 计时器。**配套 CSS**：焦点图容器加底色防白闪——`.focus-large-img`/`.focus-img-wrap { background: var(--bg-card); }`（图片加载/刷新期间容器有底色，不再白闪）。抄这个 composable 时务必抄当前版本，旧版（无防抖/无上限）会重新引入闪烁。

页面接入（OrderDetail.vue 为例）：
```js
const { refreshNow } = useSignatureRefresh({
  collect: () => {
    const o = order.value; if (!o) return []
    return [
      ...(o.references || []).map(r => r.file_path),
      ...(o.notes || []).filter(n => n.image_path).map(n => n.image_path),
      ...(o.deliverables || []).map(d => d.file_path)
    ].filter(Boolean)
  },
  apply: (urlMap) => {
    const o = order.value; if (!o) return
    o.references?.forEach(r => { if (urlMap[r.file_path]) r.url = urlMap[r.file_path] })
    o.notes?.forEach(n => { if (n.image_path && urlMap[n.image_path]) n.imageUrl = urlMap[n.image_path] })
    o.deliverables?.forEach(d => { if (urlMap[d.file_path]) d.url = urlMap[d.file_path] })
  }
})
```
再给每个 `el-image`/`img` 加 `@error="refreshNow"` 作为兜底（加载失败立即刷新）。

**要点**：collect 收集的是**裸路径**（`file_path`/`image_path`），不是签名 URL；apply 把新 URL 写回响应式数据。静默失败 + 防重入 + onUnmounted 清理，三者缺一不可。客户侧页面（DeliveryPage）无 requireAuth 权限调此接口——若需要，要三号出客户侧刷新接口，不要硬接。

---

## 2. el-image 点击被内置预览吞掉（R18 必修项，一号驳回过）

**症状**：wrapper 有 `@click="selectFocusImage"`，子 `el-image` 有 `preview-src-list` + `@click.stop`。点图片只开预览，handler 永不触发。

**修复**：移除 el-image 的 `preview-src-list`/`initial-index`/`@click.stop`，让点击冒泡到 wrapper；预览改为悬停出现的放大镜按钮，手动开 `el-image-viewer`：
```html
<div class="ref-img-wrap" @click="selectFocusImage(reference)">
  <el-image :src="reference.url" fit="cover" class="ref-img" />
  <span class="ref-hover-actions">
    <el-button circle @click.stop="openGalleryViewer(index)">🔍</el-button>
    <el-button circle type="danger" @click.stop="deleteReference(reference)">✕</el-button>
  </span>
</div>
<!-- 页面底部 -->
<el-image-viewer v-if="galleryViewerVisible"
  :url-list="order.references?.map(r => r.url) || []"
  :initial-index="galleryViewerIndex"
  @close="galleryViewerVisible = false" />
```
交互语义：**单击 = 业务动作 · 悬停🔍 = 预览 · 悬停✕ = 删除**。`el-image-viewer` 全局注册，模板可直接用。这是本项目最高发的 Element Plus 点击 Bug。

---

## 3. 手机端左滑进详情（R30c，触屏专属）

桌面不做等效（C43 拍板）。用 pointer 事件检测，排除交互元素：
```js
let swipeStart = null
function onCardPointerDown(e) {
  if (e.pointerType !== 'touch') return
  if (e.target.closest('button, .drag-handle, .slide-cancel, .el-dropdown, .el-image')) return
  swipeStart = { x: e.clientX, y: e.clientY }
}
function onCardPointerUp(e, order) {
  if (!swipeStart) return
  const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y
  swipeStart = null
  if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) router.push(`/orders/${order.id}?from=queue`)
}
```
阈值：左滑 ≥60px 且水平主导（dx > 1.5×dy）。`closest()` 排除列表防止与按钮/拖拽/下拉冲突。

---

## 4. 滑块确认（R30e，取消订单防误触）

替代 `ElMessageBox.confirm`。pointer 拖拽到底（≥90%）触发，松手未到底自动回弹：
```js
const cancellingId = ref(null), slideProgress = ref(0)
let slideRect = null
function onSlideStart(e) {
  slideRect = e.currentTarget.closest('.slide-cancel').getBoundingClientRect()
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onSlideMove(e) {
  if (!slideRect) return
  const x = e.clientX - slideRect.left - 20
  slideProgress.value = Math.max(0, Math.min(1, x / (slideRect.width - 40)))
}
async function onSlideEnd(e, order) {
  if (!slideRect) return; slideRect = null
  if (slideProgress.value >= 0.9) { /* 执行取消 */ } else { slideProgress.value = 0 }
}
```
样式：`.slide-cancel` 999px 圆角轨道 + `.slide-cancel-fill`（width 跟随 progress）+ `.slide-cancel-thumb`（left 跟随 progress，`touch-action: none`，`setPointerCapture` 保证拖出元素仍收事件）。轨道用 `--el-color-danger-light-9`，拇指用 `--el-color-danger`。

**R39 已抽成 composable**：`web/src/composables/useSlideConfirm.js`，逻辑与 QueueBoard 内联版一致（阈值 0.9、pointer capture、回弹归零），返回 `{ active, progress, open, close, onStart, onMove, onEnd }`。新页面（如 OrderDetail 取消订单）统一走 composable，QueueBoard 原有内联实现不动（避免回归）。用法：
```js
const { active, progress, open, close, onStart, onMove, onEnd } =
  useSlideConfirm({ onConfirm: doCancel })
// 模板：.slide-confirm-fill width = progress * 100%，.slide-confirm-thumb left = 2px + progress * (100% - 40px)
```
⚠️ **抽 composable 时别漏 API 层**：R39 同时接线了 `artistApi.trackOn()`（启用跟踪），但忘了在 `api/index.js` 定义该方法——ESLint/Vite build 都不报错，运行时点按钮才崩。见 SKILL.md 陷阱「Composable extraction without API-layer wiring」。

⚠️ **滑块嵌在 el-dialog 里时，关闭后进度会残留**（v0.14 审核必修项）：`useSlideConfirm` 的 `close()` 只在拖到底或点 ✕ 时调用；用户直接点遮罩/Esc 关弹窗不会走 `close()`，下次打开滑块停在半路。修复：给 el-dialog 加 `@closed="slideProgress = 0"`（`closed` 是动画结束后的事件，比 `close` 更适合重置视觉状态）。凡是滑块确认放在 dialog/drawer 里的，一律加这行。

---

## 5. 看板布局：一行一条（用户决策，R30a 多列已回退）

⚠️ **R30a 的宽屏多列（`repeat(auto-fill, minmax(360px, 1fr))`）已被用户明确否决并回退**（2026-07-30 queuefix：「排期看板必须保持一行一条」）。多列实现偏离了用户决策，上线后被用户投诉。**不要在任何看板/队列页面再用 auto-fill 多列。**

正确做法：
```css
/* 一行一条（用户决策）；宽屏空间由卡片内部横向展开消化，不拆多列 */
.queue-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
```
宽屏利用空间的方向是**卡片内部横向展开**（焦点图/描述/价格/进度并排，`flex` + `margin-left: auto` 右对齐操作区），不是把卡片拆成多列。窄屏媒体查询里冗余的 `grid-template-columns: 1fr` 可以删（全局已是 1fr）。

教训：实现前核对 comms/STATUS 里的用户决策，现有代码不等于用户意图（见 SKILL.md 陷阱「User decisions override current code」）。

---

## 6. 下一步主操作外露（R30b）

状态 → 主操作映射，卡片上直接显示（不藏下拉），下拉保留取消等次要操作：
```js
const NEXT_ACTION = {
  pending:   { command: 'confirmed', labelKey: 'queue.confirm',  type: 'primary' },
  confirmed: { command: 'wip',       labelKey: 'queue.startWip', type: 'warning' },
  wip:       { command: 'done',      labelKey: 'queue.done',     type: 'success' },
  revision:  { command: 'done',      labelKey: 'queue.done',     type: 'success' },
  done:      { command: 'delivered', labelKey: 'queue.deliver',  type: 'success' }
}
const nextAction = (status) => NEXT_ACTION[status] || null
```
```html
<el-button v-if="nextAction(element.status)" :type="nextAction(element.status).type"
  @click="quickAction(nextAction(element.status).command, element)">
  {{ $t(nextAction(element.status).labelKey) }}
</el-button>
```

---

## 7. 外链文字徽标（R15/R34，一号拍板：纯文字标签 + Link 图标兜底，不自造 SVG 库）

```js
// useArtistData.js
const LINK_ICON_BADGE = { weibo:'微', bilibili:'B', pixiv:'P', x:'X',
  xiaohongshu:'红', lofter:'L', douyin:'抖', link:'🔗' }
const socialLinks = computed(() => {
  const links = artist.value.customLinks
  if (!Array.isArray(links) || !links.length) return []
  return links.map((item, i) => ({
    key: `${item.icon || 'link'}-${i}`, url: item.url, label: item.name,
    badge: LINK_ICON_BADGE[item.icon] || LINK_ICON_BADGE.link
  }))
})
```
数据源是后端拼好的 `customLinks`（含旧列 weibo_url/bilibili_url 回退），**前端不碰旧字段**。四个模板各自气质渲染徽标：Classic 左栏竖排圆角徽标 · Gallery 页脚展签式横排（直角边框+大写字距）· Folio CTA 区胶囊横排（999px 圆角+悬停上浮）· Atelier 页脚横排（赭橙 `--atelier-accent` 笔触下划线+徽标 -3° 微旋转悬停归正）。无外链时 `v-if="socialLinks.length"` 不渲染。

---

## 8. 粘贴焦点路由（R19，双粘贴目标）

`usePasteUpload` 是 document 级监听。图库（多张）与备注附图（单张）共存时，在 `onFiles` 里按焦点路由：
```js
const { pasteError } = usePasteUpload({
  onFiles: async (files) => {
    if (document.activeElement?.closest('.note-input')) {
      await uploadNoteImage(files[0])
      if (files.length > 1) ElMessage.info(t('orderDetail.noteImageSingle'))
    } else {
      await uploadGalleryFiles(files)
    }
  },
  maxCount: 5, maxSizeMB: 10
})
```
函数声明有 hoisting，回调里引用后定义的 `uploadNoteImage` 是安全的。

**拖拽进入高亮的 dragleave 闪烁**（v0.14 审核必修项）：给容器加 `@dragover.prevent="isDragOver = true"` + `@dragleave="isDragOver = false"` 会闪——拖过子元素时，离开子元素触发父容器的 dragleave，高亮瞬间熄灭又被 dragover 点亮。修复：用 `relatedTarget` 判断是否真的离开了容器：
```js
function onNoteDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return  // 还在容器内（子元素间移动），忽略
  isNoteDragOver.value = false
}
```
模板：`@dragleave="onNoteDragLeave"`。凡是有 dragover/dragleave 配对高亮的容器（图库上传磁贴、备注输入区）都用这个写法，不要用 dragenter/dragleave 计数器（relatedTarget 更简洁）。

---

## 9. 独立页面 → 抽屉组件合并（R42a/R42b）

用户拍板"手动录单合并进订单管理；须知编辑合并进设置"后的标准做法：

**页面转组件**（ManualOrder.vue 为例）：
1. 剥掉 `<ArtistLayout>` 壳和 `<h2>` 标题（抽屉自带 chrome），根节点换成普通 `<div class="manual-order-form">`
2. 成功后的路由跳转改为事件：`const emit = defineEmits(['created'])`，提交成功后 `emit('created', order.order_no)`，父组件监听后刷新列表
3. 删掉组件内不再需要的 Layout import

**父页面承载**（OrderList.vue）：
```html
<el-drawer v-model="manualDrawerVisible" :title="$t('manualOrder.title')" size="560px" direction="rtl">
  <ManualOrderForm v-if="manualDrawerVisible" @created="onManualCreated" />
</el-drawer>
```
`v-if="manualDrawerVisible"` 是关键：关闭抽屉即销毁组件，表单状态自动重置，无需手写 reset。

**路由兼容**（旧链接不 404）：
```js
{ path: '/manual-order', redirect: '/orders?action=manual' },  // 删除原命名路由
{ path: '/rules', redirect: '/settings?tab=rules' },
```
目标页读 query 自动展开：
```js
onMounted(() => {
  loadOrders()
  if (route.query.action === 'manual') manualDrawerVisible.value = true
})
// Settings.vue：const activeTab = ref(route.query.tab === 'rules' ? 'rules' : 'profile')
```

**收尾**：侧边栏 `BASE_MENU_ITEMS` 删对应项 + 清理不再使用的图标 import（EditPen/Document，ESLint 会抓 unused import）；被完全取代的页面文件直接删（RulesEditor.vue），功能迁入的保留文件转组件（ManualOrder.vue）。

**链式影响检查**：删/改路由前全库 grep 该路径——R42a 发现 Dashboard.vue 两处引用 `/manual-order`（快捷按钮 + 默认面板配置）。重定向保证功能不断，但引用文件若不在授权范围，comms 里列为遗留事项交一号。

---

## 10. 触屏常驻操作按钮（R44/C56）

悬停显示的操作组在触屏上不可达。用户拍板（C56）：不做长按（浏览器冲突 + 可发现性差），触屏常驻：
```css
.ref-hover-actions { opacity: 0; transition: opacity 0.15s; }
.ref-img-wrap:hover .ref-hover-actions { opacity: 1; }
/* 触屏无悬停，操作按钮常驻 */
@media (hover: none) {
  .ref-hover-actions { opacity: 1; }
}
```
`@media (hover: none)` 是项目标准答案，不要用 UA 嗅探或长按。R44 同时互换了交互语义：**单击图片 = 放大预览**（高频操作提到最通用交互），**✓ 小钩按钮 = 设焦点**（低频收敛到按钮），🔍 预览按钮移除（单击已等效）。提示文案（galleryHint）随交互变更同步更新——这属于功能适配，不违反"i18n 只加不改成文"（那条针对的是无关措辞改动）。

---

## 11. el-image 骨架屏防白闪（R43）

签名 URL 图片异步到达，首屏多张同时白闪。修复（~15min）：
```html
<el-image :src="reference.url" fit="cover" class="ref-img" @error="refreshNow">
  <template #placeholder>
    <div class="ref-img-skeleton"></div>
  </template>
</el-image>
```
```css
.ref-img { background: var(--bg-secondary, #f0f0f0); }  /* 兜底背景色 */
.ref-img-skeleton {
  width: 100%; height: 100%;
  background: var(--bg-secondary, #f0f0f0);
  animation: ref-skeleton-pulse 1.2s ease-in-out infinite;
}
@keyframes ref-skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
```
`@error="refreshNow"`（R33 签名刷新兜底）保持不动。

---

## 12. 多选模式 + 分级删除确认（R45/C58/C59）

工具栏"管理"按钮切换多选（C58，比长按/右键更符合桌面习惯且手机可用）：
```js
const manageMode = ref(false)
const selectedIds = ref(new Set())
function toggleManageMode() {
  manageMode.value = !manageMode.value
  selectedIds.value = new Set()  // 进入/退出都清空
}
function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = next  // Set 非响应式深追踪，必须整体替换才触发更新
}
```
多选模式下的卡片：选择层覆盖图片（`position: absolute; inset: 0`，点击切换选中），同时**阻断 el-image 预览**——`:preview-src-list="manageMode ? [] : urls"`；选中态用 outline 高亮 + 左上角圆形 ✓ 角标。底部固定批量操作栏（`position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`，999px 圆角胶囊 + 阴影）。

确认分级（C59：只有高代价用滑块）：
```js
async function startBatchDelete() {
  if (selectedIds.value.size < 3) {
    await ElMessageBox.confirm(...)   // 少量：标准弹窗
    await doBatchDelete()
  } else {
    slideDialogVisible.value = true   // ≥3：滑块确认（el-dialog 内嵌 useSlideConfirm）
  }
}
```
无批量接口时逐条删除 + 部分失败上报：
```js
let failed = 0
for (const id of ids) { try { await artistApi.deleteArtwork(id) } catch { failed++ } }
failed === 0
  ? ElMessage.success(t('artworks.batchDeleted', { n: ids.length }))
  : ElMessage.warning(t('artworks.batchPartial', { ok: ids.length - failed, failed }))
```
量级增长后请三号加真正的批量接口——comms 里提，不自己扩 scope。

**批量操作必须加 loading 态**（v0.14 审核必修项）：逐条删除是串行 await，几十条要好几秒，期间按钮可重复点击触发重复删除。标准做法：
```js
const batchDeleting = ref(false)
async function doBatchDelete() {
  batchDeleting.value = true
  try { /* 逐条删除循环 */ } finally { batchDeleting.value = false }
}
// 模板：<el-button :loading="batchDeleting" @click="startBatchDelete">
```
入口置 true、`finally` 复位 false（失败也要复位，否则按钮永久转圈）。所有异步批量操作（批量删除/批量上传/批量状态变更）都适用。

---

## 13. 空态上传磁贴（queuefix：看板焦点图空态入口）

卡片内某个图片槽位为空时，不要留白——放一个与图片同尺寸的虚线占位按钮，点击选文件 / 拖拽图片放入，上传后直接生效：

```html
<div v-if="focusDisplay === 'large'" class="focus-area">
  <el-image v-if="element.focus_image_path" :src="element.focusImageUrl" ... />
  <!-- 空态上传：点击选文件 / 拖拽放入 -->
  <div v-else class="focus-empty"
    :class="{ 'focus-empty--active': focusDragId === element.id }"
    @click="triggerFocusUpload(element)"
    @dragover.prevent="focusDragId = element.id"
    @dragleave="onFocusDragLeave($event, element)"
    @drop.prevent="handleFocusDrop($event, element)">
    <el-icon :size="20"><Plus /></el-icon>
    <span class="focus-empty-text">{{ $t('queue.uploadFocus') }}</span>
  </div>
</div>
```
```css
.focus-empty {
  width: 160px; height: 120px;  /* 与大图同尺寸，卡片高度稳定不跳动 */
  border: 2px dashed var(--border-color); border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; cursor: pointer; color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.focus-empty:hover, .focus-empty--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
```

要点：
- **点击上传**用隐藏 `<input type="file" hidden>` + 模块级变量记当前目标订单（`let focusUploadTarget = null`），`triggerFocusUpload(order)` 设目标后 `input.click()`，`@change` 里取文件上传后清空目标
- **拖拽上传**：dragover 高亮（记 `focusDragId = element.id`），dragleave 用 `relatedTarget` 防闪（见第 8 节），drop 取第一张图片
- **上传后直接生效**：复用 `uploadApi.reference(file)` + `artistApi.setFocusImage(order.id, { imagePath, mode: 'large' })`，成功后 `loadQueue()` 刷新
- **校验与图库区一致**：非图片拒绝（`galleryNotImage`）、10MB 上限（`galleryTooBig`）
- **⚠️ 多上传目标的页面不开粘贴上传**：`usePasteUpload` 是 document 级监听，页面有多个上传目标时全局粘贴无法可靠路由——用户明确指示看板页不加粘贴。粘贴只在"目标可由焦点推断"的页面用（如 OrderDetail：备注输入框聚焦→备注附图，否则→图库）
- **手机左滑排除**：占位区加入 `closest()` 排除列表（`.focus-empty`），防止点占位区触发左滑进详情

---

## 14. 活动时间线：状态+备注合并（R40/C54，方案A 纯前端）

用户拍板"状态卡和备注卡合并为一条活动时间线"。数据层不变（系统备注已写在 `order_notes` 表，`created_by='system'`），只改渲染层——零后端改动。

**前提核实**（开工前必查）：
- `order_notes` 表有 `created_by` 字段（`'artist'`/`'system'`），getOrder 返回 `SELECT *` + `ORDER BY created_at ASC`——notes 已按时间排好序，前端直接渲染
- 系统备注由后端在状态变更时写入（order.service.js），内容如"从 X 回退到 Y"
- **操作条不合并进时间线**（一号关键提醒）——操作条保持独立卡片，时间线只合并"状态展示区 + 备注区"

**实现**（el-timeline，Element Plus 全局注册可直接用）：
```html
<el-timeline v-if="order.notes?.length" class="activity-timeline">
  <el-timeline-item
    v-for="note in order.notes" :key="note.id"
    :type="note.created_by === 'system' ? 'info' : (note.image_path ? 'success' : 'primary')"
    :hollow="note.created_by === 'system'"
    :timestamp="formatDate(note.created_at)" placement="top"
  >
    <div class="tl-item" :class="{ 'tl-item--system': note.created_by === 'system' }">
      <div class="tl-head">
        <span class="tl-type">{{ note.created_by === 'system' ? '🔄' : (note.image_path ? '🖼' : '📝') }} {{ ...类型文案 }}</span>
        <!-- R46 删除按钮（见第 15 节） -->
      </div>
      <div class="tl-content">{{ note.content }}</div>
      <img v-if="note.imageUrl" :src="note.imageUrl" class="note-thumb" @click="openNoteImage(note.imageUrl)" />
    </div>
  </el-timeline-item>
</el-timeline>
<el-empty v-else :description="$t('orderDetail.noNotes')" :image-size="60" />
<!-- 添加备注输入框移到时间线底部（R40 验收标准 #3） -->
```

类型标识三态：🔄 状态变更（info 空心点，内容灰色小字）/ 📝 备注（primary 实心点）/ 🖼 带图备注（success 实心点）。系统备注用 `:hollow="true"` 视觉降权。

**要点**：
- 原备注卡的 `.notes`/`.note-item`/`.note-head`/`.note-time`/`.note-content` 样式全部删除，换成 `.tl-*` 系列（删干净，不留死样式）
- 备注输入框（含附图按钮 + 待发送预览）从原备注卡移入时间线卡底部，功能完整保留
- 状态卡标题键 `statusTitle` → `activityTitle`（文案不变，只换键名），旧键 `statusTitle`/`notes` 成为死键需清理（见 SKILL.md 陷阱「Dead i18n keys」）
- 老订单（无工作流）时间线正常可用——系统备注 + 画师备注混排不依赖工作流
- 操作条触发状态变更后后端写系统备注，`loadOrder()` 刷新后时间线即时显示新节点（验收标准 #5）

---

## 15. 备注删除：悬停✕ + 确认弹窗 + 系统备注保护（R46/C59）

单条删除用 `ElMessageBox.confirm`（C59 方案C），系统备注不可删（前端不显示按钮 + 后端 403 兜底）：

```js
// api/index.js（隐含授权文件，comms 里注明）
deleteNote: (id, noteId) => api.delete(`/artist/orders/${id}/notes/${noteId}`),

// OrderDetail.vue
async function deleteNote(note) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.deleteNoteConfirm'), t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    // 后端返回删除后的完整订单（含新签名 URL），直接替换保证状态一致
    order.value = await artistApi.deleteNote(route.params.id, note.id)
    ElMessage.success(t('orderDetail.deleteNoteSuccess'))
  } catch (err) { ElMessage.error(err.message) }
}
```

模板（时间线节点内）：
```html
<el-button
  v-if="note.created_by !== 'system'"
  class="tl-delete" size="small" circle type="danger"
  :title="$t('orderDetail.deleteNote')"
  @click="deleteNote(note)"
>
  ✕
</el-button>
```

样式（悬停显示 + 触屏常驻，与参考图 `.ref-hover-actions` 交互一致 C56）：
```css
.tl-delete { opacity: 0; transition: opacity 0.15s; margin-left: auto; }
.tl-item:hover .tl-delete { opacity: 1; }
@media (hover: none) { .tl-delete { opacity: 1; } }
```

**要点**：
- `v-if="note.created_by !== 'system'"` 是前端第一道防线，后端 403 是兜底——两道都要有
- 删除成功后用后端返回的完整订单替换 `order.value`（DELETE 路由返回 `signOrderUrls(getOrder(...))`），不手动 splice 数组——保证签名 URL 等关联状态一致
- 新增错误码 `NOTE_NOT_FOUND`/`SYSTEM_NOTE_PROTECTED` 需同步加入 zh-CN.js + en.js 的 `errors` 块（对齐后端 errors.js），否则错误提示回退到原始英文
- **ESLint 陷阱**：多行属性的 `<el-button ...>✕</el-button>` 会触发 `vue/multiline-html-element-content-newline` 警告——内容必须单独成行（`>\n  ✕\n</el-button>`）

---

## 16. 已有图片槽位的点击/拖拽替换（R53，复用空态上传链路）

空态上传磁贴（第 13 节）解决"无图时上传"，R53 解决"有图时替换"——同一个 `uploadAndSetFocus()` 链路，包装层不同：

```html
<!-- 已有焦点图：点击选文件 / 拖拽替换 -->
<div
  v-if="element.focus_image_path"
  class="focus-img-wrap"
  :class="{ 'focus-img-wrap--active': focusDragId === element.id }"
  @click="triggerFocusUpload(element)"
  @dragover.prevent="focusDragId = element.id"
  @dragleave="onFocusDragLeave($event, element)"
  @drop.prevent="handleFocusDrop($event, element)"
>
  <el-image :src="element.focusImageUrl" fit="cover" class="focus-large-img" @error="refreshNow" />
  <div v-if="focusDragId === element.id" class="focus-replace-overlay">
    <span>{{ $t('queue.dropToReplace') }}</span>
  </div>
</div>
```

```css
.focus-img-wrap {
  position: relative; width: 160px; height: 120px;
  border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: box-shadow 0.15s;
}
.focus-img-wrap:hover { box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.focus-replace-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); color: #fff;
  font-size: 13px; font-weight: 600;
  pointer-events: none;  /* 遮罩不拦截事件，drop 仍由包装层接收 */
}
.focus-img-wrap--active { box-shadow: 0 0 0 2px var(--el-color-primary); }
```

**要点**：
- **🔴 必须移除 el-image 的 `preview-src-list`**——该属性会吞掉点击事件（第 2 节同款陷阱），与"点击=替换"冲突。这是 R53 的隐含必修项，需求文档不会写，靠代码核实发现。移除后看板焦点图不再有内置预览（订单详情页仍可预览），comms 里注明这个取舍
- **不需要确认弹窗**（用户明确拍板）——旧图保留在图库（`uploadAndSetFocus` 只加 reference + 设焦点，不删旧图），替换不是破坏性操作
- 遮罩 `pointer-events: none`——只作视觉反馈，drop 事件由包装层接收
- 复用现有 `focusDragId` 状态（空态和替换共享同一个拖拽高亮变量）+ `onFocusDragLeave` 防闪烁
- 左滑进详情的 `closest()` 排除列表要加 `.focus-img-wrap`（防触屏替换操作误触发导航）
- 校验复用 `uploadAndSetFocus` 内的非图片/10MB 检查，不重复写

---

## 17. 覆盖需确认的图片替换（R55，与 R53 行为相反）

R53（第 16 节）替换焦点图**不需要确认**——旧图保留在订单图库。R55 替换档位示例图**必须确认**——旧图被覆盖后不可恢复。同一个拖拽/点击上传交互，确认语义相反，是用户明确拍板的差异（一号提醒「别统一行为」）。实现差异只在上传函数入口：

```js
/** 上传示例图（无图直传；有图先确认再覆盖——旧图不可恢复，与 R53 看板焦点图行为不同） */
async function uploadTierExample(file, row) {
  if (!file.type.startsWith('image/')) { ElMessage.error(t('tiers.notImage')); return }
  if (file.size > 10 * 1024 * 1024) { ElMessage.error(t('tiers.tooBig')); return }
  if (row.example_image) {                       // ← R55 独有：有图才弹确认
    try {
      await ElMessageBox.confirm(
        t('tiers.overwriteConfirm'), t('tiers.overwriteTitle'),
        { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
      )
    } catch { return }                           // 取消 → 原图不变（验收标准 #3）
  }
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.updateTier(row.id, { exampleImage: uploaded.filePath })
    ElMessage.success(t('tiers.exampleUpdated'))
    await loadTiers()
  } catch (err) { ElMessage.error(err.message) }
}
```

模板包装层与 R53 完全同构（`.tier-img-wrap` + dragover/dragleave/drop/click + 遮罩 + 隐藏 input），遮罩文案换掉即可。**要点**：
- 判断依据是「旧资产是否保留」：保留 → 无确认（R53）；销毁 → 确认（R55）。新需求先问这个问题
- 列表级直传不打开编辑弹窗；弹窗内原有的「更换」按钮保持无确认（用户只要求列表级加确认，不扩散）
- 列表 el-image 同样要移除 `preview-src-list`（点击=上传，第 2 节陷阱）
- ⚠️ 老页面可能没有 `useI18n`（TierManage.vue  originally 全硬编码中文）——用 `t()` 前先 grep，缺则补 `import { useI18n } from 'vue-i18n'` + `const { t } = useI18n()`，否则运行时 `t is not defined`（ESLint/build 都不报）

---

## 18. 头像上传：即时保存（R48，不走 Save 按钮）

头像与表单其他字段不同——上传即生效，不等用户点保存（REQ-009 验收标准 #1「上传后客户应该看到新头像」）：

```html
<el-form-item :label="$t('settings.avatarLabel')">
  <div class="avatar-upload" @click="triggerAvatarUpload">
    <el-avatar :size="72" :src="avatarPreviewUrl" class="avatar-preview">
      {{ form.name?.charAt(0) || '?' }}   <!-- 无头像首字母兜底，不显示破图 -->
    </el-avatar>
    <span class="avatar-upload-hint">{{ $t('settings.avatarHint') }}</span>
  </div>
  <input ref="avatarInputEl" type="file" accept="image/*" hidden @change="handleAvatarSelect" />
</el-form-item>
```
```js
const avatarPreviewUrl = computed(() => form.avatar ? `/uploads/${form.avatar}` : undefined)

async function handleAvatarSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) { ElMessage.error(t('settings.avatarNotImage')); return }
  if (file.size > 10 * 1024 * 1024) { ElMessage.error(t('settings.avatarTooBig')); return }
  try {
    const uploaded = await uploadApi.image(file)              // → images/ 目录
    await artistApi.updateProfile({ avatar: uploaded.filePath }) // 即时保存
    form.avatar = uploaded.filePath
    ElMessage.success(t('settings.avatarUpdated'))
  } catch (err) { ElMessage.error(err.message) }
}
```

**要点**：
- 上传链路：`uploadApi.image`（返回 `filePath`，如 `images/xxx.webp`）→ `PUT /api/artist/profile { avatar }`（后端校验路径必须在 `images/` 下，拒绝穿越）→ 更新本地 `form.avatar`
- 读取：GET profile 返回 snake_case `profile.avatar`（见 SKILL.md 陷阱「GET snake_case / PUT camelCase」）
- 校验与作品上传一致：image/* + ≤10MB
- **模板消费 gap**：v0.15 时只有 Classic 模板渲染 avatar（侧边栏 el-avatar），Gallery/Folio/Atelier 的 TplHero 不渲染头像——4 模板统一消费是后续批次的事，comms 里列为待确认项，不自行扩 scope

---

## 19. 强调色覆盖：data-accent 注入 + 访客选择恢复（R49/C61）

画师自定义强调色要覆盖访客 ThemePicker 的主色选择，且只影响客户主页（C61）。**关键发现**：后端白名单 5 色（`#34dbcb/#34c2db/#3498db/#346edb/#3445db`）与 theme.css 的 `html[data-accent="1"~"5"]` 一一对应（含 `html.dark[data-accent]` 暗色提亮变体）——所以客户侧注入**零 CSS 新增**，直接设 `data-accent` 属性：

```js
// ArtistHome.vue
const ACCENT_INDEX = { '#34dbcb': '1', '#34c2db': '2', '#3498db': '3', '#346edb': '4', '#3445db': '5' }
const accentOverride = computed(() => {
  const raw = previewAccent.value || artist.value?.accentColor   // 预览参数优先（R50）
  return raw ? (ACCENT_INDEX[String(raw).toLowerCase()] || null) : null
})
let savedAccent = null
let accentApplied = false
watch(accentOverride, (idx) => {
  if (idx) {
    if (!accentApplied) { savedAccent = document.documentElement.dataset.accent || null; accentApplied = true }
    document.documentElement.dataset.accent = idx     // 覆盖访客选择
  } else if (accentApplied) {
    if (savedAccent) document.documentElement.dataset.accent = savedAccent
    else delete document.documentElement.dataset.accent
    accentApplied = false
  }
}, { immediate: true })
onUnmounted(() => {                                    // 离开主页恢复访客选择
  if (accentApplied) {
    if (savedAccent) document.documentElement.dataset.accent = savedAccent
    else delete document.documentElement.dataset.accent
  }
})
```

**要点**：
- **4 模板零改动**：所有模板已消费 `--color-primary`（按钮/链接/高亮），data-accent 一改全局生效——验收标准 #5「4 模板一致」天然满足。不要往模板里注入 CSS 变量
- 暗色模式免费：theme.css 已有暗色变体（验收标准 #3），不需要前端调明度
- `savedAccent` + `accentApplied` 双变量是恢复逻辑的核心：只在第一次覆盖时快照访客值，卸载/清除时精确恢复。别用「恢复默认值 1」这种近似——访客可能选的是 3
- 未设置（null）时 `accentOverride` 为 null → 不覆盖，行为与现在一致（验收标准 #2）
- 画师端选择器用 **5 色色板按钮**（与 ThemePicker 视觉一致），**不用 el-color-picker**——自由取色超出后端白名单会 400（见 SKILL.md 陷阱「Backend whitelist constraints override the dispatch's UI component choice」）
- 保存：template tab 的 save 里 `accentColor: form.accentColor`（null = 清除，后端允许 `['string','null']`）；读取 `profile.accent_color || null`

---

## 20. 预览模式：query 参数覆盖渲染层（R50，防屎山三约束）

画师在设置页改了模板/色板/强调色但没保存，点「预览主页」看效果。设计约束（REQ-009 防屎山条款）：**单点分支**（覆盖逻辑只在 ArtistHome.vue 入口一个 if，不扩散到 4 模板内部）、**零数据风险**（参数只影响渲染，不写库不改 API）、**只传选了什么不传数据本身**。

画师端（Settings.vue）：
```js
function openPreview() {
  const params = new URLSearchParams({ _tpl: form.templateId, _pal: form.paletteId })
  if (form.accentColor) params.set('_accent', form.accentColor)
  window.open(`/artist/${form.subdomain}?${params.toString()}`, '_blank', 'noopener')
}
```

客户侧单点分支（ArtistHome.vue）：
```js
const previewTpl = computed(() => route.query._tpl || null)
const previewPal = computed(() => route.query._pal || null)
const previewAccent = computed(() => route.query._accent || null)
const isPreview = computed(() => !!(previewTpl.value || previewPal.value || previewAccent.value))

const paletteId = computed(() => previewPal.value || artist.value?.paletteId || 'paper')  // 覆盖色板
const templateComponent = computed(() => {
  const raw = previewTpl.value || artist.value?.templateId || 'classic'                   // 覆盖模板
  const id = LEGACY_TEMPLATE_MAP[raw] || raw
  return TEMPLATES[id] || TEMPLATES.classic
})
// _accent 走第 19 节的 accentOverride（previewAccent 优先）
```

预览横幅（sticky 顶部，明确标识防误以为已保存）：
```html
<div v-if="isPreview" class="preview-banner">🔍 {{ $t('artistHome.previewBanner') }}</div>
```
```css
.preview-banner {
  position: sticky; top: 0; z-index: 200;
  padding: 10px 16px; text-align: center;
  background: var(--el-color-warning-light-3); color: #333;
  font-size: 14px; font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
```

**要点**：
- 作品/档位/须知仍走公开 API（已保存数据）——预览的只是「皮肤」，客户拿到预览链接也只看到公开数据（验收标准 #4，无安全风险）
- 不传参数时三个 computed 全 null，行为与现在完全一致（验收标准 #5）
- `_tpl` 要走 `LEGACY_TEMPLATE_MAP` 映射（旧模板 ID 兼容）——与正常路径同一套
- 横幅用 `position: sticky` 不用 fixed——跟随文档流，不遮挡模板自身的 fixed 导航（Folio 有 fixed nav）
- 预览按钮 `:disabled="!form.subdomain"`（subdomain 从 profile 读取，无则不能预览）

---

## 21. 仪表盘截稿日/待办卡片 + 今日统计行（R51/R52，始终显示 + 分→元）

用户 mandate：R51/R52 卡片/统计行**始终显示，不做响应式隐藏**（一号关键提醒）。窄屏单列堆叠是布局调整，不是隐藏，允许（`@media (max-width: 600px) { .deadline-grid { grid-template-columns: 1fr; } }`）。

**R52 今日统计紧凑行**（4 统计卡上方）：
```html
<div class="today-stats-row">
  <span class="today-stats-item">{{ $t('dashboard.todayNewOrders') }} <strong class="text-gold">¥{{ formatCents(stats?.todayNewOrderCents) }}</strong></span>
  <span class="today-stats-sep">·</span>
  <span class="today-stats-item">{{ $t('dashboard.todayRevenue') }} <strong class="text-gold">¥{{ formatCents(stats?.todayRevenueCents) }}</strong></span>
</div>
```
```js
/** 金额分 → 元（后端返分，前端 /100；无数据 ¥0） */
function formatCents(cents) { return ((cents || 0) / 100).toFixed(2) }
```
金额口径：后端返**分**（INTEGER），前端 /100 显示元——与 monthRevenue 不同（那个后端已转元 REAL）。新增金额字段一律先查后端返回单位，别想当然。

**R51 截稿日卡片**：调 `getUpcomingDeadlines()`（后端已过滤 7 天内 + 非终态 + deadline 升序），前端只算剩余天数：
```js
/** 截稿日剩余天数（0 = 今天，负数 = 已过期） */
function deadlineDays(deadline) {
  if (!deadline) return 99
  const d = new Date(deadline), now = new Date()
  const day = (y, m, dd) => new Date(y, m, dd).getTime()
  return Math.round((day(d.getFullYear(), d.getMonth(), d.getDate()) - day(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}
```
≤3 天红色警示：条目加 `deadline-item--urgent`（左边框红）+ 天数加 `deadline-days--urgent`（文字红）。点击 `$router.push(`/orders/${d.id}`)` 跳详情。空态："近期无截稿 🎉"。

**R51 今日待办卡片**：卡头 `todayTodoCount` 红色徽章（后端 stats 返回），列表前端过滤：
```js
/** 今日待办：pending + revision + 今日截稿（C62 口径，与后端 todayTodoCount 一致） */
const todoOrders = computed(() =>
  allOrders.value.filter(o =>
    !['delivered', 'cancelled'].includes(o.status)
    && (['pending', 'revision'].includes(o.status) || isTodayDeadline(o.deadline))
  )
)
```
数据源是 `getOrders()` 全量列表（默认 50 条/页）——活跃订单超 50 的画师可能漏，当前规模无风险，规模大了 comms 里请三号加专门接口，不自己扩 scope。每条显示状态标签 + 今日截稿红标，空态："暂无待办，喝杯茶吧 ☕"。

**R51 截稿日设置（OrderDetail）**：el-date-picker 即时保存，computed getter 从订单取值：
```js
const deadlinePicker = computed(() => order.value?.deadline ? order.value.deadline.slice(0, 10) : null)
async function changeDeadline(val) {
  try {
    order.value = await artistApi.updateDeadline(route.params.id, val || null)  // null = 清除
    ElMessage.success(t('orderDetail.deadlineUpdated'))
  } catch (err) { ElMessage.error(err.message) }
}
```
```html
<el-date-picker v-model="deadlinePicker" type="date" value-format="YYYY-MM-DD"
  :placeholder="$t('orderDetail.deadlinePlaceholder')" clearable size="small" @change="changeDeadline" />
```
后端 PUT deadline 接受 ISO 8601 或 null，返回完整订单（直接替换 order.value）。`value-format="YYYY-MM-DD"` 保证发送格式合法。

**R51 录单截稿日（ManualOrder）**：⚠️ `POST /artist/orders/manual` 的 JSON Schema **不接受 deadline 字段**（additionalProperties: false），但 `PUT /:id/deadline` 存在——创建后单独写入：
```js
const order = await artistApi.createManualOrder({ ... })
// R51: 手动录单接口不支持 deadline，创建后单独写入
if (order.id && form.deadline) {
  await artistApi.updateDeadline(order.id, form.deadline)
}
```
`resetForm()` 里 `form.deadline = null`。别假设 create 接受 PUT 支持的所有字段——读 create 路由的 schema。

**要点**：
- 两个卡片 + 统计行都**始终渲染**（无 v-if 包裹容器），数据为空显示空状态文案，不隐藏组件
- 新增错误码 `INVALID_DEADLINE` 同步加入 zh-CN.js + en.js 的 errors 块
- Dashboard onMounted 新增 2 个 API 调用（upcoming-deadlines + getOrders），均 `catch { /* ignore */ }` 静默失败不阻塞页面

---

## 22. 表单防丢失：beforeunload + sessionStorage 草稿（R57，客户侧长表单）

客户填长表单（档位+描述+QQ+增项），误触刷新/返回全丢。两层防御：浏览器原生拦截 + 草稿恢复。

```js
// ─── R57: 表单防丢失 ───
const DRAFT_KEY = `orderForm_draft_${subdomain}`  // 按画师隔离，多画师不串

/** 表单是否有内容（任一字段非空）——决定 beforeunload 拦截与草稿存储 */
const hasDraftContent = computed(() =>
  form.tierId != null
  || !!form.description.trim()
  || !!form.clientQq.trim()
  || !!form.clientName.trim()
  || Object.values(addonSelections).some(v => v > 0)
  || Object.values(addonToggles).some(Boolean)
)

function saveDraft() {
  if (!hasDraftContent.value) { sessionStorage.removeItem(DRAFT_KEY); return }  // 表单清空自动删草稿
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      form: { tierId: form.tierId, description: form.description, clientQq: form.clientQq, /* …文字字段 */ },
      addonSelections: { ...addonSelections },
      addonToggles: { ...addonToggles }
    }))
  } catch { /* sessionStorage 不可用（隐私模式等）忽略 */ }
}

let draftTimer = null
function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraft, 500)  // debounce，别每次击键都写 storage
}
watch([() => form.tierId, () => form.description, /* …各字段 */], scheduleDraftSave)
watch(addonSelections, scheduleDraftSave, { deep: true })
watch(addonToggles, scheduleDraftSave, { deep: true })

/** beforeunload：有内容时拦截（浏览器原生确认弹窗） */
function onBeforeUnload(e) {
  if (!hasDraftContent.value) return
  e.preventDefault()
  e.returnValue = ''  // 两行都要，缺一 Chrome 不弹窗
}
```

恢复（⚠️ 必须在 tiers 加载之后——要校验档位有效性）：
```js
// onMounted 内，tiers.value = data.tiers 之后
let draft = null
try { const raw = sessionStorage.getItem(DRAFT_KEY); if (raw) draft = JSON.parse(raw) }
catch { /* 损坏的草稿直接丢弃 */ }
if (draft) {
  try {
    await ElMessageBox.confirm(t('orderForm.draftFound'), t('orderForm.draftTitle'), {
      confirmButtonText: t('orderForm.draftRestore'),
      cancelButtonText: t('orderForm.draftDiscard'),
      type: 'info'
    })
    restoreDraft(draft)
    ElMessage.success(t('orderForm.draftRestored'))
  } catch { sessionStorage.removeItem(DRAFT_KEY) }  // 丢弃 = 删草稿
}

function restoreDraft(draft) {
  const f = draft.form || {}
  // 画师可能在草稿存下后删了档位——无效档位连同关联增项/倍率一起丢弃
  const tierValid = f.tierId != null && tiers.value.some(tier => tier.id === f.tierId)
  form.tierId = tierValid ? f.tierId : null
  form.description = f.description || ''
  /* …其余文字字段 */
  if (tierValid && draft.addonSelections) Object.assign(addonSelections, draft.addonSelections)
  if (tierValid && draft.addonToggles) Object.assign(addonToggles, draft.addonToggles)
}
```

生命周期闭环（缺一即泄漏或误拦截）：
```js
onMounted(() => { window.addEventListener('beforeunload', onBeforeUnload) })
onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)  // SPA 路由切换也算离开，必须移除
  if (draftTimer) clearTimeout(draftTimer)
})
// 提交成功后：
sessionStorage.removeItem(DRAFT_KEY)
window.removeEventListener('beforeunload', onBeforeUnload)  // 提交后跳转不再拦截
```

**要点**：
- **已上传文件不进草稿**（参考图）：上传过的文件无法安全恢复（签名 URL 过期、el-upload uid 丢失）——只恢复文字字段 + 选择状态，恢复提示不承诺图片
- `e.preventDefault()` + `e.returnValue = ''` 两行都要——现代 Chrome 只认这个组合
- 用 sessionStorage 不用 localStorage——草稿应随会话死亡（关标签页 = 用户主动放弃），且天然按标签页隔离
- 恢复弹窗必须在数据加载后（tiers）——否则无法校验草稿档位是否还存在；恢复无效 tierId 会让 el-select 显示幽灵选项
- 丢弃动作 = 删草稿（不留着下次再问）；恢复动作 = 保留草稿（恢复后用户再离开仍有用）
- i18n：draftTitle/draftFound/draftRestore/draftDiscard/draftRestored × 2 语言

---

## 23. 整页表单逻辑抽取为共享 composable（R58-1，下单页多模板前置）

页面 script 长到 ~400 行、且未来变体（分步引导布局、多模板）要复用同一套逻辑时，把全部业务逻辑抽进一个 composable，页面变成纯布局壳。这是 R58-2 分步引导和下单页多模板（照搬主页模板系统）的必经之路——三步表单必须把逻辑从模板中剥离。

```js
// web/src/composables/useOrderForm.js
export function useOrderForm(subdomain, formRef) {
  // …全部状态/computed/watch/生命周期（数据加载、计价防抖、草稿、上传、提交）…
  return {
    artist, tiers, rulesContent, loading, workflowStages,
    form, rules,
    submitting, showSuccess, resultNo, submit,
    refFileList, handleRefUpload, handleRefRemove,
    addonSelections, addonToggles, pricePreview, pricingExpanded,
    selectedTier, hasPricingExtras, addonGroups,
    usageMultipliers, rushMultipliers, formatAddonPrice, onTierChange,
    sanitizedRules
  }
}
```

页面侧（OrderForm.vue script 从 ~380 行缩到 ~25 行）：
```js
const formRef = ref(null)
const { artist, tiers, form, rules, submit, /* …模板用到的全部… */ } =
  useOrderForm(subdomain, formRef)
```

**要点**：
- **formRef 由页面传入，不在 composable 内创建**——el-form 在页面模板里（未来每个模板各自一份），但 submit 需要 `formRef.value.validate()`。参数传 ref 是"逻辑共享、布局各自"的契约核心
- **composable 拥有 onMounted/onUnmounted**（数据加载、beforeunload 注册/移除、定时器清理），页面零生命周期代码。抽取时顺手补上原页面漏掉的清理（如计价防抖 calcTimer 的 clearTimeout）
- **返回对象 = 模板绑定全集**：对着模板的 v-model/@click/v-if 逐个核对，漏一个就是运行时 undefined（ESLint/build 都不报，与 R39 api 漏定义同类 P0）
- **抽取天然暴露重复逻辑**：原页面计价与提交各有一份相同的"构建已选增项"循环，抽取时合并为 `buildSelectedAddons()` 单一来源——复制粘贴两遍的代码在搬家时最容易被顺手收编
- **模板与样式零改动**是纯重构的唯一验收标准；不改 UI、不顺手 i18n 化既有硬编码（那是另一件事，comms 里报告）
- 纯搬运零新 API 调用时天然安全；若抽取同时引入新接口，仍需核对 api/index.js（R39 陷阱）

---

## 24. QQ 跳转 + 复制双动作（R58-6，客户侧 + 画师侧）

用户拍板（决策 #5）：跳转和复制都做。跳转走 QQ 协议，复制走 Clipboard API + 降级兜底：

```js
function jumpToQq(qq) {
  window.open(`tencent://message/?uin=${encodeURIComponent(qq)}`, '_self')
}
async function copyQq(qq) {
  try {
    await navigator.clipboard.writeText(qq)
    ElMessage.success(t('orderForm.qqCopied'))
  } catch {
    ElMessage.warning(qq) // 剪贴板不可用（非安全上下文等）时直接展示 QQ 号供手动复制
  }
}
```

客户侧（OrderForm 成功弹窗）展示画师 QQ——数据源 `artist.contactQq`（`GET /api/artists/:subdomain` 已返回，含 `contact_qq || qq_number` 回退），`v-if="artist?.contactQq"` 包裹（未设置不渲染）：
```html
<div v-if="artist?.contactQq" class="success-qq">
  <code class="success-qq-no">{{ artist.contactQq }}</code>
  <el-button type="primary" @click="jumpToQq(artist.contactQq)">{{ $t('orderForm.jumpQq') }}</el-button>
  <el-button @click="copyQq(artist.contactQq)">{{ $t('orderForm.copyQq') }}</el-button>
</div>
```
画师侧（OrderDetail 客户 QQ 行）用 text 小按钮内嵌 el-descriptions-item，scoped 样式压缩按钮 padding（`.client-qq-row .el-button { padding: 2px 6px; height: auto; }`）适配描述列表行高。

**要点**：
- `tencent://` 协议仅桌面端能唤起 QQ，浏览器可能无响应或提示拦截——复制按钮是真正的兜底，所以两个必须同时给
- clipboard API 要求安全上下文（https/localhost），catch 降级是必写项；降级 toast 直接展示 QQ 号本身（用户可手动选择复制）
- i18n 键按上下文分：客户侧 `orderForm.artistQqLabel/jumpQq/copyQq/qqCopied`，画师侧 `orderDetail.jumpQq/copyQq/qqCopied`——文案不同（"QQ号已复制" vs "客户QQ已复制"），不共用一套键
- TrackOrder.vue 另有旧的单一复制实现（`track.copyQq`/`track.copied`，降级也是 warning 展示原文）——不顺手统一，列为后续事项

---

## 25. 工艺 CSS 工具包（v0.16 批次1，源自 H5 原型分析报告第三节）

五项全局工艺升级，落在 theme.css / templates.css + 少量模板 scoped 样式，不增功能只升质感。后续新页面直接复用这些变量，不自己写 bezier。

```css
/* 1. 弹性缓动曲线（theme.css :root）——只用于 transform/box-shadow；opacity 单独用 ease（过冲值 >1 对 opacity 无意义） */
--ease-bounce: cubic-bezier(.34, 1.56, .64, 1);

/* 2. 按钮三态物理模型（theme.css 全局 .el-button：hover=浮起 / active=按下 / 不动=躺平） */
.el-button {
  transition: transform 0.25s var(--ease-bounce), box-shadow 0.25s var(--ease-bounce),
              background-color 0.2s, border-color 0.2s, color 0.2s;
}
.el-button:hover:not(:disabled):not(.is-loading)  { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.el-button:active:not(:disabled):not(.is-loading) { transform: translateY(-1px) scale(0.98); box-shadow: 0 2px 6px rgba(0,0,0,0.10); }

/* 3. prefers-reduced-motion 全局兜底（theme.css 末尾，一条规则覆盖全站） */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

4. **clamp() 流式字号**：页面标题/CTA 标题从固定 px 改 `clamp(26px, 4vw, 32px)` 形式（LandingPage h1 / TplHero 铭牌 / TplTierGrid 名称价格 / Folio 标题与 CTA）。移动端媒体查询内的覆写也用 clamp（`clamp(24px, 6vw, 30px)`），保持全视口流式。
5. **minmax(0, 1fr) 防溢出**：纯 `1fr` 的 grid 列换 `minmax(0, 1fr)`（TplHero split 双栏 / Classic `280px minmax(0, 1fr)`）——纯 1fr 会被长 URL 撑破列宽。`repeat(auto-fill, minmax(Npx, 1fr))` 已含 minmax，无需改。

**要点**：
- scoped/组件样式里引用全局变量带 fallback：`transition: transform 0.3s var(--ease-bounce, ease)`——变量万一缺失也不至于失效
- 按钮三态的 `:not(:disabled):not(.is-loading)` 守卫是必写项，否则禁用/加载按钮也浮起，暗示可点
- reduced-motion 用 0.01ms 而非 `animation: none`——保留 animationend/transitionend 事件触发，依赖这些事件收尾的逻辑（如 el 过渡钩子）行为更稳
- templates.css 里已有的局部 reduced-motion 规则（.tpl-reveal / .tl-dot）与全局兜底共存不冲突，不用删

---

## 26. 分步引导表单 + 小票确认 + 灵感标签 + 复制摘要（R58-2/3/4/5，基于第 23 节 composable）

R58-1 抽出的 `useOrderForm` 让页面变成纯布局壳，R58-2 在此基础上把单页表单改成三步引导。**composable 零改动**——这是抽取正确性的直接验证。

**三步布局骨架**（`v-show` 而非 `v-if`——保留各步已填状态与 el-form 校验实例）：
```html
<div class="step-layout">  <!-- grid: minmax(0,1fr) 280px；≤860px 单栏 -->
  <el-card class="step-main">
    <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
      <div v-show="step === 1">…档位卡片 + 计价摘要 + 增项/倍率…</div>
      <div v-show="step === 2">…灵感标签 + 描述 + 参考图上传 + 流程预览…</div>
      <div v-show="step === 3">…QQ + 昵称 + 须知 + 提交按钮…</div>
    </el-form>
  </el-card>
  <aside class="summary-card">…粘性摘要（sticky top:24px；移动端 static 移到底部）…</aside>
</div>
```

**档位卡片选择**（替代 el-select，选中态弹性动画 + 印章入场）：
```js
/** 档位卡片点选（与原 el-select @change 行为一致：切换时清空增项/倍率） */
function selectTier(id) {
  if (form.tierId === id) return
  form.tierId = id
  onTierChange()  // composable 提供，清空 addonSelections/addonToggles/倍率/pricePreview
}
```
```css
.tier-pick { border: 2px solid var(--border-color); border-radius: 12px; cursor: pointer;
  transition: transform 0.3s var(--ease-bounce), border-color 0.2s, box-shadow 0.3s var(--ease-bounce); }
.tier-pick:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); }
.tier-pick--on { border-color: var(--color-primary); background: var(--color-primary-soft); }
.tier-pick-stamp {  /* 右上角圆形 ✓ 印章，旋转缩放入场 */
  animation: tier-stamp-in 0.35s var(--ease-bounce); }
@keyframes tier-stamp-in { from { transform: scale(0) rotate(-30deg); } to { transform: scale(1) rotate(0deg); } }
```

**摘要卡/小票展示价**（优先后端计价，未计价回退档位基础价）：
```js
const displayPrice = computed(() => pricePreview.value?.totalPrice ?? selectedTier.value?.price ?? 0)
```

**R58-3 小票二次确认**（先校验、后弹小票、确认后走 composable 的 submit）：
```js
async function openReceipt() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return          // 校验失败不弹窗，错误定位到对应步骤的表单项
  receiptVisible.value = true
}
async function confirmSubmit() {
  await submit()              // composable 的 submit：校验+API+成功弹窗+草稿清理
  if (showSuccess.value) receiptVisible.value = false  // 提交成功才关小票
}
```
小票弹窗 teleport 到 body，样式**必须放全局 templates.css**（scoped 不生效）。锯齿边用 conic-gradient 45° 斜纹条带：
```css
.receipt { background: #fdfbf5; color: #3a3a3a; font-family: 'Courier New', monospace; }
.receipt::before, .receipt::after {
  content: ''; display: block; height: 10px; margin: 0 -24px;
  background: repeating-conic-gradient(#fdfbf5 0% 25%, transparent 0% 50%) 0 0 / 14px 14px;
}
.receipt-barcode {  /* 条形码装饰：repeating-linear-gradient 竖纹 */
  background: repeating-linear-gradient(90deg, #3a3a3a 0 2px, transparent 2px 5px, #3a3a3a 5px 6px, transparent 6px 9px); }
```
小票用固定浅色纸感（`#fdfbf5`），**不随暗色模式变化**——这是设计意图（小票就是纸），comms 里注明。

**R58-4 灵感标签**（硬编码默认标签，点击追加到描述）：
```js
const inspireTags = ['角色设计', '原创角色', '同人二创', '情侣头像', '透明背景', 'Live2D 拆分']
function appendTag(tag) {
  const sep = form.description && !/[，。、\s]$/.test(form.description) ? '，' : ''  // 智能补逗号
  form.description = `${form.description}${sep}${tag}`.slice(0, 2000)  // 对齐 maxlength
}
```
后续三号加画师自定义字段后替换硬编码数组——comms 里列为待确认项。

**R58-5 复制约稿信息**（成功弹窗，订单号+档位+明细+总价多行文本）：
```js
async function copyOrderSummary() {
  const lines = [
    `${t('orderForm.summaryOrderNo')}${resultNo.value}`,
    `${t('orderForm.tierLabel')}: ${selectedTier.value?.name || ''}`,
    ...(pricePreview.value?.breakdown || []).map(i => `${i.name}: ¥${i.amount.toFixed(2)}`),
    `${t('orderForm.receiptTotal')}: ¥${displayPrice.value.toFixed(2)}`
  ]
  try { await navigator.clipboard.writeText(lines.join('\n')); ElMessage.success(t('orderForm.summaryCopied')) }
  catch { ElMessage.warning(lines.join('\n')) }  // 降级展示原文（同第 24 节 QQ 复制）
}
```

**要点**：
- 三步用 `v-show` 不用 `v-if`——el-form 的校验状态、已填字段、上传列表都保留；`v-if` 会销毁步骤二的 el-upload 导致已传参考图丢失
- 步骤指示器（圆点+连接线）当前步 `scale(1.15)` 高亮、已完成步打勾变主色，用 `--ease-bounce` 过渡
- 移动端（≤860px）：grid 单栏、摘要卡 `position: static` 移到底部、步骤指示器隐藏文字只留圆点
- 小票弹窗 `:show-close="false" :close-on-click-modal="false"`——强制用户在"取消/确认下单"间选择，防止误关后状态不明
- 整文件重写（write_file）后，verify 脚本的"零新增 v-html"检查会误报（既有行在 diff 中重现）——见 SKILL.md 陷阱「full-file rewrites make UNCHANGED lines look added」

---

## 27. 管理员回收站面板（v0.16，对接三号孤儿回收后端）

三号后端把误删/孤儿文件移入 `.recycle-bin/`（不再永久删除），管理员面板加查看+清空。接口：`GET /api/admin/recycle-bin` → `{ items: [{ fileName, originalPath, size, movedAt }] }`；`DELETE /api/admin/recycle-bin` → `{ success, deleted }`。

```js
// api/index.js（隐含授权文件，comms 注明）
getRecycleBin: () => api.get('/admin/recycle-bin'),
emptyRecycleBin: () => api.delete('/admin/recycle-bin')

// AdminDashboard.vue —— 与 stats/artists 并行加载，独立 loading 态
const [s, a, rb] = await Promise.all([adminApi.getStats(), adminApi.getArtists(), adminApi.getRecycleBin()])
recycleItems.value = rb.items || []

function formatSize(bytes) {  // B/KB/MB 三档
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function handleEmptyRecycleBin() {
  try {
    await ElMessageBox.confirm(t('admin.recycleBin.emptyConfirm'), t('admin.recycleBin.emptyTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') })
  } catch { return }  // 取消
  emptying.value = true
  try {
    const res = await adminApi.emptyRecycleBin()
    ElMessage.success(t('admin.recycleBin.emptied', { n: res.deleted }))
    recycleItems.value = []
  } catch (err) { ElMessage.error(err.message) }
  finally { emptying.value = false }
}
```

**要点**：
- `movedAt` 是 ISO 8601（后端 `st.mtime.toISOString()`），走 `formatDateTime()`（UTC→本地，见 utils/datetime.js）
- 清空是不可恢复操作，`ElMessageBox.confirm` 二次确认 + 按钮 `:loading="emptying"` 防重复点击
- 空态 `el-empty`；清空按钮仅 `v-if="recycleItems.length > 0"` 时显示
- 回收站仅管理员可见（requireAdmin），不影响客户/画师侧

---

## 28. 拖拽手柄的弹性/脱离逻辑必须左右对称（BUG-4，PaymentBar 比例条）

分段比例条（收款节点拖拽分配）的左右拖拽用了两套不对称的阈值判断，导致右拖到某个区间既不回弹也不脱离，松手报错。根因：左拖用 `MIN_BP`(500) 进弹性区、`ELASTIC_THRESHOLD`(150) 才脱离；右拖却用 `ELASTIC_THRESHOLD` 进弹性区且**无条件脱离**。

```js
const MIN_BP = 500            // 弹性区下界（回弹到 5%）
const ELASTIC_THRESHOLD = 150 // 脱离阈值（低于此值才吞并/关闭节点）

// 左拖
if (newLeft < MIN_BP) {
  elasticId.value = leftId
  detachId.value = newLeft < ELASTIC_THRESHOLD ? leftId : null   // 条件脱离
  ...
}
// 右拖——必须与左拖同构（BUG-4 修复前这里是 newRight < ELASTIC_THRESHOLD + detachId = rightId 无条件）
else if (newRight < MIN_BP && !rightIsFinal) {
  elasticId.value = rightId
  detachId.value = newRight < ELASTIC_THRESHOLD ? rightId : null // 条件脱离，与左拖一致
  ...
}
```

**要点**：
- **两个阈值职责不同**：`MIN_BP` 是"进弹性区、松手回弹到 5%"的下界；`ELASTIC_THRESHOLD` 是"拖到这么小才算脱离/吞并"的更低下界。脱离判断永远是 `< ELASTIC_THRESHOLD ? id : null` 的条件式，不能无条件 `detachId = id`
- **左右必须同构**：任何分段拖拽组件，左拖和右拖的弹性/脱离判断要逐字对称。不对称 → 某一侧的中间区间（150~500）掉进 else 分支清空 `elasticId`/`detachId`，松手时 `onPointerUp` 的回弹逻辑找不到 `elasticId`，既不回弹也不 emit，表现为"卡住+报错"
- **尾款硬底线独立**：`if (newRight < MIN_BP && rightIsFinal)` 把尾款强制拉回 `MIN_BP` 并清空弹性/脱离态——尾款不可吞并，这条在对称修复后仍要保留
- 修这类拖拽 bug 时，把左右两个分支并排贴出来逐行比对，不对称处就是 bug

---

## 29. 拖拽 drop 非图片文件要给反馈，不能静默丢弃（BUG-2 补充）

`handleFocusDrop` 用 `find(f => f.type.startsWith('image/'))` 过滤出图片，非图片文件被静默丢弃——用户拖了个 PDF 进去毫无反应，以为操作没生效。

```js
async function handleFocusDrop(event, order) {
  focusDragId.value = null
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (file) {
    await uploadAndSetFocus(file, order)
  } else if (event.dataTransfer.files.length > 0) {
    // BUG-2: 拖入了文件但没有图片 → 提示，不再静默丢弃
    ElMessage.error(t('orderDetail.galleryNotImage'))
  }
}
```

**要点**：
- 三段式：有图片 → 上传；有文件但无图片 → 错误提示；什么都没拖（`files.length === 0`，如拖了文字/链接）→ 不提示（无意义）
- 复用既有 i18n 键（`orderDetail.galleryNotImage`），与 `uploadAndSetFocus` 内部的非图片校验提示一致，不新增键
- **通用规则**：任何 `find`/`filter` 过滤拖拽文件的 drop handler，都要处理"过滤后为空但确实拖入了文件"的情况——静默丢弃是最常见的拖拽 UX 漏洞。审 drop handler 时专门查这一条

---

## 30. 表单校验失败弹窗 + 滚动定位（R24，el-form validate 增强）

el-form 默认校验只在字段下方显示红色提示，用户可能看不到（字段在视口外）。R24 在校验失败时弹 ElMessageBox 列出所有未通过项，关闭后 scrollToField 定位第一个错误字段：

```js
import { ElMessage, ElMessageBox } from 'element-plus'

async function openReceipt() {
  try {
    await formRef.value.validate()
  } catch (invalidFields) {
    // invalidFields = { fieldName: [{ message, field }], ... }
    const items = Object.keys(invalidFields)
      .map(k => invalidFields[k][0]?.message)
      .filter(Boolean)
    await ElMessageBox.alert(
      `<ul style="margin:0;padding-left:1.2em">${items.map(m => `<li>${m}</li>`).join('')}</ul>`,
      t('order.validation.title'),
      { dangerouslyUseHTMLString: true, confirmButtonText: t('order.validation.confirm') }
    )
    // 关闭弹窗后滚动到第一个错误字段
    const firstField = Object.keys(invalidFields)[0]
    if (firstField) formRef.value.scrollToField(firstField)
    return
  }
  receiptVisible.value = true  // 校验通过才弹小票
}
```

**要点**：
- `formRef.value.validate()` 的 reject 值是 `{ [field]: [{ message, field }] }` 对象（不是 boolean）——catch 里直接拿到所有未通过字段
- `dangerouslyUseHTMLString: true` 渲染列表——内容全部来自 i18n 翻译文案（无用户输入），无 XSS 风险。如果列表项可能含用户输入，必须走 sanitizeHtml
- `scrollToField(fieldName)` 是 el-form 内置方法（element-plus ≥2.2），参数是 prop 名（如 `'agreed'`、`'clientQq'`）
- i18n 键走独立命名空间 `order.validation.*`（title/confirm/agreeRequired），不混入 orderForm 命名空间——校验弹窗是跨步骤的全局反馈，与表单字段标签不同层级
- composable 内的校验消息（如 useOrderForm 的 agreed 规则）同步改用 `order.validation.agreeRequired`——弹窗列出的 message 就是 rules 里的 message，两者必须一致

---

## 31. ThemePicker 右下角固定悬浮 FAB（R25/C37，4 模板统一）【已被第 43 节取代】

> ⚠️ **v0.29 #55/61 已 supersede**：4 模板各自的 `.theme-fab` + TrackOrder/OrderForm 的
> `.page-prefs` 已统一抽成 `ClientFloatingActions.vue` 全局组件，由 ArtistHome.vue 统一挂载。
> 本节保留作历史参考（各模板独立写 fixed 定位的旧模式），新实现见**第 43 节**。

用户决策 C37：ThemePicker 从各模板原位（侧栏/页脚/CTA 区）移至右下角固定悬浮。4 模板统一实现，CSS 完全相同：

```html
<!-- 模板根节点内，与主内容平级 -->
<!-- Classic 无吸底 CTA，不需要 above-cta 类 -->
<div class="theme-fab"><ThemePicker /></div>

<!-- Gallery/Atelier/Folio 有 TplStickyCta，fab 需避让 -->
<div class="theme-fab" :class="{ 'theme-fab--above-cta': ctaVisible }"><ThemePicker /></div>
```

```css
/* R25: ThemePicker 右下角固定悬浮（用户决策 C37） */
.theme-fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 95;  /* 高于 TplStickyCta 的 z-index: 90 */
  padding: 10px 12px;
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  border-radius: 999px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  transition: box-shadow 0.2s, bottom 0.3s;
}
.theme-fab:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
.theme-fab--above-cta { bottom: 72px; }  /* 吸底 CTA 可见时上移避让 */
```

**要点**：
- ThemePicker 根元素是 `.pref-group`（inline-flex，约 62px 宽）——fab 的 padding 10px 12px 刚好包成胶囊
- z-index 95 > TplStickyCta 的 90——fab 始终在 CTA 栏之上，不被遮挡
- `--above-cta` 避让只在有 `ctaVisible` 状态的模板用（Gallery/Atelier/Folio）；Classic 无吸底 CTA 不需要
- 原位 ThemePicker 的容器样式（如 `.classic-side-theme { margin-top: 4px }`）随移除一并删除，不留死样式
- 暗色模式免费：`var(--pal-surface)` / `var(--pal-border)` 已随色板切换

---

## 32. 平台链接 + 灵感标签：设置页管理 + 客户页消费（R58-8，v0.17-b2）

后端契约（三号已合入）：`PUT /api/artist/profile` 接受 `platformUrls: [{url, platform?}]`（maxItems 10，url 必须 `^https?://`，platform 枚举 pixiv/x/weibo/lofter/bilibili/xiaohongshu/other，`additionalProperties: false`）+ `inspirationTags: [string]`（maxItems 20，每个 ≤30 字符）。**平台识别在后端**（`server/src/utils/platform.js` 的 `identifyPlatform` 域名正则）——前端不复制识别逻辑，只传 url，platform 留空让后端识别。

**任务 A：设置页平台链接 CRUD**（Settings.vue profile tab，外链区域下方）：
```html
<el-form-item :label="$t('settings.platformLabel')">
  <div class="link-editor">
    <div v-for="(pl, index) in form.platformUrls" :key="index" class="link-row">
      <el-select v-model="pl.platform" class="platform-select">
        <el-option value="" :label="$t('settings.platformAuto')" />  <!-- 空值 = 自动识别 -->
        <el-option v-for="opt in PLATFORM_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
      </el-select>
      <el-input v-model="pl.url" placeholder="https://" class="link-url-input" />
      <el-button text size="small" type="danger" @click="removePlatformLink(index)">✕</el-button>
    </div>
    <el-button size="small" @click="addPlatformLink" :disabled="form.platformUrls.length >= 10">
      + {{ $t('settings.addLink') }}
    </el-button>
    <div class="form-hint">{{ $t('settings.platformHint') }}</div>
  </div>
</el-form-item>
```
```js
// 手动选择枚举不含 other——other 由"自动识别"兜底（后端识别不出就是 other）
const PLATFORM_OPTIONS = [
  { value: 'pixiv', label: 'Pixiv' }, { value: 'x', label: 'X (Twitter)' },
  { value: 'weibo', label: '微博' }, { value: 'lofter', label: 'Lofter' },
  { value: 'bilibili', label: 'Bilibili' }, { value: 'xiaohongshu', label: '小红书' }
]
function addPlatformLink() {
  if (form.platformUrls.length >= 10) return
  form.platformUrls.push({ url: '', platform: '' })
}
// save 时：留空行不提交，platform 为空时省略字段让后端自动识别
platformUrls: form.platformUrls
  .filter(p => p.url.trim())
  .map(p => { const item = { url: p.url.trim() }; if (p.platform) item.platform = p.platform; return item })
```
读取（⚠️ GET /api/artist/profile 返回原始 DB 行，`platform_urls` 是 JSON 字符串，需解析；兼容旧纯字符串格式）：
```js
let platformUrls = []
if (profile.platform_urls) {
  try {
    const parsed = JSON.parse(profile.platform_urls)
    if (Array.isArray(parsed)) {
      platformUrls = parsed
        .map(item => typeof item === 'string' ? { url: item, platform: '' } : { url: item.url || '', platform: item.platform || '' })
        .filter(item => item.url)
    }
  } catch { platformUrls = [] }
}
```

**任务 B：灵感标签编辑器**（el-tag 回车添加 + closable 删除）：
```html
<el-form-item :label="$t('settings.inspireLabel')">
  <div class="tag-editor">
    <div class="tag-list">
      <el-tag v-for="(tag, index) in form.inspirationTags" :key="tag + index" closable @close="removeTag(index)">
        {{ tag }}
      </el-tag>
    </div>
    <el-input v-model="newTag" class="tag-input" :placeholder="$t('settings.inspireInputPlaceholder')"
      maxlength="30" show-word-limit @keyup.enter="addTag" />
    <div class="form-hint">{{ $t('settings.inspireHint') }}</div>
  </div>
</el-form-item>
```
```js
const newTag = ref('')
function addTag() {
  const tag = newTag.value.trim()
  if (!tag) return
  if (tag.length > 30) { ElMessage.warning(t('settings.inspireTagTooLong')); return }
  if (form.inspirationTags.length >= 20) { ElMessage.warning(t('settings.inspireTagLimit')); return }
  if (form.inspirationTags.includes(tag)) { ElMessage.warning(t('settings.inspireTagDuplicate')); return }
  form.inspirationTags.push(tag)
  newTag.value = ''
}
function removeTag(index) { form.inspirationTags.splice(index, 1) }
// save: inspirationTags: form.inspirationTags.map(tag => tag.trim()).filter(Boolean)
```
⚠️ 回调参数别叫 `t`——`.filter(t => ...)` 会遮蔽 `useI18n()` 的 `t`（见 SKILL.md 陷阱）。

**任务 C：客户下单页灵感标签改 API 读取**（OrderForm.vue，删硬编码）：
```js
// 从 artist.inspirationTags 读取（公开 API 已返回解析好的数组），未设置时不显示，不 fallback 硬编码
const inspireTags = computed(() => artist.value?.inspirationTags || [])
```
```html
<!-- v-if 条件渲染：画师未设置时整个区域消失 -->
<div v-if="inspireTags.length" class="inspire-block">
  <span class="inspire-hint">{{ $t('orderForm.inspireHint') }}</span>
  <div class="inspire-tags">
    <button v-for="tag in inspireTags" :key="tag" type="button" class="inspire-tag" @click="appendTag(tag)">{{ tag }}</button>
  </div>
</div>
```
`appendTag` 注入逻辑不变（智能补逗号 + slice 2000）。**关键**：不 fallback 到硬编码默认标签——需求明确"画师未自定义时不显示"。

**任务 D：客户主页平台链接展示**（useArtistData + 4 模板）：
```js
// useArtistData.js —— 与 LINK_ICON_BADGE 共用视觉语言
const PLATFORM_BADGE = { pixiv: 'P', x: 'X', weibo: '微', lofter: 'L', bilibili: 'B', xiaohongshu: '红', other: '🔗' }
const platformLinks = computed(() => {
  const links = artist.value.platformUrls  // 公开 API 已返回 [{url, platform, label}]
  if (!Array.isArray(links) || links.length === 0) return []
  return links.map((item, i) => ({
    key: `platform-${item.platform || 'other'}-${i}`,
    url: item.url,
    label: item.label || item.platform || 'other',  // 后端已拼 label，兜底用 platform
    badge: PLATFORM_BADGE[item.platform] || PLATFORM_BADGE.other
  }))
})
```
4 模板在外链区域后追加平台链接块，**复用各模板已有链接类**（Classic `.classic-side-link` / Gallery `.gallery-link` / Folio `.folio-link` / Atelier `.atelier-link`），零新增 CSS：
```html
<div class="gallery-links" v-if="platformLinks.length">
  <a v-for="link in platformLinks" :key="link.key" :href="link.url"
    target="_blank" rel="noopener noreferrer" class="gallery-link">
    <span class="gallery-link-badge" aria-hidden="true">{{ link.badge }}</span>
    {{ link.label }}
  </a>
</div>
```
解构加 `platformLinks`：`const { socialLinks, platformLinks } = useArtistData(props)`。

**要点**：
- **两个 GET 端点不对称**：画师后台 GET profile 返回原始 JSON 字符串（需解析），公开 GET artists/:subdomain 返回解析好的数组（直接消费）——见 SKILL.md 陷阱「GET snake_case / PUT camelCase」的 R58-8 补充
- 平台识别逻辑只在后端，前端不复制域名正则——后端改规则前端零改动
- `platform: ''`（空字符串）= 自动识别，save 时省略该字段（`if (p.platform) item.platform = ...`）——别发 `platform: ''`，后端枚举校验会 400
- 外链（customLinks，画师自定义名称+图标）与平台链接（platformUrls，后端识别平台）是**两套独立数据**，客户页各渲染一块，不合并——派工明确"与现有社交链接/外链区域协调，不重复"
- i18n 新增 9 键 × 2 语言：`settings.platformLabel/platformAuto/platformHint/inspireLabel/inspireInputPlaceholder/inspireHint/inspireTagTooLong/inspireTagLimit/inspireTagDuplicate`

---

## 33. 附加工作项 CRUD 卡片 + 客户侧价格展示 + preview-teleported（SPEC-003，v0.17-b3）

后端契约（三号已合入）：`POST /api/artist/orders/:id/extra-items`（body `{name, description?, priceCents?}`，终态拒绝 + 上限 20）→ 返回完整订单（`signOrderUrls(getOrder(...))`，`final_price_cents` 已重算）；`DELETE /api/artist/orders/:id/extra-items/:itemId` → 同。track API 返回客户可见子集：`extraItems: [{name, priceCents}]`（**不含** description/id/created_at）+ `finalPriceCents` + `installments: [{name, amountCents, paid}]`。

**任务 A：OrderDetail 附加项卡片**（时间线卡下方）：
```html
<el-card style="margin-top: 16px">
  <template #header>
    <div class="card-header">
      <span>{{ $t('orderDetail.extraItemsTitle') }}</span>
      <span class="extra-count">{{ order.extraItems?.length || 0 }} / 20</span>
    </div>
  </template>
  <div v-if="order.extraItems?.length" class="extra-list">
    <div v-for="item in order.extraItems" :key="item.id" class="extra-item">
      <div class="extra-info">
        <span class="extra-name">{{ item.name }}</span>
        <span v-if="item.description" class="extra-desc">{{ item.description }}</span>
      </div>
      <span class="extra-price">¥{{ formatCents(item.price_cents) }}</span>
      <!-- 悬停显示删除（触屏常驻 C56）；终态不显示 -->
      <el-button v-if="!isTerminal" class="extra-delete" size="small" circle type="danger"
        :title="$t('orderDetail.extraDelete')" @click="deleteExtraItem(item)">✕</el-button>
    </div>
  </div>
  <el-empty v-else :description="$t('orderDetail.extraEmpty')" :image-size="60" />
  <div class="extra-footer">
    <el-button v-if="!isTerminal" size="small" @click="openExtraDialog"
      :disabled="order.extraItems?.length >= 20">+ {{ $t('orderDetail.extraAdd') }}</el-button>
    <span v-if="order.final_price_cents != null" class="extra-total">
      {{ $t('orderDetail.extraTotal') }} ¥{{ formatCents(order.final_price_cents) }}</span>
  </div>
  <p v-if="order.extraItems?.length" class="extra-auto-hint">💡 {{ $t('orderDetail.extraAutoHint') }}</p>
</el-card>
```

添加弹窗（名称必填 + 说明可选 + 金额 el-input-number 元输入）：
```js
const extraForm = ref({ name: '', description: '', priceYuan: 0 })
async function submitExtraItem() {
  if (!extraForm.value.name.trim()) return
  const payload = {
    name: extraForm.value.name.trim(),
    description: extraForm.value.description.trim() || null,
    priceCents: Math.round((extraForm.value.priceYuan || 0) * 100)  // 元→分
  }
  order.value = await artistApi.addExtraItem(route.params.id, payload)  // 返回完整订单直接替换
}
```

删除（确认弹窗 + 返回完整订单替换，与 deleteNote 模式一致）：
```js
async function deleteExtraItem(item) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.extraDeleteConfirm', { name: item.name }),
      t('orderDetail.confirmTitle'), { type: 'warning' })
  } catch { return }
  order.value = await artistApi.deleteExtraItem(route.params.id, item.id)
}
```

样式（悬停删除 + 触屏常驻，与 `.tl-delete` 交互一致 C56）：
```css
.extra-delete { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.extra-item:hover .extra-delete { opacity: 1; }
@media (hover: none) { .extra-delete { opacity: 1; } }
```

**任务 B：客户进度页价格区域**（TrackOrder，时间线下方）：
```html
<!-- SPEC-003 §5.5 硬约束：附加项仅 name+金额，不显示 description/id/created_at -->
<div class="price-block" v-if="order.finalPriceCents != null || order.extraItems?.length || order.installments?.length">
  <h4 class="price-title">{{ $t('track.priceTitle') }}</h4>
  <div v-if="order.extraItems?.length" class="extra-lines">
    <div v-for="(item, index) in order.extraItems" :key="index" class="extra-line">
      <span class="extra-line-name">+ {{ item.name }}</span>
      <span class="extra-line-price">¥{{ formatCents(item.priceCents) }}</span>
    </div>
  </div>
  <div v-if="order.finalPriceCents != null" class="final-price-row">
    <span>{{ $t('track.finalPrice') }}</span>
    <strong>¥{{ formatCents(order.finalPriceCents) }}</strong>
  </div>
  <div v-if="order.installments?.length" class="installment-block">
    <h4 class="installment-title">{{ $t('track.installmentsTitle') }}</h4>
    <div v-for="(inst, index) in order.installments" :key="index" class="installment-row">
      <span class="installment-name">{{ inst.name }}</span>
      <span class="installment-amount">¥{{ formatCents(inst.amountCents) }}</span>
      <el-tag :type="inst.paid ? 'success' : 'info'" size="small">
        {{ inst.paid ? $t('track.paid') : $t('track.unpaid') }}</el-tag>
    </div>
  </div>
</div>
```

**任务 C：preview-teleported 修复**（UX-1，4 文件各一行）：
el-image 在含 `transform` 的容器内（模板动画、抽屉、卡片悬浮效果），内置预览层会被 `overflow: hidden` + `transform` 截断。修复：给 el-image 加 `preview-teleported` 属性，预览层传送到 body：
```html
<el-image :src="..." :preview-src-list="urls" preview-teleported />
```
已有 `preview-teleported` 的文件（OrderList.vue）不需要改。排查方法：`search_files` 搜 `preview-src-list`，逐个检查是否有 `preview-teleported`。

**要点**：
- **画师端 vs 客户端数据不对称**：画师端 getOrder 返回 `extraItems` 全字段（snake_case：`price_cents`/`description`/`id`/`created_at`），客户端 track API 只返回 `{name, priceCents}`（camelCase）——前端按端消费对应字段名，不混用
- **金额单位**：后端一律返**分**（INTEGER），前端 `formatCents(cents) { return ((cents || 0) / 100).toFixed(2) }` 转元显示。el-input-number 输入元，提交时 `Math.round(yuan * 100)` 转分。`formatCents` 是局部函数（Dashboard/OrderDetail/TrackOrder 各自定义），项目无全局价格工具——未来可抽到 utils，当前不扩 scope
- **API 返回完整订单直接替换**（`order.value = await artistApi.addExtraItem(...)`）——与 deleteNote/addReference 模式一致，保证签名 URL 等关联状态一致，不手动 splice/push 数组
- **终态守卫**：`v-if="!isTerminal"` 隐藏添加/删除按钮（已交付/已取消订单不可改附加项），后端也有终态拒绝兜底
- **客户侧硬约束**：SPEC-003 §5.5 明确"不显示 description、id、created_at"——track API 已在后端过滤，前端模板也不渲染这些字段（双重保障）。审客户侧页面时专门查这一条
- i18n 新增 18 键 × 2 语言：`orderDetail.extra*`（13 键）+ `track.priceTitle/finalPrice/installmentsTitle/paid/unpaid`（5 键）

---

## 34. 名额与缓冲系统：三态数字设置 + 看板缓冲区 + 共享徽章 slotDisplay（SPEC-004，v0.17-b4）

后端契约（三号已合入）：`PUT /api/artist/profile` 新增 `batchLimit`（`['integer','null']` 0~999，null=不限制）/ `bufferLimit`（0~999）/ `autoPromote` / `hideQueuePosition` / `hidePromoteNotify` / `bufferShortForm`（均 boolean），后端有 N+M≥1 校验（batchLimit 为 null 时跳过）。`GET /api/artist/queue?zone=buffer` 返回缓冲区订单列表（同正式区字段 + focusImageUrl 签名）。`POST /api/artist/orders/:id/promote` 递补（buffer→formal，返回完整订单）。公开 API 返回 `slotDisplay`（后端算好文案：开放中·剩N席/可候补/已接满/休息中，null=未启用）。track API 返回 `queueZone` + `queueDisplay`（缓冲订单为"排队中（第 N 位）"，正式订单为 null）。

**任务 A：可空数字字段的三态设置模式**（Settings.vue，null=不限制 / 0=申请制 / N>0=限额）：

后端用一个可空整数表达三种语义，前端用「开关 + 数字输入」两个控件承载：
```html
<el-form-item :label="$t('settings.slotLabel')">
  <div class="slot-row">
    <el-switch v-model="form.batchLimitEnabled" :active-text="$t('settings.slotEnable')" />
    <el-input-number v-model="form.batchLimit" :min="0" :max="999"
      :disabled="!form.batchLimitEnabled" controls-position="right" class="slot-input" />
    <span class="slot-unit">{{ $t('settings.slotUnit') }}</span>
  </div>
  <div class="form-hint">{{ $t('settings.slotHint') }}</div>
</el-form-item>
```
```js
// form 初始值
batchLimitEnabled: false, batchLimit: 0, bufferLimit: 0,
autoPromote: false, hideQueuePosition: false, hidePromoteNotify: false, bufferShortForm: false,

// save：开关关闭 → 传 null（不限制）；开启 → 传数字
batchLimit: form.batchLimitEnabled ? form.batchLimit : null,
bufferLimit: form.bufferLimit,
autoPromote: form.autoPromote,
// ...其余 boolean 直传

// save 前 N+M≥1 前端校验（后端同校验，前端先拦避免无效请求）
if (form.batchLimitEnabled && form.batchLimit + form.bufferLimit < 1) {
  ElMessage.warning(t('settings.slotMinError')); return
}

// onMounted 回显（GET profile 返回原始 DB 行 snake_case）
batchLimitEnabled: profile.batch_limit != null,   // null → 关闭
batchLimit: profile.batch_limit ?? 0,             // null → 0
bufferLimit: profile.buffer_limit ?? 0,
autoPromote: !!profile.auto_promote,              // boolean 字段 !! 兜底
```
**要点**：开关关闭时数字输入 `:disabled`（视觉提示无效），但 `form.batchLimit` 保留旧值（重新开启不丢上次配置）。`return` 在 try 内、`finally` 仍会重置 `saving`——校验失败的 early return 安全。

**任务 B：看板缓冲区**（QueueBoard，正式区下方并列区域，非 tab）：
```html
<!-- 有数据或加载中才渲染整个区域 -->
<template v-if="bufferQueue.length || bufferLoading">
  <h3 class="buffer-title">{{ $t('queue.bufferTitle') }}</h3>
  <p class="buffer-hint">{{ $t('queue.bufferHint') }}</p>
  <div class="queue-container" v-loading="bufferLoading">
    <div class="queue-list">
      <div v-for="element in bufferQueue" :key="element.id" class="queue-item buffer-item" ...>
        <!-- 同正式区卡片风格：订单号 + 候补标签 + 状态标签 + 档位/QQ/客户名 + 焦点图只读展示 -->
        <el-tag type="warning" size="small" effect="dark">{{ $t('queue.bufferTag') }}</el-tag>
        ...
        <el-button size="small" type="primary" @click="promoteOrder(element)"
          :loading="promotingId === element.id">{{ $t('queue.promote') }}</el-button>
      </div>
    </div>
    <el-empty v-if="!bufferLoading && bufferQueue.length === 0" :description="$t('queue.bufferEmpty')" />
  </div>
</template>
```
```js
// ⚠️ bufferQueue 必须在 useSignatureRefresh 调用之前声明（collect 闭包引用它，
// 虽然运行时才执行，但声明在后会触发 ESLint no-use-before-define）
const bufferQueue = ref([])
const bufferLoading = ref(false)
const promotingId = ref(null)

// 签名刷新 composable 扩展覆盖缓冲区（collect/apply 合并两个列表）
const { refreshNow } = useSignatureRefresh({
  collect: () => [...queue.value, ...bufferQueue.value].filter(o => o.focus_image_path).map(o => o.focus_image_path),
  apply: (urlMap) => {
    for (const o of [...queue.value, ...bufferQueue.value]) {
      if (o.focus_image_path && urlMap[o.focus_image_path]) o.focusImageUrl = urlMap[o.focus_image_path]
    }
  }
})

async function loadBufferQueue() {
  bufferLoading.value = true
  try { bufferQueue.value = await artistApi.getQueue('buffer') }
  catch (err) { ElMessage.error(err.message) }
  finally { bufferLoading.value = false }
}

/** 递补成功后刷新两个列表（订单从缓冲区移入正式区） */
async function promoteOrder(order) {
  promotingId.value = order.id
  try {
    await artistApi.promoteOrder(order.id)
    ElMessage.success(t('queue.promoted'))
    await Promise.all([loadQueue(), loadBufferQueue()])
  } catch (err) { ElMessage.error(err.message) }
  finally { promotingId.value = null }
}

onMounted(() => { loadQueue(); loadBufferQueue(); /* ... */ })
```
**要点**：
- 缓冲区卡片焦点图**只读展示**（无上传/替换交互——候补订单不设焦点），空态用 `focus-empty--static`（`cursor: default`，去掉点击上传）
- 缓冲区卡片加 `border-left: 3px solid var(--el-color-warning)` 视觉区分正式区
- 递补按钮 `:loading="promotingId === element.id"` 按订单 ID 隔离 loading（多张卡片不互相转圈）
- **API 向后兼容签名**：`getQueue: (zone) => api.get('/artist/queue', zone ? { params: { zone } } : undefined)`——加可选参数不破坏既有 `getQueue()` 调用（正式区不传 zone）

**任务 C：跨 4 模板展示 → 扩展共享状态徽章组件**（TplStatusBadge prop，而非 4 模板各改）：

需求"4 模板状态徽章附近展示 slotDisplay"。4 模板的状态徽章都走 `TplStatusBadge`（Classic 直接用，Gallery/Folio/Atelier 经 TplHero 三变体间接用）——**给共享组件加 prop 一处改动全模板生效**，比在 4 个模板各插一段 HTML 干净得多：
```html
<!-- TplStatusBadge.vue -->
<span class="tpl-status" :class="status">
  <span class="tpl-status-dot" />
  <span class="tpl-status-text">{{ statusText(status) }}</span>
  <!-- slotDisplay 为 null（未启用名额制）时不显示 -->
  <span v-if="slotDisplay" class="tpl-status-slot">{{ slotDisplay }}</span>
</span>
```
```js
defineProps({
  status: { type: String, default: 'open' },
  slotDisplay: { type: String, default: null }
})
```
```css
/* 名额文案：主色点缀 + 左边框分隔，与状态文字区分 */
.tpl-status-slot {
  font-size: 12px; letter-spacing: 0.5px; color: var(--color-primary);
  padding-left: 8px; border-left: 1px solid var(--pal-border);
}
```
传值（4 处）：
```html
<!-- Classic 侧栏 -->
<TplStatusBadge :status="artist.status" :slot-display="artist.slotDisplay" />
<!-- TplHero 三变体（banner/fullscreen/split）同样传 :slot-display="artist.slotDisplay" -->
```
**要点**：
- `TplStatusBadge`/`TplHero` 在 `web/src/components/templates/**`（soul 永久授权），派工只列了 4 模板但"状态徽章附近"的展示落点在共享组件——改共享组件是实现任务的最直接路径，comms 里注明
- slotDisplay 是**后端算好的完整文案**（含"开放中·剩N席"等），前端零计算零 i18n——后端改文案前端零改动。与第 32 节 platformUrls 的 label 同思路：展示文案在后端
- 判断"该改共享组件还是各模板"：展示位置是否都经过同一个组件。状态徽章是，所以改 TplStatusBadge；外链区域各模板视觉不同（第 32 节），所以各模板各渲染

**任务 D：客户进度页排队位置**（TrackOrder，queueDisplay 条件渲染）：
```html
<!-- 正式订单 queueDisplay 为 null → 不显示；缓冲订单显示"排队中（第 N 位）" -->
<div class="position-info" v-if="order.queueDisplay">
  <el-alert type="warning" :closable="false" show-icon>
    {{ order.queueDisplay }}
  </el-alert>
</div>
```
与正式区排队位置（`order.position` 的 info alert）并列，用 warning 色区分候补语义。queueDisplay 是后端拼好的文案（含 hideQueuePosition 开关逻辑——隐藏位置时返回"排队中"不带位次），前端不计算位次。

**要点汇总**：
- i18n 新增 19 键 × 2 语言：`settings.slot*`/`buffer*`/`autoPromote`/`hideQueuePosition`/`hidePromoteNotify`/`bufferShortForm`/`bufferSwitchHint`（13 键）+ `queue.bufferTitle/bufferHint/bufferTag/bufferEmpty/promote/promoted`（6 键）
- 开关类设置的 hint 文案要写清"仅在有缓冲名额时生效"这类前置条件，避免画师开了开关以为坏了

---

## 35. 节点话术编辑 + 客户沟通小块（plan-node-speech，v0.18-b1）

后端契约（三号并行开发，迁移 v20）：`PUT /api/artist/workflow/:id` 新增可选 `speechTemplate` 字段；订单详情返回 `speechText`（变量已替换）+ `totalPriceCents`/`paidCents`/`unpaidCents`。⚠️ 并行期 PUT schema 仍是 `additionalProperties: false`，发送 speechTemplate 会 400——预期行为，后端合入后自然通，前端按契约实现不等后端（见 SKILL.md 陷阱「Parallel-period PUT 400」）。

**任务 A：变量标签点击插入光标位置**（StageListView，每个节点行下方话术编辑区）：

```js
/** 变量标签列表（后端契约，中英文界面均保持中文原文——后端按中文 token 字符串匹配替换） */
const SPEECH_VARS = ['{客户名}', '{客户QQ}', '{订单号}', '{档位名}', '{节点名}', '{截稿日}', '{总价}', '{已付}', '{待付}']
const speechDirtyId = ref(null)
const speechRefs = new Map()

function setSpeechRef(id, el) {
  if (el) speechRefs.set(id, el)
  else speechRefs.delete(id)
}

/** 点击变量标签 → 插入光标位置（无焦点则追加到末尾） */
function insertSpeechVar(s, varText) {
  const el = speechRefs.get(s.id)
  const textarea = el?.textarea ?? el?.$el?.querySelector('textarea')
  if (textarea) {
    const start = textarea.selectionStart ?? (s.speechTemplate || '').length
    const end = textarea.selectionEnd ?? start
    const val = s.speechTemplate || ''
    s.speechTemplate = val.slice(0, start) + varText + val.slice(end)
    nextTick(() => {
      textarea.focus()
      const pos = start + varText.length
      textarea.setSelectionRange(pos, pos)
    })
  } else {
    s.speechTemplate = (s.speechTemplate || '') + varText
  }
  speechDirtyId.value = s.id
}
```

模板（v-model 直接绑 stage 对象的 speechTemplate——localStages 是 props.stages 的深拷贝响应式数组；dirty 由 @input 标记，保存按钮仅 dirty 时出现）：
```html
<!-- ⚠️ draggable item 需要单根节点：话术区与 .stage-row 一起包在 .stage-item 里 -->
<div class="stage-item">
  <div class="stage-row">…既有节点行…</div>
  <div v-if="!readonly" class="stage-speech">
    <div class="speech-vars">
      <span class="speech-vars-label">💬 {{ $t('workflow.speechLabel') }}</span>
      <button v-for="v in SPEECH_VARS" :key="v" type="button" class="speech-var"
        :title="$t('workflow.speechVarHint')" @click="insertSpeechVar(s, v)">
        {{ v }}
      </button>
    </div>
    <div class="speech-editor">
      <el-input v-model="s.speechTemplate" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
        :placeholder="$t('workflow.speechPlaceholder')" maxlength="500" show-word-limit
        :ref="(el) => setSpeechRef(s.id, el)" @input="speechDirtyId = s.id" />
      <el-button v-if="speechDirtyId === s.id" size="small" type="primary" @click="commitSpeech(s)">
        {{ $t('workflow.speechSave') }}
      </el-button>
    </div>
  </div>
</div>
```

父组件保存（WorkflowPaymentEditor，复用既有 `api.value.update`，无需新增 api 方法）：
```js
async function onUpdateSpeech(id, speechTemplate) {
  try {
    await api.value.update(id, { speechTemplate })
    await load()
    ElMessage.success(t('workflow.speechSaved'))
  } catch (err) { ElMessage.error(err.message); await load() }  // 失败 load() 回滚界面
}
```
template 模式（管理员默认模板）的映射层补 `speechTemplate: x.speech_template ?? ''`（snake→camel，与既有字段映射同构）；readonly 模式不渲染话术区。

**任务 B：客户沟通小块**（OrderDetail，附加项卡片下方）：QQ 号 + 价格小结 + 话术预览 + "复制文案并唤起QQ"按钮。复制 → 提示 → **1 秒后** `tencent://`（setTimeout 让用户先看到提示，与第 24 节即时跳转不同——派工明确要求 1 秒延迟）：
```js
async function copySpeechAndOpenQq() {
  const o = order.value
  if (!o?.client_qq || !o?.speechText) return
  commCopying.value = true
  try {
    await navigator.clipboard.writeText(o.speechText)
    ElMessage.success(t('orderDetail.commCopied'))
    setTimeout(() => {
      window.open(`tencent://message/?uin=${encodeURIComponent(o.client_qq)}`, '_self')
    }, 1000)
  } catch {
    ElMessage.warning(o.speechText)  // 剪贴板不可用降级展示原文（同第 24 节）
  } finally { commCopying.value = false }
}
```
按钮禁用条件 `!order.client_qq || !order.speechText`，无 QQ 时按钮文案换"未设置客户QQ"（`:disabled` + 三元 label）。

**价格小结三级回退**（后端新字段未合入时不显示 undefined——并行期关键）：
```js
const commPaid = computed(() => {
  const o = order.value
  if (!o) return '—'
  if (o.paidCents != null) return `¥${formatCents(o.paidCents)}`   // 1. 后端新字段
  if (o.installments?.length) {                                     // 2. 既有字段本地计算
    const sum = o.installments.filter(i => i.paid).reduce((acc, i) => acc + (i.amountCents || 0), 0)
    return `¥${formatCents(sum)}`
  }
  return '—'                                                        // 3. 占位符
})
```
speechText 同理三级：有则显示 → 无 currentStageId 提示"未接入流程节点" → 有节点无话术提示"暂无话术"。

**要点**：
- 变量标签 `{客户名}` 等是**后端替换契约**，en.js 里也保持中文原文（翻译会导致后端匹配失败），加注释说明
- el-input textarea 取 DOM：`el?.textarea ?? el?.$el?.querySelector('textarea')`（组件实例暴露 textarea 属性，兜底 querySelector）
- 加 `.stage-item` 包裹层后触发大量 `vue/html-indent` 警告（所有子行 +2 缩进）——`npx eslint . --fix` 一次修完
- i18n 新增 13 键 × 2 语言：`workflow.speechLabel/speechPlaceholder/speechSave/speechSaved/speechVarHint` + `orderDetail.commTitle/commQq/commPriceSummary/commCopyBtn/commCopied/commNoQq/commNoStage/commNoSpeech`

---

## 36. 仪表盘重构：双栏布局 + 模块化独立三态 + 纯 CSS 柱状图（v0.18-b2，验收 §1~§8）

把单页 Dashboard.vue 拆成 8 个自包含模块组件（`components/artist/dashboard/`）+ 一个纯布局壳。核心设计：**布局框架先渲染，各模块并行请求、独立失败互不阻塞**（验收 §9.1）。

**双栏布局：DOM 顺序 = 窄屏顺序，宽屏用显式 grid-row/grid-column 分栏**（不用 order 属性——显式行列更可读，窄屏 fallback 是 flex 单列）：
```css
/* 窄屏默认：单列，DOM 顺序即展示顺序（验收 6.6） */
.dash-grid { display: flex; flex-direction: column; gap: 16px; }

/* 宽屏：左 60% / 右 40%，显式行列分配（验收 6.4/6.5） */
@media (min-width: 769px) {
  .dash-grid {
    display: grid; grid-template-columns: 3fr 2fr;
    column-gap: 16px; row-gap: 16px; align-items: start;
  }
  .area-greeting { grid-column: 1; grid-row: 1; }
  .area-revenue  { grid-column: 1; grid-row: 2; }
  .area-stats    { grid-column: 1; grid-row: 3; }
  .area-todo     { grid-column: 1; grid-row: 4; }
  .area-slot     { grid-column: 2; grid-row: 1; }
  .area-quick    { grid-column: 2; grid-row: 2; }
  .area-status   { grid-column: 2; grid-row: 3; }
  .area-activity { grid-column: 2; grid-row: 4; }
}
```
要点：`align-items: start` 防止右栏卡片被拉伸到与左栏等高；每个模块包一层 `.area-xxx` div 承载 grid 定位（模块组件本身不感知布局）。

**模块自包含三态**（每个组件内部统一结构，互不依赖）：
```js
const state = ref('loading')  // loading | ok | error
async function load() {
  state.value = 'loading'
  try { const res = await artistApi.getDashboardTodo(); normalize(res); state.value = 'ok' }
  catch { state.value = 'error' }
}
onMounted(() => load())
```
```html
<div v-if="state === 'error'" class="module-error">
  <span>{{ $t('dashboard.todoError') }}</span>
  <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
</div>
<div v-else-if="state === 'loading'" class="todo-skeleton">…3~5 行骨架条…</div>
<p v-else-if="!items.length" class="todo-empty">{{ $t('dashboard.todoEmpty') }}</p>
<div v-else class="todo-list">…</div>
```
骨架条统一样式：`background: var(--bg-secondary, #f0f0f0); animation: pulse 1.2s ease-in-out infinite;`（@keyframes 0%/100% opacity:1, 50% opacity:0.45）。错误态 = 文案 + 重试按钮（重试只重发本模块请求）。

**纯 CSS 柱状图**（三号图表库选型前的占位，接口不变后续可替换内部实现）：
```js
/** 柱高百分比（最大值归一化；全 0 时柱子高度 0 不留空白——验收 1.4） */
function barHeight(cents) {
  const max = Math.max(...bars.value.map(b => b.cents || 0), 1)
  return `${Math.round(((cents || 0) / max) * 100)}%`
}
```
```css
.chart-bars { display: flex; align-items: flex-end; gap: 4px; height: 140px; }
.chart-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.chart-bar { width: 100%; max-width: 36px; min-height: 2px; border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-soft));
  transition: height 0.35s ease; }
```
柱子上方 `title` 属性显示精确值（`¥xxx`）；维度切换（月/季/年）用 el-radio-group 重发请求，汇总区显示总收入 + 完成数 + 环比（`changePct == null` 时不显示环比——验收 1.7 首月无上一周期）。

**未冻结 API 字段名的宽松归一化**（与 plan-node-speech 的冻结契约不同——本批只冻结了端点名，字段名是从验收标准推断的）：
```js
function normalize(raw) {
  const list = raw?.bars || raw?.data || raw?.buckets || []
  bars.value = list.map(b => ({
    label: b.label ?? b.name ?? b.key ?? '',
    cents: b.cents ?? b.amountCents ?? b.amount ?? b.totalCents ?? 0
  }))
  summary.value = {
    totalCents: raw?.totalCents ?? raw?.total ?? raw?.summary?.totalCents ?? 0,
    orderCount: raw?.orderCount ?? raw?.completedCount ?? null,
    changePct: raw?.changePct ?? raw?.momChange ?? null,
    prevLabel: raw?.prevLabel ?? raw?.prevPeriodLabel ?? ''
  }
}
```
待办列表同理：`tag: o.tag ?? o.label ?? guessTag(o)`，`guessTag` 前端按 status+deadline 推断（overdue/dueToday/pending/revision/inProgress）作兜底。comms 里请三号联调时确认实际字段名。

**名额概览卡**（复用 SPEC-004，不新建 API——验收 §5.3）：
```js
const batchLimit = computed(() => store.profile?.batch_limit ?? null)
const visible = computed(() => batchLimit.value != null && !loadFailed.value)  // NULL 不渲染 + 错误静默降级（Q3）
async function load() {
  try {
    const [formal, buffer] = await Promise.all([artistApi.getQueue(), artistApi.getQueue('buffer')])
    formalCount.value = (formal || []).length
    bufferCount.value = (buffer || []).length
    nextBuffer.value = (buffer || [])[0] || null
  } catch { loadFailed.value = true }  // 静默降级：不显示卡片，不阻塞其他模块
}
```
进度条颜色：正式区满 → `--el-color-warning`（验收 5.3），缓冲区 → `--el-color-primary-light-3`（蓝色系，验收 §5.4）。点击卡片跳 `/queue?zone=buffer`。

**要点**：
- 布局壳（Dashboard.vue）只保留状态切换逻辑（P1-6 回滚）+ stats 加载（统计卡片和今日统计行共享），其余全下沉到模块组件
- 快捷操作 6 卡片固定 2×3 网格（C52 不可自定义）——注意验收 §3.3 写的 `/gallery` 路由不存在，实际是 `/artworks`（见 SKILL.md 陷阱「Dispatch docs may name routes that don't exist」）
- 相对时间前端计算（<1min 刚刚 / <60min N分钟前 / <24h N小时前 / <30d N天前 / 否则 toLocaleDateString），超 30 天按 locale 显示日期
- 移除"本月收入"统计卡（4→3，Q4 已定）；默认面板入口（R8）不放入新布局（Q5 已定，DB 字段保留 UI 不渲染）
- i18n 新增 22 键 × 2 语言（dashboard 命名空间：revenue*/todo*/tag_*/activity*/time*/slot*/retry/artworks/tiers）

---

## 37. 嵌入脚本 iframe → 跳转改造（v0.18-b2，用户拍板下线 iframe）

用户决策：嵌入功能不补完 iframe，改最简跳转。embed.js 是**独立静态文件**（`web/public/embed.js`，画师网站直接 `<script src>` 引用，不走 Vue 构建），改它即可切断 iframe 链路：

```js
// 改前：点击 → 创建 overlay + iframe（src = BASE_URL + '/embed.html?artist=' + ARTIST）
// 改后：点击 → 直接跳转画师公开主页
btn.addEventListener('click', function () {
  window.location.href = BASE_URL + '/artist/' + encodeURIComponent(ARTIST)
})
```
`BASE_URL` 从 `document.currentScript.src` 推导（去掉 `/embed.js` 后缀），画师从哪个域名引的脚本就跳哪个域名的公开页。按钮创建/挂载逻辑（`#huiyue-commission` 容器优先，否则插在 script 标签后）不变。

**废弃但不删除**（完整清理需要改 vite.config.js——权限外）：
- `web/src/embed/EmbedOrderPage.vue` 顶部加废弃注释块：说明已改跳转模式、本组件及 embed.html/main.js 不再被引用、待 vite.config.js 移除 embed 入口后整体删除（需一号协调）
- README 嵌入章节描述改为"显示约稿按钮，点击跳转画师公开主页"
- vite.config.js `rollupOptions.input.embed` 仍指向 embed.html——移除后 embed.html 不再构建，届时可删 `web/embed.html` + `web/src/embed/` 整个目录。comms 里列为"需要一号处理的事项"
- router/index.js 无嵌入路由（嵌入是独立 vite 入口不走 router）——派工里"移除嵌入路由"项实际不存在，comms 里说明无需操作

**要点**：
- 改独立静态 JS 文件时保持 ES5 风格（`var`/`function`，无箭头函数）——它被任意第三方网站直接加载，不经过构建转译，老浏览器兼容是硬约束
- CSP frame-ancestors 保持 'self' 即可（不再需要被 iframe 嵌入）
- 这是"用户拍板下线功能"的标准处理：入口改道 + 孤儿代码标注废弃 + 文档同步 + 把真正的删除动作（需权限外文件）交给一号，不自己越权改 vite.config.js

---

## 38. 瀑布流统一：共享组件默认值一处改动（F2，v0.19-wave1）

4 模板作品展示统一为瀑布流。TplGallery 已有 masonry CSS（folio 验证过），改动只有两处：

```js
// TplGallery.vue — 默认值 grid → masonry
layout: { type: String, default: 'masonry' }
```
```html
<!-- 4 模板删显式 layout prop，统一走默认 -->
<TplGallery :artworks="artworks" />
```

masonry 实现要点（已有 CSS，不新增）：
- `columns: 2; column-gap: 20px` + `.tpl-gallery-item { break-inside: avoid; margin-bottom: 20px }` — CSS 多列瀑布流，零 JS
- `.tpl-gallery-img { width: 100%; display: block }` — **height: auto 保留原始比例**（竖图/横幅不裁切，这是与 grid 布局 `height: 200px` + `fit: cover` 的本质区别）
- 移动端 `@media (max-width: 768px) { columns: 1 }` 单列
- `preview-teleported` 已有（UI-6 修复），全屏预览不受影响

**要点**：
- 这是"改共享组件默认值"模式（与 SPEC-004 slotDisplay 同类）：一处默认值改动 + N 处删冗余 prop，比 N 处各加 prop 干净
- 删显式 prop 而非改成 `layout="masonry"` — 冗余 prop 会掩盖默认值变更，未来改默认值时 4 模板不跟随
- CSS columns 瀑布流的列平衡由浏览器自动处理（按高度均分），无需 JS 计算
- 瀑布流渲染效果（竖图/横幅混排、列平衡）无法单测覆盖，comms 里列为需人工浏览器走查项

---

## 39. 表单 label 补充说明 tooltip（P1-4，el-form-item #label 插槽）

基础文案不变，鼠标悬停图标显示详细说明。用 el-form-item 的 `#label` 插槽（而非改 label 字符串）：

```html
<el-form-item>
  <template #label>
    <span>{{ $t('orderForm.refLabel') }}</span>
    <el-tooltip :content="$t('orderForm.refTip')" placement="top">
      <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
    </el-tooltip>
  </template>
  <!-- 原表单控件不变 -->
</el-form-item>
```
```js
import { Plus, InfoFilled } from '@element-plus/icons-vue'  // 补 InfoFilled 导入
```
```css
/* scoped 样式：灰色图标 + hover 变主色 + cursor: help 暗示可悬停 */
.ref-tip-icon {
  margin-left: 4px;
  color: var(--text-secondary);
  cursor: help;
  vertical-align: middle;
  transition: color 0.2s;
}
.ref-tip-icon:hover { color: var(--color-primary); }
```

**要点**：
- `#label` 插槽是 el-form-item 原生支持，label 区域的校验星号/对齐样式自动保留
- tooltip 文案走独立 i18n 键（`refTip`），不塞进 label 键 — label 是常驻文案，tooltip 是补充说明，两者生命周期不同
- `cursor: help` 是语义正确的鼠标样式（问号光标），暗示"悬停有信息"
- 客户页（OrderForm）用 `var(--color-primary)`，画师页（ManualOrder）用 `var(--el-color-primary)` — 跟随各页面已有的 CSS 变量体系，不混用
- 新增 i18n 键 × 2 语言（只加不改），locales 改动在 comms 里注明（隐含授权）

---

## 40. 零样式共享组件 + Hero 浮层 wrapper + 点赞（F3/F1，v0.19-wave2）

用户硬约束：**共享逻辑，不共享皮肤。** 共享组件（TplAnnouncement / ArtworkLikeButton）只输出内容和状态，不写任何布局/装饰样式，视觉完全由各模板的 class 控制——防止 4 模板同质化。这是拍板的架构约束，不是风格偏好。

### 零样式共享组件

TplAnnouncement **完全没有 `<style>` 块**：
```html
<template>
  <div v-if="artist?.announcement" class="tpl-announcement" role="note">
    <span class="tpl-announcement-icon" aria-hidden="true">📢</span>
    <span class="tpl-announcement-text">{{ artist.announcement.text }}</span>
  </div>
</template>
<script setup>
defineProps({ artist: { type: Object, default: () => ({}) } })
</script>
<!-- 无 <style> -->
```

ArtworkLikeButton 只有「行为基线样式」（按钮重置 + 状态过渡 + 弹跳动画），颜色/大小完全交给模板：
```css
.like-btn { appearance: none; border: 0; background: none; padding: 0; cursor: pointer;
  display: inline-flex; align-items: center; gap: 0.3em;
  color: inherit;      /* ← 颜色继承 currentColor，模板定 color */
  font: inherit; line-height: 1; }  /* ← 大小跟随 1em，模板定 font-size */
.like-heart { width: 1em; height: 1em; flex-shrink: 0; }
.like-heart path { fill: transparent; stroke: currentColor; stroke-width: 2;
  transition: fill 0.25s ease, stroke 0.25s ease; }
.like-btn--liked .like-heart path { fill: currentColor; }
.like-btn--pop .like-heart { animation: like-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes like-pop { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
```
关键：颜色用 `currentColor`（无硬编码色值）、尺寸用 `1em`（无硬编码 px）——模板只需设 `color` 和 `font-size` 就控制整体外观。组件自身无 margin/padding/background/border-radius/font-size。

模板通过 `:deep()` 定制内部元素，4 模板 class 互不相同、视觉各异（验收「不共享皮肤」）：
```css
.classic-announcement { border-left: 3px solid var(--color-primary); background: var(--color-primary-soft); /* … */ }
.classic-announcement :deep(.tpl-announcement-icon) { flex-shrink: 0; }
.classic-announcement :deep(.tpl-announcement-text) { word-break: break-word; }
```

### 在授权外共享组件上叠加浮层（wrapper 模式）

T3 位置表要求 gallery/atelier/folio 的公告位于 Hero 区域内，但 TplHero 不在授权清单。解法：用 `position: relative` 的 div 包裹 TplHero，公告在其内 absolute 定位，**TplHero 零改动**：
```html
<div class="gallery-hero-wrap">
  <TplHero :artist="artist" … ref="heroRef" />
  <TplAnnouncement :artist="artist" class="gallery-announcement" />
</div>
```
```css
.gallery-hero-wrap { position: relative; }
.gallery-announcement { position: absolute; top: 32px; left: 32px; z-index: 2; /* … */ }
```
适用于一切「需在共享组件上方叠加内容但不能改它」的场景。注意 wrapper 不能破坏原布局——TplHero fullscreen 变体是 height:100vh，wrapper 只是普通块级容器，无影响。

### 位置冲突解决

T3 原定 gallery「左下角展签式」，但 TplHero fullscreen 变体左下角已有展签（plaque：名字+bio+按钮），公告放左下会重叠。解法：移到**左上角**（最近的不冲突位置），comms 里列为「待一号决策」。不要因冲突而停摆，也不要默默偏离——选最近合理位置并明确标注。

### 确定性锚定 vs 猜测偏移

folio 公告最初用 `top: 50% + translateY(44px)`（猜测「简介下方」），但 bio 长度可变，会与按钮区重叠。改为锚定**左栏底部**（`bottom: 20px`）——TplHero split 变体内容垂直居中，底部恒有空隙，确定性不重叠。移动端补 static 回退（absolute 会与单栏内容重叠）：
```css
.folio-announcement { position: absolute; bottom: 20px; left: max(32px, calc(50% - 518px)); width: min(420px, calc(50% - 80px)); /* … */ }
@media (max-width: 768px) {
  .folio-announcement { position: static; width: auto; margin: 0 20px; padding: 10px 0 0; }
}
```
教训：Hero 内 absolute 浮层应锚定确定性边缘（底部/四角），不要猜测中心偏移（内容长度可变）。移动端单栏必须转 static。

### prop/ref 同名冲突

ArtworkLikeButton 有 prop `liked`，内部 ref 若也叫 `liked`（`const liked = ref(props.liked)`）会触发 vue/no-dupe-keys 风险（props 与 setup 绑定同命名空间）。内部 ref 改名 `isLiked`：
```js
const isLiked = ref(props.liked)  // 别写 const liked = ref(props.liked)
```
模板用 `:class="{ 'like-btn--liked': isLiked }"`。凡 ref 与 prop 重名，ref 加 `is`/`local` 前缀。

### localStorage 已赞集合（按画师隔离）

key 为 `huiyue_liked_${subdomain}`（按画师隔离，多画师不串）。两处读写：
```js
// ArtworkLikeButton：toggle 后持久化
const STORAGE_KEY = `huiyue_liked_${props.subdomain}`
function readIds() { try { const raw = localStorage.getItem(STORAGE_KEY); const ids = raw ? JSON.parse(raw) : []; return Array.isArray(ids) ? ids : [] } catch { return [] } }
function persist() { try { const ids = new Set(readIds()); if (isLiked.value) ids.add(props.artworkId); else ids.delete(props.artworkId); localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])) } catch { /* 隐私模式忽略 */ } }
```
```js
// TplGallery：setup 时读初始已赞集合（刷新保持）
function readLikedIds() { try { const raw = localStorage.getItem(`huiyue_liked_${props.subdomain}`); const ids = raw ? JSON.parse(raw) : []; return Array.isArray(ids) ? new Set(ids) : new Set() } catch { return new Set() } }
const likedIds = readLikedIds()
function isLiked(id) { return likedIds.has(id) }
```
TplGallery 需新增 `subdomain` prop（4 模板传入 `:subdomain="subdomain"`）。验收「刷新保持」= setup 读 localStorage；「换浏览器未赞」= localStorage 天然按浏览器隔离。

### 点赞按钮嵌入 TplGallery meta 区

原 caption 是独立 `<p>`，改为 meta 区（标题左 + 点赞右）：
```html
<div class="tpl-gallery-meta">
  <p class="tpl-gallery-caption" v-if="art.title">{{ art.title }}</p>
  <ArtworkLikeButton class="tpl-gallery-like" :artwork-id="art.id"
    :initial-count="art.like_count || 0" :liked="isLiked(art.id)" :subdomain="subdomain" />
</div>
```
```css
.tpl-gallery-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 0 0; }
.tpl-gallery-caption { margin: 0; flex: 1; min-width: 0; }
.tpl-gallery-like { font-size: 14px; color: var(--pal-text-dim); flex-shrink: 0; transition: color 0.2s; }
.tpl-gallery-like:hover { color: var(--color-primary); }
.tpl-gallery--masonry .tpl-gallery-meta { padding: 12px 16px; margin: 0; }  /* masonry 卡片内边距 */
```
`art.like_count` 由后端 getArtworks 返回（SELECT * 含 like_count）。T5（用户拍板）：0 赞不显示数字——组件内 `v-if="count > 0"` 才渲染计数，0 赞只显示空心 ♥。公告/点赞的浮层定位与填充动画无法单测覆盖，comms 里列为需人工浏览器走查项。

---

## 41. EP CSS 按需引入：base.css 顺序陷阱（v0.22 A4，删全量 index.css）

v0.20 把 EP JS 改按需（resolver `importStyle: false`）但**保留全量 CSS**（`element-plus/dist/index.css`，470kB / gzip 93kB），理由是"避免样式覆盖顺序风险"。v0.22 A4 实证解决了这个风险，把全量 CSS 删掉，gzip 降到 46kB（-50%）。

**风险的真实形态**：`--el-color-primary` 等全部 `:root` 变量定义在 `base.css`（7.8KB）。`importStyle: 'css'` 时每个组件的 `style/css.mjs` 会自动 `import "../../base/style/css.mjs"`——但这条依赖链经 router→view→component 注入，**位置在 theme.css 之后**，会把 theme.css 的 `--el-*` 覆写压回去（主色/圆角/背景全失效）。这是 v0.20 不敢删全量 CSS 的真正原因。

**解法（三步）**：
1. `vite.config.js`：resolver `importStyle: false` → `'css'`（el-* 组件样式随注册自动注入）
2. `main.js`：删 `import 'element-plus/dist/index.css'`，保留 `dark/css-vars.css`，**手动补 3 个 JS API 组件样式**——`el-message.css` / `el-message-box.css` / `el-loading.css`（这三个走 `ElMessage()`/`ElMessageBox.confirm()`/`ElLoading.directive()` JS 调用，不是模板 el-* 标签，resolver 不覆盖，样式必须手动引）
3. **base.css 无需手动引**——main.js 顶部的 `ElLoading` 命名导入（`import { ElLoading } from 'element-plus'`）经 css.mjs 依赖链自动拉入 base.css，且位于入口最顶部 → 在 theme.css 之前 → theme.css 覆写安全

```js
// main.js（A4 后）
import { ElLoading } from 'element-plus'
// A4: el-* 组件样式由 resolver 随注册自动注入（vite.config.js importStyle: 'css'）
// 以下三个走 JS API 调用（非模板标签），resolver 不覆盖，需手动引入
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/dark/css-vars.css'   // 暗色变量保留
```

**验证方法**（删全量 CSS 是高风险改动，必须跑真实 UI 路径）：
- `npm run build` 看 main CSS 体积（470→124kB）
- **跑 E2E 套件**（`npm run test:e2e`）——5 条核心路径覆盖大量 EP 组件 + ElMessage/ElMessageBox，是删 CSS 后最可靠的回归验证（vitest 不渲染 EP 组件，测不出样式缺失）
- 边角页面（HealthCheck/TierManage 等 E2E 未覆盖的）comms 里列为需人工走查项

**要点**：
- 组件 CSS（el-button.css 等）**不含** `:root` 变量（实证 grep 为 False），变量只在 base.css——所以只需保证 base.css 在前，不用管单个组件 CSS 的顺序
- `ElNotification` 项目未使用（grep 0 命中），不需要引其样式——加 JS API 组件样式前先 grep 确认实际用了哪几个
- 结果：main CSS 470.87→123.63 kB（gzip 92.85→46.14 kB，-50%），main JS +13kB（Sentry，同批 A1）

---

## 42. Spec 组件命名与代码现实不符 + 替换型改动等后端（v0.23 B7 预读）

**Spec 说"替换 X 组件"时，先 grep X 的所有消费者**——spec 描述的组件位置可能与代码现实完全不符。v0.23 B7 spec 说"替换现有 PaymentBar 勾选交互"（§2.5/§4.1），暗示 PaymentBar 在订单详情页。实际 grep：PaymentBar 只被 `WorkflowPaymentEditor.vue` 消费（工作流收款**比例**编辑），消费方是 Settings/TierManage/ArtistDetailDrawer/DefaultWorkflowEditor——**与订单收款无关，OrderDetail 里根本没有 PaymentBar**。B7 的真实形态是「OrderDetail **新增**收款记录区」，不是「替换 PaymentBar」；PaymentBar 本身要保留（比例编辑仍需要）。若照 spec 字面去改 PaymentBar，会改错文件、破坏工作流比例编辑。

预读时一并确认的 B7 代码现实（4 项，全部写进预读报告）：
1. PaymentBar 不在 OrderDetail（上述）
2. OrderDetail 已有价格小结区（L879-905，后端字段优先 + installments 本地兜底）——B7 是替换这块，不是凭空新增
3. TrackOrder 客户端分期展示（L103-107）需改为四项数据 + 进度条
4. 管理端**没有**订单详情页（只有 ArtistManage 的订单列表弹窗）——"订单详情加收款流水"需新建 UI 容器

**替换型改动 vs 增量改动的开工决策**：
- **增量/可选字段型**（加 v-if 守卫、缺字段回退旧行为）→ 契约冻结即可并行，不等后端（见 SKILL.md「Contract-first parallel work」）
- **替换型**（重做现有区域、删旧交互）→ 向后兼容分支成本高、容易两头不讨好，**等后端合入再开工**。B7 是替换型（重做收款区 + 删勾选交互），且后端分支 `git log master..<branch>` 为空（未开工），等待窗口短 → 预读报告建议等后端，一号确认后执行

预读报告结构（交付物，不写代码）：每项「派工项 | 实际状态 | 依据 file:line」表格 + 预读发现编号列表 + 开工建议（等/不等 + 理由）+ 实施计划表（波 | 工作 | 文件 | 预估）。

---

## 43. 客户端浮窗全局组件化 + 单点字段覆盖 + 瀑布流骨架（v0.29 #55/#54/#50/#52）

### 43a. 多页面重复浮窗 → 全局组件 + provide/inject 传避让状态

客户端右下角浮窗散落在 6 处（4 模板各写 `.theme-fab` + `<ThemePicker/>`，
TrackOrder/OrderForm 各写 `.page-prefs` + `<ThemeToggle/>`），样式行为不统一。
统一方案：

1. **新建全局组件** `web/src/components/client/ClientFloatingActions.vue`，
   内部包 `<ThemePicker/>`（功能更全：主色颜料盒+底色+语言，覆盖 ThemeToggle 的明暗+语言），
   带 `raised` prop（吸底 CTA 可见时上移避让）：
```html
<template>
  <div class="client-fab" :class="{ 'client-fab--raised': raised }">
    <ThemePicker />
  </div>
</template>
<script setup>
import ThemePicker from '../ThemePicker.vue'
defineProps({ raised: { type: Boolean, default: false } })
</script>
<style scoped>
.client-fab { position: fixed; right: 16px; bottom: 16px; z-index: 95; padding: 10px 12px;
  background: var(--bg-card); border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  transition: box-shadow 0.2s, bottom 0.3s; }
.client-fab:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
.client-fab--raised { bottom: 72px; }
</style>
```

2. **父级 ArtistHome.vue 统一挂载一份**（覆盖 4 模板），provide 一个 ref 供模板同步避让：
```js
const ctaRaised = ref(false)
provide('ctaRaised', ctaRaised)
```
```html
<!-- 放在 v-if/v-else-if 链之外，避免打断条件链 -->
<ClientFloatingActions v-if="artist && artist.status !== 'hidden'" :raised="ctaRaised" />
```

3. **有吸底 CTA 的模板（Gallery/Folio/Atelier）inject + watch 同步**：
```js
const ctaRaised = inject('ctaRaised')
watch(ctaVisible, (v) => { ctaRaised.value = v }, { immediate: true })
```
Classic 无 CTA 不需要 inject；TrackOrder/OrderForm 直接 `<ClientFloatingActions />`（无 raised）。

4. **删 6 处旧实现**：4 模板删 `.theme-fab` 模板+CSS+`import ThemePicker`，
   TrackOrder/OrderForm 删 `.page-prefs` 模板+CSS+`import ThemeToggle`。

**要点**：
- **v-if/v-else-if 链陷阱**：挂载浮窗时别插进 `v-if="hidden" / v-else-if="artist" / v-else-if="!loading"`
  条件链中间，会把 `v-else-if` 的锚点 `v-if` 切断。放在整条链**之后**作独立 `v-if`。
- provide/inject 传**可变 ref**（不是 computed/值），子模板 watch 回写——父级浮窗读同一个 ref 响应更新。
- 客户端只有一套皮肤（不像 4 模板要差异化），所以全局组件**可以带样式**
  （与「共享逻辑不共享皮肤」原则不冲突——那条针对的是 4 模板差异化的 Tpl* 组件）。
- 删旧 CSS 时 patch 的 old_string 若以 `}` 开头/结尾，替换后易留重复行或空行，
  改完 grep `theme-fab`/`page-prefs` 确认 0 命中，并跑 eslint 抓
  `vue/multiline-html-element-content-newline`（删模板块留下的多余空行）。

### 43b. 后端派生字段覆盖：单点 computed，4 模板零改动（#54 effectiveStatus）

后端公开 API 新增 `effectiveStatus`（额度耗尽时 `'open'→'full'`），要让 4 模板的
TplStatusBadge/TplHero/TplStickyCta 都用新状态。**不改 4 模板**，在 ArtistHome.vue
传给模板的 artist 上做单点覆盖：
```js
// 向后兼容：字段缺失时 fallback 原始 status
const displayArtist = computed(() => {
  const a = artist.value
  if (!a) return a
  if (a.effectiveStatus && a.effectiveStatus !== a.status) {
    return { ...a, status: a.effectiveStatus }
  }
  return a
})
```
模板里 `<component :artist="displayArtist" />`。链路：ArtistHome 传 displayArtist
→ 模板 artist prop → TplHero/TplStickyCta 的 `artist.status` 全链路自动生效。

**要点**：
- 这是「单点分支」原则（同第 20 节预览模式）：覆盖逻辑只在入口一个 computed，
  不扩散到模板内部。后端字段未合入时 `a.effectiveStatus` 为 undefined → 返回原对象，行为不变。
- 判断该不该用这个模式：所有消费方是否都经同一个 prop 读字段。是 → 单点覆盖；
  各消费方读不同来源 → 各自处理。
- 后端字段未合入时按契约先行（向后兼容 fallback），comms 注明「依赖五号后端，合入后自动生效」。

### 43c. 瀑布流图片预留高度防跳动（#50，后端无宽高字段时的兜底）

CSS columns 瀑布流（第 38 节）图片懒加载完成前高度为 0，加载完撑开挤掉上方图。
后端 artworks 表**无 width/height 字段**（grep server/ 0 命中），无法用 aspect-ratio 精确预留，
走兜底：el-image `#placeholder` 插槽 + 骨架占位：
```html
<el-image :src="..." lazy ...>
  <template #placeholder>
    <div class="tpl-gallery-skeleton" />
  </template>
</el-image>
```
```css
.tpl-gallery-skeleton {
  width: 100%; min-height: 200px;   /* 固定最小高度占位，防跳动 */
  background: linear-gradient(110deg, var(--pal-surface) 30%, var(--pal-border) 50%, var(--pal-surface) 70%);
  background-size: 200% 100%;
  animation: tpl-gallery-shimmer 1.5s ease-in-out infinite;
}
@keyframes tpl-gallery-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
```
若后端有宽高，优先 `aspect-ratio: w/h` 或 `padding-bottom: h/w%` 精确预留（更稳）。
判断信号：grep `width`/`height` 在后端 artworks 查询里，有则精确方案，无则骨架兜底。

### 43d. el-image 灯箱关闭：hide-on-click-modal（#52）

EP 2.9.0 的 el-image 内置预览（ImageViewer）**默认支持 ESC 关闭**，但**点遮罩默认不关**。
用户反馈「点外面关不掉」→ 给 el-image 加 `hide-on-click-modal` 属性：
```html
<el-image :preview-src-list="..." preview-teleported hide-on-click-modal lazy />
```
排查方法：grep `preview-src-list` 找出所有用内置预览的 el-image（TplGallery/TplTierGrid 等），
逐个补 `hide-on-click-modal`。若是自定义 `el-image-viewer`（OrderDetail 用），
其 `hide-on-click-modal` 默认 true，无需改。没有全局 CSS 干扰时（grep `image-viewer`/`pointer-events`
在 *.css 0 命中），加这个属性即可，不用自定义灯箱。
