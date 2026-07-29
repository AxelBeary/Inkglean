<template>
  <div v-if="artist" class="atelier" ref="rootEl">
    <!-- 开场：画册封面感 -->
    <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="fullscreen" ref="heroRef" />

    <!-- 作品画廊：画册式大留白 -->
    <section class="atelier-section tpl-reveal" v-if="artworks.length">
      <p class="tpl-section-label atelier-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery :artworks="artworks" layout="editorial" />
    </section>

    <!-- 价格档位 + 流程（R1 整合） -->
    <section class="atelier-section atelier-section--alt tpl-reveal" v-if="tiers.length || workflowStages.length">
      <div class="atelier-inner">
        <template v-if="tiers.length">
          <p class="tpl-section-label atelier-label">{{ $t('artistHome.priceList') }}</p>
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
    <section class="atelier-section atelier-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- 页脚 -->
    <footer class="atelier-footer">
      <!-- R34: 外链（画册式横排，笔触下划线） -->
      <div class="atelier-links" v-if="socialLinks.length">
        <a
          v-for="link in socialLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="atelier-link"
        >
          <span class="atelier-link-badge" aria-hidden="true">{{ link.badge }}</span>
          {{ link.label }}
        </a>
      </div>
      <ThemePicker />
      <Disclaimer />
    </footer>

    <!-- 吸底约稿条 -->
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

const { socialLinks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素
const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)
</script>

<style scoped>
/* ─── 画册风布局 ─── */
.atelier {
  min-height: 100vh;
  background: var(--pal-bg);
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: background 0.3s;
  /* 品牌装饰色（与 --color-primary 正交：主色管按钮/CTA，装饰色管品牌识别） */
  --atelier-accent: #d96c4f;   /* 赭橙 */
  --atelier-accent-2: #7c8a6e; /* 苔绿 */
}

/* 纸面颗粒纹理（仅 paper 配色明显，其他配色靠 --pal-bg 底色） */
.atelier::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

.atelier-section {
  position: relative;
  z-index: 1;
  padding: 96px 24px;
}
.atelier-inner {
  max-width: 860px;
  margin: 0 auto;
}

/* 标题：思源宋体 + 手绘笔触下划线（装饰色） */
.atelier-label {
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-weight: 700;
  text-align: center;
  margin-bottom: 56px;
  position: relative;
  display: inline-block;
  left: 50%;
  transform: translateX(-50%);
  color: var(--pal-text);
}
.atelier-label::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 10%;
  right: 10%;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--atelier-accent), transparent);
  opacity: 0.7;
}

/* 章节交替区段顶部装饰线（苔绿） */
.atelier-section--alt {
  background: var(--pal-bg-alt);
  border-top: 2px solid var(--atelier-accent-2);
}

/* 页脚 */
.atelier-footer {
  position: relative;
  z-index: 1;
  padding: 48px 24px 96px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* R34: 外链（画册式横排 — 笔触下划线，徽标微旋转） */
.atelier-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}
.atelier-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: var(--pal-text-dim);
  text-decoration: none;
  font-size: 13px;
  position: relative;
  transition: color 0.2s;
}
.atelier-link::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 10%;
  right: 10%;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--atelier-accent), transparent);
  opacity: 0;
  transition: opacity 0.2s;
}
.atelier-link:hover { color: var(--pal-text); }
.atelier-link:hover::after { opacity: 0.7; }
.atelier-link-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--pal-border);
  background: var(--pal-bg-alt, transparent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  color: var(--pal-text);
  transform: rotate(-3deg);
  transition: transform 0.2s, border-color 0.2s;
}
.atelier-link:hover .atelier-link-badge {
  transform: rotate(0deg);
  border-color: var(--atelier-accent);
}

@media (max-width: 768px) {
  .atelier-section {
    padding: 64px 16px;
  }
  .atelier-label {
    margin-bottom: 40px;
  }
}
</style>
