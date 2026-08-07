<script>
// #3: 快捷按钮候选池常量（命名导出，供 Settings.vue 配置区共用）
// v0.34 任务3：emoji 图标位改用 @element-plus/icons-vue SVG（用户拍板删 emoji，SVG 无所谓）
import { markRaw } from 'vue'
import { Odometer, Tickets, EditPen, Box, ChatDotRound, Money, Picture, Setting, View, Share, Refresh, UploadFilled } from '@element-plus/icons-vue'

/** localStorage 键（v0.25 起 DB 优先，localStorage 作为回退缓存） */
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'

/** 候选池：type=route 跳转 / action 执行动作 / link 新窗口；命名与侧边栏 menu.* 对齐 */
export const QUICK_ACTION_POOL = [
  { key: 'dashboard', type: 'route', icon: markRaw(Odometer), labelKey: 'menu.dashboard', route: '/dashboard' },
  { key: 'queue', type: 'route', icon: markRaw(Tickets), labelKey: 'menu.queue', route: '/queue' },
  { key: 'manual', type: 'route', icon: markRaw(EditPen), labelKey: 'menu.manualOrder', route: '/orders?action=manual' },
  { key: 'orders', type: 'route', icon: markRaw(Box), labelKey: 'menu.orders', route: '/orders' },
  { key: 'guestbook', type: 'route', icon: markRaw(ChatDotRound), labelKey: 'menu.guestbook', route: '/guestbook' },
  { key: 'tiers', type: 'route', icon: markRaw(Money), labelKey: 'menu.tiers', route: '/tiers' },
  { key: 'artworks', type: 'route', icon: markRaw(Picture), labelKey: 'menu.artworks', route: '/artworks' },
  { key: 'settings', type: 'route', icon: markRaw(Setting), labelKey: 'menu.settings', route: '/settings' },
  { key: 'preview', type: 'link', icon: markRaw(View), labelKey: 'menu.preview', route: null },
  // ── F3 新增动作（2026-08-07 用户拍板）──
  { key: 'rules', type: 'route', icon: markRaw(EditPen), labelKey: 'quickAction.rules', route: '/settings?tab=rules' },
  { key: 'share', type: 'action', icon: markRaw(Share), labelKey: 'quickAction.share', route: null, action: 'share' },
  { key: 'quickconfig', type: 'route', icon: markRaw(Setting), labelKey: 'quickAction.quickconfig', route: '/preferences' },
  { key: 'status', type: 'action', icon: markRaw(Refresh), labelKey: 'quickAction.status', route: null, action: 'status' },
  { key: 'publish', type: 'action', icon: markRaw(UploadFilled), labelKey: 'quickAction.publish', route: null, action: 'publish' }
]

/** 默认（2026-08-07 用户拍板）：动作型为主，移除导航镜像冗余项 */
export const QUICK_ACTIONS_DEFAULT = ['manual', 'preview', 'rules', 'share', 'quickconfig', 'status']

/** 解析 quickActions 值（DB 返回 JSON 字符串或数组，统一为合法 key 数组） */
export function parseQuickActions(raw) {
  try {
    const keys = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(keys) || keys.length === 0) return null
    const valid = QUICK_ACTION_POOL.filter(a => keys.includes(a.key)).map(a => a.key)
    return valid.length ? valid : null
  } catch { return null }
}

/** 读取 localStorage 配置（无效/缺失 → 默认副本） */
export function readQuickActionsConfig() {
  return parseQuickActions(localStorage.getItem(QUICK_ACTIONS_KEY)) || [...QUICK_ACTIONS_DEFAULT]
}
</script>

<template>
  <div class="quick-actions-wrap">
    <!-- 快速发作品：拖图/粘贴即发（画师直接拖到块上，真正人类逻辑） -->
    <div
      class="quick-publish"
      :class="{ 'quick-publish--active': publishActive || publishUploading }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @drop.prevent="onDropPublish"
      @click="publishActive = !publishActive"
      role="button" tabindex="0"
      @keydown.enter="publishActive = !publishActive"
    >
      <el-icon class="quick-publish-icon"><UploadFilled /></el-icon>
      <span class="quick-publish-name">{{ $t('quickAction.publishHint') }}</span>
      <span v-if="publishUploading" class="quick-publish-state">{{ $t('quickAction.uploading') }}</span>
    </div>
    <!-- 快捷入口网格：默认 5 项（manual/preview/rules/share/quickconfig），可自定义 -->
    <div class="quick-grid">
      <div
        v-for="action in activeActions" :key="action.key"
        class="quick-card" role="button" tabindex="0"
        :class="{ 'quick-card--status': action.key === 'status' }"
        @click="go(action)"
        @keydown.enter="go(action)"
        @keydown.space.prevent="go(action)"
      >
        <el-icon class="quick-icon"><component :is="action.icon" /></el-icon>
        <span class="quick-name">{{ $t(action.labelKey) }}</span>
        <span v-if="action.key === 'status'" class="quick-status-label">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../../stores/artist.js'
import { artistApi, uploadApi } from '../../../api/index.js'
import { usePasteUpload } from '../../../composables/usePasteUpload.js'

