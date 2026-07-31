<template>
  <div class="payment-bar">
    <div class="bar-track" ref="trackRef">
      <div
        v-for="(seg, i) in segments" :key="seg.id"
        class="bar-seg" :class="{ final: seg.isFinal, elastic: seg.id === elasticId, detach: seg.id === detachId }"
        :style="{ width: seg.width + '%', '--seg-hue': seg.hue }"
      >
        <span class="seg-label">{{ seg.name }}</span>
        <span class="seg-pct" @click="!seg.isFinal && startInput(seg)">
          <template v-if="inputId !== seg.id">{{ seg.pct }}%</template>
          <el-input-number
            v-else ref="inputRef" v-model="inputVal" :min="5" :max="95" :step="1" size="small"
            style="width: 90px" @click.stop @keyup.enter="commitInput(seg)" @blur="commitInput(seg)"
          />
        </span>
        <span v-if="seg.isFinal" class="final-badge">{{ $t('workflow.final') }}</span>
        <!-- 手柄 -->
        <div
          v-if="i < segments.length - 1" class="bar-handle"
          @pointerdown="onPointerDown($event, i)"
          tabindex="0" @keydown="onKeydown($event, i)"
          :aria-label="$t('workflow.dragHandle')"
        >
          <span class="grip"></span>
        </div>
      </div>
    </div>
    <div class="bar-ruler">
      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const props = defineProps({ stages: { type: Array, default: () => [] } })
const emit = defineEmits(['change', 'detach'])

const MIN_BP = 500
const TOTAL_BP = 10000
const SNAP = 100
const ELASTIC_THRESHOLD = 150

const trackRef = ref(null)
const elasticId = ref(null)
const detachId = ref(null)
const inputId = ref(null)
const inputVal = ref(0)
const inputRef = ref(null)

const localBp = ref({})
watch(() => props.stages, (stages) => {
  const map = {}
  for (const s of stages) { if (s.takesPayment) map[s.id] = s.basisPoints }
  localBp.value = map
}, { immediate: true, deep: true })

const payStages = computed(() => props.stages.filter(s => s.takesPayment))

const segments = computed(() => {
  return payStages.value.map((s, i) => {
    const bp = localBp.value[s.id] ?? s.basisPoints
    return {
      id: s.id, name: s.name, isFinal: s.isFinal,
      bp, pct: (bp / 100).toFixed(1).replace(/\.0$/, ''),
      width: bp / 100,
      hue: s.isFinal ? 45 : (200 + i * 40) % 360
    }
  })
})

// ─── 拖拽 ───
let dragIdx = -1, startX = 0, startLeftBp = 0, startRightBp = 0, trackW = 1

function onPointerDown(e, idx) {
  e.preventDefault()
  dragIdx = idx
  startX = e.clientX
  const segs = segments.value
  startLeftBp = segs[idx].bp
  startRightBp = segs[idx + 1].bp
  trackW = trackRef.value?.offsetWidth || 600
  e.target.setPointerCapture(e.pointerId)
  e.target.addEventListener('pointermove', onPointerMove)
  e.target.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(e) {
  if (dragIdx < 0) return
  const dx = e.clientX - startX
  const deltaBp = Math.round((dx / trackW) * TOTAL_BP / SNAP) * SNAP

  const segs = segments.value
  const leftId = segs[dragIdx].id
  const rightId = segs[dragIdx + 1].id
  const rightIsFinal = segs[dragIdx + 1].isFinal

  let newLeft = startLeftBp + deltaBp
  let newRight = startRightBp - deltaBp

  // 保护：隐含尾款不能低于 MIN_BP
  const final = payStages.value.find(s => s.isFinal)
  if (final && final.id !== leftId && final.id !== rightId) {
    const otherSum = payStages.value
      .filter(s => !s.isFinal && s.id !== leftId && s.id !== rightId)
      .reduce((sum, s) => sum + (localBp.value[s.id] ?? s.basisPoints), 0)
    const maxPair = TOTAL_BP - otherSum - MIN_BP
    if (newLeft + newRight > maxPair) {
      if (deltaBp > 0) newLeft = maxPair - newRight
      else newRight = maxPair - newLeft
    }
  }

  // 左拖：弹性 / 脱离
  if (newLeft < MIN_BP) {
    elasticId.value = leftId
    detachId.value = newLeft < ELASTIC_THRESHOLD ? leftId : null
    newLeft = Math.max(0, newLeft)
    newRight = startLeftBp + startRightBp - newLeft
  }
  // 右拖：弹性 / 脱离（与左拖对称：MIN_BP 进弹性区，ELASTIC_THRESHOLD 才脱离）
  else if (newRight < MIN_BP && !rightIsFinal) {
    elasticId.value = rightId
    detachId.value = newRight < ELASTIC_THRESHOLD ? rightId : null
    newRight = Math.max(0, newRight)
    newLeft = startLeftBp + startRightBp - newRight
  }
  else {
    elasticId.value = null
    detachId.value = null
  }

  // 尾款硬底线
  if (newRight < MIN_BP && rightIsFinal) {
    newRight = MIN_BP
    newLeft = startLeftBp + startRightBp - newRight
    elasticId.value = null
    detachId.value = null
  }

  localBp.value[leftId] = newLeft
  localBp.value[rightId] = newRight
}

function onPointerUp(e) {
  e.target.removeEventListener('pointermove', onPointerMove)

  if (detachId.value) {
    // 脱离 / 吞并：关闭该节点收款
    emit('detach', detachId.value)
  } else if (elasticId.value) {
    // Q弹回弹到 5%
    const segs = segments.value
    const leftId = segs[dragIdx]?.id
    const rightId = segs[dragIdx + 1]?.id
    const id = elasticId.value
    const otherId = id === leftId ? rightId : leftId
    const total = (localBp.value[leftId] || 0) + (localBp.value[rightId] || 0)
    localBp.value[id] = MIN_BP
    localBp.value[otherId] = Math.max(MIN_BP, total - MIN_BP)
    emitChange()
  } else {
    emitChange()
  }

  elasticId.value = null
  detachId.value = null
  dragIdx = -1
}

function emitChange() {
  const nodes = payStages.value
    .filter(s => !s.isFinal)
    .map(s => ({ id: s.id, basisPoints: localBp.value[s.id] ?? s.basisPoints }))
  emit('change', nodes)
}

// ─── 键盘 ───
function onKeydown(e, idx) {
  const step = e.shiftKey ? 500 : 100
  const segs = segments.value
  const leftId = segs[idx].id
  const rightId = segs[idx + 1].id
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    const newLeft = Math.max(MIN_BP, (localBp.value[leftId] || 0) - step)
    const diff = (localBp.value[leftId] || 0) - newLeft
    localBp.value[leftId] = newLeft
    localBp.value[rightId] = (localBp.value[rightId] || 0) + diff
    emitChange()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    const newRight = Math.max(MIN_BP, (localBp.value[rightId] || 0) - step)
    const diff = (localBp.value[rightId] || 0) - newRight
    localBp.value[rightId] = newRight
    localBp.value[leftId] = (localBp.value[leftId] || 0) + diff
    emitChange()
  }
}

