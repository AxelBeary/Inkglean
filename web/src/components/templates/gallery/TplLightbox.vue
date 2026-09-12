<template>
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
</template>

<script setup lang="ts">
// F-09 巨型文件拆分：自 components/templates/TplGallery.vue 整体搬入（v0.35 F6 大图灯箱 + .tpl-lb-* 样式），
// 模板/文案键/class/样式取值一字未改。数据与跳转逻辑仍归父页：imgUrl/isLiked/tagsOf/orderByTag
// 由父页以函数 prop 注入（同一份函数实例，零逻辑复制、零行为漂移）；翻页与显隐走 v-model。
import { computed } from 'vue'
import type { PropType } from 'vue'
import ArtworkLikeButton from '../../shared/ArtworkLikeButton.vue'

/** 灯箱消费的作品行形状（与父页 GalleryArtwork 结构兼容，只声明本组件用到的字段） */
interface LightboxArtwork {
  id: number
  title?: string | null
  image_path?: string | null
  like_count?: number | null
  description?: string | null
}
/** 档位标签条目（父页 buildGalleryFilters 产物形状，字段与父页 orderByTag 入参一致） */
interface LightboxTag {
  sizeId: number
  styleId: number
  label: string
  sortKey: number
}

// ─── v0.35 F6: 大图 lightbox ───
const lightboxVisible = defineModel<boolean>('visible', { default: false })
const lightboxIndex = defineModel<number>('index', { default: 0 })
const props = defineProps({
  /** 当前筛选结果（与父页画廊同源：左右箭头翻页区间与末页判定） */
  filteredArtworks: { type: Array as PropType<LightboxArtwork[]>, default: () => [] },
  /** F1: 点赞 localStorage 按画师隔离（与父页同一 subdomain 口径） */
  subdomain: { type: String, default: '' },
  imgUrl: { type: Function as PropType<(path: string | null | undefined) => string>, required: true },
  isLiked: { type: Function as PropType<(id: number) => boolean>, required: true },
  tagsOf: { type: Function as PropType<(art: LightboxArtwork) => LightboxTag[]>, required: true },
  orderByTag: { type: Function as PropType<(tag: LightboxTag) => void>, required: true }
})

const lightboxArt = computed(() => props.filteredArtworks[lightboxIndex.value] || null)
const lightboxTags = computed(() => (lightboxArt.value ? props.tagsOf(lightboxArt.value) : []))
</script>

<style scoped>
/* 以下两条基线样式随灯箱搬入一份（画廊端仍在 TplGallery.vue 使用同名 class），取值与源文件一致 */
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
</style>
