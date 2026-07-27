<template>
  <div class="stage-list">
    <draggable v-model="localStages" item-key="id" handle=".drag-handle" @end="onDragEnd">
      <template #item="{ element: s }">
        <div class="stage-row" :class="{ 'is-final': s.isFinal }">
          <span v-if="!readonly" class="drag-handle" title="拖拽排序">⠿</span>

          <!-- 名称（点击内联编辑） -->
          <span v-if="editingId !== s.id" class="stage-name" @click="startEdit(s)">{{ s.name }}</span>
          <el-input v-else v-model="editName" size="small" style="width: 120px"
            @keyup.enter="commitEdit(s)" @blur="commitEdit(s)" ref="editInput" />

          <span v-if="s.description" class="stage-desc">{{ s.description }}</span>

          <!-- 收款开关 -->
          <div class="stage-pay">
            <el-switch v-model="s.takesPayment" size="small"
              :disabled="s.isFinal || readonly"
              @change="(val) => onTogglePay(s, val)" />
            <span v-if="s.takesPayment" class="pay-badge" :class="{ auto: s.isFinal }">
              {{ s.isFinal ? $t('workflow.auto') : (s.basisPoints / 100).toFixed(1).replace(/\.0$/, '') + '%' }}
            </span>
          </div>

          <!-- 删除 -->
          <el-popconfirm v-if="!s.isFinal && !readonly"
            :title="s.takesPayment ? $t('workflow.deletePayHint', { pct: (s.basisPoints / 100).toFixed(1).replace(/\.0$/, '') }) : $t('workflow.deleteHint')"
            @confirm="$emit('delete', s.id)">
            <template #reference>
              <el-button text size="small" type="danger" class="del-btn">✕</el-button>
            </template>
          </el-popconfirm>

          <el-tag v-if="s.isFinal" size="small" type="warning" effect="plain">🔒 {{ $t('workflow.final') }}</el-tag>
        </div>
      </template>
    </draggable>

    <!-- 添加 -->
    <div v-if="!readonly" class="add-row">
      <el-input v-model="newName" :placeholder="$t('workflow.addPlaceholder')" size="small"
        style="max-width: 200px" @keyup.enter="addStage" />
      <el-button size="small" @click="addStage" :disabled="!newName.trim()">＋ {{ $t('common.add') }}</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import draggable from 'vuedraggable'

const props = defineProps({ stages: { type: Array, default: () => [] }, readonly: { type: Boolean, default: false } })
const emit = defineEmits(['reorder', 'add', 'rename', 'togglePay', 'delete'])

const localStages = ref([...props.stages])
watch(() => props.stages, (v) => { localStages.value = [...v] }, { deep: true })

const newName = ref('')
const editingId = ref(null)
const editName = ref('')
const editInput = ref(null)

function onDragEnd() {
  emit('reorder', localStages.value.map(s => s.id))
}

function addStage() {
  if (!newName.value.trim()) return
  emit('add', { name: newName.value.trim() })
  newName.value = ''
}

function startEdit(s) {
  editingId.value = s.id
  editName.value = s.name
  nextTick(() => editInput.value?.[0]?.focus?.())
}

function commitEdit(s) {
  if (editName.value.trim() && editName.value.trim() !== s.name) {
    emit('rename', s.id, editName.value.trim())
  }
  editingId.value = null
}

function onTogglePay(s, val) {
  emit('togglePay', s.id, val)
}
</script>

<style scoped>
.stage-list { display: flex; flex-direction: column; gap: 4px; }
.stage-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px;
  background: var(--bg-card); border: 1px solid var(--border-color);
  transition: background 0.15s, border-color 0.15s;
}
.stage-row:hover { border-color: var(--color-primary); }
.stage-row.is-final { border-color: var(--color-gold); background: var(--color-gold-soft, rgba(176,141,30,0.06)); }
.drag-handle { cursor: grab; color: var(--text-muted); font-size: 14px; user-select: none; }
.stage-name { font-weight: 600; font-size: 14px; color: var(--text-primary); cursor: pointer; }
.stage-name:hover { color: var(--color-primary); }
.stage-desc { font-size: 12px; color: var(--text-secondary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stage-pay { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.pay-badge {
  font-size: 12px; font-weight: 700; color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.pay-badge.auto { color: var(--color-gold); }
.del-btn { opacity: 0.4; }
.stage-row:hover .del-btn { opacity: 1; }
.add-row { display: flex; gap: 8px; margin-top: 8px; }
</style>
