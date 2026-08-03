<template>
  <div class="tpl-gallery-wrap">
    <!-- v0.35 F6: 档位筛选行（= 画师对外档位 + 全部；无档位数据时不显示，行为与现状一致） -->
    <div v-if="filters.length" class="tpl-gallery-filters" role="tablist">
      <button
        type="button"
        class="tpl-gallery-filter"
        :class="{ 'tpl-gallery-filter--on': activeSizeId == null }"
        @click="setFilter(null)"
      >
        {{ $t('gallery.filterAll') }}
      </button>
      <button
        v-for="f in filters" :key="f.sizeId"
        type="button"
        class="tpl-gallery-filter"
        :class="{ 'tpl-gallery-filter--on': activeSizeId === f.sizeId }"
        @click="setFilter(activeSizeId === f.sizeId ? null : f.sizeId)"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- v0.35 F6: 筛选后无作品（档位存在但没作品标注它） -->
    <p v-if="filters.length && !filteredArtworks.length" class="tpl-gallery-filter-empty">
      {{ $t('gallery.filterEmpty') }}
    </p>

    <!-- key 随筛选变化 → 淡出淡入平滑过渡，不整页刷新 -->
    <Transition name="tpl-gallery-swap" mode="out-in">
      <div :key="activeSizeId ?? 'all'" class="tpl-gallery" :class="`tpl-gallery--${layout}`">
        <div
          v-for="(art, index) in filteredArtworks"
          :key="art.id"
          class="tpl-gallery-item tpl-reveal"
        >
          <!-- #15: aspect-ratio 占位——后端返回 width/height 时精确预留高度，lazy 加载零 reflow；缺失时骨架兜底 -->
          <!-- v0.35 F6: 点击打开自定义 lightbox（大图 + 档位标签 + 描述）；hover 浮层桌面端显示标签 -->
          <div class="tpl-gallery-img-wrap" :style="ratioStyle(art)" @click="openLightbox(index)">
            <el-image
              :src="imgUrl(art.image_path)"
              fit="cover"
              class="tpl-gallery-img"
              :alt="art.title || $t('artistHome.artworks')"
              lazy
            >
              <!-- #50: 加载占位——无 width/height 时兜底防跳动 -->
              <template #placeholder>
                <div class="tpl-gallery-skeleton" />
              </template>
            </el-image>
            <!-- v0.35 F6: hover 浮层（仅桌面）——默认卡片干净无叠加，hover 才显示档位标签+描述；点浮层空白处开大图（一号审核补：原 @click.stop 无 handler 造成点击死区） -->
            <div v-if="hasGalleryMeta(art)" class="tpl-gallery-hover" @click.stop="openLightbox(index)">
              <p v-if="art.description" class="tpl-gallery-hover-desc">{{ art.description }}</p>
              <div v-if="tagsOf(art).length" class="tpl-gallery-hover-tags">
                <button
                  v-for="tag in tagsOf(art)" :key="tag.sizeId"
                  type="button" class="tpl-gallery-tag"
                  @click.stop="orderByTag(tag)"
                >
                  {{ tag.label }}
                </button>
              </div>
            </div>
          </div>
          <div class="tpl-gallery-meta">
            <p class="tpl-gallery-caption" v-if="art.title">{{ art.title }}</p>
            <!-- F1: 点赞（颜色/大小由模板 class 覆盖） -->
            <ArtworkLikeButton
              class="tpl-gallery-like"
              :artwork-id="art.id"
              :initial-count="art.like_count || 0"
              :liked="isLiked(art.id)"
              :subdomain="subdomain"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- v0.35 F6: 大图 lightbox（标签+描述只在这里和 hover 出现，网格小图保持干净） -->
    <el-dialog
      v-model="lightboxVisible"
      class="tpl-gallery-lightbox"
      width="min(860px, 92vw)"
      align-center
      destroy-on-close
      :aria-label="lightboxArt?.title || $t('artistHome.artworks')"
    >
      <div v-if="lightboxArt" class="tpl-lb-body">
        <div class="tpl-lb-stage">
          <button
            v-if="lightboxIndex > 0"
            type="button" class="tpl-lb-arrow tpl-lb-arrow--prev"
            :aria-label="$t('gallery.prev')"
            @click="lightboxIndex--"
          >
            ‹
          </button>
          <el-image
            :src="imgUrl(lightboxArt.image_path)"
            fit="contain"
            class="tpl-lb-img"
            :alt="lightboxArt.title || $t('artistHome.artworks')"
            :preview-src-list="[imgUrl(lightboxArt.image_path)]"
            preview-teleported
            hide-on-click-modal
          />
          <button
            v-if="lightboxIndex < filteredArtworks.length - 1"
            type="button" class="tpl-lb-arrow tpl-lb-arrow--next"
            :aria-label="$t('gallery.next')"
            @click="lightboxIndex++"
          >
            ›
          </button>
        </div>
        <div class="tpl-lb-info">
          <div class="tpl-lb-head">
            <p v-if="lightboxArt.title" class="tpl-lb-title">{{ lightboxArt.title }}</p>
            <ArtworkLikeButton
              class="tpl-gallery-like"
              :artwork-id="lightboxArt.id"
              :initial-count="lightboxArt.like_count || 0"
              :liked="isLiked(lightboxArt.id)"
              :subdomain="subdomain"
            />
          </div>
          <!-- v0.35 F6: 自由描述（画师在作品管理填写；mock 阶段为占位文案） -->
          <p v-if="lightboxArt.description" class="tpl-lb-desc">{{ lightboxArt.description }}</p>
          <!-- v0.35 F6: 档位标签（可点击 → 下单页预选该档位，复用 F4 跳第三步） -->
          <div v-if="lightboxTags.length" class="tpl-lb-tags">
            <span class="tpl-lb-tags-label">{{ $t('gallery.tierTag') }}</span>
            <button
              v-for="tag in lightboxTags" :key="tag.sizeId"
              type="button" class="tpl-gallery-tag"
              @click="orderByTag(tag)"
            >
              {{ tag.label }}
            </button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistData, deriveGalleryFilters, filterArtworksBySize } from '../../composables/useArtistData.js'
