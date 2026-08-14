<template>
  <div v-if="artist" class="gallery" ref="rootEl">
    <!-- Opening: fullscreen artwork + corner plaque (F3: announcement floats at top-left, avoiding the plaque at bottom-left) -->
    <div class="gallery-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" :platforms="platforms" variant="fullscreen" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="gallery-announcement" />
    </div>

    <!-- v0.36: 作品画廊——画册式左右翻页（Gallery：大小交错 editorial 节奏——当前页大图居中，相邻页缩小侧露） -->
    <!-- 波 M：数据源收敛为 F6 画廊端点（全量含 size_tags），移除重复分页请求 -->
    <section class="gallery-section tpl-reveal" v-if="galleryForTpl.length">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery
        :artworks="galleryForTpl"
        :gallery="gallery"
        :subdomain="subdomain"
        layout="album"
        peek
      />
    </section>
    <!-- 波 M：画廊数据未到前骨架占位（避免「暂无作品」误判闪一帧） -->
    <section class="gallery-section tpl-reveal" v-else-if="galleryLoading">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <div class="gallery-loading-skeleton" aria-hidden="true">
        <div v-for="i in 3" :key="i" class="gallery-loading-card"></div>
      </div>
    </section>
    <!-- P2-3: 无作品空态 -->
    <section class="gallery-section tpl-reveal" v-else>
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <div class="gallery-empty">{{ $t('artistHome.noWorks') }}</div>
    </section>

    <!-- P1-B 收敛：价格档位 + 流程 + 修改说明 → 共享 TplPricingSection（外观零变） -->
    <TplPricingSection
      class="gallery-section gallery-section--alt tpl-reveal"
      inner-class="gallery-inner"
      :styles="styles"
      :tiers="tiers"
      :workflow-stages="workflowStages"
      :revision-note="artist.revisionNote"
      :subdomain="subdomain"
      :artist="artist"
    >
      <template #title>
        <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
      </template>
    </TplPricingSection>

    <!-- 约稿须知 -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- F4: 留言板 -->
    <section class="gallery-section tpl-reveal">
      <p class="tpl-section-label gallery-label">{{ $t('guestbook.title') }}</p>
      <TplGuestbook :subdomain="subdomain" theme="plaque" />
    </section>

    <!-- 页脚 -->
    <footer class="gallery-footer">
      <!-- REQ-022 F2: 页脚链接（外链/平台链接合一，展签式横排自动换行，新窗口打开） -->
      <div class="gallery-links" v-if="footerLinks.length">
        <a
          v-for="link in footerLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="gallery-link"
        >
          <span class="gallery-link-badge" aria-hidden="true">
            <TplPlatformIcon :icon-key="link.iconKey" :fallback-char="link.fallbackChar" />
          </span>
          {{ link.label }}
        </a>
      </div>
      <!-- REQ-042: 页脚合规入口（隐私/条款 + 举报） -->
      <ComplianceFooterLinks />
      <Disclaimer />
    </footer>

    <!-- 吸底约稿条（滚过开场后浮现） -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, inject, watch, computed } from 'vue'
import { useArtistData } from '../../../composables/useArtistData.js'
import { useScrollReveal } from '../../../composables/useScrollReveal.js'
import { useStickyCta } from '../../../composables/useStickyCta.js'
import TplHero from '../../../components/templates/TplHero.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplAnnouncement from '../../../components/shared/TplAnnouncement.vue'
import TplGuestbook from '../../../components/shared/TplGuestbook.vue'
import TplPricingSection from '../../../components/templates/TplPricingSection.vue'
import TplRules from '../../../components/templates/TplRules.vue'
import TplStickyCta from '../../../components/templates/TplStickyCta.vue'
import TplPlatformIcon from '../../../components/shared/TplPlatformIcon.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import ComplianceFooterLinks from '../../../components/client/ComplianceFooterLinks.vue'

const props = defineProps({
  artist: { type: Object, default: null },
  tiers: { type: Array, default: () => [] },
  styles: { type: Array, default: () => [] },
  artworks: { type: Array, default: () => [] },
  rules: { type: String, default: '' },
  workflowStages: { type: Array, default: () => [] },
  subdomain: { type: String, default: '' },
  sanitizedRules: { type: String, default: '' },
  gallery: { type: Object, default: null }, // v0.35 联调：画廊端点数据（size_tags/filterSizes）
  platforms: { type: Array, default: () => [] }, // REQ-022 F2: 社交平台列表（页脚链接平台名/图标渲染）
  galleryLoading: { type: Boolean, default: false } // 波 M：画廊端点加载中（首载骨架）
})

