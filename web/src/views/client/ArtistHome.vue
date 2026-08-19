<template>
  <div class="artist-home" v-loading="loading">
    <!-- R50: 预览模式横幅（有预览参数时显示，客户拿到链接也只看到公开数据） -->
    <div v-if="isPreview" class="preview-banner">{{ $t('artistHome.previewBanner') }}</div>
    <!-- UI-8: hidden 状态 — 友好提示页，不渲染模板 -->
    <div v-if="artist?.status === 'hidden'" class="hidden-state">
      <p>{{ $t('artistHome.hidden') }}</p>
    </div>
    <component
      v-else-if="artist"
      :is="templateComponent"
      :artist="displayArtist"
      :tiers="tiers"
      :styles="styles"
      :artworks="artworks"
      :rules="rules"
      :workflow-stages="workflowStages"
      :subdomain="subdomain"
      :sanitized-rules="sanitizedRules"
      :gallery="galleryData"
      :platforms="platforms"
      :gallery-loading="galleryLoading"
    />
    <!-- 波 M：分块接口失败统一占位（淡墨提示 + 重试，不整页破） -->
    <div v-if="hasSectionErrors" class="section-error-banner" role="alert">
      <p>{{ $t('artistHome.sectionLoadFailed') }}</p>
      <el-button type="primary" size="small" @click="retryFailedSections">{{ $t('common.loadRetry') }}</el-button>
    </div>
    <!-- 波 M 空态限定修复（v104 竖屏实测抓修）：条件链被上方独立 v-if（分块占位）打断，
         v-else-if 只接 hasSectionErrors；异步模板数据晚于 loading=false 到达时，
         空态与已渲染模板会同时出现。K1-11：!artist 时 artist?.status !== 'hidden' 恒真，
         删死分支；「无画师」已隐含非隐藏（隐藏态走上方 banner），保持真失败才显示 -->
    <div v-if="!loading && !artist && !hasSectionErrors" class="empty-state">
      <p>{{ $t('artistHome.loadFailed') }}</p>
    </div>
    <!-- #55/61: 客户端统一浮窗（4 模板共用，CTA 避让由模板 inject 同步） -->
    <ClientFloatingActions v-if="artist && artist.status !== 'hidden'" :raised="ctaRaised" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, provide, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import { useRoute } from 'vue-router'
import { artistPublicApi } from '../../api/index.js'
import type { ArtistPublicProfile, VisibleArtistProfile, Artwork, PlatformDTO, PublicArtStyle, PublicGalleryResult, WorkflowStageDTO } from '../../api/types.js'
import { fetchArtistPublicProfile } from '../../composables/useArtistPublicProfile.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../../utils/sanitize.js'
import { usePalette } from '../../composables/usePalette.js'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain as string

const artist = ref<ArtistPublicProfile | null>(null)
const tiers = ref<unknown[]>([])
const styles = ref<PublicArtStyle[]>([]) // v0.32 REQ-023 Phase3: 画风列表（GET /public/styles/:subdomain）
const artworks = ref<Artwork[]>([])
const rules = ref('')
const workflowStages = ref<WorkflowStageDTO[]>([])
// v0.35 联调：画廊数据走独立端点 GET /public/gallery/:subdomain
// （artworks 带 size_tags/description + filterSizes 筛选档位；F6 真实数据源）
const galleryData = ref<PublicGalleryResult>({ artworks: [], filterSizes: [] })
// 波 M：画廊端点请求中标记（Gallery 模板首载骨架占位用；失败/成功均复位）
const galleryLoading = ref(true)
// REQ-022 F2: 社交平台列表（页脚链接平台名/图标渲染用；静默失败走「其他」兜底）
const platforms = ref<PlatformDTO[]>([])
const loading = ref(true)

const sanitizedRules = computed(() => sanitizeHtml(rules.value))

// 波 M：workflow/pricing/styles/gallery/platforms 各自失败标记（统一占位 + 可重试）
const sectionErrors = reactive({ workflow: false, styles: false, gallery: false, platforms: false })
const hasSectionErrors = computed(() => Object.values(sectionErrors).some(Boolean))

