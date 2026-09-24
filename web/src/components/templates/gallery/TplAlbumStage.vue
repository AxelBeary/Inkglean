<template>
  <!-- v0.36 修正: 画廊布局按模板区分——album 画册翻页与瀑布流并存，用户拍板恢复 -->
  <div class="tpl-gallery tpl-gallery--album tpl-reveal">
    <!-- v0.36: 画册模式 —— 一次一张大图居中，左右箭头翻页（单张作品时不渲染箭头） -->
    <button
      v-if="filteredArtworks.length > 1"
      type="button"
      class="tpl-album-arrow tpl-album-arrow--prev"
      :aria-label="$t('gallery.prev')"
      :disabled="index <= 0"
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
          <button type="button" class="tpl-album-frame" @click="onFrameClick">
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
              :initial-count="displayLikeCount(currentArt)"
              :liked="isLiked(currentArt.id)"
              :subdomain="subdomain"
              @update:liked="(v: boolean) => onLikeToggle(currentArt.id, v)"
              @update:count="(v: number) => onLikeCount(currentArt.id, v)"
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
      :disabled="index >= filteredArtworks.length - 1"
      @click="goNext"
    >
      ›
    </button>
  </div>
</template>

<script setup lang="ts">
// G 批巨型文件拆分：自 components/templates/TplGallery.vue 整体搬入（v0.36 画册翻页模式 + .tpl-album-* 样式），
// 模板/文案键/class/样式取值一字未改。数据与点赞口径仍归父页：imgUrl/isLiked/displayLikeCount/
// onLikeToggle/onLikeCount/openLightbox 由父页以函数 prop 注入（同一份函数实例，零逻辑复制、零行为漂移）；
// 页码走 v-model:index——筛选切换重置与列表变短收敛仍由父页 watch 驱动。
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { PropType } from 'vue'
import ArtworkLikeButton from '../../shared/ArtworkLikeButton.vue'

/** 画册消费的作品行形状（与父页 GalleryArtwork 结构兼容，只声明本组件用到的字段） */
interface AlbumArtwork {
  id: number
  title?: string | null
  image_path?: string | null
  like_count?: number | null
}

const index = defineModel<number>('index', { default: 0 })
const props = defineProps({
  /** 当前筛选结果（与父页画廊同源：翻页区间与箭头禁用判定） */
  filteredArtworks: { type: Array as PropType<AlbumArtwork[]>, default: () => [] },
  /** F1: 点赞 localStorage 按画师隔离（与父页同一 subdomain 口径） */
  subdomain: { type: String, default: '' },
  /** v0.36: 侧露页开关（Gallery 模板启用；相邻页缩小露出） */
  peek: { type: Boolean, default: false },
  /** 灯箱打开时键盘 ←/→ 让位给灯箱（父页 lightboxVisible 注入） */
  lightboxOpen: { type: Boolean, default: false },
  imgUrl: { type: Function as PropType<(path: string | null | undefined) => string>, required: true },
  isLiked: { type: Function as PropType<(id: number) => boolean>, required: true },
  displayLikeCount: { type: Function as PropType<(art: AlbumArtwork) => number>, required: true },
  onLikeToggle: { type: Function as PropType<(artworkId: number, liked: boolean) => void>, required: true },
  onLikeCount: { type: Function as PropType<(artworkId: number, count: number) => void>, required: true },
  /** 打开大图灯箱（父页 openLightbox；滑动收尾的抑制判定见 onFrameClick） */
  openLightbox: { type: Function as PropType<(index: number) => void>, required: true }
})

const currentArt = computed(() => props.filteredArtworks[index.value] || null)
/** 侧露页数据（peek 模式）：越界返回 null → 模板侧不渲染 */
const prevArt = computed(() => props.filteredArtworks[index.value - 1] || null)
const nextArt = computed(() => props.filteredArtworks[index.value + 1] || null)

function goPrev() {
  if (index.value > 0) index.value -= 1
}
function goNext() {
  if (index.value < props.filteredArtworks.length - 1) index.value += 1
}

// 键盘 ←/→ 翻页（本组件仅在 album 布局挂载；灯箱打开时让位给灯箱；输入框聚焦时不抢按键）
function onKeydown(e: KeyboardEvent) {
  if (props.lightboxOpen) return
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
  if (!swipeStart) return
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

/** 当前页点击开灯箱：刚滑动翻页过 → 本次 click 属于滑动收尾，不开灯箱（原父页 openLightbox 内判定随滑动逻辑搬入） */
function onFrameClick() {
  if (justSwiped.value) return
  props.openLightbox(index.value)
}
</script>

<style scoped>
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

/* 以下三条基线样式随画册搬入一份（画廊端仍在 TplGallery.vue 使用同名 class），取值与源文件一致 */
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
}
</style>