import ArtworkLikeButton from '../shared/ArtworkLikeButton.vue'

const props = defineProps({
  artworks: { type: Array, default: () => [] },
  /** grid: 等高网格 | editorial: 大小交错 | masonry: 瀑布流（v0.19 默认） */
  layout: { type: String, default: 'masonry' },
  /** F1: 点赞 localStorage 按画师隔离（huiyue_liked_${subdomain}） */
  subdomain: { type: String, default: '' },
  /** v0.35 F6: 画风列表 → 派生画廊筛选标签（对外档位）；空数组=不显示筛选行 */
  styles: { type: Array, default: () => [] }
})

const { imgUrl } = useArtistData(props)
const router = useRouter()

// ─── v0.35 F6: 档位筛选 ───
const filters = computed(() => deriveGalleryFilters(props.styles))
const activeSizeId = ref(null)
function setFilter(sizeId) {
  activeSizeId.value = sizeId
}
/** 当前显示的作品：默认全部混编；选中档位 → 只显示标注该档位的作品 */
const filteredArtworks = computed(() => filterArtworksBySize(props.artworks, activeSizeId.value))

/**
 * 作品的档位标签：art.tags（尺寸 id 数组）→ 映射到筛选条目（含 styleId/label）。
 * 档位被画师删除后 tags 里的 id 在 filters 中查不到 → 自动失效不残留（REQ-024 F6 验收 8）。
 */
const tagIndex = computed(() => new Map(filters.value.map(f => [f.sizeId, f])))
function tagsOf(art) {
  if (!Array.isArray(art.tags)) return []
  return art.tags.map(id => tagIndex.value.get(id)).filter(Boolean)
}
/** 有描述或档位标签才算有展示元数据（hover 浮层/lightbox 信息区显示依据） */
function hasGalleryMeta(art) {
  return !!art.description || tagsOf(art).length > 0
}

