<template>
  <div v-if="artist" class="gallery" ref="rootEl">
    <!-- Opening: fullscreen artwork + corner plaque (F3: announcement floats at top-left, avoiding the plaque at bottom-left) -->
    <div class="gallery-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="fullscreen" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="gallery-announcement" />
    </div>

    <!-- 作品画廊：大小交错 editorial -->
    <section class="gallery-section tpl-reveal" v-if="artworks.length">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery :artworks="artworks" :subdomain="subdomain" />
    </section>

    <!-- 价格档位 + 流程（R1 整合） -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="tiers.length || workflowStages.length">
      <div class="gallery-inner">
        <template v-if="tiers.length">
          <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
          <TplTierGrid :tiers="tiers">
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
          <span class="tpl-revision-note-icon" aria-hidden="true">✏️</span>
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

    <!-- R25: ThemePicker 右下角固定悬浮（用户决策 C37） -->
    <div class="theme-fab" :class="{ 'theme-fab--above-cta': ctaVisible }"><ThemePicker /></div>

    <!-- 吸底约稿条（滚过开场后浮现） -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useArtistData } from '../../../composables/useArtistData.js'
import { useScrollReveal } from '../../../composables/useScrollReveal.js'
import { useStickyCta } from '../../../composables/useStickyCta.js'
import TplHero from '../../../components/templates/TplHero.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplAnnouncement from '../../../components/shared/TplAnnouncement.vue'
import TplTierGrid from '../../../components/templates/TplTierGrid.vue'
import TplRules from '../../../components/templates/TplRules.vue'
import TplStickyCta from '../../../components/templates/TplStickyCta.vue'
import ThemePicker from '../../../components/ThemePicker.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  artist: Object, tiers: Array, artworks: Array, rules: String,
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object
})

const { socialLinks, platformLinks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素（sentinelEl 是 TplHero expose 的 ref，需解两层）
const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)
</script>

<style scoped>
.gallery {
  min-height: 100vh;
  background: var(--pal-bg);
  transition: background 0.3s;
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
.gallery-announcement :deep(.tpl-announcement-icon) { flex-shrink: 0; }
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

/* R25: ThemePicker 右下角固定悬浮（用户决策 C37） */
.theme-fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 95;
  padding: 10px 12px;
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  border-radius: 999px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  transition: box-shadow 0.2s, bottom 0.3s;
}
.theme-fab:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
.theme-fab--above-cta { bottom: 72px; }

@media (max-width: 768px) {
  .gallery-section {
    padding: 56px 16px;
  }
}
</style>
