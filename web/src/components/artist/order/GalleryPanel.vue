<template>
  <!-- R18: 订单图库（参考图 + 画师加图，点击设焦点；v0.40 拆分：整卡搬自 OrderDetail.vue，零行为变化） -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.gallery')">
        <template #extra>
          <span class="gallery-count">{{ order.references?.length || 0 }} / 20</span>
        </template>
      </CardHead>
    </template>
    <div class="ref-grid">
      <div
        v-for="(reference, index) in order.references" :key="reference.id"
        class="ref-item" :class="{ 'ref-item--focus': order.focus_image_path === reference.file_path }"
      >
        <div
          class="ref-img-wrap" role="button" tabindex="0"
          :aria-label="$t('orderDetail.openViewer', { n: index + 1 })"
          @click="emit('open-viewer', index)"
          @keydown.enter.prevent="emit('open-viewer', index)"
          @keydown.space.prevent="emit('open-viewer', index)"
        >
          <!-- R43: placeholder 骨架屏防首屏白闪 -->
          <el-image :src="reference.url" fit="cover" class="ref-img" :alt="$t('orderDetail.referenceImage')" @error="emit('refresh')">
            <template #placeholder>
              <div class="ref-img-skeleton"></div>
            </template>
          </el-image>
          <!-- R18: 来源角标（客户/画师） -->
          <span class="ref-source-badge" :class="`ref-source-badge--${reference.source || 'client'}`">
            {{ reference.source === 'artist' ? $t('orderDetail.sourceArtist') : $t('orderDetail.sourceClient') }}
          </span>
          <!-- R44: 悬停操作组——✓设焦点（C56 手机端常驻）+ 删除；预览按钮已移除（单击图片即预览） -->
          <span class="ref-hover-actions">
            <el-button size="small" circle :aria-label="$t('orderDetail.setFocus')" :title="$t('orderDetail.setFocus')" @click.stop="emit('select-focus', reference)">✓</el-button>
            <el-button size="small" circle type="danger" :aria-label="$t('orderDetail.deleteRef')" :title="$t('orderDetail.deleteRef')" @click.stop="emit('delete', reference)">✕</el-button>
          </span>
          <!-- 焦点指示 -->
          <span v-if="order.focus_image_path === reference.file_path" class="ref-focus-indicator">✓</span>
        </div>
      </div>

      <!-- R18: 上传入口（拖拽/点击/Ctrl+V） -->
      <button
        type="button"
        class="ref-upload-tile"
        :class="{ 'ref-upload-tile--active': isGalleryDragOver }"
        @dragenter.capture="emit('dragenter', $event)"
        @dragover.capture="emit('dragover', $event)"
        @dragover.prevent="emit('update:isGalleryDragOver', true)"
        @dragleave="handleDragLeave"
        @drop.prevent="emit('drop', $event)"
        @click="triggerGalleryUpload"
      >
        <el-icon :size="24"><Plus /></el-icon>
        <span class="ref-upload-text">{{ $t('orderDetail.galleryUpload') }}</span>
      </button>
      <input
        ref="galleryInputEl" type="file" accept="image/*" multiple hidden
        @change="emit('file-select', $event)"
      />
    </div>
    <p v-if="!order.references?.length" class="no-refs">{{ $t('orderDetail.noReferences') }}</p>
    <p v-if="galleryUploading" class="upload-status">{{ $t('orderDetail.uploading') }}</p>
    <p v-if="pasteError" class="upload-error">{{ pasteError }}</p>
    <p class="focus-hint">{{ $t('orderDetail.galleryHint') }}</p>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PropType } from 'vue'
import CardHead from '../visual/CardHead.vue'
import { Plus } from '@element-plus/icons-vue'

/** 参考图行（本卡消费字段） */
interface GalleryRefItem {
  id?: number
  url?: string
  file_path?: string
  source?: string | null
}

