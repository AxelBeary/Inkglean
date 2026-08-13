<template>
  <div class="stage-list">
    <!-- #8: 话术变量公共区（只显示一次，点击插入当前聚焦的话术编辑框） -->
    <div v-if="!readonly" class="speech-vars-common">
      <span class="speech-vars-label">{{ $t('workflow.speechVarCommon') }}</span>
      <button
        v-for="v in SPEECH_VARS" :key="v.token" type="button" class="speech-var"
        :title="$t('workflow.speechVarHint')"
        @click="insertSpeechVarToFocused(v.token)"
      >
        {{ $t(v.labelKey) }}
      </button>
      <span v-if="!focusedSpeechId" class="speech-vars-hint">{{ $t('workflow.speechVarNoFocus') }}</span>
    </div>
    <draggable v-model="localStages" item-key="id" handle=".drag-handle" @end="onDragEnd">
      <template #item="{ element: s, index }">
        <div class="stage-item">
          <div class="stage-row" :class="{ 'is-final': s.isFinal }">
            <span v-if="!readonly" class="drag-handle" :title="$t('workflow.dragSort')">⠿</span>
            <!-- 键盘等价：上移/下移（拖拽排序的可达替代） -->
            <span v-if="!readonly" class="stage-move" role="group" :aria-label="$t('workflow.reorderLabel')">
              <button
                type="button" class="stage-move-btn" :disabled="index === 0"
                :aria-label="$t('workflow.moveUp')" :title="$t('workflow.moveUp')"
                @click.stop="moveStage(s, -1)"
              >
                ↑
              </button>
              <button
                type="button" class="stage-move-btn" :disabled="index === localStages.length - 1"
                :aria-label="$t('workflow.moveDown')" :title="$t('workflow.moveDown')"
                @click.stop="moveStage(s, 1)"
              >
                ↓
              </button>
            </span>

            <!-- 名称（点击内联编辑） -->
            <button
              v-if="editingId !== s.id" type="button" class="stage-name"
              @click="startEdit(s)"
            >
              {{ s.name }}
            </button>
            <el-input
              v-else v-model="editName" size="small" class="name-input"
              @keyup.enter="commitEdit(s)" @blur="commitEdit(s)" ref="editInput"
            />

            <!-- 说明（点击编辑，始终占位保证对齐） -->
            <button
              v-if="descEditId !== s.id" type="button" class="stage-desc"
              :class="{ empty: !s.description && !readonly }"
              :disabled="readonly"
              @click="startDescEdit(s)"
            >
              {{ s.description || (readonly ? '' : $t('workflow.descPlaceholder')) }}
            </button>
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
                  <el-button text size="small" type="danger" class="del-btn" :aria-label="$t('workflow.deleteStage')">✕</el-button>
                </template>
              </el-popconfirm>
              <el-tag v-else-if="s.isFinal" size="small" type="warning" effect="plain">{{ $t('workflow.final') }}</el-tag>
            </div>
          </div>

          <!-- #8: 话术编辑区（节点≥3 默认折叠，显示节点名+前20字预览；变量按钮已移到顶部公共区） -->
          <div v-if="!readonly" class="stage-speech" :class="{ 'stage-speech--collapsed': isSpeechCollapsed(s) }">
            <button
              type="button" class="speech-head"
              :aria-expanded="!isSpeechCollapsed(s)"
              @click="toggleSpeech(s.id)"
            >
              <span class="speech-toggle">{{ isSpeechCollapsed(s) ? '▸' : '▾' }}</span>
              <span class="speech-head-label">{{ $t('workflow.speechLabel') }}</span>
              <span v-if="isSpeechCollapsed(s) && s.speechTemplate" class="speech-preview">
                {{ speechPreview(s.speechTemplate) }}
              </span>
              <span v-else-if="isSpeechCollapsed(s)" class="speech-preview speech-preview--empty">{{ $t('workflow.speechEmpty') }}</span>
            </button>
            <div v-show="!isSpeechCollapsed(s)" class="speech-editor">
              <el-input
                v-model="s.speechTemplate" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                :placeholder="$t('workflow.speechPlaceholder')" maxlength="500" show-word-limit
                :ref="(el) => setSpeechRef(s.id, el)"
                @input="speechDirtyId = s.id"
                @focus="focusedSpeechId = s.id"
              />
              <div class="speech-side">
                <!-- v0.27: 多模板随机开关（后端 random_template 契约，多条话术时可选随机发送） -->
                <el-tooltip :content="$t('workflow.randomTemplateHint')" :disabled="hasMultiSpeech(s)">
                  <span class="random-wrap">
                    <el-checkbox
                      v-model="s.randomTemplate"
                      :disabled="!hasMultiSpeech(s)"
                      @change="speechDirtyId = s.id"
                    >
                      {{ $t('workflow.randomTemplate') }}
                    </el-checkbox>
                  </span>
                </el-tooltip>
                <el-button
                  v-if="speechDirtyId === s.id" size="small" type="primary" class="speech-save"
                  @click="commitSpeech(s)"
                >
                  {{ $t('workflow.speechSave') }}
                </el-button>
              </div>
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
import { ref, computed, watch, nextTick } from 'vue'
import draggable from 'vuedraggable'

