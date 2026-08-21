<script lang="ts">
// #3: 快捷按钮候选池常量（命名导出，供 Preferences.vue 配置区共用）
// v0.34 任务3：emoji 图标位改用 @element-plus/icons-vue SVG（用户拍板删 emoji，SVG 无所谓）
import { markRaw } from 'vue'
import type { Component } from 'vue'
import { Tickets, EditPen, Box, ChatDotRound, Money, Picture, Setting, View, Share, UploadFilled, Wallet, Document, ChatLineRound, Notebook, Brush, PriceTag } from '@element-plus/icons-vue'
import { safeGetItem } from '../../../utils/storage'

/** localStorage 键（v0.25 起 DB 优先，localStorage 作为回退缓存） */
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'

/** 候选池条目（type 判别联合：route 必带 route / link、action 不带） */
interface QuickActionRoute {
  key: string
  type: 'route'
  icon: Component
  labelKey: string
  route: string
}
interface QuickActionLink {
  key: string
  type: 'link'
  icon: Component
  labelKey: string
  route: null
}
interface QuickActionAction {
  key: string
  type: 'action'
  icon: Component
  labelKey: string
  route: null
  action: string
}
export type QuickActionDef = QuickActionRoute | QuickActionLink | QuickActionAction

/** 候选池：type=route 跳转 / action 执行动作 / link 新窗口；命名与侧边栏 menu.* 对齐 */
export const QUICK_ACTION_POOL: QuickActionDef[] = [
  { key: 'queue', type: 'route', icon: markRaw(Tickets), labelKey: 'menu.queue', route: '/queue' },
  { key: 'manual', type: 'route', icon: markRaw(EditPen), labelKey: 'menu.manualOrder', route: '/orders?action=manual' },
  { key: 'orders', type: 'route', icon: markRaw(Box), labelKey: 'menu.orders', route: '/orders' },
  { key: 'guestbook', type: 'route', icon: markRaw(ChatDotRound), labelKey: 'menu.guestbook', route: '/guestbook' },
  { key: 'tiers', type: 'route', icon: markRaw(Money), labelKey: 'menu.tiers', route: '/tiers' },
  { key: 'artworks', type: 'route', icon: markRaw(Picture), labelKey: 'menu.artworks', route: '/artworks' },
  { key: 'settings', type: 'route', icon: markRaw(Setting), labelKey: 'menu.settings', route: '/settings' },
  { key: 'preview', type: 'link', icon: markRaw(View), labelKey: 'menu.preview', route: null },
  // ── 819-G: 后台已有但未入池的真实页面（逐一核实 router/index.js 路由存在才加） ──
  { key: 'income', type: 'route', icon: markRaw(Wallet), labelKey: 'menu.standaloneIncome', route: '/tools/income' },
  { key: 'quote', type: 'route', icon: markRaw(Document), labelKey: 'menu.quote', route: '/tools/quote' },
  // 改稿计数器已随 v128 下架（订单详情改用真实修改记录）
  { key: 'reply', type: 'route', icon: markRaw(ChatLineRound), labelKey: 'menu.socialReply', route: '/tools/reply' },
  { key: 'note', type: 'route', icon: markRaw(Notebook), labelKey: 'menu.quickNote', route: '/tools/note' },
  { key: 'watermark', type: 'route', icon: markRaw(Brush), labelKey: 'menu.watermark', route: '/tools/watermark' },
  { key: 'price-calc', type: 'route', icon: markRaw(PriceTag), labelKey: 'menu.priceCalc', route: '/tools/price-calc' },
  // ── F3 新增动作（2026-08-07 用户拍板）──
  { key: 'rules', type: 'route', icon: markRaw(EditPen), labelKey: 'quickAction.rules', route: '/settings?tab=rules' },
  { key: 'share', type: 'action', icon: markRaw(Share), labelKey: 'quickAction.share', route: null, action: 'share' },
  { key: 'quickconfig', type: 'route', icon: markRaw(Setting), labelKey: 'quickAction.quickconfig', route: '/preferences' },
  { key: 'publish', type: 'action', icon: markRaw(UploadFilled), labelKey: 'quickAction.publish', route: null, action: 'publish' }
]

/** 默认（2026-08-07 用户拍板）：动作型为主，移除导航镜像冗余项；817 拍板：移除「状态切换」 */
export const QUICK_ACTIONS_DEFAULT = ['manual', 'preview', 'rules', 'share', 'quickconfig']

/** 解析 quickActions 值（DB 返回 JSON 字符串或数组，统一为合法 key 数组；
    819-G: 空数组 [] 是合法配置=全部隐藏，返回 [] 而非 null） */
export function parseQuickActions(raw: unknown): string[] | null {
  try {
    const keys: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(keys)) return null
    if (keys.length === 0) return []
    const valid = QUICK_ACTION_POOL.filter(a => keys.includes(a.key)).map(a => a.key)
    return valid.length ? valid : null
  } catch { return null }
}

/** 读取 localStorage 配置（无效/缺失 → 默认副本） */
export function readQuickActionsConfig() {
  // G-5: 裸读换 safeGetItem（存储禁用时按默认配置降级，不抛错）
  return parseQuickActions(safeGetItem(QUICK_ACTIONS_KEY)) || [...QUICK_ACTIONS_DEFAULT]
}
</script>

