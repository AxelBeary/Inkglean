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
      <!-- 读屏进度播报：骨架屏本身 aria-hidden，靠这条承担「在加载」的语义 -->
      <p class="sr-only" role="status">{{ loading ? $t('landing.loadingArtists') : '' }}</p>

      <div v-if="loading" class="artist-grid">
        <LandingArtistSkeleton v-for="i in SKELETON_COUNT" :key="i" />
      </div>

      <!-- P0-1：失败态独立成块，与「还没画师」不再同屏同形（文案 + 图标 + 重试三处都不同） -->
      <LandingStatePanel
        v-else-if="loadError"
        variant="error"
        :title="$t('landing.loadFailed')"
        :description="errorDetail || $t('landing.errorDesc')"
        @retry="load"
      />

      <div v-else-if="artists.length" class="artist-grid">
        <el-card
          v-for="artist in artists"
          :key="artist.id"
          shadow="hover"
          class="artist-card"
          tabindex="0"
          role="button"
          :aria-label="`${artist.name} · ${$t(`common.status.${artist.status}`)}`"
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

      <LandingStatePanel
        v-else
        variant="empty"
        :title="$t('landing.noArtists')"
        :description="$t('landing.emptyDesc')"
      />

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
import LandingArtistSkeleton from '../../components/client/LandingArtistSkeleton.vue'
import LandingStatePanel from '../../components/client/LandingStatePanel.vue'
import { ARTIST_STATUS_TYPE } from '../../constants/order'

/** 骨架卡数量：桌面 1000px 容器三列时正好铺满两行，不制造空缝 */
const SKELETON_COUNT = 6

const { t } = useI18n()
const router = useRouter()
const artists = ref<ArtistListItem[]>([])
const loading = ref(true)
/**
 * P0-1：失败必须有自己的状态位。
 * 旧实现 catch 只弹 ElMessage、artists 保持 []，于是断网/500 与「平台没画师」渲染成同一块 el-empty，
 * 而 landing.loadFailed 因 http.ts 的兜底文案恒非空永不可达（死键）。
 */
const loadError = ref(false)
/** 具体错误文案（服务端 code 译文或网络异常兜底），仅作失败面板的补充说明 */
const errorDetail = ref('')

const statusType = (s: string) => ARTIST_STATUS_TYPE[s] || 'info'

function enterArtist(artist: ArtistListItem) {
  // a2 猎杀修复：数据异常时拒绝拼 /artist/undefined 死链（与后端创建口径一致；823 规则对齐批：去连字符）
  const sub = artist?.subdomain
  if (typeof sub !== 'string' || !/^[a-z0-9]{2,20}$/i.test(sub)) return
  router.push(`/artist/${sub}`)
}

async function load() {
  loading.value = true
  loadError.value = false
  errorDetail.value = ''
  try {
    artists.value = await artistPublicApi.getAll()
  } catch (err) {
    // 失败标记 + 页内常驻失败区块（toast 会消失，不能承担状态表达）
    loadError.value = true
    artists.value = []
    const msg = err instanceof Error ? err.message : ''
    errorDetail.value = msg
    ElMessage.error(msg || t('landing.loadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */

  /* 圆角阶梯：--r-* 此前只在 html[data-artist-theme]（画师后台作用域）定义，
     客户端路由取不到。本批不往全站 :root 加变量（全站 token 改动风险面大），
     改在门面页作用域内声明，子组件经继承取值，且 measure.mjs 认 var(--r-*) 为受管角。
     三个档均与客户端既有视觉一致：容器 12px（同 NotFound 卡片）、细条 4px、胶囊 999px */
  --r-card: 12px;
  --r-line: 4px;
  --r-pill: 999px;

  /* P1-1：次级文字 #909399 在 #f5f5f5 上仅 2.82:1、在卡片 #fff 上 3.08:1，均不达 AA。
     --text-secondary 是 EP --el-text-color-regular 的同一枚 token（全站共用），
     不能在本批全局调暗——只在门面页作用域内换成实测达标的取值：
     亮色 #5f6369（page 5.54:1 / card 6.04:1）；暗色沿用 #a3a6ad（page 7.56:1 / card 6.85:1）。 */
  --text-secondary: #5f6369;
}
html.dark .landing {
  --text-secondary: #a3a6ad;
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.landing-footer {
  text-align: center;
  padding: 24px;
  color: var(--text-footer);
  font-size: 13px;
  border-top: 1px solid var(--border-color);
}
</style>
