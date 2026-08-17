<template>
  <div v-if="artist" class="classic" ref="rootEl">
    <!-- 开场：代表作横幅 -->
    <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" :platforms="platforms" variant="banner" />

    <!-- 主体：桌面双栏，移动端单栏 -->
    <div class="classic-body">
      <!-- 左栏：吸顶信息卡（约稿按钮常驻） -->
      <aside class="classic-side">
        <div class="classic-card">
          <el-avatar :size="72" :src="artist.avatar ? imgUrl(artist.avatar) : undefined" class="classic-avatar">
            {{ artist.name?.charAt(0) }}
          </el-avatar>
          <h2 class="classic-side-name">{{ artist.name }}</h2>
          <!-- F3: Announcement (T3: below avatar/name, above status badge) -->
          <TplAnnouncement :artist="artist" class="classic-announcement" />
          <TplStatusBadge :status="artist.status" :slot-display="artist.slotDisplay" />
          <!-- REQ-022 F2: 页脚链接（外链/平台链接合一，一排自动换行，新窗口打开） -->
          <div class="classic-side-links" v-if="footerLinks.length">
            <a
              v-for="link in footerLinks"
              :key="link.key"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="classic-side-link"
            >
              <span class="classic-link-badge" aria-hidden="true">
                <TplPlatformIcon :icon-key="link.iconKey" :fallback-char="link.fallbackChar" />
              </span>
              {{ link.label }}
            </a>
          </div>
          <button
            class="classic-cta"
            :disabled="artist.status !== 'open'"
            @click="$router.push(`/artist/${subdomain}/order`)"
          >
            {{ $t('artistHome.commission') }}
          </button>
        </div>
      </aside>

      <!-- 右栏：滚动内容 -->
      <main class="classic-main">
        <!-- P1-B 收敛：价格档位 + 流程 + 修改说明 → 共享 TplPricingSection（外观零变） -->
        <TplPricingSection
          class="classic-section tpl-reveal"
          :styles="styles"
          :tiers="tiers"
          :workflow-stages="workflowStages"
          :revision-note="artist.revisionNote"
          :subdomain="subdomain"
          :artist="artist"
        >
          <template #title>
            <p class="tpl-section-label classic-label">{{ $t('artistHome.priceList') }}</p>
          </template>
        </TplPricingSection>

        <!-- v0.36: 作品画廊——画册式左右翻页（Classic：端正素雅，细边框装裱 + 文字题注） -->
        <section class="classic-section tpl-reveal" v-if="galleryArtworks.length">
          <p class="tpl-section-label classic-label">{{ $t('artistHome.artworks') }}</p>
          <TplGallery :artworks="galleryArtworks" :gallery="gallery" :subdomain="subdomain" layout="masonry" />
        </section>
        <!-- P2-3: 无作品空态 -->
        <section class="classic-section tpl-reveal" v-else>
          <p class="tpl-section-label classic-label">{{ $t('artistHome.artworks') }}</p>
          <div class="classic-empty">{{ $t('artistHome.noWorks') }}</div>
        </section>

        <section class="classic-section tpl-reveal" v-if="rules">
          <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
        </section>

        <!-- F4: 留言板 -->
        <section class="classic-section tpl-reveal" v-if="artist.guestbookEnabled !== false">
          <p class="tpl-section-label classic-label">{{ $t('guestbook.title') }}</p>
          <TplGuestbook :subdomain="subdomain" theme="card" :enabled="artist.guestbookEnabled !== false" />
        </section>

        <Disclaimer class="classic-disclaimer" />
        <!-- REQ-042: 页脚合规入口（隐私/条款 + 举报） -->
        <ComplianceFooterLinks class="classic-compliance" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useArtistData } from '../../../composables/useArtistData.js'
import { useScrollReveal } from '../../../composables/useScrollReveal.js'
import TplHero from '../../../components/templates/TplHero.vue'
import TplStatusBadge from '../../../components/templates/TplStatusBadge.vue'
import TplPricingSection from '../../../components/templates/TplPricingSection.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplAnnouncement from '../../../components/shared/TplAnnouncement.vue'
import TplGuestbook from '../../../components/shared/TplGuestbook.vue'
import TplRules from '../../../components/templates/TplRules.vue'
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
  platforms: { type: Array, default: () => [] } // REQ-022 F2: 社交平台列表（页脚链接平台名/图标渲染）
})

const { imgUrl, footerLinks, galleryArtworks } = useArtistData(props)

const rootEl = ref(null)
useScrollReveal(rootEl)
</script>

<style scoped>
.classic {
  min-height: 100vh;
  background: var(--pal-bg);
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
}

.classic-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 40px;
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 24px 80px;
  align-items: start;
}

/* ===== 左栏吸顶信息卡 ===== */
.classic-side {
  position: sticky;
  top: 24px;
}
.classic-card {
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  border-radius: 16px;
  /* v0.34 任务G：内容少时不撑出大片空白——内边距/间距随内容收紧 */
  padding: 22px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.classic-avatar {
  font-size: 28px;
}
.classic-side-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--pal-text);
  margin: 0;
}
/* F3: Announcement — border-left emphasis line + background color */
.classic-announcement {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 0 8px 8px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pal-text);
  text-align: left;
}
.classic-announcement :deep(.tpl-announcement-text) { word-break: break-word; }
.classic-side-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.classic-side-link {
  color: var(--pal-text-dim);
  text-decoration: none;
  font-size: 13px;
  padding: 6px 0;
  border-radius: 8px;
  transition: color var(--dur-mid), background var(--dur-mid);
  display: flex;
  align-items: center;
  gap: 8px;
}
.classic-side-link:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
/* R15: 外链图标文字徽标 */
.classic-link-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--pal-bg-alt, var(--color-primary-soft));
  border: 1px solid var(--pal-border);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  color: var(--pal-text);
  transition: background var(--dur-mid), border-color var(--dur-mid);
}
.classic-side-link:hover .classic-link-badge {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}
.classic-cta {
  width: 100%;
  padding: 13px 0;
  background: var(--color-primary);
  color: var(--pal-bg);
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  /* T 波：hover 禁位移——位移换背景加深 */
  transition: background var(--dur-mid);
}
.classic-cta:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
.classic-cta:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
/* ===== 右栏内容 ===== */
.classic-empty { text-align: center; color: var(--pal-text-dim); font-size: 14px; letter-spacing: 0.05em; padding: 40px 0 64px; }
.classic-section {
  margin-bottom: 56px;
}
.classic-label {
  margin-bottom: 20px;
}

/* v0.36 修正: 画廊恢复瀑布流（masonry）——Classic：端正素雅，卡片圆角边框 + 居中题注（温暖克制） */
.classic :deep(.tpl-gallery--masonry .tpl-gallery-item) {
  border: 1px solid var(--pal-border);
  border-radius: 8px;
  background: var(--pal-surface);
}
.classic :deep(.tpl-gallery-meta) {
  justify-content: center;
  gap: 16px;
  text-align: center;
}
.classic :deep(.tpl-gallery-caption) {
  flex: 0 1 auto;
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--pal-text);
}
.classic-disclaimer {
  margin-top: 24px;
}
.classic-compliance {
  margin-top: 24px;
}

/* ===== 移动端：单栏，信息卡置顶 ===== */
@media (max-width: 860px) {
  .classic-body {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 24px 16px 64px;
  }
  .classic-side {
    position: static;
  }
}
</style>
