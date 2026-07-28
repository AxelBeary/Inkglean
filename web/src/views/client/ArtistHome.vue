<template>
  <div class="artist-home" v-loading="loading">
    <component
      v-if="artist"
      :is="templateComponent"
      :artist="artist"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../../utils/sanitize.js'
import { usePalette } from '../../composables/usePalette.js'

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
const paletteId = computed(() => artist.value?.paletteId || 'paper')

// 配色系统：根据画师 paletteId 设置 html[data-palette]，卸载时清理
usePalette(paletteId)

// ─── 模板注册表（defineAsyncComponent 自动处理懒加载）───
// 布局 ID：classic / gallery / folio；旧值 default / dark-gallery / single-page 做映射兼容
const TEMPLATES = {
  'classic': defineAsyncComponent(() => import('./templates/ArtistHomeClassic.vue')),
  'gallery': defineAsyncComponent(() => import('./templates/ArtistHomeGallery.vue')),
  'folio':   defineAsyncComponent(() => import('./templates/ArtistHomeFolio.vue'))
}
const LEGACY_TEMPLATE_MAP = {
  'default': 'classic',
  'dark-gallery': 'gallery',
  'single-page': 'folio'
}

const templateComponent = computed(() => {
  const raw = artist.value?.templateId || 'classic'
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
</style>
