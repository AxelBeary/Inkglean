<template>
  <div class="tpl-gallery-wrap">
    <!-- v0.35 F6: 档位筛选行（= 画师对外档位 + 全部；无档位数据时不显示，行为与现状一致） -->
    <div v-if="filters.length" class="tpl-gallery-filters" role="tablist">
      <button
        type="button"
        class="tpl-gallery-filter"
        :class="{ 'tpl-gallery-filter--on': activeSizeId == null }"
        role="tab"
        :aria-selected="activeSizeId == null"
        @click="setFilter(null)"
      >
        {{ $t('gallery.filterAll') }}
      </button>
      <button
        v-for="f in filters" :key="f.sizeId"
        type="button"
        class="tpl-gallery-filter"
        :class="{ 'tpl-gallery-filter--on': activeSizeId === f.sizeId }"
        role="tab"
        :aria-selected="activeSizeId === f.sizeId"
        @click="setFilter(activeSizeId === f.sizeId ? null : f.sizeId)"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- 打磨批：空态条件放宽为「当前筛选结果为空」即显示（无筛选行时兜底「还没有作品」）；
         单档位选中沿用「该档位下暂时没有作品」；全部/无筛选时用通用文案 -->
    <p v-if="!filteredArtworks.length" class="tpl-gallery-filter-empty">
      {{ activeSizeId == null ? $t('gallery.filterEmptyAll') : $t('gallery.filterEmpty') }}
    </p>

    <!-- key 随筛选变化 → 淡出淡入平滑过渡，不整页刷新；筛选切换同时把翻页重置到第一张 -->
    <Transition name="tpl-gallery-swap" mode="out-in">
      <!-- v0.36 修正: 画廊布局按模板区分——album 画册翻页（Gallery/Atelier）与瀑布流（Classic/Folio）并存，用户拍板恢复 -->
      <!-- G 批巨型文件拆分：album 画册模式整体搬至 gallery/TplAlbumStage.vue（模板/class/样式一字未改），
           页码 v-model 双向，数据/点赞/灯箱函数由本页注入；样式取值口径见子组件头注 -->
      <TplAlbumStage
        v-if="layout === 'album'"
        :key="'album-' + (activeSizeId ?? 'all')"
        v-model:index="currentIndex"
        :filtered-artworks="filteredArtworks"
        :subdomain="subdomain"
        :peek="peek"
        :lightbox-open="lightboxVisible"
        :img-url="imgUrl"
        :is-liked="isLiked"
        :display-like-count="displayLikeCount"
        :on-like-toggle="onLikeToggle"
        :on-like-count="onLikeCount"
        :open-lightbox="openLightbox"
      />

      <!-- v0.36 修正: 瀑布流布局（Classic 等高网格 / Folio 瀑布流）——稳定不闪，恢复 v0.35 行为 -->
      <div
        v-else
        :key="'flow-' + (activeSizeId ?? 'all')"
        class="tpl-gallery"
        :class="`tpl-gallery--${layout}`"
      >
        <div
          v-for="(art, index) in filteredArtworks"
          :key="art.id"
          class="tpl-gallery-item tpl-reveal"
          :style="{ '--i': index }"
        >
          <!-- #15: aspect-ratio 占位——有 width/height 时精确预留高度，lazy 加载零跳动 -->
          <div
            class="tpl-gallery-img-wrap" :style="ratioStyle(art)"
            role="button" tabindex="0"
            :aria-label="art.title || $t('artistHome.artworks')"
            @click="openLightbox(index)"
            @keydown.enter.prevent="openLightbox(index)"
            @keydown.space.prevent="openLightbox(index)"
          >
            <el-image
              :src="imgUrl(art.image_path)"
              fit="cover"
              class="tpl-gallery-img"
              :alt="art.title || $t('artistHome.artworks')"
              lazy
            >
              <template #placeholder>
                <div class="tpl-gallery-skeleton" aria-hidden="true" />
              </template>
            </el-image>
            <!-- hover 浮层：档位标签+描述（桌面端），点浮层空白处开大图 -->
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
            <ArtworkLikeButton
              class="tpl-gallery-like"
              :artwork-id="art.id"
              :initial-count="displayLikeCount(art)"
              :liked="isLiked(art.id)"
              :subdomain="subdomain"
              @update:liked="(v: boolean) => onLikeToggle(art.id, v)"
              @update:count="(v: number) => onLikeCount(art.id, v)"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- v0.36: 页码指示（3 / 12）；单张作品时隐藏——仅画册模式显示 -->
    <p v-if="layout === 'album' && filteredArtworks.length > 1" class="tpl-album-counter" aria-live="polite">
      {{ currentIndex + 1 }} / {{ filteredArtworks.length }}
    </p>

    <!-- v0.35 F6: 大图 lightbox（F-09 拆分至 TplLightbox.vue；显隐/翻页 v-model 双向，imgUrl/isLiked/tagsOf/orderByTag 由本页注入） -->
    <!-- WEB-07：传 enrichedArtworks（like_count 覆盖后）而非 filteredArtworks，
         灯箱内 ArtworkLikeButton 重建时读到的是最新计数，不再回退到 props 原值 -->
    <TplLightbox
      v-model:visible="lightboxVisible"
      v-model:index="lightboxIndex"
      :filtered-artworks="enrichedArtworks"
      :subdomain="subdomain"
      :img-url="imgUrl"
      :is-liked="isLiked"
      :tags-of="tagsOf"
      :order-by-tag="orderByTag"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistData, buildGalleryFilters, filterArtworksBySize } from '../../composables/useArtistData'
