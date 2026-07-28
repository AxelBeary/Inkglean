<template>
  <div v-if="artist" class="folio" ref="rootEl">
    <!-- 固定导航（滚动侦测高亮 + 移动端汉堡） -->
    <nav class="folio-nav">
      <span class="folio-nav-brand">{{ artist.name }}</span>
      <button class="folio-nav-burger" @click="menuOpen = !menuOpen" aria-label="menu">
        <span></span><span></span><span></span>
      </button>
      <div class="folio-nav-links" :class="{ open: menuOpen }">
        <a
          v-for="item in navItems"
          :key="item.id"
          :href="`#${item.id}`"
          class="folio-nav-link"
          :class="{ active: activeSection === item.id }"
          @click.prevent="scrollTo(item.id)"
        >
          {{ item.label }}
        </a>
        <button
          class="folio-nav-cta"
          :disabled="artist.status !== 'open'"
          @click="$router.push(`/artist/${subdomain}/order`)"
        >
          {{ $t('artistHome.commission') }}
        </button>
      </div>
    </nav>

    <!-- 开场：左文右图分屏 -->
    <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="split" ref="heroRef" />

    <!-- 作品（瀑布流） -->
    <section id="gallery" class="folio-section tpl-reveal" v-if="artworks.length">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('artistHome.artworks') }}</h2>
        <TplGallery :artworks="artworks" layout="masonry" />
      </div>
    </section>

    <!-- 价格 -->
    <section id="pricing" class="folio-section folio-section--alt tpl-reveal" v-if="tiers.length">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('artistHome.priceList') }}</h2>
        <TplTierGrid :tiers="tiers">
          <template #addons="{ tier }">
            <slot name="addons" :tier="tier"></slot>
          </template>
        </TplTierGrid>
      </div>
    </section>

    <!-- 流程 -->
    <section id="workflow" class="folio-section tpl-reveal" v-if="workflowStages.length">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('artistHome.howItWorks') }}</h2>
        <WorkflowOverviewStrip :stages="workflowStages" vertical />
      </div>
    </section>

    <!-- 须知 -->
    <section id="rules" class="folio-section folio-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- CTA 区 -->
    <section class="folio-cta">
      <div class="folio-cta-inner">
        <h2 class="folio-cta-title">{{ $t('artistHome.commission') }}</h2>
        <p class="folio-cta-sub">{{ $t('artistHome.ctaSubtitle') }}</p>
        <button
          class="folio-cta-btn"
          :disabled="artist.status !== 'open'"
          @click="$router.push(`/artist/${subdomain}/order`)"
        >
          {{ $t('artistHome.startCommission') }}
        </button>
        <div class="folio-cta-meta">
          <ThemePicker />
          <Disclaimer />
        </div>
      </div>
    </section>

    <!-- 吸底约稿条 -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
const menuOpen = ref(false)
const activeSection = ref('')
useScrollReveal(rootEl)

const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)

const navItems = computed(() => [
  { id: 'gallery', label: t('artistHome.navWork') },
  { id: 'pricing', label: t('artistHome.navPricing') },
  { id: 'workflow', label: t('artistHome.navProcess') }
])

function scrollTo(id) {
  menuOpen.value = false
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// 滚动侦测：高亮当前所在区块
// 区块可能因异步数据（workflowStages）晚到才插入 DOM，用 MutationObserver 补挂观察
let observer = null
let mo = null
function setupSpy() {
  if (!observer) return
  navItems.value.forEach((item) => {
    const el = document.getElementById(item.id)
    if (el) observer.observe(el)
  })
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activeSection.value = entry.target.id
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  )
  setupSpy()
  mo = new MutationObserver(setupSpy)
  mo.observe(rootEl.value || document.body, { childList: true, subtree: true })
})
onUnmounted(() => {
  observer?.disconnect()
  mo?.disconnect()
})
</script>

<style scoped>
.folio {
  min-height: 100vh;
  background: var(--pal-bg);
  transition: background 0.3s;
}

/* ===== 固定导航 ===== */
.folio-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  background: color-mix(in srgb, var(--pal-bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--pal-border);
}
.folio-nav-brand {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--pal-text);
}
.folio-nav-links {
  display: flex;
  align-items: center;
  gap: 28px;
}
.folio-nav-link {
  color: var(--pal-text-dim);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
  position: relative;
}
.folio-nav-link:hover,
.folio-nav-link.active {
  color: var(--color-primary);
}
.folio-nav-link.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -6px;
  height: 2px;
  background: var(--color-primary);
}
.folio-nav-cta {
  padding: 8px 22px;
  background: var(--color-primary);
  color: var(--pal-bg);
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.folio-nav-cta:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
.folio-nav-cta:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.folio-nav-burger {
  display: none;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.folio-nav-burger span {
  width: 22px;
  height: 2px;
  background: var(--pal-text);
  transition: 0.3s;
}

/* ===== 区块 ===== */
.folio-section {
  padding: 88px 32px;
}
.folio-section--alt {
  background: var(--pal-bg-alt);
}
.folio-inner {
  max-width: 900px;
  margin: 0 auto;
}
.folio-title {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.5px;
  text-align: center;
  color: var(--pal-text);
  margin: 0 0 48px;
}

/* ===== CTA 区 ===== */
.folio-cta {
  padding: 96px 32px;
  text-align: center;
  background: var(--pal-bg-alt);
}
.folio-cta-inner {
  max-width: 520px;
  margin: 0 auto;
}
.folio-cta-title {
  font-family: var(--font-display);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -1px;
  color: var(--pal-text);
  margin: 0 0 12px;
}
.folio-cta-sub {
  color: var(--pal-text-dim);
  font-size: 16px;
  margin: 0 0 32px;
}
.folio-cta-btn {
  padding: 16px 44px;
  background: var(--color-primary);
  color: var(--pal-bg);
  border: none;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}
.folio-cta-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-2px);
}
.folio-cta-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.folio-cta-meta {
  margin-top: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* ===== 移动端：汉堡菜单 ===== */
@media (max-width: 768px) {
  .folio-nav {
    padding: 14px 20px;
  }
  .folio-nav-burger {
    display: flex;
  }
  .folio-nav-links {
    position: fixed;
    top: 57px;
    left: 0;
    right: 0;
    flex-direction: column;
    gap: 0;
    padding: 12px 0;
    background: var(--pal-surface);
    border-bottom: 1px solid var(--pal-border);
    transform: translateY(-120%);
    transition: transform 0.3s;
  }
  .folio-nav-links.open {
    transform: translateY(0);
  }
  .folio-nav-link {
    padding: 14px 24px;
    width: 100%;
  }
  .folio-nav-link.active::after {
    display: none;
  }
  .folio-nav-cta {
    margin: 8px 24px;
  }
  .folio-section {
    padding: 56px 16px;
  }
  .folio-title {
    font-size: 26px;
  }
}
</style>
