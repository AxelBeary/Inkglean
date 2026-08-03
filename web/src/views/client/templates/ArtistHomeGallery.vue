<template>
  <div v-if="artist" class="gallery" ref="rootEl">
    <!-- Opening: fullscreen artwork + corner plaque (F3: announcement floats at top-left, avoiding the plaque at bottom-left) -->
    <div class="gallery-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="fullscreen" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="gallery-announcement" />
    </div>

    <!-- 作品画廊：大小交错 editorial -->
    <section class="gallery-section tpl-reveal" v-if="galleryArtworks.length">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery :artworks="galleryArtworks" :subdomain="subdomain" />
    </section>

    <!-- 价格档位 + 流程（R1 整合） -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="styles.length || tiers.length || workflowStages.length">
      <div class="gallery-inner">
        <!-- v0.32 REQ-023 Phase3: 有画风数据 → TplStyleGrid；无画风 → 现有 TplTierGrid 兜底 -->
        <template v-if="styles.length">
          <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
          <TplStyleGrid :styles="styles" :subdomain="subdomain" />
        </template>
        <template v-else-if="tiers.length">
          <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
          <TplTierGrid :tiers="tiers" :subdomain="subdomain">
            <template #addons="{ tier }">
              <slot name="addons" :tier="tier"></slot>
            </template>
          </TplTierGrid>
        </template>
        <div v-if="workflowStages.length" class="tpl-workflow-inline">
          <p class="tpl-workflow-inline-label">{{ $t('artistHome.workflow') }}</p>
          <WorkflowOverviewStrip :stages="workflowStages" vertical />
        </div>
        <div v-if="artist.revisionNote" class="tpl-revision-note">
          <span>
            <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
            {{ artist.revisionNote }}
          </span>
        </div>
      </div>
    </section>

    <!-- 约稿须知 -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- F4: 留言板 -->
    <section class="gallery-section tpl-reveal">
      <p class="tpl-section-label gallery-label">{{ $t('guestbook.title') }}</p>
      <TplGuestbook :subdomain="subdomain" class="gallery-guestbook" />
    </section>

    <!-- 页脚 -->
    <footer class="gallery-footer">
      <!-- R34: 外链（展签式横排） -->
      <div class="gallery-links" v-if="socialLinks.length">
        <a
          v-for="link in socialLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="gallery-link"
        >
          <span class="gallery-link-badge" aria-hidden="true">{{ link.badge }}</span>
          {{ link.label }}
        </a>
      </div>
      <!-- R58-8: 平台链接（展签式横排，与外链共用视觉语言） -->
      <div class="gallery-links" v-if="platformLinks.length">
        <a
          v-for="link in platformLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="gallery-link"
        >
          <span class="gallery-link-badge" aria-hidden="true">{{ link.badge }}</span>
          {{ link.label }}
        </a>
      </div>
      <Disclaimer />
    </footer>

    <!-- 吸底约稿条（滚过开场后浮现） -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useArtistData } from '../../../composables/useArtistData.js'
import { useScrollReveal } from '../../../composables/useScrollReveal.js'
import { useStickyCta } from '../../../composables/useStickyCta.js'
import TplHero from '../../../components/templates/TplHero.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplAnnouncement from '../../../components/shared/TplAnnouncement.vue'
import TplGuestbook from '../../../components/shared/TplGuestbook.vue'
import TplTierGrid from '../../../components/templates/TplTierGrid.vue'
import TplStyleGrid from '../../../components/templates/TplStyleGrid.vue'
import TplRules from '../../../components/templates/TplRules.vue'
import TplStickyCta from '../../../components/templates/TplStickyCta.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  artist: Object, tiers: Array, styles: Array, artworks: Array, rules: String,
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object
})

const { socialLinks, platformLinks, galleryArtworks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素（sentinelEl 是 TplHero expose 的 ref，需解两层）
const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)

// #55/61: 同步 CTA 避让状态给父级浮窗
const ctaRaised = inject('ctaRaised')
watch(ctaVisible, (v) => { ctaRaised.value = v }, { immediate: true })
</script>

<style scoped>
.gallery {
  min-height: 100vh;
  background: var(--pal-bg);
  transition: background 0.3s;
}

/* F3: Hero wrapper (relative container for announcement overlay) */
.gallery-hero-wrap { position: relative; }