import ArtworkLikeButton from '../shared/ArtworkLikeButton.vue'
// F-09 巨型文件拆分：v0.35 F6 大图灯箱搬至 components/templates/gallery/TplLightbox.vue（数据/跳转逻辑仍在本页）
import TplLightbox from './gallery/TplLightbox.vue'
// G 批巨型文件拆分：v0.36 album 画册翻页搬至 gallery/TplAlbumStage.vue（页码 v-model，函数注入口径同上）
import TplAlbumStage from './gallery/TplAlbumStage.vue'
import { useGalleryLikes } from '../../composables/useGalleryLikes'
import type { PublicGallerySize } from '../../api/types'

/** 画廊作品行宽松形状（gallery 端点与 artworks prop 两种口径共用） */
interface GalleryArtwork {
  id: number
  title?: string | null
  image_path?: string | null
  is_cover?: number | null
  like_count?: number | null
  description?: string | null
  width?: number | null
  height?: number | null
  size_tags?: Array<{ style_size_id?: number | null }> | null
}

/** gallery 专用端点数据形状（GET /public/gallery/:subdomain） */
interface GalleryData {
  artworks?: GalleryArtwork[] | null
  filterSizes?: PublicGallerySize[] | null
}

/** 筛选标签条目（buildGalleryFilters 返回值元素） */
type GalleryFilter = ReturnType<typeof buildGalleryFilters>[number]

const props = defineProps({
  /** 兜底数据源（gallery 端点不可用时回退，无筛选行） */
  artworks: { type: Array as PropType<GalleryArtwork[]>, default: () => [] },
  /**
   * v0.35 联调：画廊专用端点数据 GET /public/gallery/:subdomain
   * { artworks: [{..., size_tags: [{style_size_id, size_name, style_id, style_name}], description }],
   *   filterSizes: [{ id, name, style_id, style_name, sort_order }] }
   * 端点失败/为空时回退 artworks prop（行为与旧版一致，筛选行隐藏）
   */
  gallery: { type: Object as PropType<GalleryData | null>, default: null },
  /**
   * v0.36 修正: 画廊布局模式——album 画册翻页 / masonry 瀑布流。
   * 默认 masonry（稳定不闪的 v0.35 行为）；Gallery/Atelier 模板显式传 album。
   * （P2-B 清扫：grid 变体无任何调用方，已删除）
   */
  layout: { type: String, default: 'masonry', validator: (v: string) => ['album', 'masonry'].includes(v) },
  /**
   * v0.36: 侧露页开关——相邻页缩小露出在当前页两侧（Gallery 模板启用的大小交错节奏）。
   * 其他模板不传，保持单张大图居中翻页。
   */
  peek: { type: Boolean, default: false },
  /** F1: 点赞 localStorage 按画师隔离（huiyue_liked_${subdomain}） */
  subdomain: { type: String, default: '' }
})

