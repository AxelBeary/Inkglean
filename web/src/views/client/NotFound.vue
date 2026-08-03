<template>
  <!-- v0.34 任务A：独立 404 页（主题/语言切换复用右下角浮窗，与画师主页一致） -->
  <div class="not-found-page">
    <ClientFloatingActions />
    <main class="not-found-main">
      <div class="not-found-hero">
        <div class="not-found-code" aria-hidden="true">404</div>
        <p class="not-found-message">{{ $t('notFound.message') }}</p>
        <button class="not-found-home-btn" @click="$router.push('/')">
          {{ $t('notFound.backHome') }}
        </button>
      </div>

      <!-- 画师入口（可选展示，加载失败静默隐藏） -->
      <section v-if="artists.length" class="not-found-artists">
        <div class="not-found-artists-divider"></div>
        <p class="not-found-artists-title">{{ $t('notFound.artistsTitle') }}</p>
        <div class="not-found-artist-grid">
          <button
            v-for="artist in artists" :key="artist.id"
            class="not-found-artist-card"
            :aria-label="artist.name"
            @click="$router.push(`/artist/${artist.subdomain}`)"
          >
            <el-avatar :size="56" :src="artist.avatar ? `/uploads/${artist.avatar}` : undefined">
              {{ artist.name?.charAt(0) }}
            </el-avatar>
            <span class="not-found-artist-name">{{ artist.name }}</span>
            <el-tag :type="statusType(artist.status)" effect="dark" size="small">
              {{ $t(`common.status.${artist.status}`) }}
            </el-tag>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistPublicApi } from '../../api/index.js'
import { ARTIST_STATUS_TYPE } from '../../constants/order.js'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'

const artists = ref([])
const statusType = (s) => ARTIST_STATUS_TYPE[s] || 'info'

onMounted(async () => {
  // 404 页画师入口是锦上添花：加载失败静默隐藏，不影响主信息
  try {
    const list = await artistPublicApi.getAll()
    artists.value = (list || []).slice(0, 6)
  } catch { /* 静默失败：只显示 404 主体 */ }
})
</script>

<style scoped>
.not-found-page {
  min-height: 100vh;
  background: var(--bg-page);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  transition: background 0.3s;
}
.not-found-main {
  width: 100%;
  max-width: 640px;
  text-align: center;
}
/* 大号 404：描边镂空字，低调但有质感 */
.not-found-code {
  font-family: var(--font-display);
  font-size: clamp(96px, 22vw, 180px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.04em;
  color: transparent;
  -webkit-text-stroke: 2px var(--color-primary);
  user-select: none;
  margin-bottom: 20px;
}
.not-found-message {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 0 0 28px;
}
.not-found-home-btn {
  display: inline-block;
  padding: 12px 36px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.2s, transform 0.15s;
}
.not-found-home-btn:hover {
  opacity: 0.88;
  transform: translateY(-2px);
}
/* 画师入口区 */
.not-found-artists-divider {
  width: 48px;
  height: 1px;
  margin: 48px auto 20px;
  background: var(--border-color-strong);
}
.not-found-artists-title {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px;
}
.not-found-artist-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
.not-found-artist-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 18px;
  min-width: 120px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.not-found-artist-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-card-hover);
}
.not-found-artist-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
