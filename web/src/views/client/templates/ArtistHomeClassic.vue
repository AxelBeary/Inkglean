<template>
  <div v-if="artist" class="classic" ref="rootEl">
    <!-- 开场：代表作横幅 -->
    <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="banner" ref="heroRef" />

    <!-- 主体：桌面双栏，移动端单栏 -->
    <div class="classic-body">
      <!-- 左栏：吸顶信息卡（约稿按钮常驻） -->
      <aside class="classic-side">
        <div class="classic-card">
          <el-avatar :size="72" :src="artist.avatar ? imgUrl(artist.avatar) : undefined" class="classic-avatar">
            {{ artist.name?.charAt(0) }}
          </el-avatar>
          <h2 class="classic-side-name">{{ artist.name }}</h2>
          <TplStatusBadge :status="artist.status" />
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
          <button
            class="classic-cta"
            :disabled="artist.status !== 'open'"
            @click="$router.push(`/artist/${subdomain}/order`)"
          >
            {{ $t('artistHome.commission') }}
          </button>
          <div class="classic-side-theme">
            <ThemePicker />
          </div>
        </div>
      </aside>

      <!-- 右栏：滚动内容 -->
      <main class="classic-main">
        <section class="classic-section tpl-reveal" v-if="tiers.length || workflowStages.length">
          <template v-if="tiers.length">
            <p class="tpl-section-label classic-label">{{ $t('artistHome.priceList') }}</p>
            <TplTierGrid :tiers="tiers" featured>
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
          <TplGallery :artworks="artworks" layout="grid" />
        </section>

        <section class="classic-section tpl-reveal" v-if="rules">
          <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
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
import TplStatusBadge from '../../../components/templates/TplStatusBadge.vue'
import TplTierGrid from '../../../components/templates/TplTierGrid.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplRules from '../../../components/templates/TplRules.vue'
import ThemePicker from '../../../components/ThemePicker.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  artist: Object, tiers: Array, artworks: Array, rules: String,
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object
})

const { imgUrl, socialLinks } = useArtistData(props)

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

.classic-body {
  display: grid;
  grid-template-columns: 280px 1fr;
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
.classic-side-theme {
  margin-top: 4px;
}

/* ===== 右栏内容 ===== */
.classic-section {
  margin-bottom: 56px;
}
.classic-label {
  margin-bottom: 20px;
}
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
