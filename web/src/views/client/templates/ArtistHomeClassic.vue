<template>
  <div v-if="artist" class="classic" ref="rootEl">
    <!-- 开场：代表作横幅 -->
    <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="banner" ref="heroRef" />

    <!-- v0.25 A: 封面精选（有封面时显示，横幅下方暖色圆角展带） -->
    <div v-if="coverArtworks.length" class="classic-covers tpl-reveal">
      <TplCoverShowcase :covers="coverArtworks" class="classic-cover-show" />
    </div>

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
          <div class="classic-side-links" v-if="socialLinks.length">
            <a
              v-for="link in socialLinks"
              :key="link.key"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="classic-side-link"
            >
              <span class="classic-link-badge" aria-hidden="true">{{ link.badge }}</span>
              {{ link.label }}
            </a>
          </div>
          <!-- R58-8: 平台链接（与外链共用侧栏链接区，无链接时不显示） -->
          <div class="classic-side-links" v-if="platformLinks.length">
            <a
              v-for="link in platformLinks"
              :key="link.key"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="classic-side-link"
            >
              <span class="classic-link-badge" aria-hidden="true">{{ link.badge }}</span>
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
        <section class="classic-section tpl-reveal" v-if="tiers.length || workflowStages.length">
          <template v-if="tiers.length">
            <p class="tpl-section-label classic-label">{{ $t('artistHome.priceList') }}</p>
            <TplTierGrid :tiers="tiers" featured :subdomain="subdomain">
              <template #addons="{ tier }">
                <slot name="addons" :tier="tier"></slot>
              </template>
            </TplTierGrid>
          </template>
          <!-- R1: 流程整合进价格板块，不再独立成区 -->
          <div v-if="workflowStages.length" class="tpl-workflow-inline">
            <p class="tpl-workflow-inline-label">{{ $t('artistHome.workflow') }}</p>
            <WorkflowOverviewStrip :stages="workflowStages" vertical />
          </div>
          <div v-if="artist.revisionNote" class="tpl-revision-note">
            <span class="tpl-revision-note-icon" aria-hidden="true">✏️</span>
            <span>
              <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
              {{ artist.revisionNote }}
            </span>
          </div>
        </section>

        <section class="classic-section tpl-reveal" v-if="artworks.length">
          <p class="tpl-section-label classic-label">{{ $t('artistHome.artworks') }}</p>
          <TplGallery :artworks="artworks" :subdomain="subdomain" />
        </section>

        <section class="classic-section tpl-reveal" v-if="rules">
          <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
        </section>

        <!-- F4: 留言板 -->
        <section class="classic-section tpl-reveal">
          <p class="tpl-section-label classic-label">{{ $t('guestbook.title') }}</p>
          <TplGuestbook :subdomain="subdomain" class="classic-guestbook" />
        </section>

        <Disclaimer class="classic-disclaimer" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useArtistData } from '../../../composables/useArtistData.js'
import { useScrollReveal } from '../../../composables/useScrollReveal.js'
import TplHero from '../../../components/templates/TplHero.vue'
import TplCoverShowcase from '../../../components/templates/TplCoverShowcase.vue'
import TplStatusBadge from '../../../components/templates/TplStatusBadge.vue'
import TplTierGrid from '../../../components/templates/TplTierGrid.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplAnnouncement from '../../../components/shared/TplAnnouncement.vue'
import TplGuestbook from '../../../components/shared/TplGuestbook.vue'
import TplRules from '../../../components/templates/TplRules.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  artist: Object, tiers: Array, artworks: Array, rules: String,
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object
})

const { imgUrl, socialLinks, platformLinks, coverArtworks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)
</script>

<style scoped>
.classic {
  min-height: 100vh;
  background: var(--pal-bg);
  transition: background 0.3s;
}

