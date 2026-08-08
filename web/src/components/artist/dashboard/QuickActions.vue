<script>
// #3: 快捷按钮候选池常量（命名导出，供 Settings.vue 配置区共用）
// v0.34 任务3：emoji 图标位改用 @element-plus/icons-vue SVG（用户拍板删 emoji，SVG 无所谓）
import { markRaw } from 'vue'
import { Tickets, EditPen, Box, ChatDotRound, Money, Picture, Setting, View, Share, Refresh, UploadFilled } from '@element-plus/icons-vue'

/** localStorage 键（v0.25 起 DB 优先，localStorage 作为回退缓存） */
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'

/** 候选池：type=route 跳转 / action 执行动作 / link 新窗口；命名与侧边栏 menu.* 对齐 */
export const QUICK_ACTION_POOL = [
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
    <!-- 快捷入口网格（2026-08-07 用户反馈批：常驻虚线块并入「快速发作品」卡片；
         02B：状态卡内嵌三态滑块，直接点目标态） -->
    <div class="quick-grid">
      <div
        v-for="action in activeActions" :key="action.key"
        class="quick-card" role="button" tabindex="0"
        :class="{
          'quick-card--status': action.key === 'status',
          'quick-card--publish-active': action.key === 'publish' && (publishActive || publishUploading)
        }"
        @click="go(action)"
        @keydown.enter="go(action)"
        @keydown.space.prevent="go(action)"
        @dragenter.prevent="onCardDragEnter(action)"
        @dragover.prevent
        @dragleave="onCardDragLeave(action)"
        @drop.prevent="onCardDrop(action, $event)"
      >
        <template v-if="action.key === 'status'">
          <SliderSwitch
            class="quick-status-slider"
            :model-value="store.profile?.status || 'open'"
            :options="statusOptions"
            size="small"
            @click.stop
            @change="onStatusChange"
          />
        </template>
        <template v-else>
          <el-icon class="quick-icon"><component :is="action.icon" /></el-icon>
          <span class="quick-name">{{ action.key === 'publish' && publishUploading ? $t('quickAction.uploading') : $t(action.labelKey) }}</span>
        </template>
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
import { trackEvent } from '../../../utils/track.js'
import SliderSwitch from '../SliderSwitch.vue'

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

// ─── 02B: 状态三态滑块（与 05B SliderSwitch 统一；直接点目标态替代循环） ───
const statusBusy = ref(false)
const statusOptions = [
  { value: 'open', label: t('dashboard.statusOpen') },
  { value: 'full', label: t('dashboard.statusFull') },
  { value: 'break', label: t('dashboard.statusBreak') }
]
async function onStatusChange(next) {
  if (statusBusy.value || next === (store.profile?.status || 'open')) return
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

// ─── F3 快速发作品：拖图/粘贴直接发布（2026-08-07 用户反馈批：能力并入快捷卡片） ───
const publishActive = ref(false)
const publishUploading = ref(false)
const { pasteError } = usePasteUpload({
  onFiles: async (files) => { await doPublish(files) },
  maxCount: 5,
  maxSizeMB: 10,
  enabled: true
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

function onCardDragEnter(action) {
  if (action.key !== 'publish') return
  publishActive.value = true
}
function onCardDragLeave(action) {
  if (action.key !== 'publish') return
  publishActive.value = false
}
async function onCardDrop(action, e) {
  if (action.key !== 'publish') return
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
  trackEvent('dashboard_quick_click', { action: action.key })
  if (action.type === 'link') {
    // 主页预览：动态拼接 subdomain（新窗口，与 Settings 预览行为一致）
    if (store.subdomain) window.open(`/artist/${store.subdomain}`, '_blank', 'noopener')
    else ElMessage.warning(t('quickAction.noSubdomain'))
    return
  }
  if (action.type === 'action') {
    // 02B: status 由卡片内 SliderSwitch 直接处理（点卡片空白处无循环）
    if (action.action === 'share') shareLink()
    else if (action.action === 'publish') router.push('/artworks') // 点击跳转发作品页；拖图/粘贴走卡片 drop/paste
    return
  }
  router.push(action.route)
}
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（第一批白名单内补漏） */
.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.artist-scope .quick-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--line); border-radius: var(--r-l);
  background: var(--card); cursor: pointer; user-select: none;
  transition: border-color 0.2s, transform 0.15s ease-out, box-shadow 0.2s;
}
.quick-card:hover {
  border-color: color-mix(in srgb, var(--hq) 50%, transparent);
  box-shadow: var(--sh-2);
}
.quick-card:active { transform: translateY(-2px) scale(0.98); }
/* 快速发作品：拖图悬停/发布中高亮（2026-08-07 用户反馈批） */
.quick-card--publish-active {
  border-color: var(--hq);
  background: color-mix(in srgb, var(--hq) 10%, var(--card));
  box-shadow: var(--sh-1);
}
.quick-card--publish-active .quick-icon { color: var(--hq); }
.quick-icon { font-size: calc(var(--font-scale, 1) * 22px); color: var(--hq); }
.quick-name { font-size: calc(var(--font-scale, 1) * 12px); font-weight: 500; color: var(--ink); }
/* 02B: 状态卡内嵌三态滑块（占满卡片宽度，直接点目标态） */
.quick-status-slider { width: 100%; }
@media (max-width: 768px) {
  .quick-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 400px) {
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
/* 快捷区纵向容器 */
.quick-actions-wrap { display: flex; flex-direction: column; gap: 10px; }
</style>