const router = useRouter()
const store = useArtistStore()
const { t } = useI18n()

// v0.25: DB 优先（profile.quick_actions），localStorage 回退，最终兜底默认值
const activeActions = computed(() => {
  const dbKeys = parseQuickActions(store.profile?.quick_actions)
  const keys = dbKeys || readQuickActionsConfig()
  return keys
    .map(k => QUICK_ACTION_POOL.find(a => a.key === k))
    .filter(Boolean)
})

// ─── F3 状态循环按钮（替代 Dashboard StatusSwitch，2026-08-07 拍板） ───
const STATUS_CYCLE = ['open', 'full', 'break']
const statusBusy = ref(false)
const statusText = computed(() => t(`dashboard.status${statusLabel(store.profile?.status || 'open')}`))
function statusLabel(s) {
  return { open: 'Open', full: 'Full', break: 'Break' }[s] || 'Open'
}
async function cycleStatus() {
  if (statusBusy.value) return
  const cur = store.profile?.status || 'open'
  const idx = STATUS_CYCLE.indexOf(cur)
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
  statusBusy.value = true
  try {
    await artistApi.updateProfile({ status: next })
    store.profile = { ...store.profile, status: next }
    ElMessage.success(t('dashboard.statusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    statusBusy.value = false
  }
}

// ─── F3 分享接稿页（复制链接） ───
async function shareLink() {
  if (!store.subdomain) {
    ElMessage.warning(t('quickAction.noSubdomain'))
    router.push('/settings')
    return
  }
  const url = `${window.location.origin}/artist/${store.subdomain}`
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success(t('quickAction.copied'))
  } catch {
    ElMessage.warning(url) // 剪贴板不可用：展示链接供手动复制
  }
}

// ─── F3 快速发作品：拖图/粘贴到块（真正人类逻辑） ───
const publishActive = ref(false)
const publishUploading = ref(false)
const { pasteError } = usePasteUpload({
  onFiles: async (files) => { await doPublish(files) },
  maxCount: 5,
  maxSizeMB: 10,
  enabled: true
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

function onDragEnter() {
  publishActive.value = true
}
async function onDropPublish(e) {
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
  if (!files.length) { ElMessage.warning(t('quickAction.notImage')); return }
  await doPublish(files)
}
async function doPublish(files) {
  publishUploading.value = true
  try {
    for (const file of files) {
      const uploaded = await uploadApi.image(file)
      await artistApi.createArtwork({ imagePath: uploaded.filePath, title: uploaded.originalName })
    }
    ElMessage.success(t('quickAction.published'))
    // 保持 profile 最新（quick_actions 等可能变化），失败静默
    store.fetchProfile().catch(() => {})
  } catch (err) {
    ElMessage.error(err.message || t('quickAction.publishFailed'))
  } finally {
    publishUploading.value = false
    publishActive.value = false
  }
}

// ─── go() 分发：route/action/link 三型 ───
function go(action) {
  if (action.type === 'link') {
    // 主页预览：动态拼接 subdomain（新窗口，与 Settings 预览行为一致）
    if (store.subdomain) window.open(`/artist/${store.subdomain}`, '_blank', 'noopener')
    else ElMessage.warning(t('quickAction.noSubdomain'))
    return
  }
  if (action.type === 'action') {
    if (action.action === 'status') cycleStatus()
    else if (action.action === 'share') shareLink()
    else if (action.action === 'publish') { publishActive.value = !publishActive.value }
    return
  }
  router.push(action.route)
}
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（第一批白名单内补漏） */
.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.quick-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--line); border-radius: var(--r-l);
  background: var(--card); cursor: pointer; user-select: none;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}
.quick-card:hover {
  border-color: color-mix(in srgb, var(--hq) 50%, transparent);
  transform: translateY(-2px);
  box-shadow: var(--sh-2);
}
.quick-card:active { transform: translateY(0); }
.quick-icon { font-size: 22px; color: var(--hq); }
.quick-name { font-size: 12px; font-weight: 500; color: var(--ink); }
@media (max-width: 768px) {
  .quick-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 400px) {
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
/* ─── F3 快速发作品拖图块（2026-08-07） ─── */
.quick-actions-wrap { display: flex; flex-direction: column; gap: 10px; }
.quick-publish {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px 12px;
  border: 1.5px dashed color-mix(in srgb, var(--hq) 55%, transparent);
  border-radius: var(--r-l);
  background: color-mix(in srgb, var(--hq) 6%, var(--card));
  cursor: pointer; user-select: none;
  transition: border-color 0.2s, background 0.2s;
}
.quick-publish:hover, .quick-publish--active {
  border-color: var(--hq);
  background: color-mix(in srgb, var(--hq) 12%, var(--card));
}
.quick-publish-icon { font-size: 20px; color: var(--hq); }
.quick-publish-name { font-size: 13px; font-weight: 500; color: var(--ink); }
.quick-publish-state { font-size: 12px; color: var(--ink3); }
/* 状态卡当前状态文字 */
.quick-status-label { font-size: 11px; color: var(--ink3); margin-top: -2px; }
</style>
