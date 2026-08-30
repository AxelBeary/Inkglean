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
      <div
        v-if="layout === 'album'"
        :key="'album-' + (activeSizeId ?? 'all')"
        class="tpl-gallery tpl-gallery--album tpl-reveal"
      >
        <!-- v0.36: 画册模式 —— 一次一张大图居中，左右箭头翻页（单张作品时不渲染箭头/页码） -->
        <button
          v-if="filteredArtworks.length > 1"
          type="button"
          class="tpl-album-arrow tpl-album-arrow--prev"
          :aria-label="$t('gallery.prev')"
          :disabled="currentIndex <= 0"
          @click="goPrev"
        >
          ‹
        </button>

        <!-- 舞台：pointer 事件处理触摸/鼠标滑动翻页（touch-action: pan-y 保留纵向滚动） -->
        <div
          class="tpl-album-stage"
          :class="{ 'tpl-album-stage--peek': peek }"
          @pointerdown="onSwipeStart"
          @pointerup="onSwipeEnd"
          @pointercancel="onSwipeCancel"
        >
          <!-- v0.36: 侧露页（peek，Gallery 模板启用）——相邻页缩小露出，点击翻到该页 -->
          <button
            v-if="peek && prevArt"
            type="button"
            class="tpl-album-peek tpl-album-peek--prev"
            :aria-label="$t('gallery.prev')"
            @click="goPrev"
          >
            <el-image
              :src="imgUrl(prevArt.image_path)"
              fit="cover"
              class="tpl-album-peek-img"
              :alt="prevArt.title || $t('artistHome.artworks')"
            />
          </button>

          <!-- 当前页：key 变化触发淡入+微位移过渡 -->
          <Transition name="tpl-album-swap" mode="out-in">
            <figure v-if="currentArt" class="tpl-album-page" :key="currentArt.id">
              <button type="button" class="tpl-album-frame" @click="openLightbox(currentIndex)">
                <el-image
                  :src="imgUrl(currentArt.image_path)"
                  fit="contain"
                  class="tpl-album-img"
                  :alt="currentArt.title || $t('artistHome.artworks')"
                >
                  <!-- #50: 加载占位兜底 -->
                  <template #placeholder>
                    <div class="tpl-gallery-skeleton" aria-hidden="true" />
                  </template>
                </el-image>
              </button>
              <figcaption class="tpl-album-meta">
                <p class="tpl-gallery-caption" v-if="currentArt.title">{{ currentArt.title }}</p>
                <!-- F1: 点赞（颜色/大小由模板 class 覆盖） -->
                <ArtworkLikeButton
                  class="tpl-gallery-like"
                  :artwork-id="currentArt.id"
                  :initial-count="currentArt.like_count || 0"
                  :liked="isLiked(currentArt.id)"
                  :subdomain="subdomain"
                />
              </figcaption>
            </figure>
          </Transition>

          <button
            v-if="peek && nextArt"
            type="button"
            class="tpl-album-peek tpl-album-peek--next"
            :aria-label="$t('gallery.next')"
            @click="goNext"
          >
            <el-image
              :src="imgUrl(nextArt.image_path)"
              fit="cover"
              class="tpl-album-peek-img"
              :alt="nextArt.title || $t('artistHome.artworks')"
            />
          </button>
        </div>

        <button
          v-if="filteredArtworks.length > 1"
          type="button"
          class="tpl-album-arrow tpl-album-arrow--next"
          :aria-label="$t('gallery.next')"
          :disabled="currentIndex >= filteredArtworks.length - 1"
          @click="goNext"
        >
          ›
        </button>
      </div>

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
              :initial-count="art.like_count || 0"
              :liked="isLiked(art.id)"
              :subdomain="subdomain"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- v0.36: 页码指示（3 / 12）；单张作品时隐藏——仅画册模式显示 -->
    <p v-if="layout === 'album' && filteredArtworks.length > 1" class="tpl-album-counter" aria-live="polite">
      {{ currentIndex + 1 }} / {{ filteredArtworks.length }}
    </p>

    <!-- v0.35 F6: 大图 lightbox（画册是浏览，灯箱是细看，两层并存） -->
    <!-- v0.36 热修: append-to-body——画廊容器带 .tpl-reveal 渐入动画(transform)，
         祖先 transform 会劫持 fixed 定位基准导致弹窗飘出窗口，teleport 到 body 规避 -->
    <el-dialog
      v-model="lightboxVisible"
      class="tpl-gallery-lightbox"
      width="min(860px, 92vw)"
      align-center
      destroy-on-close
      append-to-body
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
          <!-- v0.36 热修: 移除 preview-src-list/preview-teleported——灯箱内再开 EP 内置预览会叠出第三层全屏遮罩，
               且被弹窗宽度截断（用户实测截图）。灯箱自带左右箭头翻页，无需再套预览层 -->
          <el-image
            :src="imgUrl(lightboxArt.image_path)"
            fit="contain"
            class="tpl-lb-img"
            :alt="lightboxArt.title || $t('artistHome.artworks')"
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
          <!-- v0.35 F6: 自由描述（画师在作品管理填写，gallery 端点带出；无则不显示） -->
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

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistData, buildGalleryFilters, filterArtworksBySize } from '../../composables/useArtistData'
import ArtworkLikeButton from '../shared/ArtworkLikeButton.vue'
import { safeGetItem } from '../../utils/storage'
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

