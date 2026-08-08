<template>
  <ArtistLayout>
    <div class="note-page">
      <h2 class="od-page-title">{{ $t('note.title') }}</h2>
      <p class="page-sub">{{ $t('note.subtitle') }}</p>

      <!-- 新增表单 -->
      <div class="note-form">
        <input
          v-model="newTitle" type="text" class="note-input"
          :placeholder="$t('note.titlePlaceholder')" maxlength="40"
        />
        <textarea
          v-model="newContent" class="note-textarea" rows="3"
          :placeholder="$t('note.contentPlaceholder')" maxlength="1000"
        ></textarea>
        <div class="note-form-actions">
          <el-button type="primary" :disabled="!newContent.trim()" @click="addNote">
            {{ $t('note.add') }}
          </el-button>
        </div>
      </div>

      <!-- 条目列表 -->
      <div v-if="notes.length === 0" class="note-empty">{{ $t('note.empty') }}</div>
      <div v-else class="note-list">
        <div v-for="n in notes" :key="n.id" class="note-item">
          <div class="note-item-head">
            <span class="note-item-title">{{ n.title || $t('note.untitled') }}</span>
            <div class="note-item-actions">
              <button type="button" class="note-mini-btn" @click="copyNote(n)">{{ $t('note.copy') }}</button>
              <button type="button" class="note-mini-btn" @click="removeNote(n.id)">{{ $t('note.delete') }}</button>
            </div>
          </div>
          <p class="note-item-content">{{ n.content }}</p>
          <span class="note-item-time">{{ n.time }}</span>
        </div>
      </div>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const STORAGE_KEY = 'huiyue_quick_notes'
const notes = ref([])
const newTitle = ref('')
const newContent = ref('')

/** localStorage 读取（隐私模式 try-catch 兜底） */
function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.value))
  } catch {
    ElMessage.warning(t('note.saveFailed'))
  }
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

/** 复制条目内容（与社恐回复工具同款：clipboard 优先 + execCommand 回退） */
async function copyNote(n) {
  const text = n.content
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy(text)
    }
    ElMessage.success(t('note.copied'))
  } catch {
    fallbackCopy(text)
    ElMessage.success(t('note.copied'))
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta)
}

onMounted(() => {
  notes.value = loadNotes()
})
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.note-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }

.note-form {
  margin-top: 20px; padding: 18px 20px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  display: flex; flex-direction: column; gap: 10px;
}
.note-input {
  padding: 9px 12px;
  border: 1px solid var(--line2, #dcdcdc);
  border-radius: var(--r-m, 8px);
  background: var(--paper, #faf9f6);
  color: var(--ink);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.note-input:focus { border-color: var(--hq, var(--el-color-primary)); }
.note-textarea {
  padding: 9px 12px;
  border: 1px solid var(--line2, #dcdcdc);
  border-radius: var(--r-m, 8px);
  background: var(--paper, #faf9f6);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.note-textarea:focus { border-color: var(--hq, var(--el-color-primary)); }
.note-form-actions { display: flex; justify-content: flex-end; }

.note-empty { margin-top: 20px; padding: 28px; text-align: center; color: var(--ink3, #888); background: var(--card, #fff); border: 1px dashed var(--line, #e5e5e5); border-radius: var(--r-m, 8px); }

.note-list { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
.note-item {
  padding: 16px 20px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.note-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.note-item-title { font-size: 14px; font-weight: 600; color: var(--ink); }
.note-item-actions { display: flex; gap: 8px; }
.note-mini-btn {
  padding: 4px 12px;
  border: 1px solid var(--line2, #dcdcdc);
  border-radius: var(--r-m, 8px);
  background: var(--paper, #faf9f6);
  color: var(--ink2, #555);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.35s, transform 0.15s ease-out;
}
.note-mini-btn:hover { border-color: var(--hq, var(--el-color-primary)); color: var(--hq, var(--el-color-primary)); }
.note-mini-btn:active { transform: scale(0.98); }
.note-item-content { margin-top: 8px; font-size: 14px; line-height: 1.7; color: var(--ink2, #555); white-space: pre-wrap; }
.note-item-time { display: block; margin-top: 8px; font-size: 12px; color: var(--ink3, #888); }
</style>
