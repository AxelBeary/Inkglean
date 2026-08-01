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

    <!-- Opening: split screen with text on left and image on right (F3: announcement inlined in the left column, after the bio) -->
    <div class="folio-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="split" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="folio-announcement" />
    </div>

    <!-- v0.25 A: 封面精选（有封面时显示，作品集编辑式：全宽 + 序号标注 + 细线分隔） -->
    <section v-if="coverArtworks.length" class="folio-covers tpl-reveal">
      <div class="folio-covers-head">
        <h2 class="folio-title">{{ $t('artistHome.covers') }}</h2>
        <span class="folio-covers-count">{{ coverArtworks.length }}</span>
      </div>
      <div class="folio-cover-frame">
        <TplCoverShowcase :covers="coverArtworks" :interval="4500" class="folio-cover-show" />
      </div>
    </section>

    <!-- 作品（瀑布流） -->
    <section id="gallery" class="folio-section tpl-reveal" v-if="artworks.length">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('artistHome.artworks') }}</h2>
        <TplGallery :artworks="artworks" :subdomain="subdomain" />
      </div>
    </section>

    <!-- 价格 + 流程（R1 整合） -->
    <section id="pricing" class="folio-section folio-section--alt tpl-reveal" v-if="tiers.length || workflowStages.length">
      <div class="folio-inner">
        <template v-if="tiers.length">
          <h2 class="folio-title">{{ $t('artistHome.priceList') }}</h2>
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
          <span class="tpl-revision-note-icon" aria-hidden="true">✏️</span>
          <span>
            <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
            {{ artist.revisionNote }}
          </span>
        </div>
      </div>
    </section>

    <!-- 须知 -->
    <section id="rules" class="folio-section folio-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- F4: 留言板 -->
    <section id="guestbook" class="folio-section tpl-reveal">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('guestbook.title') }}</h2>
        <TplGuestbook :subdomain="subdomain" class="folio-guestbook" />
      </div>
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
          <!-- R34: 外链（胶囊横排，呼应 CTA 圆角语言） -->
          <div class="folio-links" v-if="socialLinks.length">
            <a
              v-for="link in socialLinks" :key="link.key"
              :href="link.url" target="_blank" rel="noopener noreferrer"
              class="folio-link"
            >
              <span class="folio-link-badge" aria-hidden="true">{{ link.badge }}</span>
              {{ link.label }}
            </a>
          </div>
          <!-- R58-8: 平台链接（胶囊横排，与外链共用视觉语言） -->
          <div class="folio-links" v-if="platformLinks.length">
            <a
              v-for="link in platformLinks" :key="link.key"
              :href="link.url" target="_blank" rel="noopener noreferrer"
              class="folio-link"
            >
              <span class="folio-link-badge" aria-hidden="true">{{ link.badge }}</span>
              {{ link.label }}
            </a>
          </div>
          <Disclaimer />
        </div>
      </div>
    </section>

    <!-- R25: ThemePicker 右下角固定悬浮（用户决策 C37） -->
    <div class="theme-fab" :class="{ 'theme-fab--above-cta': ctaVisible }"><ThemePicker /></div>

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
import TplCoverShowcase from '../../../components/templates/TplCoverShowcase.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplAnnouncement from '../../../components/shared/TplAnnouncement.vue'
import TplGuestbook from '../../../components/shared/TplGuestbook.vue'
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
const { socialLinks, platformLinks, coverArtworks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
const menuOpen = ref(false)
const activeSection = ref('')
useScrollReveal(rootEl)

const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)

const navItems = computed(() => [
  { id: 'gallery', label: t('artistHome.navWork') },
  { id: 'pricing', label: t('artistHome.navPricing') }
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

/* F3: Hero wrapper — 公告内联于分屏左栏（左文字区底部，简介/按钮之下，首屏可见） */
.folio-hero-wrap { position: relative; }

/* v0.25 A: 封面精选 — folio：作品集编辑式，全宽薄边框 + 序号标注 + 锐利箭头 */
.folio-covers {
  max-width: 1100px;
  margin: 0 auto;
  padding: 96px 32px 0;
}
.folio-covers-head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 28px;
  border-bottom: 1px solid var(--pal-border);
  padding-bottom: 16px;
}
.folio-covers-count {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.1em;
}
.folio-cover-frame {
  border: 1px solid var(--pal-border);
  border-radius: 4px;
  overflow: hidden;
}
.folio-cover-show {
  height: 460px;
}
.folio-cover-show :deep(.el-carousel__arrow) {
  background: transparent;
  border: 1px solid var(--pal-border);
  border-radius: 2px;
  color: var(--pal-text);
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.folio-cover-show :deep(.el-carousel__arrow:hover) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.folio-cover-show :deep(.el-carousel__indicators--outside) { margin-top: 16px; }
.folio-cover-show :deep(.el-carousel__indicator--horizontal .el-carousel__button) {
  background: var(--pal-border);
  border-radius: 0;
  height: 3px;
  width: 28px;
  transition: background 0.25s, width 0.25s;
}
.folio-cover-show :deep(.el-carousel__indicator--horizontal.is-active .el-carousel__button) {
  background: var(--color-primary);
  width: 40px;
}
@media (max-width: 768px) {
  .folio-covers { padding: 56px 16px 0; }
  .folio-cover-show { height: 260px; }
}
.folio-announcement {
  position: absolute;
  /* TplHero--split: max-width 1100px + padding 32px，等宽双栏 + gap 48px → 左栏 x 起点与宽度 */
  bottom: 20px;
  left: max(32px, calc(50% - 518px));
  width: min(420px, calc(50% - 80px));
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--pal-text-dim);
}
.folio-announcement :deep(.tpl-announcement-icon) { flex-shrink: 0; }
.folio-announcement :deep(.tpl-announcement-text) { word-break: break-word; }

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
  font-size: clamp(26px, 4vw, 32px);
  font-weight: 700;
  letter-spacing: -0.5px;
  text-align: center;
  color: var(--pal-text);
  margin: 0 0 48px;
}