// ─── 手动输入 ───
function startInput(seg) {
  inputId.value = seg.id
  inputVal.value = seg.bp / 100
  nextTick(() => {
    // 自动聚焦并全选，用户可直接输入覆盖
    const inputEl = inputRef.value?.$el?.querySelector('input')
    if (inputEl) { inputEl.focus(); inputEl.select() }
  })
}

function commitInput(seg) {
  if (inputId.value !== seg.id) return
  const newBp = Math.round(inputVal.value * 100)
  if (newBp < MIN_BP) {
    ElMessage.warning(t('workflow.minPercent'))
    inputId.value = null
    return
  }
  const final = payStages.value.find(s => s.isFinal)
  const oldBp = localBp.value[seg.id] || seg.bp
  const diff = newBp - oldBp
  const finalBp = (localBp.value[final.id] || final.basisPoints) - diff
  if (finalBp < MIN_BP) {
    ElMessage.warning(t('workflow.finalTooLow'))
    inputId.value = null
    return
  }
  localBp.value[seg.id] = newBp
  localBp.value[final.id] = finalBp
  emitChange()
  inputId.value = null
}
</script>

<style scoped>
.payment-bar { user-select: none; --seg-light: 94%; }
.bar-track {
  display: flex; height: 64px; border-radius: 10px; overflow: visible;
  border: 1px solid var(--border-color); position: relative;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.bar-seg {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px;
  position: relative; min-width: 0; overflow: hidden;
  background: hsl(var(--seg-hue, 210) 55% var(--seg-light));
  transition: width 0.15s ease, opacity 0.2s, background 0.3s;
  border-right: 1px solid var(--border-color);
}
.bar-seg:first-child { border-radius: 9px 0 0 9px; }
.bar-seg:last-child { border-right: none; border-radius: 0 9px 9px 0; }
.bar-seg:only-child { border-radius: 9px; }
.bar-seg.final { background: hsl(45 60% calc(var(--seg-light) - 2%)); }
.bar-seg.elastic { opacity: 0.55; }
.bar-seg.detach { opacity: 0.3; outline: 2px dashed var(--color-danger); outline-offset: -2px; }
.seg-label {
  font-size: 12px; color: var(--text-secondary); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 90%;
  line-height: 1.2;
}
.seg-pct {
  font-size: 15px; font-weight: 700;
  color: hsl(var(--seg-hue, 210) 50% var(--seg-text-light, 38%));
  font-variant-numeric: tabular-nums; cursor: pointer;
  line-height: 1.2;
}
.bar-seg.final .seg-pct { color: hsl(45 55% var(--seg-text-light, 35%)); }
.final-badge {
  font-size: 10px; color: hsl(45 55% var(--seg-text-light, 42%)); opacity: 0.85;
  line-height: 1; letter-spacing: 0.5px;
}
.bar-handle {
  position: absolute; right: -6px; top: 4px; bottom: 4px; width: 12px;
  cursor: col-resize; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; transition: background 0.15s;
}
.bar-handle .grip {
  width: 3px; height: 20px; border-radius: 2px;
  background: var(--border-color); transition: background 0.15s, height 0.15s;
}
.bar-handle:hover, .bar-handle:focus {
  background: hsl(var(--seg-hue, 210) 50% 50% / 0.15);
}
.bar-handle:hover .grip, .bar-handle:focus .grip {
  background: hsl(var(--seg-hue, 210) 50% 45%); height: 28px;
}
.bar-ruler {
  display: flex; justify-content: space-between;
  font-size: 10px; color: var(--text-muted); margin-top: 4px; padding: 0 2px;
}

/* ===== 暗色适配（A5）=====
   浅色 94% 亮度段底在暗色下刺眼 → 段底压暗至 22%，文字提亮至 72%。
   色相/饱和度不变，保持分段辨识色。 */
html.dark .payment-bar { --seg-light: 22%; --seg-text-light: 72%; }
html.dark .bar-track { box-shadow: none; }
html.dark .bar-handle:hover, html.dark .bar-handle:focus {
  background: hsl(var(--seg-hue, 210) 50% 60% / 0.2);
}
html.dark .bar-handle:hover .grip, html.dark .bar-handle:focus .grip {
  background: hsl(var(--seg-hue, 210) 50% 65%);
}
</style>