/** 本卡消费的订单字段（参考图列表 + 焦点图路径） */
interface GalleryOrderLite {
  references?: GalleryRefItem[] | null
  focus_image_path?: string | null
}

defineProps({
  order: { type: Object as PropType<GalleryOrderLite>, required: true },
  galleryUploading: Boolean,
  isGalleryDragOver: Boolean,
  pasteError: { type: String, default: '' }
})
const emit = defineEmits([
  'open-viewer', 'refresh', 'select-focus', 'delete',
  'dragenter', 'dragover', 'drop', 'file-select', 'update:isGalleryDragOver'
])

const galleryInputEl = ref<HTMLInputElement | null>(null)
/** 触发上传：等价于父组件原 triggerGalleryUpload（input 随卡移入本组件） */
function triggerGalleryUpload() {
  galleryInputEl.value?.click()
}

/** R4: dragleave 防闪烁——仅当指针真正离开上传区（relatedTarget 不在本容器内）才取消高亮 */
function handleDragLeave(event: DragEvent) {
  if (event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) return
  emit('update:isGalleryDragOver', false)
}
</script>

<style scoped>
/* ─── R18: 订单图库（自 OrderDetail.vue 原样搬入） ─── */
.gallery-count { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-item { display: flex; flex-direction: column; gap: 4px; }
.ref-item--focus .ref-img { outline: 2px solid var(--hq); outline-offset: 2px; }
.ref-img-wrap {
  position: relative;
  cursor: pointer;
  border-radius: var(--r-m);
  overflow: hidden;
}
.ref-img-wrap:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 2px;
}
.ref-img { height: 120px; width: 100%; border-radius: var(--r-m); display: block; background: var(--paper2); }
/* R43: 加载骨架屏（防首屏多图白闪） */
.ref-img-skeleton {
  width: 100%; height: 100%;
  background: var(--paper2);
  animation: ref-skeleton-pulse 1.2s ease-in-out infinite;
}
@keyframes ref-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
/* R18: 来源角标 */
.ref-source-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  font-size: calc(var(--font-scale, 1) * 10px);
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--r-s);
  line-height: 1.5;
  pointer-events: none;
}
.ref-source-badge--client { background: rgba(0, 0, 0, 0.55); color: #fff; }
.ref-source-badge--artist { background: var(--hq); color: #fff; }
/* 焦点指示 */
.ref-focus-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--hq);
  color: #fff;
  font-size: calc(var(--font-scale, 1) * 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
/* 悬停操作组（✓设焦点 + 删除） */
.ref-hover-actions {
  position: absolute; top: 4px; right: 4px;
  display: flex; gap: 4px;
  opacity: 0; transition: opacity var(--dur-fast);
}
.ref-img-wrap:hover .ref-hover-actions { opacity: 1; }
/* R44/C56: 触屏无悬停，✓ 设焦点按钮常驻 */
@media (hover: none) {
  .ref-hover-actions { opacity: 1; }
}
/* R18: 上传磁贴 */
.ref-upload-tile {
  height: 120px;
  border: 2px dashed var(--line2);
  border-radius: var(--r-m);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--ink2);
  padding: 0;
  border: 2px dashed var(--line2);
  background: none;
  font: inherit;
  text-align: inherit;
  transition: border-color var(--dur-mid), background var(--dur-mid), color var(--dur-mid);
}
.ref-upload-tile:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 2px;
}
.ref-upload-tile:hover, .ref-upload-tile--active {
  border-color: var(--hq);
  background: var(--hq-t);
  color: var(--hq);
}
.ref-upload-text { font-size: calc(var(--font-scale, 1) * 12px); }
.upload-status { font-size: calc(var(--font-scale, 1) * 12px); color: var(--hq); margin: 8px 0 0; }
.upload-error { font-size: calc(var(--font-scale, 1) * 12px); color: var(--zs); margin: 8px 0 0; }
.no-refs { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); margin: 0; }
.focus-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin: 12px 0 0; }
</style>
