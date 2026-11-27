<template>
  <div class="landing">
    <header class="landing-header">
      <div class="header-prefs">
        <ThemePicker />
      </div>
    </header>

    <main class="landing-main">
      <LandingHero @browse="scrollToDirectory" />

      <section id="artist-directory" class="directory" aria-labelledby="directory-title">
        <div class="directory-head">
          <h2 id="directory-title" class="directory-title">{{ $t('landing.directoryTitle') }}</h2>
          <p v-if="!loading && !loadError" class="directory-count">{{ countText }}</p>
        </div>

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
          <LandingArtistCard
            v-for="artist in artists"
            :key="artist.id"
            :artist="artist"
            @enter="enterArtist(artist)"
          />
        </div>

        <LandingStatePanel
          v-else
          variant="empty"
          :title="$t('landing.noArtists')"
          :description="$t('landing.emptyDesc')"
        />
      </section>

      <LandingArtistBanner />

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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { artistPublicApi } from '../../api/index'
import type { ArtistListItem } from '../../api/types'
import ThemePicker from '../../components/ThemePicker.vue'
import LandingHero from '../../components/client/LandingHero.vue'
import LandingArtistCard from '../../components/client/LandingArtistCard.vue'
import LandingArtistSkeleton from '../../components/client/LandingArtistSkeleton.vue'
import LandingStatePanel from '../../components/client/LandingStatePanel.vue'
import LandingArtistBanner from '../../components/client/LandingArtistBanner.vue'
import Disclaimer from '../../components/Disclaimer.vue'
import ComplianceFooterLinks from '../../components/client/ComplianceFooterLinks.vue'

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

/** 目录事实计数：数据已在手，纯前端 reduce，不引入新请求 */
const openCount = computed(() => artists.value.filter((a) => a.status === 'open').length)
const countText = computed(() =>
  t('landing.artistCount', { total: artists.value.length, open: openCount.value })
)

function enterArtist(artist: ArtistListItem) {
  // a2 猎杀修复：数据异常时拒绝拼 /artist/undefined 死链（与后端创建口径一致；823 规则对齐批：去连字符）
  const sub = artist?.subdomain
  if (typeof sub !== 'string' || !/^[a-z0-9]{2,20}$/i.test(sub)) return
  router.push(`/artist/${sub}`)
}

function scrollToDirectory() {
  const el = document.getElementById('artist-directory')
  if (!el) return
  // 尊重系统「减少动态效果」偏好（滚动动画同属动效）
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
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
     客户端路由取不到。本批不往全站 :root 加变量（那是全站 token 改动，风险面大），
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
  padding: 0 16px;
  position: relative;
}
.header-prefs { position: absolute; top: 16px; right: 24px; }
.landing-main {
  flex: 1;
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 16px 48px;
  width: 100%;
}
.directory {
  /* 主行动「浏览画师」滚动落点：留出与浮窗/浏览器边缘的呼吸位 */
  scroll-margin-top: 24px;
}
.directory-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.directory-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}
.directory-count {
  font-size: 13px;
  color: var(--text-secondary);
}
/* 375 实测：标题 118px + 计数 197px 挤在同一行只剩 44px 余隙，视觉上贴在一起；
   320 下计数已被挤到第二行却仍左对齐。窄屏统一改成竖排，标题在上、计数在下。 */
@media (max-width: 768px) {
  .directory-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 20px;
}
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