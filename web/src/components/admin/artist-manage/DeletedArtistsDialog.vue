<template>
  <!-- 0817：已移除画师（软删兜底：清单可见+可恢复；恢复后需重新登录） -->
  <el-dialog v-model="deletedVisible" :title="$t('admin.deletedArtists.title')" width="720px" :close-on-click-modal="false">
    <div class="recycle-body">
      <el-table v-if="deletedLoading || deletedItems.length > 0" :data="deletedItems" v-loading="deletedLoading" stripe max-height="420">
        <el-table-column prop="name" :label="$t('admin.colName')" min-width="120">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.isBanned" type="warning" size="small" class="cell-tag">{{ $t('compliance.admin.bannedTag') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" min-width="140">
          <template #default="{ row }"><code class="cell-code">{{ $t('admin.domainSuffix') }}{{ row.subdomain }}</code></template>
        </el-table-column>
        <el-table-column prop="qqNumber" :label="$t('admin.colQq')" width="120" />
        <el-table-column :label="$t('admin.deletedArtists.colDeletedAt')" width="170">
          <template #default="{ row }">{{ formatDateTime(row.deletedAt) }}</template>
        </el-table-column>
        <!-- 824 响应式巡逻：操作列右固定，防窄屏藏进表内横滚 -->
        <el-table-column :label="$t('common.actions')" width="110" align="right" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small" type="primary" plain
              :loading="restoringId === row.id" :disabled="restoringId != null"
              @click="restoreDeletedArtist(row)"
            >
              {{ $t('admin.deletedArtists.restore') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('admin.deletedArtists.empty')" />
    </div>
    <template #footer>
      <el-button @click="deletedVisible = false">{{ $t('common.cancel') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// F-09 巨型文件拆分：自 views/admin/ArtistManage.vue 整体搬入（0817 已移除画师清单弹窗），
// 模板/文案键/样式取值一字未改；恢复成功后 emit('restored') 通知父页刷新在册列表。
import { ref, watch } from 'vue'
import { adminApi } from '../../../api/index'
import type { DeletedArtistItem } from '../../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../../utils/datetime'

const { t } = useI18n()

// ─── 0817：已移除画师（软删兜底：清单可见+可恢复） ───
const deletedVisible = defineModel({ type: Boolean, default: false })
/** 恢复成功 → 通知父页（原口径：恢复后主列表同步刷新 loadArtists） */
const emit = defineEmits<{ (e: 'restored'): void }>()
const deletedItems = ref<DeletedArtistItem[]>([])
const deletedLoading = ref(false)
/** 恢复在途锁（单飞：一次只恢复一个，防并发双击） */
const restoringId = ref<number | null>(null)

// 打开即重拉（与原 openDeletedArtists 函数体同口径）
watch(deletedVisible, async (v) => {
  if (!v) return
  await loadDeletedArtists()
})

async function loadDeletedArtists() {
  deletedLoading.value = true
  try {
    deletedItems.value = await adminApi.getDeletedArtists()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    deletedLoading.value = false
  }
}

async function restoreDeletedArtist(row: DeletedArtistItem) {
  try {
    await ElMessageBox.confirm(
      t('admin.deletedArtists.restoreConfirm', { name: row.name }),
      t('admin.deletedArtists.title'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  restoringId.value = row.id
  try {
    await adminApi.restoreArtist(row.id)
    ElMessage.success(t('admin.deletedArtists.restored'))
    await loadDeletedArtists()
    emit('restored') // 回到在册 → 父页主列表同步刷新
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    restoringId.value = null
  }
}
</script>

<style scoped>
/* 单元格标签/代码样式（随弹窗搬入，取值与 ArtistManage.vue 同源） */
.cell-tag { margin-left: var(--sp-1, 4px); }
.cell-code { font-size: 12px; color: var(--ink2); background: var(--paper2); padding: 4px 8px; border-radius: var(--r-s); }
</style>