const { imgUrl } = useArtistData(props)
const router = useRouter()

// ─── v0.35 联调：数据源优先级 gallery 端点 > artworks prop；封面去重保持现有展示规则（REQ-017 约束 2） ───
const displayArtworks = computed(() => {
  const list = props.gallery?.artworks?.length ? props.gallery.artworks : props.artworks
  const filtered = list.filter(a => !a.is_cover)
  return filtered.length > 0 ? filtered : list
})

// ─── v0.35 F6: 档位筛选（filterSizes 由后端门控好多画风开关/启用状态） ───
const filters = computed(() => buildGalleryFilters(props.gallery?.filterSizes))
const activeSizeId = ref<number | null>(null)
function setFilter(sizeId: number | null) {
  activeSizeId.value = sizeId
}
/** 当前显示的作品：默认全部混编；选中档位 → 只显示标注该档位的作品 */
const filteredArtworks = computed(() => filterArtworksBySize(displayArtworks.value, activeSizeId.value))

// ─── v0.36: 画册翻页状态（页码归本页：筛选重置/区间收敛两个 watch 驱动；翻页交互见 TplAlbumStage） ───
const currentIndex = ref(0)

// 筛选切换 → 翻页重置到第一张；列表变短（如数据刷新）→ 页码收敛回有效区间
watch(activeSizeId, () => { currentIndex.value = 0 })
watch(() => filteredArtworks.value.length, (len) => {
  if (currentIndex.value > len - 1) currentIndex.value = Math.max(0, len - 1)
})

/**
 * 作品的档位标签：art.size_tags（对象数组）→ 按 style_size_id 映射到筛选条目（含 styleId/label）。
 * 档位被画师删除后后端 CASCADE 清理，且 tags 里的 id 在 filters 中查不到 → 自动失效不残留（REQ-024 F6 验收 8）。
 */
const tagIndex = computed(() => new Map(filters.value.map(f => [f.sizeId, f])))
function tagsOf(art: GalleryArtwork): GalleryFilter[] {
  if (!Array.isArray(art.size_tags)) return []
  return art.size_tags.map(t => tagIndex.value.get(t.style_size_id as number)).filter(Boolean) as GalleryFilter[]
}

// ─── v0.35 F6: 大图 lightbox ───
const lightboxVisible = ref(false)
const lightboxIndex = ref(0)
// G 批拆分注：滑动收尾抑制（justSwiped）随滑动逻辑搬至 TplAlbumStage.onFrameClick；
// masonry 无滑动路径，本页入口不再需要该判定
function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxVisible.value = true
}

/** v0.35 F6: 点档位标签 → 下单页预选「画风+尺寸」（复用 F4 入口 A 逻辑，齐选直跳第三步） */
function orderByTag(tag: GalleryFilter) {
  lightboxVisible.value = false
  router.push({
    path: `/artist/${props.subdomain}/order`,
    query: { styleId: tag.styleId, sizeId: tag.sizeId }
  })
}

// F1/WEB-07：点赞状态（likedIds 响应式 + 计数覆盖 + enriched 传灯箱）
// F-44 门禁消红批：逻辑拆至 composables/useGalleryLikes.ts，逐字搬移行为零变更
const { isLiked, displayLikeCount, onLikeToggle, onLikeCount, enrichedArtworks } = useGalleryLikes(
  () => props.subdomain,
  filteredArtworks
)