// ─── v0.35 F6: 大图 lightbox ───
const lightboxVisible = ref(false)
const lightboxIndex = ref(0)
const lightboxArt = computed(() => filteredArtworks.value[lightboxIndex.value] || null)
const lightboxTags = computed(() => (lightboxArt.value ? tagsOf(lightboxArt.value) : []))
function openLightbox(index) {
  lightboxIndex.value = index
  lightboxVisible.value = true
}

/** v0.35 F6: 点档位标签 → 下单页预选「画风+尺寸」（复用 F4 入口 A 逻辑，齐选直跳第三步） */
function orderByTag(tag) {
  lightboxVisible.value = false
  router.push({
    path: `/artist/${props.subdomain}/order`,
    query: { styleId: tag.styleId, sizeId: tag.sizeId }
  })
}

// #15: 后端返回 width/height 时生成 aspect-ratio 样式，精确预留高度防 reflow；缺失时返回空对象，骨架兜底
function ratioStyle(art) {
  return art.width && art.height ? { aspectRatio: `${art.width} / ${art.height}` } : {}
}

// F1: 初始已赞集合（localStorage，按画师隔离）
function readLikedIds() {
  try {
    const raw = localStorage.getItem(`huiyue_liked_${props.subdomain}`)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? new Set(ids) : new Set()
  } catch { return new Set() }
}
const likedIds = readLikedIds()
function isLiked(id) { return likedIds.has(id) }
</script>

<style scoped>
/* ===== v0.35 F6: 筛选行（全部 + 对外档位；视觉用设计系统变量，4 模板自动适配） ===== */
.tpl-gallery-filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 28px;
}
.tpl-gallery-filter {
  padding: 6px 16px;
  border: 1px solid var(--pal-border);
  border-radius: 999px;
  background: var(--pal-surface);
  color: var(--pal-text-dim);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.tpl-gallery-filter:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.tpl-gallery-filter--on {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--pal-surface));
  color: var(--color-primary);
  font-weight: 600;
}
.tpl-gallery-filter-empty {
  text-align: center;
  color: var(--pal-text-dim);
  font-size: 13px;
  padding: 40px 0;
  margin: 0;
}
/* 筛选切换淡出淡入 */
.tpl-gallery-swap-enter-active,
.tpl-gallery-swap-leave-active {
  transition: opacity 0.22s ease;
}
.tpl-gallery-swap-enter-from,
.tpl-gallery-swap-leave-to {
  opacity: 0;
}

/* ===== grid：等高网格（classic）===== */
.tpl-gallery--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.tpl-gallery--grid .tpl-gallery-img {
  width: 100%;
  height: auto;
  border-radius: 10px;
  cursor: zoom-in;
}

