<template>
  <div v-if="artist" class="atelier" ref="rootEl">
    <!-- Opening: art-book-cover vibe (F3: announcement as a sticky-note card in the bottom-right, avoiding the plaque in the bottom-left) -->
    <div class="atelier-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" :platforms="platforms" variant="fullscreen" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="atelier-announcement" />
    </div>

    <!-- v0.36: 作品画廊——画册式左右翻页（Atelier：画室纸片感——白衬厚边微旋转，宋体题注） -->
    <section class="atelier-section tpl-reveal" v-if="galleryArtworks.length">
      <p class="tpl-section-label atelier-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery :artworks="galleryArtworks" :gallery="gallery" :subdomain="subdomain" layout="album" />
    </section>
    <!-- P2-3: 无作品空态 -->
    <section class="atelier-section tpl-reveal" v-else>
      <p class="tpl-section-label atelier-label">{{ $t('artistHome.artworks') }}</p>
      <div class="atelier-empty">{{ $t('artistHome.noWorks') }}</div>
    </section>

    <!-- P1-B 收敛：价格档位 + 流程 + 修改说明 → 共享 TplPricingSection（外观零变） -->
    <TplPricingSection
      class="atelier-section atelier-section--alt tpl-reveal"
      inner-class="atelier-inner"
      :styles="styles"
      :tiers="tiers"
      :workflow-stages="workflowStages"
      :revision-note="artist.revisionNote"
      :subdomain="subdomain"
      :artist="artist"
    >
      <template #title>
        <p class="tpl-section-label atelier-label">{{ $t('artistHome.priceList') }}</p>
      </template>
    </TplPricingSection>

    <!-- 约稿须知 -->
    <section class="atelier-section atelier-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- F4: 留言板 -->
    <section class="atelier-section tpl-reveal" v-if="artist.guestbookEnabled !== false">
      <p class="tpl-section-label atelier-label">{{ $t('guestbook.title') }}</p>
      <TplGuestbook :subdomain="subdomain" theme="note" :enabled="artist.guestbookEnabled !== false" />
    </section>

    <!-- 页脚 -->
    <footer class="atelier-footer">
      <!-- REQ-022 F2: 页脚链接（外链/平台链接合一，画册式横排自动换行，新窗口打开） -->
      <div class="atelier-links" v-if="footerLinks.length">
        <a
          v-for="link in footerLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="atelier-link"
        >
          <span class="atelier-link-badge" aria-hidden="true">
            <TplPlatformIcon :icon-key="link.iconKey" :fallback-char="link.fallbackChar" />
          </span>
          {{ link.label }}
        </a>
      </div>
      <!-- REQ-042: 页脚合规入口（隐私/条款 + 举报） -->
      <ComplianceFooterLinks />
      <Disclaimer />
    </footer>

    <!-- 吸底约稿条 -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, inject, watch } from 'vue'
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

const { footerLinks, galleryArtworks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素（直接传 heroRef，异步组件挂载后 ref 更新会触发 watch）
const { visible: ctaVisible } = useStickyCta(heroRef)

// #55/61: 同步 CTA 避让状态给父级浮窗
const ctaRaised = inject('ctaRaised')
watch(ctaVisible, (v) => { ctaRaised.value = v }, { immediate: true })
</script>

<style scoped>
/* ─── 画册风布局 ─── */
.atelier {
  min-height: 100vh;
  background: var(--pal-bg);
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
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

/* F3: Hero wrapper (relative container for the announcement overlay) */
.atelier-hero-wrap { position: relative; z-index: 1; }

/* F3: Announcement — sticky-note paper feel + slight rotation (bottom-right, avoiding the plaque in the bottom-left) */
.atelier-announcement {
  position: absolute;
  right: 40px;
  bottom: 40px;
  z-index: 2;
  max-width: 280px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 18px;
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  border-top: 3px solid var(--atelier-accent);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--pal-text) 18%, transparent);
  transform: rotate(-1deg);
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.7;
  color: var(--pal-text);
  transition: transform var(--dur-mid) var(--ease-out);
}
.atelier-announcement:hover { box-shadow: 0 12px 28px color-mix(in srgb, var(--pal-text) 24%, transparent); }
.atelier-announcement :deep(.tpl-announcement-text) { word-break: break-word; }

/* U2: 窄屏公告回到文档流（absolute 会与展签/CTA 重叠） */
@media (max-width: 640px) {
  .atelier-announcement {
    position: relative;
    top: auto; left: auto; right: auto; bottom: auto;
    max-width: calc(100% - 32px);
    margin: 12px auto;
  }
}

.atelier-section {
  position: relative;
  z-index: 1;
  padding: 96px 24px;
}
/* 标题：思源宋体 + 手绘笔触下划线（装饰色） */
.atelier-empty { text-align: center; color: var(--pal-text-dim); font-size: 15px; letter-spacing: 0.03em; padding: 40px 0 64px; }
.atelier-label {
  font-family: var(--font-display);
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

/* v0.36: 画册翻页 — atelier：画室纸片感——白衬厚边拍立得装裱 + 微旋转（呼应封面拍立得与留言条语言），
   宋体题注，装饰色细线页码；hover 回正，手作温度 */
.atelier :deep(.tpl-album-frame) {
  padding: 14px;
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  box-shadow: 0 20px 48px color-mix(in srgb, var(--pal-text) 16%, transparent);
  transform: rotate(-0.8deg);
  transition: transform var(--dur-slow) cubic-bezier(0.22, 1, 0.36, 1), box-shadow var(--dur-slow);
}
.atelier :deep(.tpl-album-frame:hover) {
  transform: rotate(0deg);
  box-shadow: 0 26px 60px color-mix(in srgb, var(--pal-text) 22%, transparent);
}
.atelier :deep(.tpl-album-meta) {
  justify-content: center;
  gap: 14px;
  text-align: center;
}
.atelier :deep(.tpl-gallery-caption) {
  flex: 0 1 auto;
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--pal-text);
}
.atelier :deep(.tpl-album-arrow) {
  border-radius: 8px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--pal-text) 10%, transparent);
}
.atelier :deep(.tpl-album-counter) {
  font-family: var(--font-display);
  color: var(--atelier-accent);
  opacity: 0.85;
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
  transition: color var(--dur-mid);
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
  transition: opacity var(--dur-mid);
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
  transition: transform var(--dur-mid), border-color var(--dur-mid);
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