const props = defineProps({ stages: { type: Array, default: () => [] }, readonly: { type: Boolean, default: false } })
const emit = defineEmits(['reorder', 'add', 'rename', 'updateDesc', 'togglePay', 'delete', 'updateSpeech'])

const localStages = ref([...props.stages])
watch(() => props.stages, (v) => { localStages.value = [...v] }, { deep: true })

// ─── plan-node-speech：话术编辑 ───
/** 变量按钮列表：labelKey 为显示名（b4-11 键化），token 为后端契约中文原文（插入时不变） */
const SPEECH_VARS = [
  { token: '{客户名}', labelKey: 'workflow.speechVar.clientName' },
  { token: '{客户QQ}', labelKey: 'workflow.speechVar.clientQq' },
  { token: '{订单号}', labelKey: 'workflow.speechVar.orderNo' },
  { token: '{档位名}', labelKey: 'workflow.speechVar.tierName' },
  { token: '{节点名}', labelKey: 'workflow.speechVar.stageName' },
  { token: '{截稿日}', labelKey: 'workflow.speechVar.deadline' },
  { token: '{总价}', labelKey: 'workflow.speechVar.totalPrice' },
  { token: '{已付}', labelKey: 'workflow.speechVar.paid' },
  { token: '{待付}', labelKey: 'workflow.speechVar.unpaid' }
]
const speechDirtyId = ref(null)
const speechRefs = new Map()

// ─── #8: 折叠 + 焦点跟踪 ───
/** 当前聚焦的话术编辑框所属节点 ID（变量公共区插入目标） */
const focusedSpeechId = ref(null)
/** 用户手动展开的节点 ID 集合（节点≥3 时默认折叠，展开后记住） */
const expandedIds = ref(new Set())

/** 节点≥3 时话术区默认折叠（REQ-013 #8 验收 2） */
const speechDefaultCollapsed = computed(() => localStages.value.length >= 3)

