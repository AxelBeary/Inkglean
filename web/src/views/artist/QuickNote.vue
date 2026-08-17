<template>
  <div class="note-page">
    <h2 class="od-page-title">{{ $t('note.title') }}</h2>
    <p class="page-sub">{{ $t('note.subtitle') }}</p>

    <!-- 新增表单（818-B：同类成组 + 一行一事，说明在左控件在右） -->
    <div class="group">
      <div class="group-head">{{ $t('note.formTitle') }}</div>
      <div class="row">
        <div class="note-field-text">
          <div class="lab">{{ $t('note.titleLabel') }}</div>
          <div class="desc">{{ $t('note.titleDesc') }}</div>
        </div>
        <input
          v-model="newTitle" type="text" class="note-input"
          :placeholder="$t('note.titlePlaceholder')" maxlength="40"
        />
      </div>
      <div class="row">
        <div class="note-field-text">
          <div class="lab">{{ $t('note.contentLabel') }}</div>
          <div class="desc">{{ $t('note.contentDesc') }}</div>
        </div>
        <textarea
          v-model="newContent" class="note-textarea" rows="3"
          :placeholder="$t('note.contentPlaceholder')" maxlength="1000"
        ></textarea>
      </div>
      <div class="note-form-actions">
        <el-button type="primary" :disabled="!newContent.trim()" @click="addNote">
          {{ $t('note.add') }}
        </el-button>
      </div>
    </div>

    <!-- 条目列表（同类成组收纳） -->
    <div class="group">
      <div class="group-head">{{ $t('note.listTitle') }}</div>
      <p class="note-list-hint">{{ $t('note.listDesc') }}</p>
      <div v-if="notes.length === 0" class="note-empty">{{ $t('note.empty') }}</div>
      <div v-else class="note-list">
        <div v-for="n in notes" :key="n.id" class="page-card note-item">
          <div class="note-item-head">
            <span class="note-item-title">{{ n.title || $t('note.untitled') }}</span>
            <div class="note-item-actions">
              <button type="button" class="note-mini-btn" @click="copyNote(n)">{{ $t('note.copy') }}</button>
              <!-- A5: 删除不可恢复，先二次确认（localStorage 数据） -->
              <el-popconfirm :title="$t('note.deleteConfirm')" @confirm="removeNote(n.id)">
                <template #reference>
                  <button type="button" class="note-mini-btn">{{ $t('note.delete') }}</button>
                </template>
              </el-popconfirm>
            </div>
          </div>
          <p class="note-item-content">{{ n.content }}</p>
          <span class="note-item-time">{{ n.time }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText as copyToClipboard } from '../../utils/clipboard.js'

const { t } = useI18n()
const STORAGE_KEY = 'huiyue_quick_notes'
const notes = ref([])
const newTitle = ref('')
const newContent = ref('')

/** localStorage 读取（G-5: safeGetItem 静默降级；损坏 JSON 丢弃） */
function loadNotes() {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveNotes() {
  // G-5: 写入失败静默（safeSetItem 契约），隐私模式下仅本次会话生效
  safeSetItem(STORAGE_KEY, JSON.stringify(notes.value))
}

/** 当前时间短格式（MM-DD HH:mm） */
function nowTime() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return d.getMonth() + 1 + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function addNote() {
  const content = newContent.value.trim()
  if (!content) return
  notes.value.unshift({
    id: Date.now(),
    title: newTitle.value.trim(),
    content,
    time: nowTime()
  })
  newTitle.value = ''
  newContent.value = ''
  saveNotes()
}

function removeNote(id) {
  notes.value = notes.value.filter(n => n.id !== id)
  saveNotes()
}

/** 复制条目内容（公共 clipboard.copyText；成功提示 / 失败提示） */
async function copyNote(n) {
  if (await copyToClipboard(n.content)) {
    ElMessage.success(t('note.copied'))
  } else {
    ElMessage.error(t('note.copyFailed'))
  }
}

onMounted(() => {
  notes.value = loadNotes()
})
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.note-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; }

/* 818-B 三原则：分组卡片收纳，组头带朱砂小印点（对齐原型 .group-head） */
.group {
  margin-top: 16px;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-B 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }

.note-input {
  width: 320px;
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper);
  color: var(--ink);
  font-size: 14px;
  /* REQ-037 批4a 补漏：去 outline:none，键盘焦点环由 artist-tokens.css 全局 :focus-visible 提供 */
  transition: border-color var(--dur-fast);
}
.note-input:focus { border-color: var(--hq); }
.note-textarea {
  width: 360px;
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  font-family: inherit;
  /* REQ-037 批4a 补漏：去 outline:none，键盘焦点环由 artist-tokens.css 全局 :focus-visible 提供 */
  transition: border-color var(--dur-fast);
}
.note-textarea:focus { border-color: var(--hq); }
.note-form-actions { display: flex; justify-content: flex-end; padding: 4px 0 0; }

.note-list-hint { margin: 0 0 4px; font-size: 12px; color: var(--ink3); }

.note-empty {
  margin-top: 16px; padding: 28px; text-align: center;
  color: var(--ink3); background: var(--paper2);
  border: 1px dashed var(--line); border-radius: var(--r-m);
}

.note-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.note-item {
  padding: 16px 20px;
}
.note-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.note-item-title { font-size: 14px; font-weight: 600; color: var(--ink); }
.note-item-actions { display: flex; gap: 8px; }
.note-mini-btn {
  padding: 4px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper);
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  /* 818-B 克制动效：过渡只动颜色/边框，按压不位移 */
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.note-mini-btn:hover { border-color: var(--hq); color: var(--hq); }
.note-item-content { margin-top: 8px; font-size: 14px; line-height: 1.7; color: var(--ink2); white-space: pre-wrap; }
.note-item-time { display: block; margin-top: 8px; font-size: 12px; color: var(--ink3); }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .note-input, .note-textarea { width: 100%; }
}
</style>