const { footerLinks, galleryArtworks } = useArtistData(props)

/**
 * 波 M：画廊数据源收敛——F6 端点已含全量 artworks + size_tags（服务端 getPublicGallery
 * 全量返回无分页），移除重复的 getPublicArtworksPaged 请求与「按 id 合并 size_tags」。
 * 端点失败/未到时回退 profile 全量（galleryArtworks，无筛选行，行为与旧版一致）。
 */
const galleryForTpl = computed(() => {
  const list = props.gallery?.artworks
  return list?.length ? list : galleryArtworks.value
})

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素（直接传 heroRef，异步组件挂载后 ref 更新会触发 watch）
const { visible: ctaVisible } = useStickyCta(heroRef)

// #55/61: 同步 CTA 避让状态给父级浮窗
const ctaRaised = inject('ctaRaised')
watch(ctaVisible, (v) => { ctaRaised.value = v }, { immediate: true })
</script>

<style scoped>
.gallery {
  min-height: 100vh;
  background: var(--pal-bg);
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
}

/* F3: Hero wrapper (relative container for announcement overlay) */
.gallery-hero-wrap { position: relative; }

/* F3: Announcement — semi-transparent base + plaque-style typography (top-left, avoiding the plaque at bottom-left) */
.gallery-announcement {
  position: absolute;
  top: 32px;
  left: 32px;
  z-index: 2;
  max-width: 320px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 18px;
  background: color-mix(in srgb, var(--pal-bg) 78%, transparent);
  backdrop-filter: blur(10px);
  border-left: 2px solid var(--color-primary);
  font-size: 13px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: var(--pal-text);
}
.gallery-announcement :deep(.tpl-announcement-text) { word-break: break-word; }

/* U2: 窄屏公告回到文档流（absolute 会与展签/CTA 重叠） */
@media (max-width: 640px) {
  .gallery-announcement {
    position: relative;
    top: auto; left: auto; right: auto; bottom: auto;
    max-width: calc(100% - 32px);
    margin: 12px auto;
  }
}

.gallery-section {
  padding: 88px 24px;
}
.gallery-section--alt {
  background: var(--pal-bg-alt);
}
.gallery-empty { text-align: center; color: var(--pal-text-dim); font-size: 14px; letter-spacing: 0.05em; padding: 48px 0 72px; }
.gallery-label {
  text-align: center;
  margin-bottom: 48px;
}
/* 波 M：首载骨架（画廊数据未到前占位，淡墨 shimmer，克制） */
.gallery-loading-skeleton {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
}
.gallery-loading-card {
  position: relative;
  height: 240px;
  overflow: hidden;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
}
.gallery-loading-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--pal-border) 55%, transparent) 50%, transparent 70%);
  transform: translateX(-100%);
  animation: gallery-loading-shimmer 1.5s ease-in-out infinite;
}
@keyframes gallery-loading-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* v0.36: 画册翻页 — gallery：大小交错（editorial）节奏——当前页直角细线框装裱，
   相邻页缩小侧露（用户点名的视觉）；展签式页码，美术馆克制感 */
.gallery :deep(.tpl-album-frame) {
  padding: 10px;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
}
.gallery :deep(.tpl-album-meta) {
  padding-top: 14px;
}
.gallery :deep(.tpl-gallery-caption) {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.gallery :deep(.tpl-album-counter) {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
/* 侧露页：缩小（58% 高）+ 直角细线框 + 半透明，hover 提亮引导点击 */
.gallery :deep(.tpl-album-peek) {
  width: 13%;
  height: 58%;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
  padding: 4px;
  opacity: 0.55;
}
.gallery :deep(.tpl-album-peek:hover) {
  opacity: 0.95;
}

.gallery-footer {
  padding: 48px 24px 96px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* R34: 外链（展签式横排 — 直角边框，大写字距） */
.gallery-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 8px;
}
.gallery-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border: 1px solid var(--pal-border);
  color: var(--pal-text-dim);
  text-decoration: none;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: color var(--dur-mid), border-color var(--dur-mid), background var(--dur-mid);
}
.gallery-link:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.gallery-link-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--pal-border);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  color: var(--pal-text);
  transition: border-color var(--dur-mid);
}
.gallery-link:hover .gallery-link-badge { border-color: var(--color-primary); }

@media (max-width: 768px) {
  .gallery-section {
    padding: 56px 16px;
  }
  .gallery-loading-skeleton {
    grid-template-columns: 1fr;
  }
}
</style>
