<template>
  <div class="landing">
    <header class="landing-header">
      <h1>{{ $t('landing.title') }}</h1>
      <p class="subtitle">{{ $t('landing.subtitle') }}</p>
      <div class="header-prefs">
        <ThemePicker />
      </div>
    </header>

    <main class="landing-main">
      <!-- P2-11（v0.20）：404 catch-all 渲染首页时显示提示条，让用户知道发生了什么 -->
      <div v-if="isNotFound" class="not-found-banner" role="alert">
        <span class="not-found-code">404</span>
        {{ $t('landing.notFoundHint') }}
      </div>
      <div class="artist-grid" v-loading="loading">
        <el-card
          v-for="artist in artists"
          :key="artist.id"
          shadow="hover"
          class="artist-card"
          tabindex="0"
          role="button"
          :aria-label="artist.name"
          @click="enterArtist(artist)"
          @keyup.enter="enterArtist(artist)"
        >
          <div class="artist-avatar">
            <el-avatar :size="80" :src="artist.avatar ? `/uploads/${artist.avatar}` : undefined">
              {{ artist.name?.charAt(0) }}
            </el-avatar>
          </div>
          <h3 class="artist-name">{{ artist.name }}</h3>
          <p class="artist-bio">{{ artist.bio || $t('landing.noBio') }}</p>
          <div class="artist-status">
            <el-tag :type="statusType(artist.status)" effect="dark" size="small">
              {{ $t(`common.status.${artist.status}`) }}
            </el-tag>
          </div>
          <div class="artist-links" v-if="artist.weiboUrl || artist.bilibiliUrl">
            <a v-if="artist.weiboUrl" :href="artist.weiboUrl" target="_blank" rel="noopener noreferrer" @click.stop>
              {{ $t('landing.weibo') }}
            </a>
            <a v-if="artist.bilibiliUrl" :href="artist.bilibiliUrl" target="_blank" rel="noopener noreferrer" @click.stop>
              {{ $t('landing.bilibili') }}
            </a>
          </div>
          <el-button type="primary" class="enter-btn" @click.stop="enterArtist(artist)">
            {{ $t('landing.enterHome') }}
          </el-button>
        </el-card>
      </div>

      <el-empty v-if="!loading && artists.length === 0" :description="$t('landing.noArtists')" />

      <Disclaimer />
    </main>

    <footer class="landing-footer">
      <p>{{ $t('common.footer') }}</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ThemePicker from '../../components/ThemePicker.vue'
import Disclaimer from '../../components/Disclaimer.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const artists = ref([])
const loading = ref(true)
// P2-11（v0.20）：404 catch-all 复用首页渲染，仅当路由名为 NotFound 时显示提示条
const isNotFound = computed(() => route.name === 'NotFound')

import { ARTIST_STATUS_TYPE } from '../../constants/order.js'

const statusType = (s) => ARTIST_STATUS_TYPE[s] || 'info'

function enterArtist(artist) {
  router.push(`/artist/${artist.subdomain}`)
}

onMounted(async () => {
  try {
    artists.value = await artistPublicApi.getAll()
  } catch (err) {
    ElMessage.error(err.message || t('landing.loadFailed'))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  transition: background 0.3s;
}
.landing-header {
  text-align: center;
  padding: 48px 16px 32px;
  position: relative;
}
.landing-header h1 { font-size: clamp(26px, 4vw, 32px); color: var(--text-primary); }
.subtitle { color: var(--text-secondary); margin-top: 8px; font-size: 16px; }
.header-prefs { position: absolute; top: 16px; right: 24px; }
.landing-main {
  flex: 1;
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 16px 48px;
  width: 100%;
}
/* P2-11（v0.20）：404 提示条 */
.not-found-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--el-color-warning, #e6a23c);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}
.not-found-code {
  font-weight: 700;
  font-size: 16px;
  color: var(--el-color-warning, #e6a23c);
  font-variant-numeric: tabular-nums;
}
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.artist-card {
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, background 0.3s;
  background: var(--bg-card);
}
.artist-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-card-hover); }
.artist-avatar { margin-bottom: 12px; }
.artist-name { font-size: 18px; color: var(--text-primary); margin-bottom: 8px; }
.artist-bio {
  color: var(--text-secondary); font-size: 13px; line-height: 1.6;
  margin-bottom: 12px; min-height: 40px;
}
.artist-status { margin-bottom: 12px; }
.artist-links { margin-bottom: 12px; display: flex; gap: 16px; justify-content: center; }
.artist-links a { color: var(--el-color-primary); text-decoration: none; font-size: 13px; }
.artist-links a:hover { text-decoration: underline; }
.enter-btn { width: 100%; }
.landing-footer {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
  border-top: 1px solid var(--border-color);
}
</style>