// ─── 瀑布流布局辅助（v0.36 恢复 v0.35 行为） ───
/** hover 浮层只在有档位标签或描述时渲染（无元数据的卡片保持干净） */
function hasGalleryMeta(art: GalleryArtwork) {
  return tagsOf(art).length > 0 || !!art.description
}
// #15: 后端返回 width/height 时生成 aspect-ratio 样式，精确预留高度防 reflow；缺失时返回空对象，骨架兜底
function ratioStyle(art: GalleryArtwork): Record<string, string> {
  return art.width && art.height ? { aspectRatio: `${art.width} / ${art.height}` } : {}
}
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
  transition: border-color var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out), background-color var(--dur-mid) var(--ease-out);
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
  /* T 波：0.22s → --dur-mid(.25s) 就近等值 */
  transition: opacity var(--dur-mid) var(--ease-out);
}
.tpl-gallery-swap-enter-from,
.tpl-gallery-swap-leave-to {
  opacity: 0;
}

/* ===== v0.36: 画册模式样式随拆分搬至 gallery/TplAlbumStage.vue（.tpl-album-stage/frame/arrow/peek 等） ===== */

/* 页码指示（保留在本页：它不在 Transition 内，筛选切换时不参与淡出淡入） */
.tpl-album-counter {
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--pal-text-dim);
  margin: 16px 0 0;
}

/* ===== masonry：瀑布流（folio，v0.36 恢复——稳定不闪）===== */
.tpl-gallery--masonry {
  columns: 2;
  column-gap: 20px;
}
/* 波 M：窄屏瀑布流切单列（≤480px，避免两列卡片过窄） */
@media (max-width: 480px) {
  .tpl-gallery--masonry {
    columns: 1;
  }
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

/* ===== 瀑布流通用 ===== */
/* #15: aspect-ratio 占位容器——有 width/height 时撑出精确高度，el-image 填满；缺失时高度由内容决定，骨架兜底 */
.tpl-gallery-img-wrap {
  width: 100%;
  position: relative; /* hover 浮层定位锚点 */
}
.tpl-gallery-img-wrap .tpl-gallery-img {
  display: block;
  height: 100%;
}
/* #15: 有 aspect-ratio 时占位区填满容器（无 ratio 时高度链为 auto，由骨架 min-height 兜底） */
.tpl-gallery-img-wrap :deep(.el-image__placeholder) { height: 100%; }
.tpl-gallery-item .tpl-gallery-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 12px 0 0;
}
.tpl-gallery--masonry .tpl-gallery-meta {
  padding: 12px 16px;
  margin: 0;
}

/* ===== hover 浮层（桌面端）——默认隐藏，卡片保持干净 ===== */
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
.tpl-gallery-img-wrap:focus-within .tpl-gallery-hover,
.tpl-gallery-img-wrap:focus .tpl-gallery-hover {
  display: flex;
}
.tpl-gallery-img-wrap:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* ===== 通用 ===== */
/* #50: 加载骨架占位（masonry placeholder 兜底；画册端在 TplAlbumStage.vue 各留一份，取值一致） */
.tpl-gallery-skeleton {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
  background: var(--pal-surface);
  overflow: hidden;
}
.tpl-gallery-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--pal-border) 55%, transparent) 50%, transparent 70%);
  transform: translateX(-100%);
  /* T 波豁免：1.5s 骨架 shimmer 循环为加载占位节奏，保留原值（不归三档） */
  animation: tpl-gallery-shimmer 1.5s ease-in-out infinite;
}
@keyframes tpl-gallery-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
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
  transition: color var(--dur-mid);
}
.tpl-gallery-like:hover { color: var(--color-primary); }

/* v0.35 F6: 档位标签（lightbox 用；深色底白字，点击跳下单预选） */
.tpl-gallery-tag {
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, #fff 55%, transparent);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out);
}
.tpl-gallery-tag:hover {
  background: #fff;
  color: #222;
}

@media (max-width: 768px) {
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
