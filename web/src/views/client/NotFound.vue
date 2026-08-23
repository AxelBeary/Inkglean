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
            @click="enterArtist(artist)"
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

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { artistPublicApi } from '../../api/index'
import type { ArtistListItem } from '../../api/types'
import { ARTIST_STATUS_TYPE } from '../../constants/order'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'

const router = useRouter()
const artists = ref<ArtistListItem[]>([])
const statusType = (s: string) => ARTIST_STATUS_TYPE[s] || 'info'

/** a2 猎杀修复：与 LandingPage 同口径，subdomain 非法时不生成 /artist/undefined 死链 */
function enterArtist(artist: ArtistListItem) {
  const sub = artist?.subdomain
  if (typeof sub !== 'string' || !/^[a-z0-9]{2,20}$/i.test(sub)) return
  router.push(`/artist/${sub}`)
}

onMounted(async () => {
  // 404 页画师入口是锦上添花：加载失败静默隐藏，不影响主信息
  try {
    const list = await artistPublicApi.getAll()
    // 只推荐可约稿（open）画师；已排满/休息/隐藏不进导流位
    artists.value = (list || []).filter((a) => a.status === 'open').slice(0, 6)
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
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
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
  color: var(--pal-bg);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  /* T 波：active 禁位移——按压反馈换背景加深（brightness），不位移 */
  transition: opacity var(--dur-mid), filter var(--dur-fast);
}
.not-found-home-btn:hover {
  opacity: 0.88;
}
.not-found-home-btn:active { filter: brightness(0.92); }
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
  /* T 波：active 禁位移——位移换背景加深 */
  transition: background var(--dur-fast), box-shadow var(--dur-fast), border-color var(--dur-fast);
}
.not-found-artist-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-card-hover);
}
.not-found-artist-card:active { background: var(--bg-hover); }
.not-found-artist-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
