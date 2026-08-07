<template>
  <div v-if="artist" class="gallery" ref="rootEl">
    <!-- Opening: fullscreen artwork + corner plaque (F3: announcement floats at top-left, avoiding the plaque at bottom-left) -->
    <div class="gallery-hero-wrap">
      <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" :platforms="platforms" variant="fullscreen" ref="heroRef" />
      <TplAnnouncement :artist="artist" class="gallery-announcement" />
    </div>

    <!-- v0.36: 作品画廊——画册式左右翻页（Gallery：大小交错 editorial 节奏——当前页大图居中，相邻页缩小侧露） -->
    <!-- v0.42 Step 6: 分页数据源（10/页 + 加载更多）；加载中隐藏画廊区避免「全量闪一帧」 -->
    <section class="gallery-section tpl-reveal" v-if="galleryForTpl.length">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery
        :artworks="galleryForTpl"
        :gallery="galleryFilterOnly"
        :subdomain="subdomain"
        layout="album"
        peek
        :total="total"
        :loading-more="loadingMore"
        @load-more="onLoadMore"
      />
    </section>
    <!-- P2-3: 无作品空态（分页加载中不显示，避免闪烁） -->
    <section class="gallery-section tpl-reveal" v-else-if="!pageLoading">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <div class="gallery-empty">{{ $t('artistHome.noWorks') }}</div>
    </section>

    <!-- 价格档位 + 流程（R1 整合） -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="styles.length || tiers.length || workflowStages.length">
      <div class="gallery-inner">
        <!-- v0.32 REQ-023 Phase3: 有画风数据 → TplStyleGrid；无画风 → 现有 TplTierGrid 兜底 -->
        <template v-if="styles.length">
          <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
          <TplStyleGrid :styles="styles" :subdomain="subdomain" :artist="artist" />
        </template>
        <template v-else-if="tiers.length">
          <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
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
      <!-- REQ-022 F2: 页脚链接（外链/平台链接合一，展签式横排自动换行，新窗口打开） -->
      <div class="gallery-links" v-if="footerLinks.length">
        <a
          v-for="link in footerLinks" :key="link.key"
          :href="link.url" target="_blank" rel="noopener noreferrer"
          class="gallery-link"
        >
          <span class="gallery-link-badge" aria-hidden="true">
            <TplPlatformIcon :icon-key="link.iconKey" :fallback-char="link.fallbackChar" />
          </span>
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
import { ref, inject, watch, computed, onMounted } from 'vue'
import { artistPublicApi } from '../../../api/index.js'
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

const { footerLinks, galleryArtworks } = useArtistData(props)

// ─── v0.42 Step 6: 作品分页（10/页 + 加载更多；封面置顶由后端排序保证） ───
const PAGE_SIZE = 10
const pagedArtworks = ref([])
const total = ref(0)
const loadingMore = ref(false)
const pageLoading = ref(false)

/**
 * size_tags 索引（F6 画廊端点全量数据，公开分页接口 items 不带 size_tags）。
 * 分页 items 到达后按 id 合并，保住档位筛选/大图标签（filterArtworksBySize 依赖 art.size_tags）。
 */
const sizeTagsById = computed(() => {
  const map = new Map()
  for (const a of props.gallery?.artworks || []) map.set(a.id, a.size_tags || [])
  return map
})

async function loadArtworks(reset = false) {
  if (reset) pageLoading.value = true
  else loadingMore.value = true
  try {
    const page = reset ? 1 : Math.ceil(pagedArtworks.value.length / PAGE_SIZE) + 1
    const res = await artistPublicApi.getPublicArtworksPaged(props.artist?.id, { page, pageSize: PAGE_SIZE })
    const items = (res.items || []).map(a => ({
      ...a,
      size_tags: sizeTagsById.value.get(a.id) || []
    }))
    pagedArtworks.value = reset ? items : [...pagedArtworks.value, ...items]
    total.value = res.total || 0
  } catch {
    // 静默失败：分页不可用时回退全量（galleryArtworks 兜底），行为与现状一致
    pagedArtworks.value = []
    total.value = 0
  } finally {
    pageLoading.value = false
    loadingMore.value = false
  }
}

function onLoadMore() { loadArtworks(false) }

/** 展示数据：分页累积优先；分页失败/加载中回退全量兜底 */
const galleryForTpl = computed(() => {
  if (pagedArtworks.value.length) return pagedArtworks.value
  return pageLoading.value ? [] : galleryArtworks.value
})

/** TplGallery 只消费 filterSizes（筛选行）+ 空 artworks——避免其优先用 gallery.artworks 全量，分页才生效 */
const galleryFilterOnly = computed(() => ({
  filterSizes: props.gallery?.filterSizes || []
}))

// 首载 + 画师切换重载
onMounted(() => { if (props.artist?.id) loadArtworks(true) })
watch(() => props.artist?.id, () => { loadArtworks(true) })

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
.gallery-announcement :deep(.tpl-announcement-text) { word-break: break-word; }

/* U2: 窄屏公告回到文档流（absolute 会与展签/CTA 重叠） */
@media (max-width: 640px) {
  .gallery-announcement {
    position: relative;
    top: auto; left: auto; right: auto; bottom: auto;
    max-width: calc(100% - 32px);
    margin: 12px auto;
  }
}

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
.gallery-empty { text-align: center; color: var(--pal-text-dim); font-size: 14px; letter-spacing: 0.05em; padding: 48px 0 72px; }
.gallery-label {
  text-align: center;
  margin-bottom: 48px;
}

/* v0.36: 画册翻页 — gallery：大小交错（editorial）节奏——当前页直角细线框装裱，
   相邻页缩小侧露（用户点名的视觉）；展签式页码，美术馆克制感 */
.gallery :deep(.tpl-album-frame) {
  padding: 10px;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
}
.gallery :deep(.tpl-album-meta) {
  padding-top: 14px;
}
.gallery :deep(.tpl-gallery-caption) {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.gallery :deep(.tpl-album-counter) {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
/* 侧露页：缩小（58% 高）+ 直角细线框 + 半透明，hover 提亮引导点击 */
.gallery :deep(.tpl-album-peek) {
  width: 13%;
  height: 58%;
  border: 1px solid var(--pal-border);
  background: var(--pal-surface);
  padding: 4px;
  opacity: 0.55;
}
.gallery :deep(.tpl-album-peek:hover) {
  opacity: 0.95;
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
.gallery-guestbook :deep(.gb-input:focus-visible),
.gallery-guestbook :deep(.gb-textarea:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
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
