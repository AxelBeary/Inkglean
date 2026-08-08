<template>
  <div
    ref="trackEl"
    class="sw-track"
    :class="[`sw-track--${size}`, { 'sw-track--dragging': isDragging }]"
    role="radiogroup"
    :style="{ '--sw-count': swCount, '--sw-index': displayIndex }"
    tabindex="0"
    @keydown="onKeydown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <!-- 滑块式切换器（05B 批：radiogroup 语义 + 选中高亮块随切换平滑滑动；参考用户三态滑块，不抄 SVG） -->
    <div class="sw-thumb" aria-hidden="true"></div>
    <div
      v-for="(opt, i) in options"
      :key="opt.value"
      class="sw-option"
      :class="{ 'sw-option--active': i === displayIndex }"
      role="radio"
      :aria-checked="i === displayIndex"
      :aria-label="opt.label"
    >
      <el-icon v-if="opt.icon" :size="iconSize" class="sw-option-icon">
        <component :is="opt.icon" />
      </el-icon>
      <span class="sw-option-label">{{ opt.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

/**
 * SliderSwitch —— 滑块式切换器（radiogroup 语义）
 *
 * 与 el-radio-group 等价：modelValue 双向绑定 + change 事件。
 * 选中高亮块用 --sw-count/--sw-index 两个 CSS 变量 + translateX 驱动，
 * 零 DOM 测量；拖动时禁用 transition 实时跟随，落定恢复动画。
 *
 * @example
 * <SliderSwitch v-model="viewMode" :options="[{ value: 'board', label: '看板', icon: Odometer }]" />
 */
const props = defineProps({
  /** 当前选中值（options 内某项的 value） */
  modelValue: { type: [String, Number], default: '' },
  /** 选项数组：{ value, label, icon? }，icon 为 @element-plus/icons-vue 组件引用 */
  options: { type: Array, default: () => [] },
  /** 尺寸：default(高36px) | small(高28px) */
  size: { type: String, default: 'default' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const trackEl = ref(null)
// 拖动状态（pointer capture 期间）
const isDragging = ref(false)
const dragIndex = ref(-1)
let pointerStartX = 0
let moved = false

const swCount = computed(() => Math.max(props.options.length, 1))
/** 当前选中下标（modelValue 在 options 中的位置） */
const swIndex = computed(() => {
  const i = props.options.findIndex(o => o.value === props.modelValue)
  return i === -1 ? 0 : i
})
/** 视觉下标：拖动中跟随手指，否则跟随选中项 */
const displayIndex = computed(() => (isDragging.value && dragIndex.value >= 0 ? dragIndex.value : swIndex.value))

const iconSize = computed(() => (props.size === 'small' ? 13 : 15))

/** 由 x 坐标算选项下标（含两侧 padding 3px 修正） */
function indexFromX(clientX) {
  const rect = trackEl.value.getBoundingClientRect()
  if (!rect.width) return 0
  const innerW = rect.width - 6
  const per = innerW / swCount.value
  const i = Math.floor((clientX - rect.left - 3) / per)
  return Math.min(Math.max(i, 0), swCount.value - 1)
}

function select(i) {
  const opt = props.options[i]
  if (!opt || opt.value === props.modelValue) return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
}

function onPointerDown(e) {
  e.preventDefault()
  trackEl.value?.setPointerCapture?.(e.pointerId)
  pointerStartX = e.clientX
  moved = false
  isDragging.value = false
  dragIndex.value = -1
}

function onPointerMove(e) {
  if (!moved && Math.abs(e.clientX - pointerStartX) <= 4) return // 轻移阈值：防误触
  moved = true
  isDragging.value = true
  dragIndex.value = indexFromX(e.clientX)
}

function onPointerUp(e) {
  if (isDragging.value) {
    select(dragIndex.value >= 0 ? dragIndex.value : indexFromX(e.clientX))
  } else {
    // 未拖动（纯点击）：按落点选中
    select(indexFromX(e.clientX))
  }
  isDragging.value = false
  dragIndex.value = -1
  moved = false
}

function onKeydown(e) {
  const i = swIndex.value
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    select(Math.max(i - 1, 0))
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    select(Math.min(i + 1, swCount.value - 1))
  }
}
</script>

<style scoped>
/* ─── 滑块式切换器（纸墨 token 双主题自适应） ─── */
.sw-track {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 3px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
.sw-track:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--hq) 45%, transparent); }

/* 高亮滑块：宽度 = 等分项宽（-6px 扣两侧 padding），translateX(下标 × 100%) 驱动，零测量 */
.sw-thumb {
  position: absolute;
  top: 3px; bottom: 3px; left: 3px;
  width: calc((100% - 6px) / var(--sw-count));
  transform: translateX(calc(var(--sw-index) * 100%));
  transition: transform 0.28s var(--ease-out), background-color 0.2s var(--ease-out);
  border-radius: 999px;
  background: var(--hq-t);
  border: 1px solid var(--hq-t2);
  box-shadow: var(--sh-1);
  pointer-events: none;
}
/* 拖动中：禁用过渡，滑块实时跟随手指 */
.sw-track--dragging .sw-thumb { transition: none; }

.sw-option {
  position: relative;
  z-index: 1;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
  color: var(--ink2);
  transition: color 0.2s var(--ease-out);
}
.sw-option--active { color: var(--hq-d); font-weight: 600; }

.sw-track--default { height: 36px; }
.sw-track--default .sw-option { font-size: calc(var(--font-scale, 1) * 13px); }
.sw-track--small { height: 28px; }
.sw-track--small .sw-option { font-size: calc(var(--font-scale, 1) * 12px); }
</style>
