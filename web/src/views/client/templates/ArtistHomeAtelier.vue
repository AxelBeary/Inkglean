<template>
  <div v-if="artist" class="atelier" ref="rootEl">
    <!-- Opening: art-book-cover vibe (F3: announcement as a sticky-note card in the bottom-right, avoiding the plaque in the bottom-left) -->
    <div class="atelier-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="fullscreen" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="atelier-announcement" />
    </div>

    <!-- 作品画廊：画册式大留白 -->
    <section class="atelier-section tpl-reveal" v-if="galleryArtworks.length">
      <p class="tpl-section-label atelier-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery :artworks="galleryArtworks" :gallery="gallery" :subdomain="subdomain" />
    </section>

    <!-- 价格档位 + 流程（R1 整合） -->
    <section class="atelier-section atelier-section--alt tpl-reveal" v-if="styles.length || tiers.length || workflowStages.length">
      <div class="atelier-inner">
        <!-- v0.32 REQ-023 Phase3: 有画风数据 → TplStyleGrid；无画风 → 现有 TplTierGrid 兜底 -->
        <template v-if="styles.length">
          <p class="tpl-section-label atelier-label">{{ $t('artistHome.priceList') }}</p>
          <TplStyleGrid :styles="styles" :subdomain="subdomain" />
        </template>
        <template v-else-if="tiers.length">
          <p class="tpl-section-label atelier-label">{{ $t('artistHome.priceList') }}</p>
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
    <section class="atelier-section atelier-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- F4: 留言板 -->
    <section class="atelier-section tpl-reveal">
      <p class="tpl-section-label atelier-label">{{ $t('guestbook.title') }}</p>
      <TplGuestbook :subdomain="subdomain" class="atelier-guestbook" />
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
      <!-- R58-8: 平台链接（画册式横排，与外链共用视觉语言） -->
      <div class="atelier-links" v-if="platformLinks.length">
        <a
          v-for="link in platformLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="atelier-link"
        >
          <span class="atelier-link-badge" aria-hidden="true">{{ link.badge }}</span>
          {{ link.label }}
        </a>
      </div>
      <Disclaimer />
    </footer>

    <!-- 吸底约稿条 -->
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
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object,
  gallery: Object // v0.35 联调：画廊端点数据（size_tags/filterSizes）
})

const { socialLinks, platformLinks, galleryArtworks } = useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素
const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)

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

/* F3: Hero wrapper (relative container for the announcement overlay) */
.atelier-hero-wrap { position: relative; z-index: 1; }

/* v0.25 A: 封面精选 — atelier：画册式拍立得，白边厚衬 + 微旋转 + 深阴影，手作温度 */
.atelier-covers {
  max-width: 760px;
  margin: 0 auto;
  padding: 80px 24px 0;
}
.atelier-cover-polaroid {
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  padding: 14px 14px 20px;
  transform: rotate(-0.8deg);
  box-shadow: 0 20px 48px color-mix(in srgb, var(--pal-text) 18%, transparent);
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s;
}
.atelier-cover-polaroid:hover {
  transform: rotate(0deg) translateY(-4px);
  box-shadow: 0 28px 64px color-mix(in srgb, var(--pal-text) 24%, transparent);
}
.atelier-cover-show {
  height: 400px;
  overflow: hidden;
}
.atelier-cover-show :deep(.el-carousel__arrow) {
  background: color-mix(in srgb, var(--pal-surface) 80%, transparent);
  color: var(--pal-text);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: background 0.2s, color 0.2s, transform 0.2s;
}
.atelier-cover-show :deep(.el-carousel__arrow:hover) {
  background: var(--color-primary);
  color: var(--pal-bg);
  transform: scale(1.1);
}
.atelier-cover-show :deep(.el-carousel__indicators--outside) { margin-top: 14px; }
.atelier-cover-show :deep(.el-carousel__indicator--horizontal .el-carousel__button) {
  background: var(--pal-text-dim);
  opacity: 0.3;
  border-radius: 50%;
  width: 8px;
  height: 8px;
  transition: opacity 0.2s, background 0.2s, transform 0.2s;
}
.atelier-cover-show :deep(.el-carousel__indicator--horizontal.is-active .el-carousel__button) {
  background: var(--color-primary);
  opacity: 1;
  transform: scale(1.3);
}
@media (max-width: 768px) {
  .atelier-covers { padding: 56px 16px 0; }
  .atelier-cover-show { height: 240px; }
  .atelier-cover-polaroid { transform: none; }
}
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
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 13px;
  line-height: 1.7;
  color: var(--pal-text);
  transition: transform 0.25s ease;
}
.atelier-announcement:hover { transform: rotate(0deg); }
.atelier-announcement :deep(.tpl-announcement-text) { word-break: break-word; }

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