// #54: effectiveStatus 适配——额度耗尽时后端返回 effectiveStatus='full'，前端覆盖 status
// 向后兼容：字段缺失时 fallback 原始 status，4 模板零改动
const displayArtist = computed(() => {
  const a = artist.value as VisibleArtistProfile | null
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

const paletteId = computed(() => (previewPal.value as string | null) || (artist.value as VisibleArtistProfile | null)?.paletteId || 'paper')

// 配色系统：根据画师 paletteId 设置 html[data-palette]，卸载时清理
usePalette(paletteId)

// #55/61: 浮窗 CTA 避让——模板 inject 后同步 ctaVisible
const ctaRaised = ref(false)
provide('ctaRaised', ctaRaised)

// ─── R49: 强调色覆盖（画师设置优先于访客 ThemePicker；离开主页时恢复访客选择） ───
// 5 色与 theme.css data-accent="1"~"5" 一一对应（含暗色提亮变体，免费获得暗色适配）
// 813-fq-tail-shared 战役 S：色值单源 = theme.css --accent-1..5，此处按 CSS 变量动态构建映射
const ACCENT_INDEX = Object.freeze(Object.fromEntries(
  ['1', '2', '3', '4', '5'].map(id => [
    getComputedStyle(document.documentElement).getPropertyValue(`--accent-${id}`).trim().toLowerCase(),
    id
  ])
))
const accentOverride = computed(() => {
  const raw = previewAccent.value || (artist.value as VisibleArtistProfile | null)?.accentColor
  return raw ? (ACCENT_INDEX[String(raw).toLowerCase()] || null) : null
})
let savedAccent: string | null = null
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
const TEMPLATES: Record<string, Component> = {
  'classic': defineAsyncComponent(() => import('./templates/ArtistHomeClassic.vue')),
  'gallery': defineAsyncComponent(() => import('./templates/ArtistHomeGallery.vue')),
  'folio':   defineAsyncComponent(() => import('./templates/ArtistHomeFolio.vue')),
  'atelier': defineAsyncComponent(() => import('./templates/ArtistHomeAtelier.vue'))
}
const LEGACY_TEMPLATE_MAP: Record<string, string> = {
  'default': 'classic',
  'dark-gallery': 'gallery',
  'single-page': 'folio'
}

const templateComponent = computed(() => {
  const raw = (previewTpl.value || (artist.value as VisibleArtistProfile | null)?.templateId || 'classic') as string
  const id = LEGACY_TEMPLATE_MAP[raw] || raw
  return TEMPLATES[id] || TEMPLATES.classic
})

onMounted(async () => {
  try {
    const data = await fetchArtistPublicProfile(subdomain)
    artist.value = data
    const profile = data as VisibleArtistProfile
    tiers.value = profile.tiers || []
    artworks.value = profile.artworks || []
    rules.value = profile.rules || ''
    // 波 M：5 个分块接口并行加载，各自失败标记 + 统一占位（不整页破）
    loadSection('workflow')
    loadSection('styles')
    loadSection('gallery')
    loadSection('platforms')
  } catch (err) {
    ElMessage.error(err instanceof Error && err.message ? err.message : t('artistHome.loadFailed'))
  } finally {
    loading.value = false
  }
})

type SectionKey = 'workflow' | 'styles' | 'gallery' | 'platforms'

/** 波 M：单个分块接口加载（成功清失败标记；失败仅标记，由占位条提供重试） */
async function loadSection(key: SectionKey) {
  sectionErrors[key] = false
  try {
    if (key === 'workflow') {
      const res = await artistPublicApi.getWorkflow(subdomain)
      workflowStages.value = res.stages || []
    } else if (key === 'styles') {
      // v0.32 REQ-023 Phase3: 加载画风列表（失败走旧模型兜底）
      // v0.35 联调：sizes 已自带 image/artwork_image_path/description/work_days（F3 真实数据源），直读
      styles.value = (await artistPublicApi.getPublicStyles(subdomain)) || []
    } else if (key === 'gallery') {
      // v0.35 联调 F6: 画廊专用端点（artworks 带 size_tags/description + filterSizes 筛选档位）
      const res = await artistPublicApi.getPublicGallery(subdomain)
      galleryData.value = { artworks: res?.artworks || [], filterSizes: res?.filterSizes || [] }
    } else if (key === 'platforms') {
      // REQ-022 F2: 平台列表（页脚渲染用，失败 → footerLinks 走「其他」兜底）
      const res = await artistPublicApi.getPlatforms()
      platforms.value = Array.isArray(res) ? res : []
    }
  } catch {
    sectionErrors[key] = true
  } finally {
    if (key === 'gallery') galleryLoading.value = false
  }
}

/** 波 M：重试所有失败的分块接口（并行） */
function retryFailedSections() {
  (Object.keys(sectionErrors) as SectionKey[]).filter(k => sectionErrors[k]).forEach(loadSection)
}
</script>

<style scoped>
.artist-home {
  min-height: 100vh;
  background: var(--bg-page);
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
}
.empty-state {
  display: flex; align-items: center; justify-content: center;
  min-height: 50vh; color: var(--text-secondary); font-size: 16px;
}
/* 波 M：分块接口失败占位（淡墨提示，克制居中，不整页破） */
.section-error-banner {
  margin: 24px auto; max-width: 480px; padding: 16px 20px; text-align: center;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--el-border-radius-base);
}
.section-error-banner p { margin: 0 0 12px; color: var(--text-secondary); font-size: 13px; }
/* UI-8: hidden 状态提示 */
.hidden-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 60vh; color: var(--text-secondary); font-size: 16px; gap: 12px;
}
/* R50: 预览模式横幅 */
.preview-banner {
  position: sticky; top: 0; z-index: 200;
  padding: 10px 16px; text-align: center;
  background: var(--el-color-warning-light-3); color: #333;
  font-size: 14px; font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
</style>
