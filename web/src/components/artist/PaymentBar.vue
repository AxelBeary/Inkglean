<template>
  <div class="payment-bar">
    <!-- 比例条 -->
    <div class="bar-track" ref="trackRef">
      <div v-for="(seg, i) in segments" :key="seg.id"
        class="bar-seg" :class="{ final: seg.isFinal, elastic: seg.id === elasticId, detach: seg.id === detachId }"
        :style="{ width: seg.width + '%' }">
        <span class="seg-label">{{ seg.name }}</span>
        <span class="seg-pct" @click="startInput(seg)" v-if="!seg.isFinal">
          <template v-if="inputId !== seg.id">{{ seg.pct }}%</template>
          <el-input-number v-else v-model="inputVal" :min="5" :max="95" :step="0.5" size="small"
            style="width: 90px" @keyup.enter="commitInput(seg)" @blur="commitInput(seg)" />
        </span>
        <span class="seg-pct" v-else>{{ seg.pct }}% 🔒</span>
        <!-- 手柄（非尾款段右侧） -->
        <div v-if="i < segments.length - 1" class="bar-handle"
          @pointerdown="onPointerDown($event, i)"
          tabindex="0" @keydown="onKeydown($event, i)"
          :aria-label="$t('workflow.dragHandle')"></div>
      </div>
    </div>
    <!-- 标尺 -->
    <div class="bar-ruler"><span>0%</span><span>100%</span></div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const props = defineProps({ stages: { type: Array, default: () => [] } })
const emit = defineEmits(['change', 'detach'])

const MIN_BP = 500
const SNAP = 100
const ELASTIC_THRESHOLD = 150 // 脱离阈值（基点）

const trackRef = ref(null)
const elasticId = ref(null)
const detachId = ref(null)
const inputId = ref(null)
const inputVal = ref(0)

// 本地可拖拽状态（基点数组）
const localBp = ref({})
watch(() => props.stages, (stages) => {
  const map = {}
  for (const s of stages) { if (s.takesPayment) map[s.id] = s.basisPoints }
  localBp.value = map
}, { immediate: true, deep: true })

const payStages = computed(() => props.stages.filter(s => s.takesPayment))

const segments = computed(() => {
  return payStages.value.map(s => {
    const bp = localBp.value[s.id] ?? s.basisPoints
    return {
      id: s.id, name: s.name, isFinal: s.isFinal,
      bp, pct: (bp / 100).toFixed(1).replace(/\.0$/, ''),
      width: bp / 100
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
  let deltaBp = Math.round((dx / trackW) * 10000 / SNAP) * SNAP

  const segs = segments.value
  const leftId = segs[dragIdx].id
  const rightId = segs[dragIdx + 1].id
  const rightIsFinal = segs[dragIdx + 1].isFinal

  let newLeft = startLeftBp + deltaBp
  let newRight = startRightBp - deltaBp

  // 弹性区检测（左侧段）
  if (newLeft < MIN_BP) {
    elasticId.value = leftId
    if (newLeft < ELASTIC_THRESHOLD) { detachId.value = leftId } else { detachId.value = null }
    // 弹性视觉：clamp 到最小，但记录意图
    newLeft = Math.max(0, newLeft)
    newRight = startLeftBp + startRightBp - newLeft
  } else {
    elasticId.value = null
    detachId.value = null
  }

  // 右侧段边界（尾款不低于 5%）
  if (newRight < MIN_BP) {
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
  const segs = segments.value
  const leftId = segs[dragIdx]?.id

  if (detachId.value && leftId) {
    // 脱离：移除该收款节点
    emit('detach', leftId)
  } else if (elasticId.value && leftId) {
    // 弹回 5%（P2-2: 保护右侧不低于 MIN_BP）
    const rightId = segs[dragIdx + 1]?.id
    const total = (localBp.value[leftId] || 0) + (localBp.value[rightId] || 0)
    localBp.value[leftId] = MIN_BP
    localBp.value[rightId] = Math.max(MIN_BP, total - MIN_BP)
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
  const step = e.shiftKey ? 500 : 50
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
}

function commitInput(seg) {
  if (inputId.value !== seg.id) return
  const newBp = Math.round(inputVal.value * 100)
  if (newBp < MIN_BP) {
    ElMessage.warning(t('workflow.minPercent'))
    inputId.value = null
    return
  }
  // 差值由尾款吸收
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
.payment-bar { user-select: none; }
.bar-track {
  display: flex; height: 48px; border-radius: 8px; overflow: hidden;
  border: 1px solid var(--border-color); position: relative;
}
.bar-seg {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; min-width: 0; overflow: hidden;
  background: var(--color-primary-soft); transition: width 0.1s, opacity 0.2s;
  border-right: 1px solid var(--border-color);
}
.bar-seg:last-child { border-right: none; }
.bar-seg.final {
  background: repeating-linear-gradient(45deg, transparent, transparent 4px, var(--color-gold-soft, rgba(176,141,30,0.08)) 4px, var(--color-gold-soft, rgba(176,141,30,0.08)) 8px);
}
.bar-seg.elastic { opacity: 0.5; }
.bar-seg.detach { opacity: 0.3; border: 2px dashed var(--color-danger); }
.seg-label { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.seg-pct { font-size: 13px; font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums; cursor: pointer; }
.bar-seg.final .seg-pct { color: var(--color-gold); cursor: default; }
.bar-handle {
  position: absolute; right: -4px; top: 0; bottom: 0; width: 8px;
  cursor: col-resize; z-index: 2; background: transparent;
}
.bar-handle:hover, .bar-handle:focus { background: var(--color-primary); opacity: 0.3; border-radius: 2px; }
.bar-ruler { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 2px; }
</style>
