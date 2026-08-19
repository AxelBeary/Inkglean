<template>
  <div class="clients-page">
    <h2 class="od-page-title">{{ $t('clients.title') }}</h2>

    <!-- 顶部搜索：QQ 过滤（后端 GET /artist/tools/clients?qq= 支持） -->
    <div class="clients-toolbar">
      <el-input
        v-model="searchQq"
        :placeholder="$t('clients.searchPlaceholder')"
        clearable
        class="clients-search"
        @input="onSearchInput"
      />
    </div>

    <!-- 客户标记表格 -->
    <el-table :data="items" v-loading="loading" class="clients-table">
      <el-table-column :label="$t('clients.qq')" prop="clientQq" min-width="120" />
      <el-table-column :label="$t('clients.tags')" min-width="220">
        <template #default="{ row }">
          <div class="clients-tags">
            <el-tag v-for="tag in (row.tags || [])" :key="tag" size="small">{{ tag }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="$t('clients.note')" prop="note" min-width="180" show-overflow-tooltip />
      <el-table-column :label="$t('clients.actions')" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">{{ $t('clients.edit') }}</el-button>
          <el-button link type="danger" @click="removeClient(row)">{{ $t('clients.delete') }}</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span>{{ $t('clients.empty') }}</span>
      </template>
    </el-table>

    <!-- 编辑弹窗：QQ 只读；标签 allow-create（默认空）；备注 ≤200 -->
    <el-dialog v-model="editVisible" :title="t('clients.editTitle')" width="480px" :close-on-click-modal="false">
      <el-form label-position="top" @submit.prevent="saveEdit">
        <el-form-item :label="$t('clients.qq')">
          <el-input :model-value="editForm.qq" disabled />
        </el-form-item>
        <el-form-item :label="$t('clients.tags')">
          <el-select
            v-model="editForm.tags"
            multiple allow-create filterable default-first-option
            :multiple-limit="20"
            :placeholder="$t('clients.tags')"
            class="clients-tag-select"
          >
            <el-option v-for="tag in editForm.tags" :key="tag" :value="tag" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('clients.note')">
          <el-input v-model="editForm.note" type="textarea" :rows="3" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ $t('clients.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">{{ $t('clients.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../api/index.js'
import type { ClientProfile } from '../../api/types.js'

const { t } = useI18n()
const items = ref<ClientProfile[]>([])
const loading = ref(false)
const searchQq = ref('')

// 搜索防抖 + 竞态保护（300ms；慢请求不得覆盖快请求）
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0
function onSearchInput() {
  clearTimeout(searchTimer ?? undefined)
  searchTimer = setTimeout(loadClients, 300)
}
onUnmounted(() => clearTimeout(searchTimer ?? undefined))

async function loadClients() {
  const mySeq = ++searchSeq
  loading.value = true
  try {
    const res = await artistApi.getToolsClients(searchQq.value.trim())
    if (mySeq !== searchSeq) return
    items.value = res.items || []
  } catch (err) {
    if (mySeq !== searchSeq) return
    items.value = []
    ElMessage.error((err instanceof Error ? err.message : '') || t('clients.loadFailed'))
  } finally {
    if (mySeq === searchSeq) loading.value = false
  }
}

// ─── 编辑弹窗 ───
const editVisible = ref(false)
const saving = ref(false)
const editForm = reactive({ qq: '', tags: [] as string[], note: '' })

function openEdit(row: ClientProfile) {
  editForm.qq = row.clientQq
  editForm.tags = Array.isArray(row.tags) ? row.tags.slice() : []
  editForm.note = row.note || ''
  editVisible.value = true
}

/** 表单校验 = 后端子集（PUT 规则：tags ≤20、每项 1-20 字符；note ≤200） */
function validateEdit() {
  if (editForm.tags.length > 20) {
    ElMessage.warning(t('clients.tagsMax'))
    return false
  }
  for (const tag of editForm.tags) {
    const s = String(tag).trim()
    if (s.length < 1 || s.length > 20) {
      ElMessage.warning(t('clients.tagLength'))
      return false
    }
  }
  if (editForm.note.length > 200) {
    ElMessage.warning(t('clients.noteMax'))
    return false
  }
  return true
}

async function saveEdit() {
  if (!validateEdit()) return
  saving.value = true
  try {
    await artistApi.saveToolsClient(editForm.qq, {
      tags: editForm.tags.map(tag => String(tag).trim()).filter(Boolean),
      note: editForm.note.trim()
    })
    editVisible.value = false
    ElMessage.success(t('clients.saveSuccess'))
    await loadClients()
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || t('clients.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function removeClient(row: ClientProfile) {
  try {
    await ElMessageBox.confirm(t('clients.deleteConfirm'), t('common.confirmDeleteTitle'), {
      confirmButtonText: t('clients.delete'),
      cancelButtonText: t('clients.cancel'),
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await artistApi.deleteToolsClient(row.clientQq)
    ElMessage.success(t('clients.deleteSuccess'))
    await loadClients()
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || t('clients.deleteFailed'))
  }
}

onMounted(loadClients)
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.clients-page { padding: 24px; max-width: 960px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.clients-toolbar { margin-top: 20px; display: flex; align-items: center; }
.clients-search { width: 260px; }
.clients-table { margin-top: 16px; background: var(--card, #fff); border: 1px solid var(--line, #e5e5e5); border-radius: var(--r-m, 8px); }
.clients-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.clients-tag-select { width: 100%; }
</style>
