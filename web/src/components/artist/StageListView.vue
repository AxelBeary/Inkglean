<template>
  <div class="stage-list">
    <draggable v-model="localStages" item-key="id" handle=".drag-handle" @end="onDragEnd">
      <template #item="{ element: s }">
        <div class="stage-item">
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

          <!-- plan-node-speech：话术编辑区（变量标签 + 输入框 + 保存） -->
          <div v-if="!readonly" class="stage-speech">
            <div class="speech-vars">
              <span class="speech-vars-label">💬 {{ $t('workflow.speechLabel') }}</span>
              <button
                v-for="v in SPEECH_VARS" :key="v" type="button" class="speech-var"
                :title="$t('workflow.speechVarHint')"
                @click="insertSpeechVar(s, v)"
              >
                {{ v }}
              </button>
            </div>
            <div class="speech-editor">
              <el-input
                v-model="s.speechTemplate" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                :placeholder="$t('workflow.speechPlaceholder')" maxlength="500" show-word-limit
                :ref="(el) => setSpeechRef(s.id, el)"
                @input="speechDirtyId = s.id"
              />
              <el-button
                v-if="speechDirtyId === s.id" size="small" type="primary" class="speech-save"
                @click="commitSpeech(s)"
              >
                {{ $t('workflow.speechSave') }}
              </el-button>
            </div>
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
const emit = defineEmits(['reorder', 'add', 'rename', 'updateDesc', 'togglePay', 'delete', 'updateSpeech'])

const localStages = ref([...props.stages])
watch(() => props.stages, (v) => { localStages.value = [...v] }, { deep: true })

// ─── plan-node-speech：话术编辑 ───
/** 变量标签列表（后端契约，中英文界面均保持中文原文） */
const SPEECH_VARS = ['{客户名}', '{客户QQ}', '{订单号}', '{档位名}', '{节点名}', '{截稿日}', '{总价}', '{已付}', '{待付}']
const speechDirtyId = ref(null)
const speechRefs = new Map()

function setSpeechRef(id, el) {
  if (el) speechRefs.set(id, el)
  else speechRefs.delete(id)
}

/** 点击变量标签 → 插入光标位置（无焦点则追加到末尾） */
function insertSpeechVar(s, varText) {
  const el = speechRefs.get(s.id)
  const textarea = el?.textarea ?? el?.$el?.querySelector('textarea')
  if (textarea) {
    const start = textarea.selectionStart ?? (s.speechTemplate || '').length
    const end = textarea.selectionEnd ?? start
    const val = s.speechTemplate || ''
    s.speechTemplate = val.slice(0, start) + varText + val.slice(end)
    nextTick(() => {
      textarea.focus()
      const pos = start + varText.length
      textarea.setSelectionRange(pos, pos)
    })
  } else {
    s.speechTemplate = (s.speechTemplate || '') + varText
  }
  speechDirtyId.value = s.id
}

/** 保存话术（仅 dirty 时触发） */
function commitSpeech(s) {
  emit('updateSpeech', s.id, (s.speechTemplate || '').trim())
  speechDirtyId.value = null
}

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

/* ─── plan-node-speech：话术编辑区 ─── */
.stage-speech {
  margin: 4px 0 0 32px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-secondary, rgba(0,0,0,0.025));
}
.speech-vars { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 6px; }
.speech-vars-label { font-size: 12px; color: var(--text-secondary); margin-right: 4px; }
.speech-var {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: var(--color-primary-soft, rgba(52,150,219,0.08));
  color: var(--color-primary); border: 1px solid transparent;
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
  line-height: 1.6;
}
.speech-var:hover { border-color: var(--color-primary); background: rgba(52,150,219,0.14); }
.speech-editor { display: flex; gap: 8px; align-items: flex-start; }
.speech-editor .el-textarea { flex: 1; }
.speech-save { flex-shrink: 0; margin-top: 2px; }
</style>