// ─── v0.36: 画册翻页状态（仅 album 布局生效；瀑布流模式不注册键盘/滑动监听） ───
const isAlbum = computed(() => props.layout === 'album')
const currentIndex = ref(0)
const currentArt = computed(() => filteredArtworks.value[currentIndex.value] || null)
/** 侧露页数据（peek 模式）：越界返回 null → 模板侧不渲染 */
const prevArt = computed(() => filteredArtworks.value[currentIndex.value - 1] || null)
const nextArt = computed(() => filteredArtworks.value[currentIndex.value + 1] || null)

function goPrev() {
  if (currentIndex.value > 0) currentIndex.value -= 1
}
function goNext() {
  if (currentIndex.value < filteredArtworks.value.length - 1) currentIndex.value += 1
}

// 筛选切换 → 翻页重置到第一张；列表变短（如数据刷新）→ 页码收敛回有效区间
watch(activeSizeId, () => { currentIndex.value = 0 })
watch(() => filteredArtworks.value.length, (len) => {
  if (currentIndex.value > len - 1) currentIndex.value = Math.max(0, len - 1)
})

// 键盘 ←/→ 翻页（仅画册模式；灯箱打开时让位给灯箱；输入框聚焦时不抢按键）
function onKeydown(e: KeyboardEvent) {
  if (!isAlbum.value) return
  if (lightboxVisible.value) return
  const el = document.activeElement as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
  if (e.key === 'ArrowLeft') goPrev()
  else if (e.key === 'ArrowRight') goNext()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// 触摸/鼠标滑动翻页（pointer events）：横向位移超阈值且以横向为主 → 翻页
let swipeStart: { x: number; y: number } | null = null
const justSwiped = ref(false)
// L-5: justSwiped 复位定时器句柄——卸载时清理，防组件销毁后仍回写已卸载状态
let swipeResetTimer: number | null = null
function onSwipeStart(e: PointerEvent) {
  swipeStart = { x: e.clientX, y: e.clientY }
}
function onSwipeEnd(e: PointerEvent) {
  if (!isAlbum.value || !swipeStart) return
  const dx = e.clientX - swipeStart.x
  const dy = e.clientY - swipeStart.y
  swipeStart = null
  if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return
  justSwiped.value = true
  if (dx < 0) goNext()
  else goPrev()
  // click 在 pointerup 之后同步派发，微任务里复位即可吞掉本次点击
  if (swipeResetTimer) clearTimeout(swipeResetTimer)
  swipeResetTimer = setTimeout(() => { justSwiped.value = false }, 0)
}
function onSwipeCancel() { swipeStart = null }

// L-5: 卸载清理滑动复位定时器（与上方 keydown 监听各自收口，互不干扰）
onUnmounted(() => { if (swipeResetTimer) clearTimeout(swipeResetTimer) })

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
const lightboxArt = computed(() => filteredArtworks.value[lightboxIndex.value] || null)
const lightboxTags = computed(() => (lightboxArt.value ? tagsOf(lightboxArt.value) : []))
function openLightbox(index: number) {
  // 刚滑动翻页过 → 本次 click 属于滑动收尾，不开灯箱
  if (justSwiped.value) return
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

// F1: 初始已赞集合（localStorage，按画师隔离）
function readLikedIds(): Set<number> {
  // G-5: 裸读换 safeGetItem（存储禁用/损坏 JSON 均按未点赞降级）
  const raw = safeGetItem(`huiyue_liked_${props.subdomain}`)
  if (!raw) return new Set()
  try {
    const ids: unknown = JSON.parse(raw)
    return Array.isArray(ids) ? new Set(ids as number[]) : new Set()
  } catch { return new Set() }
}
const likedIds = readLikedIds()
function isLiked(id: number) { return likedIds.has(id) }

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

/* ===== v0.36: 画册模式（一次一张大图居中，左右翻页；区分度由各模板 :deep 覆盖） ===== */
.tpl-gallery--album {
  display: flex;
  align-items: center;
  gap: 14px;
}
/* 舞台：固定高度，图片 contain 完整呈现；peek 模式下三列（侧露-当前页-侧露） */
.tpl-album-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 62vh;
  min-height: 340px;
  touch-action: pan-y; /* 横向滑动交给翻页，纵向滚动不受影响 */
  user-select: none;
  -webkit-user-select: none;
}
.tpl-album-stage--peek { gap: 18px; }

.tpl-album-page {
  margin: 0;
  height: 100%;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tpl-album-frame {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-in;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
}
.tpl-album-frame:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.tpl-album-img {
  height: 100%;
  width: auto;
  max-width: 100%;
}
/* el-image 内部 img 默认 width/height:100%——覆盖为高度撑满、宽度按原图比例，contain 不拉伸 */
.tpl-album-img :deep(img) {
  height: 100%;
  width: auto;
  max-width: 100%;
}
.tpl-album-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
}

/* 翻页箭头（复用灯箱箭头的视觉语言；位于舞台两侧，disabled 时留位淡出） */
.tpl-album-arrow {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 1px solid var(--pal-border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--pal-surface) 82%, transparent);
  color: var(--pal-text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: border-color var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out);
}
.tpl-album-arrow:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.tpl-album-arrow:disabled {
  opacity: 0.25;
  cursor: default;
}

/* 侧露页基线（具体尺寸/透明度由启用模板覆盖） */
.tpl-album-peek {
  flex-shrink: 0;
  width: 11%;
  height: 56%;
  padding: 0;
  border: none;
  background: none;
  opacity: 0.5;
  cursor: pointer;
  overflow: hidden;
  transition: opacity var(--dur-mid) var(--ease-out);
}
.tpl-album-peek:hover { opacity: 0.85; }
.tpl-album-peek-img {
  width: 100%;
  height: 100%;
}
.tpl-album-peek-img :deep(img) {
  object-fit: cover;
}

/* 切页过渡：淡入 + 微位移（克制，不做翻页翻转） */
.tpl-album-swap-enter-active,
.tpl-album-swap-leave-active {
  /* T 波：0.28s → --dur-mid(.25s) 就近等值 */
  transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out);
}
.tpl-album-swap-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.tpl-album-swap-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}

/* 页码指示 */
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
/* #50: 加载骨架占位（画册 placeholder 兜底） */
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
  transition: border-color var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out);
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
  .tpl-album-stage {
    height: 50vh;
    min-height: 280px;
  }
  .tpl-album-arrow {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }
  .tpl-album-peek {
    width: 9%;
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
