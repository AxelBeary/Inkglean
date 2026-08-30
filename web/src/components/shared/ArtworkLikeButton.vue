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
    :aria-label="isLiked ? t('common.unlike') : t('common.like')"
    :disabled="busy"
    @click="toggle"
  >
    <svg class="like-heart" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
    <span v-if="count > 0" class="like-count">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistPublicApi } from '../../api/index'
import { safeGetItem, safeSetItem } from '../../utils/storage'

const { t } = useI18n()

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
// L-5: 弹跳复位定时器句柄——卸载时清理，防组件销毁后仍回写已卸载组件状态
let popTimer: number | null = null

/** b3 猎杀：props 变化（父级切换作品/数据刷新）时同步本地状态，storage key 随 subdomain 响应式 */
const storageKey = computed(() => `huiyue_liked_${props.subdomain}`)
watch(() => props.liked, (v) => { if (!busy.value) isLiked.value = v })
watch(() => props.initialCount, (v) => { if (!busy.value) count.value = v })

function readIds(): number[] {
  // G-5: 裸读写换 safe 封装（存储禁用/损坏 JSON 均按未点赞降级）
  const raw = safeGetItem(storageKey.value)
  if (!raw) return []
  try {
    const ids: unknown = JSON.parse(raw)
    return Array.isArray(ids) ? (ids as number[]) : []
  } catch { return [] }
}

function persist() {
  const ids = new Set(readIds())
  if (isLiked.value) ids.add(props.artworkId)
  else ids.delete(props.artworkId)
  safeSetItem(storageKey.value, JSON.stringify([...ids]))
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
    if (popTimer) clearTimeout(popTimer)
    popTimer = setTimeout(() => { popping.value = false }, 350)
  } catch { /* 网络失败静默，不打断浏览 */ }
  finally { busy.value = false }
}

// L-5: 卸载清理弹跳复位定时器（对齐生命周期钩子收口）
onUnmounted(() => { if (popTimer) clearTimeout(popTimer) })
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
  transition: fill var(--dur-mid) var(--ease-out), stroke var(--dur-mid) var(--ease-out);
}
.like-btn--liked .like-heart path {
  fill: currentColor;
}
.like-btn--pop .like-heart {
  /* T 波：like-pop 缓动 token 化（同曲线 --ease-out），弹跳幅度收敛至克制范围 */
  animation: like-pop var(--dur-slow) var(--ease-out);
}
@keyframes like-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); }
}
</style>
