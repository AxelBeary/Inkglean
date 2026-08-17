<template>
  <div v-if="artist" class="folio" ref="rootEl">
    <!-- 固定导航（滚动侦测高亮 + 移动端汉堡） -->
    <nav class="folio-nav">
      <span class="folio-nav-brand">{{ artist.name }}</span>
      <button class="folio-nav-burger" @click="menuOpen = !menuOpen" :aria-label="t('artistHome.menuLabel')">
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
    <!-- P2-3: 无作品空态 -->
    <section id="gallery" class="folio-section tpl-reveal" v-else>
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('artistHome.artworks') }}</h2>
        <div class="folio-empty">{{ $t('artistHome.noWorks') }}</div>
      </div>
    </section>

    <!-- P1-B 收敛：价格档位 + 流程 + 修改说明 → 共享 TplPricingSection（外观零变） -->
    <TplPricingSection
      section-id="pricing"
      class="folio-section folio-section--alt tpl-reveal"
      inner-class="folio-inner"
      :styles="styles"
      :tiers="tiers"
      :workflow-stages="workflowStages"
      :revision-note="artist.revisionNote"
      :subdomain="subdomain"
      :artist="artist"
    >
      <template #title>
        <h2 class="folio-title">{{ $t('artistHome.priceList') }}</h2>
      </template>
    </TplPricingSection>

    <!-- 须知 -->
    <section id="rules" class="folio-section folio-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- F4: 留言板 -->
    <section id="guestbook" class="folio-section tpl-reveal" v-if="artist.guestbookEnabled !== false">
      <div class="folio-inner">
        <h2 class="folio-title">{{ $t('guestbook.title') }}</h2>
        <TplGuestbook :subdomain="subdomain" theme="inline" :enabled="artist.guestbookEnabled !== false" />
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
          <!-- REQ-042: 页脚合规入口（隐私/条款 + 举报） -->
          <ComplianceFooterLinks />
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
  platforms: { type: Array, default: () => [] } // REQ-022 F2: 社交平台列表（页脚链接平台名/图标渲染）
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
  // 820-L：留言功能关闭时导航不出现留言锚点
  if (props.artist?.guestbookEnabled !== false) items.push({ id: 'guestbook', label: t('artistHome.navGuestbook') })
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
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
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
  transition: color var(--dur-mid);
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
  transition: background var(--dur-mid);
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
  transition: var(--dur-slow);
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
.folio-empty { text-align: center; color: var(--pal-text-dim); font-size: 15px; letter-spacing: 0.03em; padding: 40px 0 64px; }
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
  /* T 波：hover 禁位移——位移换背景加深 */
  transition: background var(--dur-mid);
}
.folio-cta-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
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
  /* T 波：active 禁位移——位移换阴影加深 */
  transition: color var(--dur-mid), border-color var(--dur-mid), background var(--dur-mid), box-shadow var(--dur-mid);
}
.folio-link:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.folio-link:active { box-shadow: var(--shadow-card-hover); }
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
  transition: border-color var(--dur-mid), background var(--dur-mid);
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
    transition: transform var(--dur-slow);
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