/* ===== editorial：大小交错（gallery）===== */
.tpl-gallery--editorial {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
}
.tpl-gallery--editorial .tpl-gallery-item {
  width: 82%;
  text-align: center;
}
.tpl-gallery--editorial .tpl-gallery-item:nth-child(even) {
  width: 56%;
  align-self: flex-end;
  margin-right: 6%;
}
.tpl-gallery--editorial .tpl-gallery-img {
  width: 100%;
  height: auto;
  cursor: zoom-in;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.tpl-gallery--editorial .tpl-gallery-item:hover .tpl-gallery-img {
  transform: scale(1.02);
}

/* ===== masonry：瀑布流（folio）===== */
.tpl-gallery--masonry {
  columns: 2;
  column-gap: 20px;
}
.tpl-gallery--masonry .tpl-gallery-item {
  break-inside: avoid;
  margin-bottom: 20px;
  background: var(--pal-surface);
  overflow: hidden;
  border-radius: 4px;
}
.tpl-gallery--masonry .tpl-gallery-img {
  width: 100%;
  display: block;
  cursor: zoom-in;
}

/* ===== 通用 ===== */
/* #15: aspect-ratio 占位容器——有 width/height 时撑出精确高度，el-image 填满；缺失时高度由内容决定，骨架兜底 */
.tpl-gallery-img-wrap {
  width: 100%;
  position: relative; /* v0.35 F6: hover 浮层定位锚点 */
}
.tpl-gallery-img-wrap .tpl-gallery-img {
  display: block;
  height: 100%;
}
/* #15: 有 aspect-ratio 时占位区填满容器（无 ratio 时高度链为 auto，由骨架 min-height 兜底） */
.tpl-gallery-img-wrap :deep(.el-image__placeholder) { height: 100%; }
/* #50: 加载骨架占位——无 width/height 时兜底防瀑布流跳动 */
.tpl-gallery-skeleton {
  width: 100%;
  height: 100%;
  min-height: 200px;
  background: linear-gradient(110deg, var(--pal-surface) 30%, var(--pal-border) 50%, var(--pal-surface) 70%);
  background-size: 200% 100%;
  animation: tpl-gallery-shimmer 1.5s ease-in-out infinite;
}
@keyframes tpl-gallery-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.tpl-gallery-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 12px 0 0;
}
.tpl-gallery-caption {
  margin: 0;
  font-size: 13px;
  color: var(--pal-text-dim);
  flex: 1;
  min-width: 0;
}
/* F1: 点赞按钮基线（颜色/大小由模板 class 覆盖） */
.tpl-gallery-like {
  font-size: 14px;
  color: var(--pal-text-dim);
  flex-shrink: 0;
  transition: color 0.2s;
}
.tpl-gallery-like:hover { color: var(--color-primary); }
.tpl-gallery--masonry .tpl-gallery-meta {
  padding: 12px 16px;
  margin: 0;
}

/* ===== v0.35 F6: hover 浮层（桌面端）——默认隐藏，卡片保持干净 ===== */
.tpl-gallery-hover {
  position: absolute;
  inset: auto 0 0 0;
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: color-mix(in srgb, #000 62%, transparent);
  color: #fff;
  cursor: default;
}
.tpl-gallery-hover-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tpl-gallery-hover-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
@media (hover: hover) {
  .tpl-gallery-img-wrap:hover .tpl-gallery-hover {
    display: flex;
  }
}

/* v0.35 F6: 档位标签（hover 浮层 + lightbox 共用；深色底白字，点击跳下单预选） */
.tpl-gallery-tag {
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, #fff 55%, transparent);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.tpl-gallery-tag:hover {
  background: #fff;
  color: #222;
}

/* ===== v0.35 F6: lightbox 内容（el-dialog 壳，样式穿透定制） ===== */
.tpl-lb-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tpl-lb-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  background: var(--pal-bg, transparent);
}
.tpl-lb-img {
  max-height: 62vh;
  width: 100%;
  cursor: zoom-in;
}
.tpl-lb-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 36px;
  height: 36px;
  border: 1px solid var(--pal-border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--pal-surface) 82%, transparent);
  color: var(--pal-text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
}
.tpl-lb-arrow:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.tpl-lb-arrow--prev { left: 8px; }
.tpl-lb-arrow--next { right: 8px; }
.tpl-lb-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tpl-lb-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.tpl-lb-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--pal-text);
  font-family: var(--font-display, inherit);
}
.tpl-lb-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--pal-text-dim);
  word-break: break-word;
}
.tpl-lb-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--pal-border);
}
.tpl-lb-tags-label {
  font-size: 12px;
  color: var(--pal-text-dim);
  margin-right: 2px;
}
/* lightbox 内的标签改用主题色描边（白底/暗底均可辨） */
.tpl-lb-tags .tpl-gallery-tag {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.tpl-lb-tags .tpl-gallery-tag:hover {
  background: var(--color-primary);
  color: #fff;
}

@media (max-width: 768px) {
  .tpl-gallery--editorial .tpl-gallery-item,
  .tpl-gallery--editorial .tpl-gallery-item:nth-child(even) {
    width: 100%;
    margin-right: 0;
  }
  .tpl-gallery--masonry {
    columns: 1;
  }
  .tpl-gallery-filters {
    justify-content: flex-start;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .tpl-gallery-filter {
    flex-shrink: 0;
  }
}
</style>