<template>
  <!-- 819-G: 0 个快捷按钮 = 隐藏整个快捷区（含标题），空态不渲染不崩 -->
  <div v-if="activeActions.length" class="quick-actions-wrap">
    <!-- 百眼柜 → 命名说人话：分组标题「设置」（提案 §6.3） -->
    <h3 class="quick-title">{{ $t('quickAction.title') }}</h3>
    <!-- 快捷入口网格（2026-08-07 用户反馈批：常驻虚线块并入「快速发作品」卡片） -->
    <div class="quick-grid">
      <div
        v-for="action in activeActions" :key="action.key"
        class="quick-card" role="button" tabindex="0"
        :class="{
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
        <el-icon class="quick-icon"><component :is="action.icon" /></el-icon>
        <span class="quick-name">{{ action.key === 'publish' && publishUploading ? $t('quickAction.uploading') : $t(action.labelKey) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../../stores/artist'
import { artistApi, uploadApi } from '../../../api/index'
import { usePasteUpload } from '../../../composables/usePasteUpload'
import { trackEvent } from '../../../utils/track'
import { MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_IMAGE_MB } from '../../../constants/upload'

const router = useRouter()
// profile 为「登录画像|完整资料」联合，status/quick_actions 读取以轻量接口桥接（同 PlaqueStatus 手法，不引入 any）
interface ArtistProfileLite {
  status?: string
  quick_actions?: unknown
}
const store = useArtistStore() as Omit<ReturnType<typeof useArtistStore>, 'profile'> & { profile: ArtistProfileLite | null }
const { t } = useI18n()

// v0.25: DB 优先（profile.quick_actions），localStorage 回退，最终兜底默认值
const activeActions = computed(() => {
  const dbKeys = parseQuickActions(store.profile?.quick_actions)
  const keys = dbKeys || readQuickActionsConfig()
  return keys
    .map(k => QUICK_ACTION_POOL.find(a => a.key === k))
    // 817 拍板：删除「状态切换」——已保存的旧值渲染时一并过滤，不再出现状态卡
    .filter((a): a is QuickActionDef => a != null && a.key !== 'status')
    .filter(Boolean)
})

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
  maxCount: MAX_IMAGE_COUNT,
  maxSizeMB: MAX_IMAGE_MB,
  enabled: true
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

function onCardDragEnter(action: QuickActionDef) {
  if (action.key !== 'publish') return
  publishActive.value = true
}
function onCardDragLeave(action: QuickActionDef) {
  if (action.key !== 'publish') return
  publishActive.value = false
}
async function onCardDrop(action: QuickActionDef, e: DragEvent) {
  if (action.key !== 'publish') return
  const files = Array.from(e.dataTransfer?.files || [])
    .filter(f => f.type.startsWith('image/') && f.size <= MAX_IMAGE_BYTES) // a1: 拖拽路径补大小校验（对齐粘贴路径）
  if (!files.length) { ElMessage.warning(t('quickAction.notImage')); return }
  await doPublish(files)
}
async function doPublish(files: File[]) {
  if (publishUploading.value) return // a1: busy 入口守卫——粘贴与拖拽并发时忽略后续批次
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
    ElMessage.error((err as Error).message || t('quickAction.publishFailed'))
  } finally {
    publishUploading.value = false
    publishActive.value = false
  }
}

// ─── go() 分发：route/action/link 三型 ───
function go(action: QuickActionDef) {
  trackEvent('dashboard_quick_click', { action: action.key })
  if (action.type === 'link') {
    // 主页预览：动态拼接 subdomain（新窗口，与 Settings 预览行为一致）
    if (store.subdomain) window.open(`/artist/${store.subdomain}`, '_blank', 'noopener')
    else ElMessage.warning(t('quickAction.noSubdomain'))
    return
  }
  if (action.type === 'action') {
    if (action.action === 'share') shareLink()
    else if (action.action === 'publish') router.push('/artworks') // 点击跳转发作品页；拖图/粘贴走卡片 drop/paste
    return
  }
  router.push(action.route)
}
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（第一批白名单内补漏） */
.quick-actions-wrap { display: flex; flex-direction: column; gap: 10px; }
.quick-title {
  margin: 0;
  font-size: calc(var(--font-scale, 1) * 14px);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: .18em;
}
.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.artist-scope .quick-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 8px;
  border: none;
  border-radius: 3px 8px 4px 9px / 8px 4px 9px 3px;   /* 手剪不规则角（同新组件） */
  background: var(--card); cursor: pointer; user-select: none;
  box-shadow: var(--sh-1);
  transition: background var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid) var(--ease-out);
}
/* hover 仅背景/描边加深，无位移无缩放 */
.quick-card:hover { background: var(--paper2); box-shadow: var(--sh-2); }
/* 快速发作品：拖图悬停/发布中高亮（2026-08-07 用户反馈批） */
.quick-card--publish-active {
  background: color-mix(in srgb, var(--hq) 10%, var(--card));
  box-shadow: var(--sh-1);
}
.quick-card--publish-active .quick-icon { color: var(--hq); }
.quick-icon { font-size: calc(var(--font-scale, 1) * 22px); color: var(--hq); }
.quick-name { font-size: calc(var(--font-scale, 1) * 12px); font-weight: 500; color: var(--ink); }
/* 812 追修（用户实测反馈：430px 手机屏仍三列硬挤、标签断行）：
   2 列断点由 400px 提到 600px，覆盖主流手机竖屏；删除无效 768px 块（与基础规则重复） */
@media (max-width: 600px) {
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