/* v0.25 A: 封面精选 — classic：横幅下方暖色圆角展带，柔和阴影，亲切温暖 */
.classic-covers {
  max-width: 1080px;
  margin: -28px auto 0;
  padding: 0 24px;
  position: relative;
  z-index: 2;
}
.classic-cover-show {
  height: 340px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--pal-border);
  box-shadow: 0 8px 32px color-mix(in srgb, var(--pal-text) 12%, transparent);
}
.classic-cover-show :deep(.el-carousel__indicators--outside) {
  margin-top: 8px;
}
.classic-cover-show :deep(.el-carousel__indicator--horizontal .el-carousel__button) {
  background: var(--pal-text-dim);
  opacity: 0.35;
  border-radius: 999px;
  transition: opacity 0.2s, background 0.2s, width 0.2s;
}
.classic-cover-show :deep(.el-carousel__indicator--horizontal.is-active .el-carousel__button) {
  background: var(--color-primary);
  opacity: 1;
  width: 22px;
}
@media (max-width: 860px) {
  .classic-covers { padding: 0 16px; margin-top: -16px; }
  .classic-cover-show { height: 220px; }
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
  padding: 28px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
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
.classic-announcement :deep(.tpl-announcement-icon) { flex-shrink: 0; }
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
  transition: color 0.2s, background 0.2s;
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
  transition: background 0.2s, border-color 0.2s;
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
  transition: background 0.2s, transform 0.2s;
}
.classic-cta:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-2px);
}
.classic-cta:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
/* ===== 右栏内容 ===== */
.classic-section {
  margin-bottom: 56px;
}
.classic-label {
  margin-bottom: 20px;
}
/* F4: 留言板 — classic：卡片式（surface 底 + 圆角边框，温暖友好） */
.classic-guestbook :deep(.gb-form) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 28px;
}
.classic-guestbook :deep(.gb-input),
.classic-guestbook :deep(.gb-textarea) {
  padding: 10px 14px;
  border: 1px solid var(--pal-border);
  border-radius: 10px;
  background: var(--pal-surface);
  color: var(--pal-text);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s;
}
.classic-guestbook :deep(.gb-input:focus),
.classic-guestbook :deep(.gb-textarea:focus) {
  outline: none;
  border-color: var(--color-primary);
}
.classic-guestbook :deep(.gb-submit) {
  align-self: flex-start;
  padding: 10px 28px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--pal-bg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
}
.classic-guestbook :deep(.gb-submit:hover:not(:disabled)) { transform: translateY(-1px); }
.classic-guestbook :deep(.gb-submit:disabled) { opacity: 0.5; cursor: default; }
.classic-guestbook :deep(.gb-pending-hint) {
  margin: 0;
  font-size: 13px;
  color: var(--color-primary);
}
.classic-guestbook :deep(.gb-item) {
  padding: 16px;
  border: 1px solid var(--pal-border);
  border-radius: 12px;
  background: var(--pal-surface);
  margin-bottom: 12px;
}
.classic-guestbook :deep(.gb-item-head) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.classic-guestbook :deep(.gb-nickname) { font-weight: 700; font-size: 14px; color: var(--pal-text); }
.classic-guestbook :deep(.gb-time) { font-size: 12px; color: var(--pal-text-dim); }
.classic-guestbook :deep(.gb-content) { margin: 0; font-size: 14px; line-height: 1.6; color: var(--pal-text); word-break: break-word; }
.classic-guestbook :deep(.gb-reply) {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-primary-soft);
}
.classic-guestbook :deep(.gb-reply-tag) {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4px;
}
.classic-guestbook :deep(.gb-reply-content) { margin: 0; font-size: 13px; line-height: 1.6; color: var(--pal-text); }
.classic-guestbook :deep(.gb-empty) { color: var(--pal-text-dim); font-size: 14px; text-align: center; padding: 24px 0; }
.classic-guestbook :deep(.gb-load-more) {
  display: block;
  margin: 8px auto 0;
  padding: 8px 24px;
  border: 1px solid var(--pal-border);
  border-radius: 999px;
  background: transparent;
  color: var(--pal-text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.classic-guestbook :deep(.gb-load-more:hover:not(:disabled)) { border-color: var(--color-primary); color: var(--color-primary); }
.classic-guestbook :deep(.gb-no-more) { text-align: center; font-size: 12px; color: var(--pal-text-dim); margin-top: 8px; }
.classic-disclaimer {
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
