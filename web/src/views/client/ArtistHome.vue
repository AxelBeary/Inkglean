<template>
  <div class="artist-home" v-loading="loading">
    <div v-if="artist" class="home-container">
      <!-- 头部 -->
      <header class="home-header">
        <div class="header-prefs">
          <ThemePicker />
        </div>
        <el-avatar :size="100" :src="artist.avatar ? `/uploads/${artist.avatar}` : undefined">
          {{ artist.name?.charAt(0) }}
        </el-avatar>
        <h1 class="artist-name">{{ artist.name }}</h1>
        <p class="artist-bio">{{ artist.bio }}</p>
        <div class="status-badge">
          <el-tag :type="statusType(artist.status)" effect="dark" size="large">
            {{ statusText(artist.status) }}
          </el-tag>
        </div>
        <div class="social-links" v-if="artist.weiboUrl || artist.bilibiliUrl">
          <a v-if="artist.weiboUrl" :href="artist.weiboUrl" target="_blank" rel="noopener noreferrer" class="social-link">
            {{ $t('artistHome.weibo') }}
          </a>
          <a v-if="artist.bilibiliUrl" :href="artist.bilibiliUrl" target="_blank" rel="noopener noreferrer" class="social-link">
            {{ $t('artistHome.bilibili') }}
          </a>
        </div>
      </header>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <el-button
          type="primary" size="large" @click="$router.push(`/artist/${subdomain}/order`)"
          :disabled="artist.status !== 'open'"
        >
          {{ $t('artistHome.commission') }}
        </el-button>
        <el-button size="large" @click="$router.push(`/artist/${subdomain}/track`)">
          {{ $t('artistHome.track') }}
        </el-button>
      </div>

      <!-- 价格表 -->
      <section class="section" v-if="tiers.length">
        <h2 class="section-title">{{ $t('artistHome.priceList') }}</h2>
        <div class="tier-grid">
          <el-card v-for="tier in tiers" :key="tier.id" shadow="hover" class="tier-card">
            <el-image
              v-if="tier.example_image" :src="`/uploads/${tier.example_image}`"
              fit="cover" class="tier-img" :alt="tier.name"
              :preview-src-list="[`/uploads/${tier.example_image}`]"
            />
            <h3>{{ tier.name }}</h3>
            <div class="tier-price">¥{{ tier.price }}</div>
            <p class="tier-desc">{{ tier.description }}</p>
            <p class="tier-days" v-if="tier.work_days">{{ $t('artistHome.aboutDays', { n: tier.work_days }) }}</p>
          </el-card>
        </div>
      </section>

      <!-- 约稿流程与收款 -->
      <section class="section" v-if="workflowStages.length">
        <h2 class="section-title">{{ $t('artistHome.workflow') }}</h2>
        <WorkflowOverviewStrip :stages="workflowStages" vertical />
      </section>

      <!-- 作品展示 -->
      <section class="section" v-if="artworks.length">
        <h2 class="section-title">{{ $t('artistHome.artworks') }}</h2>
        <div class="artwork-grid">
          <el-image
            v-for="(art, index) in artworks" :key="art.id"
            :src="`/uploads/${art.image_path}`" fit="cover" class="artwork-img"
            :alt="art.title || $t('artistHome.artworks')"
            :preview-src-list="artworks.map(a => `/uploads/${a.image_path}`)"
            :initial-index="index"
          />
        </div>
      </section>

      <!-- 约稿须知（消毒后渲染） -->
      <section class="section" v-if="rules">
        <h2 class="section-title">{{ $t('artistHome.rules') }}</h2>
        <el-card shadow="never" class="rules-card">
          <div v-html="sanitizedRules"></div>
        </el-card>
      </section>

      <Disclaimer />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ThemePicker from '../../components/ThemePicker.vue'
import Disclaimer from '../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../components/shared/WorkflowOverviewStrip.vue'
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

// XSS 防护：消毒后的须知 HTML
const sanitizedRules = computed(() => sanitizeHtml(rules.value))

import { ARTIST_STATUS_TYPE } from '../../constants/order.js'

const statusType = (s) => ARTIST_STATUS_TYPE[s] || 'info'
const statusText = (s) => t(`artistHome.status${s.charAt(0).toUpperCase() + s.slice(1)}`)

onMounted(async () => {
  try {
    const data = await artistPublicApi.getProfile(subdomain)
    artist.value = data
    tiers.value = data.tiers || []
    artworks.value = data.artworks || []
    rules.value = data.rules || ''
    // 加载流程（静默失败不阻塞主页）
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
.home-container { max-width: 800px; margin: 0 auto; padding: 16px; }
.home-header {
  text-align: center;
  padding: 40px 16px 24px;
  position: relative;
}
.header-prefs { position: absolute; top: 16px; right: 16px; }
.artist-name { font-size: 28px; margin-top: 16px; color: var(--text-primary); }
.artist-bio { color: var(--text-secondary); margin-top: 8px; line-height: 1.6; }
.status-badge { margin-top: 16px; }
.social-links { margin-top: 16px; display: flex; gap: 20px; justify-content: center; }
.social-link {
  color: var(--el-color-primary); text-decoration: none; font-size: 14px;
  padding: 6px 16px; border: 1px solid var(--el-color-primary); border-radius: 20px;
  transition: all 0.2s;
}
.social-link:hover { background: var(--el-color-primary); color: var(--el-color-white, #fff); }
.action-bar {
  display: flex; gap: 16px; justify-content: center;
  margin: 24px 0 32px;
}
.section { margin-bottom: 32px; }
.section-title {
  font-size: 20px; color: var(--text-primary);
  margin-bottom: 16px; padding-bottom: 8px;
  border-bottom: 2px solid var(--el-color-primary);
}
.tier-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.tier-card { text-align: center; background: var(--bg-card); transition: background 0.3s; }
.tier-img { width: 100%; height: 160px; border-radius: 8px 8px 0 0; margin: -20px -20px 12px; width: calc(100% + 40px); }
.tier-price { font-size: 24px; font-weight: bold; color: var(--el-color-primary); margin: 8px 0; }
.tier-desc { color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.tier-days { color: var(--text-muted); font-size: 12px; margin-top: 8px; }
.artwork-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.artwork-img { width: 100%; height: 180px; border-radius: 8px; }
.rules-card { line-height: 1.8; color: var(--text-primary); background: var(--bg-card); }
</style>
