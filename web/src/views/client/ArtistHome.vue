<template>
  <div class="artist-home" v-loading="loading">
    <!-- R50: 预览模式横幅（有预览参数时显示，客户拿到链接也只看到公开数据） -->
    <div v-if="isPreview" class="preview-banner">🔍 {{ $t('artistHome.previewBanner') }}</div>
    <!-- UI-8: hidden 状态 — 友好提示页，不渲染模板 -->
    <div v-if="artist?.status === 'hidden'" class="hidden-state">
      <p class="hidden-icon">🙈</p>
      <p>{{ $t('artistHome.hidden') }}</p>
    </div>
    <component
      v-else-if="artist"
      :is="templateComponent"
      :artist="displayArtist"
      :tiers="tiers"
      :artworks="artworks"
      :rules="rules"
      :workflow-stages="workflowStages"
      :subdomain="subdomain"
      :sanitized-rules="sanitizedRules"
      :pricing="pricing"
    />
    <div v-else-if="!loading" class="empty-state">
      <p>{{ $t('artistHome.loadFailed') }}</p>
    </div>
    <!-- #55/61: 客户端统一浮窗（4 模板共用，CTA 避让由模板 inject 同步） -->
    <ClientFloatingActions v-if="artist && artist.status !== 'hidden'" :raised="ctaRaised" />
  </div>
</template>

<script setup>
import { ref, computed, provide, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../../utils/sanitize.js'
import { usePalette } from '../../composables/usePalette.js'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

const artist = ref(null)
const tiers = ref([])
const artworks = ref([])
const rules = ref('')
const workflowStages = ref([])
const pricing = ref(null)
const loading = ref(true)

const sanitizedRules = computed(() => sanitizeHtml(rules.value))

// #54: effectiveStatus 适配——额度耗尽时后端返回 effectiveStatus='full'，前端覆盖 status
// 向后兼容：字段缺失时 fallback 原始 status，4 模板零改动
const displayArtist = computed(() => {
  const a = artist.value
  if (!a) return a
  if (a.effectiveStatus && a.effectiveStatus !== a.status) {
    return { ...a, status: a.effectiveStatus }
  }
  return a
})

// ─── R50: 预览参数（_tpl/_pal/_accent 只覆盖渲染层，不碰数据层；单点分支，不扩散到模板内部） ───
const previewTpl = computed(() => route.query._tpl || null)
const previewPal = computed(() => route.query._pal || null)
const previewAccent = computed(() => route.query._accent || null)
const isPreview = computed(() => !!(previewTpl.value || previewPal.value || previewAccent.value))

const paletteId = computed(() => previewPal.value || artist.value?.paletteId || 'paper')

// 配色系统：根据画师 paletteId 设置 html[data-palette]，卸载时清理
usePalette(paletteId)

// #55/61: 浮窗 CTA 避让——模板 inject 后同步 ctaVisible
const ctaRaised = ref(false)
provide('ctaRaised', ctaRaised)

// ─── R49: 强调色覆盖（画师设置优先于访客 ThemePicker；离开主页时恢复访客选择） ───
// 5 色与 theme.css data-accent="1"~"5" 一一对应（含暗色提亮变体，免费获得暗色适配）
const ACCENT_INDEX = { '#34dbcb': '1', '#34c2db': '2', '#3498db': '3', '#346edb': '4', '#3445db': '5' }
const accentOverride = computed(() => {
  const raw = previewAccent.value || artist.value?.accentColor
  return raw ? (ACCENT_INDEX[String(raw).toLowerCase()] || null) : null
})
let savedAccent = null
let accentApplied = false
watch(accentOverride, (idx) => {
  if (idx) {
    if (!accentApplied) { savedAccent = document.documentElement.dataset.accent || null; accentApplied = true }
    document.documentElement.dataset.accent = idx
  } else if (accentApplied) {
    if (savedAccent) document.documentElement.dataset.accent = savedAccent
    else delete document.documentElement.dataset.accent
    accentApplied = false
  }
}, { immediate: true })
onUnmounted(() => {
  if (accentApplied) {
    if (savedAccent) document.documentElement.dataset.accent = savedAccent
    else delete document.documentElement.dataset.accent
  }
})

// ─── 模板注册表（defineAsyncComponent 自动处理懒加载）───
// 布局 ID：classic / gallery / folio；旧值 default / dark-gallery / single-page 做映射兼容
const TEMPLATES = {
  'classic': defineAsyncComponent(() => import('./templates/ArtistHomeClassic.vue')),
  'gallery': defineAsyncComponent(() => import('./templates/ArtistHomeGallery.vue')),
  'folio':   defineAsyncComponent(() => import('./templates/ArtistHomeFolio.vue')),
  'atelier': defineAsyncComponent(() => import('./templates/ArtistHomeAtelier.vue'))
}
const LEGACY_TEMPLATE_MAP = {
  'default': 'classic',
  'dark-gallery': 'gallery',
  'single-page': 'folio'
}

const templateComponent = computed(() => {
  const raw = previewTpl.value || artist.value?.templateId || 'classic'
  const id = LEGACY_TEMPLATE_MAP[raw] || raw
  return TEMPLATES[id] || TEMPLATES.classic
})

onMounted(async () => {
  try {
    const data = await artistPublicApi.getProfile(subdomain)
    artist.value = data
    tiers.value = data.tiers || []
    artworks.value = data.artworks || []
    rules.value = data.rules || ''
    artistPublicApi.getWorkflow(subdomain)
      .then(res => { workflowStages.value = res.stages || [] })
      .catch(() => {})
    // 加载价格数据（增项+倍率，静默失败不阻塞主页）
    artistPublicApi.getPricing(subdomain)
      .then(res => { pricing.value = res })
      .catch(() => {})
  } catch (err) {
    ElMessage.error(err.message || t('artistHome.loadFailed'))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.artist-home {
  min-height: 100vh;
  background: var(--bg-page);
  transition: background 0.3s;
}
.empty-state {
  display: flex; align-items: center; justify-content: center;
  min-height: 50vh; color: var(--text-secondary); font-size: 16px;
}
/* UI-8: hidden 状态提示 */
.hidden-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 60vh; color: var(--text-secondary); font-size: 16px; gap: 12px;
}
.hidden-icon { font-size: 48px; margin: 0; }
/* R50: 预览模式横幅 */
.preview-banner {
  position: sticky; top: 0; z-index: 200;
  padding: 10px 16px; text-align: center;
  background: var(--el-color-warning-light-3); color: #333;
  font-size: 14px; font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
</style>