function isSpeechCollapsed(s) {
  if (!speechDefaultCollapsed.value) return false
  if (expandedIds.value.has(s.id)) return false
  if (speechDirtyId.value === s.id) return false // 编辑中不折叠
  return true
}
function toggleSpeech(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

/** 折叠态预览：前 20 字（REQ-013 #8 验收 2） */
function speechPreview(text) {
  const t = (text || '').trim()
  return t.length > 20 ? t.slice(0, 20) + '…' : t
}

function setSpeechRef(id, el) {
  if (el) speechRefs.set(id, el)
  else speechRefs.delete(id)
}

/** #8: 顶部公共区点击变量 → 插入当前聚焦的编辑框（无焦点时提示，不盲插） */
function insertSpeechVarToFocused(varText) {
  if (!focusedSpeechId.value) return
  const s = localStages.value.find(st => st.id === focusedSpeechId.value)
  if (s) insertSpeechVar(s, varText)
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

/** 话术是否含多条（换行分隔 ≥2 条非空行）——随机开关仅在多条时有意义 */
function hasMultiSpeech(s) {
  return (s.speechTemplate || '').split('\n').filter(l => l.trim()).length >= 2
}

/** 保存话术（仅 dirty 时触发；附带随机开关状态，v0.27） */
function commitSpeech(s) {
  emit('updateSpeech', s.id, {
    speechTemplate: (s.speechTemplate || '').trim(),
    randomTemplate: !!s.randomTemplate
  })
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

/** 键盘上移/下移（拖拽排序的键盘等价；完成后走同一条 reorder 持久化） */
function moveStage(s, direction) {
  const idx = localStages.value.findIndex(st => st.id === s.id)
  const target = idx + direction
  if (idx < 0 || target < 0 || target >= localStages.value.length) return
  const next = localStages.value.slice()
  ;[next[idx], next[target]] = [next[target], next[idx]]
  localStages.value = next
  emit('reorder', next.map(st => st.id))
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
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
.stage-list { display: flex; flex-direction: column; gap: 4px; }
.stage-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: var(--r-m);
  background: var(--card); border: 1px solid var(--line);
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.stage-row:hover { border-color: var(--hq); }
/* 终态节点：赭石=客户/完结语义（原 color-gold） */
.stage-row.is-final { border-color: var(--zhe); background: var(--zhe-t); }
.drag-handle { cursor: grab; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 14px); user-select: none; flex-shrink: 0; }
.stage-move { display: inline-flex; gap: 1px; flex-shrink: 0; }
.stage-move-btn {
  width: 20px; height: 20px; padding: 0;
  border: none; border-radius: var(--r-s);
  background: none; color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 11px); font-weight: 700; line-height: 1;
  cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.stage-move-btn:hover:not(:disabled) { color: var(--hq); background: var(--hq-t); }
.stage-move-btn:disabled { opacity: 0.35; cursor: default; }
.stage-name {
  font-weight: 600; font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); cursor: pointer; flex-shrink: 0;
  padding: 0; border: none; background: none; font-family: inherit; text-align: inherit;
}
.stage-name:hover { color: var(--hq); }
.name-input { width: 120px; flex-shrink: 0; }
.stage-desc {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer; padding: 2px 4px; border-radius: var(--r-s);
  border: none; background: none; font-family: inherit; text-align: inherit;
}
.stage-desc:disabled { cursor: default; }
.stage-desc:hover { background: var(--hq-t); }
.stage-desc.empty { color: var(--ink3); opacity: 0; transition: opacity var(--dur-fast); font-style: italic; }
.stage-row:hover .stage-desc.empty { opacity: 0.7; }
.desc-input { flex: 1; min-width: 0; }
.stage-pay {
  display: flex; align-items: center; gap: 6px;
  width: 110px; flex-shrink: 0; justify-content: flex-end;
}
/* 比例数字：统计数字墨色不上色铁律（REQ §1.1） */
.pay-badge {
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums;
  min-width: 44px; text-align: right;
}
.pay-badge.auto { color: var(--zhe); }
.pay-badge.ghost { color: var(--ink3); font-weight: 400; }
.stage-actions { width: 64px; flex-shrink: 0; display: flex; justify-content: flex-end; }
.del-btn { opacity: 0.4; }
.stage-row:hover .del-btn { opacity: 1; }
.add-row { display: flex; gap: 8px; margin-top: 8px; }

/* ─── plan-node-speech：话术编辑区 ─── */
/* #8: 变量公共区（顶部，只显示一次） */
.speech-vars-common {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  margin-bottom: 10px; padding: 8px 10px;
  border-radius: var(--r-m);
  background: var(--hq-t);
  border: 1px dashed color-mix(in srgb, var(--hq) 35%, transparent);
}
.speech-vars-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3); font-style: italic; margin-left: 4px; }

.stage-speech {
  margin: 4px 0 0 32px;
  padding: 8px 10px;
  border-radius: var(--r-m);
  background: var(--paper2);
  transition: background var(--dur-fast);
}
/* #8: 折叠态更紧凑 */
.stage-speech--collapsed { padding: 4px 10px; }
/* #8: 折叠头（可点击展开/收起） */
.speech-head {
  display: flex; align-items: center; gap: 6px;
  cursor: pointer; user-select: none;
  padding: 2px 0;
  border: none; background: none; font-family: inherit; color: inherit; text-align: inherit;
}
.speech-toggle { font-size: calc(var(--font-scale, 1) * 10px); color: var(--ink3); width: 12px; flex-shrink: 0; }
.speech-head-label { font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink2); flex-shrink: 0; }
.speech-preview {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.speech-preview--empty { font-style: italic; opacity: 0.6; }
.speech-vars { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 6px; }
.speech-vars-label { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin-right: 4px; }
.speech-var {
  font-size: calc(var(--font-scale, 1) * 11px); padding: 1px 6px; border-radius: var(--r-s);
  background: var(--hq-t);
  color: var(--hq); border: 1px solid transparent;
  cursor: pointer; transition: border-color var(--dur-fast), background var(--dur-fast);
  line-height: 1.6;
}
.speech-var:hover { border-color: var(--hq); background: color-mix(in srgb, var(--hq) 14%, transparent); }
.speech-editor { display: flex; gap: 8px; align-items: flex-start; }
.speech-editor .el-textarea { flex: 1; }
/* v0.27: 随机开关 + 保存按钮纵向排列 */
.speech-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; margin-top: 2px; }
.random-wrap { display: inline-flex; } /* tooltip 需要包裹层承接 disabled checkbox 的悬停事件 */
.speech-save { flex-shrink: 0; }
</style>
