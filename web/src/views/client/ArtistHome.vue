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

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

const artist = ref(null)
const tiers = ref([])
const artworks = ref([])
const rules = ref('')
const workflowStages = ref([])
const loading = ref(true)

const sanitizedRules = computed(() => sanitizeHtml(rules.value))

// ─── 模板注册表（defineAsyncComponent 自动处理懒加载）───
const TEMPLATES = {
  'default':      defineAsyncComponent(() => import('./templates/ArtistHomeDefault.vue')),
  'dark-gallery': defineAsyncComponent(() => import('./templates/ArtistHomeDarkGallery.vue')),
  'single-page':  defineAsyncComponent(() => import('./templates/ArtistHomeSinglePage.vue'))
}

const templateComponent = computed(() => {
  const id = artist.value?.templateId || 'default'
  return TEMPLATES[id] || TEMPLATES.default
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
