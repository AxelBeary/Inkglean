<!--
  ArtworkLikeButton — 作品点赞按钮（F1，共享逻辑组件）

  硬约束：不写布局/装饰样式（无 margin/padding/background/border-radius/font-size）。
  颜色继承 currentColor（模板定 color），大小跟随 1em（模板定 font-size）。
  组件只负责：状态切换、API 调用、localStorage 持久化、心形填充过渡 + 弹跳微动画。

  T5（用户拍板）：0 赞不显示数字，只显示空心 ♥；有赞才显示计数。
  localStorage key：huiyue_liked_${subdomain}（JSON 数组，按画师隔离）。
-->
<template>
  <button
    type="button"
    class="like-btn"
    :class="{ 'like-btn--liked': isLiked, 'like-btn--pop': popping }"
    :aria-pressed="isLiked"
    :disabled="busy"
    @click="toggle"
  >
    <svg class="like-heart" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
    <span v-if="count > 0" class="like-count">{{ count }}</span>
  </button>
</template>

<script setup>
import { ref } from 'vue'
import { artistPublicApi } from '../../api/index.js'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'

const props = defineProps({
  artworkId: { type: Number, required: true },
  initialCount: { type: Number, default: 0 },
  liked: { type: Boolean, default: false },
  subdomain: { type: String, default: '' }
})

const emit = defineEmits(['update:count'])

const isLiked = ref(props.liked)
const count = ref(props.initialCount)
const busy = ref(false)
const popping = ref(false)

const STORAGE_KEY = `huiyue_liked_${props.subdomain}`

function readIds() {
  // G-5: 裸读写换 safe 封装（存储禁用/损坏 JSON 均按未点赞降级）
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? ids : []
  } catch { return [] }
}

function persist() {
  const ids = new Set(readIds())
  if (isLiked.value) ids.add(props.artworkId)
  else ids.delete(props.artworkId)
  safeSetItem(STORAGE_KEY, JSON.stringify([...ids]))
}

async function toggle() {
  if (busy.value) return
  busy.value = true
  try {
    const res = isLiked.value
      ? await artistPublicApi.unlikeArtwork(props.artworkId)
      : await artistPublicApi.likeArtwork(props.artworkId)
    isLiked.value = !isLiked.value
    count.value = res.likeCount ?? count.value
    emit('update:count', count.value)
    persist()
    // 弹跳微动画：加 class 触发 CSS animation，结束后移除
    popping.value = true
    setTimeout(() => { popping.value = false }, 350)
  } catch { /* 网络失败静默，不打断浏览 */ }
  finally { busy.value = false }
}
</script>

<style scoped>
/* 行为基线样式（非装饰）：按钮重置 + 心形状态过渡 + 弹跳动画。
   颜色 = currentColor（模板控制），大小 = 1em（模板 font-size 控制）。 */
.like-btn {
  appearance: none;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  color: inherit;
  font: inherit;
  line-height: 1;
}
.like-btn:disabled { cursor: default; }
.like-heart {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
.like-heart path {
  fill: transparent;
  stroke: currentColor;
  stroke-width: 2;
  transition: fill 0.25s ease, stroke 0.25s ease;
}
.like-btn--liked .like-heart path {
  fill: currentColor;
}
.like-btn--pop .like-heart {
  animation: like-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes like-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  100% { transform: scale(1); }
}
</style>
