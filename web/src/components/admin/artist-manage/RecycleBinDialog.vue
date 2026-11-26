<template>
  <!-- 回收站（从主页迁入：孤儿文件可恢复；REQ-022 F4 分页） -->
  <el-dialog v-model="recycleVisible" :title="$t('admin.recycleBin.title')" width="720px" :close-on-click-modal="false">
    <div class="recycle-body">
      <el-table v-if="recycleLoading || recycleItems.length > 0" :data="recycleItems" v-loading="recycleLoading" stripe max-height="420">
        <el-table-column prop="fileName" :label="$t('admin.recycleBin.colFile')" min-width="160" show-overflow-tooltip />
        <el-table-column prop="originalPath" :label="$t('admin.recycleBin.colPath')" min-width="180" show-overflow-tooltip />
        <el-table-column :label="$t('admin.recycleBin.colSize')" width="90">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column :label="$t('admin.recycleBin.colMovedAt')" width="160">
          <template #default="{ row }">{{ formatDateTime(row.movedAt) }}</template>
        </el-table-column>
        <!-- M-6：回收站恢复入口——带列表返回的 binPath 精确恢复同名条目之一 -->
        <el-table-column :label="$t('common.actions')" width="90">
          <template #default="{ row }">
            <el-button
              size="small" text type="primary"
              :loading="restoringKey === restoreKey(row)" :disabled="restoringKey != null"
              @click="handleRestore(row)"
            >
              {{ $t('admin.deletedArtists.restore') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('admin.recycleBin.emptyHint')" />
      <!-- REQ-022 F4: 分页（每页 20 条） -->
      <div v-if="recycleTotal > 0" class="pager">
        <el-pagination
          v-model:current-page="recyclePage"
          :page-size="recyclePageSize"
          :total="recycleTotal"
          layout="total, prev, pager, next"
          @current-change="loadRecycleBin"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="recycleVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button v-if="recycleTotal > 0" type="danger" plain :loading="emptying" @click="handleEmptyRecycleBin">
        {{ $t('admin.recycleBin.empty') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// F-09 巨型文件拆分：自 views/admin/ArtistManage.vue 整体搬入（回收站弹窗），
// 模板/文案键/样式取值一字未改；入口按钮留在父页，父页只置显本组件 v-model。
import { ref, watch } from 'vue'
import { adminApi } from '../../../api/index'
import type { RecycleBinItem } from '../../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../../utils/datetime'

const { t } = useI18n()

// ─── 回收站（从主页迁入：孤儿文件可恢复；REQ-022 F4 分页） ───
// M-6 / B7-F0109：列表接口实际下发 binPath（回收站内相对路径，服务端恢复端点据此精确定位
// 同名条目之一）。api/types 的 RecycleBinItem 尚未补该字段，本批次只在弹窗内做局部放宽，
// 不改 api/types（跨端共享类型归口），避免把兼容字段散播到别的消费方。
type RecycleBinRow = RecycleBinItem & { binPath?: string }
const recycleVisible = defineModel({ type: Boolean, default: false })
const recycleItems = ref<RecycleBinRow[]>([])
const recycleLoading = ref(false)
const emptying = ref(false)
const restoringKey = ref<string | null>(null)
const recyclePage = ref(1)
const recyclePageSize = 20
const recycleTotal = ref(0)

// 打开即回第 1 页重拉（与原 openRecycleBin 函数体同口径：先重置页码，再拉数据）
watch(recycleVisible, async (v) => {
  if (!v) return
  recyclePage.value = 1
  await loadRecycleBin()
})

async function loadRecycleBin() {
  recycleLoading.value = true
  try {
    const res = await adminApi.getRecycleBin({ page: recyclePage.value, pageSize: recyclePageSize })
    recycleItems.value = (res.items || []) as RecycleBinRow[]
    recycleTotal.value = res.total || 0
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    recycleLoading.value = false
  }
}

function formatSize(bytes: number | null | undefined) {
  // A7: 后端可能不返回体积（undefined/null）——占位短横线，避免 NaN MB
  if (bytes === undefined || bytes === null || !Number.isFinite(Number(bytes))) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** M-6：同一文件名可能在不同日期目录各有一份，恢复键用 binPath 唯一定位（缺省回退 fileName） */
function restoreKey(row: RecycleBinRow): string {
  return row.binPath || row.fileName
}

/** M-6：精确恢复——把列表行的 fileName + binPath 交给后端 restore 端点，成功后重拉当前页 */
async function handleRestore(row: RecycleBinRow) {
  const key = restoreKey(row)
  if (restoringKey.value != null) return
  restoringKey.value = key
  try {
    await adminApi.restoreRecycleBinFile(row.fileName, row.binPath)
    // 复用既有通用「已保存」文案，避免为本批次新增 locale 键（i18n 门禁零风险）
    ElMessage.success(t('common.saved'))
    await loadRecycleBin()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    restoringKey.value = null
  }
}

async function handleEmptyRecycleBin() {
  try {
    await ElMessageBox.confirm(
      t('admin.recycleBin.emptyConfirm'),
      t('admin.recycleBin.emptyTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  emptying.value = true
  try {
    const res = await adminApi.emptyRecycleBin()
    ElMessage.success(t('admin.recycleBin.emptied', { n: res.deleted }))
    // REQ-022 F4: 清空后回到第 1 页并刷新
    recyclePage.value = 1
    await loadRecycleBin()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    emptying.value = false
  }
}
</script>

<style scoped>
/* 分页行（随弹窗搬入，取值与 ArtistManage.vue 同源） */
.pager { display: flex; justify-content: flex-end; margin-top: var(--sp-4, 16px); }
</style>