/* F4: 留言板 — atelier：纸面留言条（宋体、米色卡片、微旋转，手账感） */
.atelier-guestbook { max-width: 600px; margin: 0 auto; }
.atelier-guestbook :deep(.gb-form) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 36px;
}
.atelier-guestbook :deep(.gb-input),
.atelier-guestbook :deep(.gb-textarea) {
  padding: 12px 14px;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
  color: var(--pal-text);
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.2s;
}
.atelier-guestbook :deep(.gb-input:focus),
.atelier-guestbook :deep(.gb-textarea:focus) {
  outline: none;
  border-color: var(--atelier-accent);
}
.atelier-guestbook :deep(.gb-submit) {
  align-self: flex-start;
  padding: 10px 30px;
  border: 1px solid var(--atelier-accent);
  background: transparent;
  color: var(--atelier-accent);
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.25s, color 0.25s;
}
.atelier-guestbook :deep(.gb-submit:hover:not(:disabled)) { background: var(--atelier-accent); color: var(--pal-bg); }
.atelier-guestbook :deep(.gb-submit:disabled) { opacity: 0.4; cursor: default; }
.atelier-guestbook :deep(.gb-pending-hint) { margin: 0; font-size: 13px; color: var(--atelier-accent); }
.atelier-guestbook :deep(.gb-item) {
  padding: 18px 20px;
  background: var(--pal-surface);
  border: 1px solid var(--pal-border);
  border-top: 3px solid var(--atelier-accent);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--pal-text) 10%, transparent);
  margin-bottom: 16px;
  transform: rotate(-0.4deg);
  transition: transform 0.25s ease;
}
.atelier-guestbook :deep(.gb-item:nth-child(even)) { transform: rotate(0.4deg); }
.atelier-guestbook :deep(.gb-item:hover) { transform: rotate(0deg); }
.atelier-guestbook :deep(.gb-item-head) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.atelier-guestbook :deep(.gb-nickname) {
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--pal-text);
}
.atelier-guestbook :deep(.gb-time) { font-size: 11px; color: var(--pal-text-dim); }
.atelier-guestbook :deep(.gb-content) {
  margin: 0;
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 14px;
  line-height: 1.9;
  color: var(--pal-text);
  word-break: break-word;
}
.atelier-guestbook :deep(.gb-reply) {
  margin-top: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--atelier-accent) 8%, transparent);
  border-left: 2px solid var(--atelier-accent);
}
.atelier-guestbook :deep(.gb-reply-tag) {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--atelier-accent);
  margin-bottom: 4px;
}
.atelier-guestbook :deep(.gb-reply-content) {
  margin: 0;
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 13px;
  line-height: 1.8;
  color: var(--pal-text);
}
.atelier-guestbook :deep(.gb-empty) {
  color: var(--pal-text-dim);
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 14px;
  text-align: center;
  padding: 28px 0;
}
.atelier-guestbook :deep(.gb-load-more) {
  display: block;
  margin: 8px auto 0;
  padding: 8px 26px;
  border: 1px solid var(--pal-border);
  background: transparent;
  color: var(--pal-text-dim);
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.atelier-guestbook :deep(.gb-load-more:hover:not(:disabled)) { border-color: var(--atelier-accent); color: var(--atelier-accent); }
.atelier-guestbook :deep(.gb-no-more) {
  text-align: center;
  font-size: 12px;
  color: var(--pal-text-dim);
  font-family: 'Noto Serif SC', 'STSong', 'SimSun', serif;
  margin-top: 8px;
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