/* F4: 留言板 — folio：内联文字块（极简编辑感，无边框，留白分隔） */
.folio-guestbook { max-width: 560px; }
.folio-guestbook :deep(.gb-form) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 40px;
}
.folio-guestbook :deep(.gb-input),
.folio-guestbook :deep(.gb-textarea) {
  padding: 12px 16px;
  border: 1px solid var(--pal-border);
  border-radius: 2px;
  background: transparent;
  color: var(--pal-text);
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s;
}
.folio-guestbook :deep(.gb-input:focus),
.folio-guestbook :deep(.gb-textarea:focus) {
  outline: none;
  border-color: var(--pal-text);
}
.folio-guestbook :deep(.gb-submit) {
  align-self: flex-start;
  padding: 12px 36px;
  border: none;
  border-radius: 2px;
  background: var(--pal-text);
  color: var(--pal-bg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.folio-guestbook :deep(.gb-submit:hover:not(:disabled)) { opacity: 0.85; }
.folio-guestbook :deep(.gb-submit:disabled) { opacity: 0.4; cursor: default; }
.folio-guestbook :deep(.gb-pending-hint) { margin: 0; font-size: 13px; color: var(--pal-text-dim); font-style: italic; }
.folio-guestbook :deep(.gb-item) { padding: 24px 0; border-top: 1px solid var(--pal-border); }
.folio-guestbook :deep(.gb-item:first-child) { border-top: none; padding-top: 0; }
.folio-guestbook :deep(.gb-item-head) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.folio-guestbook :deep(.gb-nickname) {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--pal-text);
}
.folio-guestbook :deep(.gb-time) { font-size: 12px; color: var(--pal-text-dim); }
.folio-guestbook :deep(.gb-content) { margin: 0; font-size: 15px; line-height: 1.8; color: var(--pal-text-dim); word-break: break-word; }
.folio-guestbook :deep(.gb-reply) { margin-top: 14px; padding-left: 18px; border-left: 2px solid var(--pal-border); }
.folio-guestbook :deep(.gb-reply-tag) {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--pal-text-dim);
  margin-bottom: 4px;
}
.folio-guestbook :deep(.gb-reply-content) { margin: 0; font-size: 14px; line-height: 1.7; color: var(--pal-text); font-style: italic; }
.folio-guestbook :deep(.gb-empty) { color: var(--pal-text-dim); font-size: 15px; font-style: italic; padding: 24px 0; }
.folio-guestbook :deep(.gb-load-more) {
  display: block;
  margin: 12px 0 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--pal-text-dim);
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
  transition: color 0.2s;
}
.folio-guestbook :deep(.gb-load-more:hover:not(:disabled)) { color: var(--pal-text); }
.folio-guestbook :deep(.gb-no-more) { font-size: 12px; color: var(--pal-text-dim); margin-top: 12px; }

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
  font-size: clamp(30px, 5vw, 40px);
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

/* R34: 外链（胶囊横排，呼应 CTA 999px 圆角语言） */
.folio-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.folio-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 18px;
  border: 1px solid var(--pal-border);
  border-radius: 999px;
  color: var(--pal-text-dim);
  text-decoration: none;
  font-size: 13px;
  transition: color 0.2s, border-color 0.2s, background 0.2s, transform 0.2s;
}
.folio-link:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  transform: translateY(-2px);
}
.folio-link-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--pal-bg-alt, var(--color-primary-soft));
  border: 1px solid var(--pal-border);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  color: var(--pal-text);
  transition: border-color 0.2s, background 0.2s;
}
.folio-link:hover .folio-link-badge {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

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
  /* F3: 移动端单栏，公告转内联（absolute 会与内容重叠） */
  .folio-announcement {
    position: static;
    width: auto;
    margin: 0 20px;
    padding: 10px 0 0;
  }
}
</style>