/* v0.25 A: 封面精选 — gallery：美术馆展墙式，直角细线框 + 展签标注，冷峻克制 */
.gallery-covers {
  max-width: 900px;
  margin: 0 auto;
  padding: 72px 24px 0;
}
.gallery-cover-frame {
  border: 1px solid var(--pal-border);
  padding: 10px;
  background: var(--pal-surface);
}
.gallery-cover-show {
  height: 420px;
  overflow: hidden;
}
.gallery-cover-show :deep(.el-carousel__arrow) {
  background: color-mix(in srgb, var(--pal-bg) 70%, transparent);
  border: 1px solid var(--pal-border);
  border-radius: 0;
  color: var(--pal-text);
  backdrop-filter: blur(6px);
  transition: border-color 0.2s, color 0.2s;
}
.gallery-cover-show :deep(.el-carousel__arrow:hover) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--pal-bg) 85%, transparent);
}
.gallery-cover-show :deep(.el-carousel__indicators--outside) { margin-top: 12px; }
.gallery-cover-show :deep(.el-carousel__indicator--horizontal .el-carousel__button) {
  background: var(--pal-border);
  border-radius: 0;
  height: 2px;
  width: 24px;
  transition: background 0.25s;
}
.gallery-cover-show :deep(.el-carousel__indicator--horizontal.is-active .el-carousel__button) {
  background: var(--color-primary);
}
@media (max-width: 768px) {
  .gallery-covers { padding: 48px 16px 0; }
  .gallery-cover-show { height: 260px; }
}
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

.gallery-section {
  padding: 88px 24px;
}
.gallery-section--alt {
  background: var(--pal-bg-alt);
}
.gallery-inner {
  max-width: 900px;
  margin: 0 auto;
}
.gallery-label {
  text-align: center;
  margin-bottom: 48px;
}

/* F4: 留言板 — gallery：展签式（无圆角、细线分隔、字距，美术馆感） */
.gallery-guestbook { max-width: 640px; margin: 0 auto; }
.gallery-guestbook :deep(.gb-form) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 40px;
}
.gallery-guestbook :deep(.gb-input),
.gallery-guestbook :deep(.gb-textarea) {
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--pal-border);
  background: transparent;
  color: var(--pal-text);
  font-size: 14px;
  font-family: inherit;
  letter-spacing: 0.03em;
  resize: vertical;
  transition: border-color 0.25s;
}
.gallery-guestbook :deep(.gb-input:focus),
.gallery-guestbook :deep(.gb-textarea:focus) {
  outline: none;
  border-bottom-color: var(--color-primary);
}
.gallery-guestbook :deep(.gb-submit) {
  align-self: flex-start;
  padding: 10px 32px;
  border: 1px solid var(--pal-text);
  background: transparent;
  color: var(--pal-text);
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.25s, color 0.25s;
}
.gallery-guestbook :deep(.gb-submit:hover:not(:disabled)) { background: var(--pal-text); color: var(--pal-bg); }
.gallery-guestbook :deep(.gb-submit:disabled) { opacity: 0.4; cursor: default; }
.gallery-guestbook :deep(.gb-pending-hint) { margin: 0; font-size: 12px; letter-spacing: 0.05em; color: var(--color-primary); }
.gallery-guestbook :deep(.gb-item) {
  padding: 20px 0;
  border-bottom: 1px solid var(--pal-border);
}
.gallery-guestbook :deep(.gb-item-head) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.gallery-guestbook :deep(.gb-nickname) { font-weight: 600; font-size: 14px; letter-spacing: 0.05em; color: var(--pal-text); }
.gallery-guestbook :deep(.gb-time) { font-size: 11px; letter-spacing: 0.08em; color: var(--pal-text-dim); }
.gallery-guestbook :deep(.gb-content) { margin: 0; font-size: 14px; line-height: 1.8; color: var(--pal-text-dim); word-break: break-word; }
.gallery-guestbook :deep(.gb-reply) {
  margin-top: 14px;
  padding-left: 16px;
  border-left: 2px solid var(--color-primary);
}
.gallery-guestbook :deep(.gb-reply-tag) {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: 4px;
}
.gallery-guestbook :deep(.gb-reply-content) { margin: 0; font-size: 13px; line-height: 1.7; color: var(--pal-text); }
.gallery-guestbook :deep(.gb-empty) { color: var(--pal-text-dim); font-size: 13px; letter-spacing: 0.05em; text-align: center; padding: 32px 0; }
.gallery-guestbook :deep(.gb-load-more) {
  display: block;
  margin: 20px auto 0;
  padding: 8px 28px;
  border: 1px solid var(--pal-border);
  background: transparent;
  color: var(--pal-text-dim);
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.25s, color 0.25s;
}
.gallery-guestbook :deep(.gb-load-more:hover:not(:disabled)) { border-color: var(--pal-text); color: var(--pal-text); }
.gallery-guestbook :deep(.gb-no-more) { text-align: center; font-size: 11px; letter-spacing: 0.1em; color: var(--pal-text-dim); margin-top: 16px; }

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
  transition: color 0.2s, border-color 0.2s, background 0.2s;
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
  transition: border-color 0.2s;
}
.gallery-link:hover .gallery-link-badge { border-color: var(--color-primary); }

@media (max-width: 768px) {
  .gallery-section {
    padding: 56px 16px;
  }
}
</style>
