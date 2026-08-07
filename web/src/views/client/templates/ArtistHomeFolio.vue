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
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" :platforms="platforms" variant="split" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="folio-announcement" />
    </div>

    <!-- v0.36: 作品——画册式左右翻页（沉浸暗调：图占满画幅，元信息压角）；历史注释"瀑布流"为 v0.19 前遗留，实际早已统一走共享组件 -->
    <section id="gallery" class="folio-section tpl-reveal" v-if="galleryArtworks.length">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('artistHome.artworks') }}</h2>
        <TplGallery :artworks="galleryArtworks" :gallery="gallery" :subdomain="subdomain" />
      </div>
    </section>

    <!-- 价格 + 流程（R1 整合） -->
    <section id="pricing" class="folio-section folio-section--alt tpl-reveal" v-if="styles.length || tiers.length || workflowStages.length">
      <div class="folio-inner">
        <!-- v0.32 REQ-023 Phase3: 有画风数据 → TplStyleGrid；无画风 → 现有 TplTierGrid 兜底 -->
        <template v-if="styles.length">
          <h2 class="folio-title">{{ $t('artistHome.priceList') }}</h2>
          <TplStyleGrid :styles="styles" :subdomain="subdomain" :artist="artist" />
        </template>
        <template v-else-if="tiers.length">
          <h2 class="folio-title">{{ $t('artistHome.priceList') }}</h2>
          <TplTierGrid :tiers="tiers" :subdomain="subdomain" :artist="artist">
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
          <!-- REQ-022 F2: 页脚链接（外链/平台链接合一，胶囊横排自动换行，新窗口打开） -->
          <div class="folio-links" v-if="footerLinks.length">
            <a
              v-for="link in footerLinks" :key="link.key"
              :href="link.url" target="_blank" rel="noopener noreferrer"
              class="folio-link"
            >
              <span class="folio-link-badge" aria-hidden="true">
                <TplPlatformIcon :icon-key="link.iconKey" :fallback-char="link.fallbackChar" />
              </span>
              {{ link.label }}
            </a>
          </div>
          <Disclaimer />
        </div>
      </div>
    </section>

    <!-- 吸底约稿条 -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import TplPlatformIcon from '../../../components/shared/TplPlatformIcon.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  artist: Object, tiers: Array, styles: Array, artworks: Array, rules: String,
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object,
  gallery: Object, // v0.35 联调：画廊端点数据（size_tags/filterSizes）
  platforms: Array // REQ-022 F2: 社交平台列表（页脚链接平台名/图标渲染）
})

const { t } = useI18n()
const { footerLinks, galleryArtworks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
const menuOpen = ref(false)
const activeSection = ref('')
useScrollReveal(rootEl)

// 吸底 CTA：直接传 heroRef，异步组件挂载后 ref 更新会触发 watch
const { visible: ctaVisible } = useStickyCta(heroRef)

// #55/61: 同步 CTA 避让状态给父级浮窗
const ctaRaised = inject('ctaRaised')
watch(ctaVisible, (v) => { ctaRaised.value = v }, { immediate: true })

const navItems = computed(() => {
  const items = []
  if (galleryArtworks.value.length) items.push({ id: 'gallery', label: t('artistHome.navWork') })
  if (props.styles.length || props.tiers.length || props.workflowStages.length) items.push({ id: 'pricing', label: t('artistHome.navPricing') })
  if (props.rules) items.push({ id: 'rules', label: t('artistHome.navRules') })
  items.push({ id: 'guestbook', label: t('artistHome.navGuestbook') })
  return items
})

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

/* v0.36 修正: 画廊恢复瀑布流（masonry）——Folio：沉浸暗调，无边框满幅卡片，题注压卡片内右下角（编辑感） */
.folio :deep(.tpl-gallery--masonry) {
  column-gap: 28px;
}
.folio :deep(.tpl-gallery--masonry .tpl-gallery-item) {
  border-radius: 0;
  background: transparent;
}
.folio :deep(.tpl-gallery-meta) {
  gap: 12px;
}
.folio :deep(.tpl-gallery-caption) {
  color: var(--pal-text);
  font-size: 12px;
  letter-spacing: 0.05em;
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
.folio-guestbook :deep(.gb-input:focus-visible),
.folio-guestbook :deep(.gb-textarea:focus-visible) {
  outline: 2px solid var(--pal-text);
  outline-offset: 2px;
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
