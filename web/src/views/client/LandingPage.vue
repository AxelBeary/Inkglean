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
          @keyup.space.prevent="enterArtist(artist)"
        >
          <div class="artist-avatar">
            <!-- U3: 原生 img + loading="lazy"（el-avatar 不透传 attrs 到 img，改用等价圆形头像） -->
            <img
              v-if="artist.avatar"
              :src="`/uploads/${artist.avatar}`"
              :alt="artist.name"
              loading="lazy"
              class="artist-avatar-img"
            />
            <span v-else class="artist-avatar-fallback">{{ artist.name?.charAt(0) }}</span>
          </div>
          <h3 class="artist-name">{{ artist.name }}</h3>
          <p class="artist-bio">{{ artist.bio || $t('landing.noBio') }}</p>
          <div class="artist-status">
            <el-tag :type="statusType(artist.status)" effect="dark" size="small">
              {{ $t(`common.status.${artist.status}`) }}
            </el-tag>
          </div>
        </el-card>
      </div>

      <el-empty v-if="!loading && artists.length === 0" :description="$t('landing.noArtists')" />

      <Disclaimer />
    </main>

    <footer class="landing-footer">
      <!-- REQ-042: 隐私/条款 + 举报入口（页脚底部） -->
      <ComplianceFooterLinks />
      <p>{{ $t('common.footer') }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { artistPublicApi } from '../../api/index'
import type { ArtistListItem } from '../../api/types'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ThemePicker from '../../components/ThemePicker.vue'
import Disclaimer from '../../components/Disclaimer.vue'
import ComplianceFooterLinks from '../../components/client/ComplianceFooterLinks.vue'
import { ARTIST_STATUS_TYPE } from '../../constants/order'

const { t } = useI18n()
const router = useRouter()
const artists = ref<ArtistListItem[]>([])
const loading = ref(true)


const statusType = (s: string) => ARTIST_STATUS_TYPE[s] || 'info'

function enterArtist(artist: ArtistListItem) {
  // a2 猎杀修复：数据异常时拒绝拼 /artist/undefined 死链（与后端创建口径一致；823 规则对齐批：去连字符）
  const sub = artist?.subdomain
  if (typeof sub !== 'string' || !/^[a-z0-9]{2,20}$/i.test(sub)) return
  router.push(`/artist/${sub}`)
}

onMounted(async () => {
  try {
    artists.value = await artistPublicApi.getAll()
  } catch (err) {
    ElMessage.error(err instanceof Error && err.message ? err.message : t('landing.loadFailed'))
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
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
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
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.artist-card {
  text-align: center;
  cursor: pointer;
  /* T 波：hover/active 禁位移——位移换背景加深+阴影加深 */
  transition: box-shadow var(--dur-fast), background var(--dur-slow);
  background: var(--bg-card);
}
.artist-card:hover { box-shadow: var(--shadow-card-hover); }
.artist-card:active { background: var(--bg-hover); box-shadow: var(--shadow-card-hover); }
.artist-avatar { margin-bottom: 12px; }
/* U3: 原生 img 懒加载头像（等价 el-avatar 圆形视觉） */
.artist-avatar-img {
  width: 80px; height: 80px;
  border-radius: 50%;
  object-fit: cover;
  display: inline-block;
  background: var(--bg-inset);
}
.artist-avatar-fallback {
  width: 80px; height: 80px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--text-secondary);
  background: var(--bg-inset);
}
.artist-name { font-size: 18px; color: var(--text-primary); margin-bottom: 8px; }
.artist-bio {
  color: var(--text-secondary); font-size: 13px; line-height: 1.6;
  margin-bottom: 12px; min-height: 40px;
}
.artist-status { margin-bottom: 12px; }
.landing-footer {
  text-align: center;
  padding: 24px;
  color: var(--text-footer);
  font-size: 13px;
  border-top: 1px solid var(--border-color);
}
</style>
