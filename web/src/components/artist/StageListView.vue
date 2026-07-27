<template>
  <div class="stage-list">
    <draggable v-model="localStages" item-key="id" handle=".drag-handle" @end="onDragEnd">
      <template #item="{ element: s }">
        <div class="stage-row" :class="{ 'is-final': s.isFinal }">
          <span v-if="!readonly" class="drag-handle" title="拖拽排序">⠿</span>

          <!-- 名称（点击内联编辑） -->
          <span v-if="editingId !== s.id" class="stage-name" @click="startEdit(s)">{{ s.name }}</span>
          <el-input
            v-else v-model="editName" size="small" class="name-input"
            @keyup.enter="commitEdit(s)" @blur="commitEdit(s)" ref="editInput"
          />

          <!-- 说明（点击编辑，始终占位保证对齐） -->
          <span
            v-if="descEditId !== s.id" class="stage-desc" :class="{ empty: !s.description && !readonly }"
            @click="!readonly && startDescEdit(s)"
          >
            {{ s.description || (readonly ? '' : $t('workflow.descPlaceholder')) }}
          </span>
          <el-input
            v-else v-model="descEditVal" size="small" class="desc-input"
            :placeholder="$t('workflow.descPlaceholder')"
            @keyup.enter="commitDescEdit(s)" @blur="commitDescEdit(s)" ref="descInput"
          />

          <!-- 收款区（固定宽度，右对齐） -->
          <div class="stage-pay">
            <span v-if="s.takesPayment" class="pay-badge" :class="{ auto: s.isFinal }">
              {{ s.isFinal ? $t('workflow.auto') : (s.basisPoints / 100).toFixed(1).replace(/\.0$/, '') + '%' }}
            </span>
            <span v-else class="pay-badge ghost">—</span>
            <el-switch
              v-model="s.takesPayment" size="small"
              :disabled="s.isFinal || readonly"
              @change="(val) => onTogglePay(s, val)"
            />
          </div>

          <!-- 操作区（固定宽度） -->
          <div class="stage-actions">
            <el-popconfirm
              v-if="!s.isFinal && !readonly"
              :title="s.takesPayment ? $t('workflow.deletePayHint', { pct: (s.basisPoints / 100).toFixed(1).replace(/\.0$/, '') }) : $t('workflow.deleteHint')"
              @confirm="$emit('delete', s.id)"
            >
              <template #reference>
                <el-button text size="small" type="danger" class="del-btn">✕</el-button>
              </template>
            </el-popconfirm>
            <el-tag v-else-if="s.isFinal" size="small" type="warning" effect="plain">{{ $t('workflow.final') }}</el-tag>
          </div>
        </div>
      </template>
    </draggable>

    <!-- 添加 -->
    <div v-if="!readonly" class="add-row">
      <el-input
        v-model="newName" :placeholder="$t('workflow.addPlaceholder')" size="small"
        style="max-width: 200px" @keyup.enter="addStage"
      />
      <el-button size="small" @click="addStage" :disabled="!newName.trim()">＋ {{ $t('common.add') }}</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import draggable from 'vuedraggable'

const props = defineProps({ stages: { type: Array, default: () => [] }, readonly: { type: Boolean, default: false } })
const emit = defineEmits(['reorder', 'add', 'rename', 'updateDesc', 'togglePay', 'delete'])

const localStages = ref([...props.stages])
watch(() => props.stages, (v) => { localStages.value = [...v] }, { deep: true })

const newName = ref('')
const editingId = ref(null)
const editName = ref('')
const editInput = ref(null)
const descEditId = ref(null)
const descEditVal = ref('')
const descInput = ref(null)

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

function startDescEdit(s) {
  descEditId.value = s.id
  descEditVal.value = s.description || ''
  nextTick(() => descInput.value?.[0]?.focus?.())
}

function commitDescEdit(s) {
  const val = descEditVal.value.trim()
  if (val !== (s.description || '')) {
    emit('updateDesc', s.id, val)
  }
  descEditId.value = null
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
.drag-handle { cursor: grab; color: var(--text-muted); font-size: 14px; user-select: none; flex-shrink: 0; }
.stage-name { font-weight: 600; font-size: 14px; color: var(--text-primary); cursor: pointer; flex-shrink: 0; }
.stage-name:hover { color: var(--color-primary); }
.name-input { width: 120px; flex-shrink: 0; }
.stage-desc {
  font-size: 12px; color: var(--text-secondary);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer; padding: 2px 4px; border-radius: 4px;
}
.stage-desc:hover { background: var(--color-primary-soft, rgba(52,150,219,0.08)); }
.stage-desc.empty { color: var(--text-muted); opacity: 0; transition: opacity 0.15s; font-style: italic; }
.stage-row:hover .stage-desc.empty { opacity: 0.7; }
.desc-input { flex: 1; min-width: 0; }
.stage-pay {
  display: flex; align-items: center; gap: 6px;
  width: 110px; flex-shrink: 0; justify-content: flex-end;
}
.pay-badge {
  font-size: 12px; font-weight: 700; color: var(--color-primary);
  font-variant-numeric: tabular-nums;
  min-width: 44px; text-align: right;
}
.pay-badge.auto { color: var(--color-gold); }
.pay-badge.ghost { color: var(--text-muted); font-weight: 400; }
.stage-actions { width: 64px; flex-shrink: 0; display: flex; justify-content: flex-end; }
.del-btn { opacity: 0.4; }
.stage-row:hover .del-btn { opacity: 1; }
.add-row { display: flex; gap: 8px; margin-top: 8px; }
</style>
