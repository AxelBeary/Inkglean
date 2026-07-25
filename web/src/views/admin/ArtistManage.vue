<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/admin')" :title="$t('admin.backToPanel')" :content="$t('admin.artistManage')" />

    <el-button type="primary" style="margin: 16px 0" @click="dialogVisible = true">{{ $t('admin.addArtist') }}</el-button>

    <el-table :data="artists" v-loading="loading" stripe>
      <el-table-column prop="name" :label="$t('admin.colName')" width="120" />
      <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" width="120">
        <template #default="{ row }">{{ row.subdomain }}{{ $t('admin.domainSuffix') }}</template>
      </el-table-column>
      <el-table-column prop="qq_number" :label="$t('admin.colQq')" width="120" />
      <el-table-column prop="bio" :label="$t('admin.colBio')" />
      <el-table-column :label="$t('admin.colStatus')" width="80">
        <template #default="{ row }">
          <el-tag :type="{ open: 'success', full: 'warning', break: 'danger' }[row.status]" size="small">
            {{ $t(`common.statusShort.${row.status}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click="remove(row)">{{ $t('common.remove') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加画师弹窗 -->
    <el-dialog v-model="dialogVisible" :title="$t('admin.addTitle')" width="420px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('admin.qqLabel')" required>
          <el-input v-model="form.qqNumber" :placeholder="$t('admin.qqPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.nameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('admin.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.subdomainLabel')" required>
          <el-input v-model="form.subdomain" :placeholder="$t('admin.subdomainPlaceholder')">
            <template #append>{{ $t('admin.domainSuffix') }}</template>
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('admin.bioLabel')">
          <el-input v-model="form.bio" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addArtist" :loading="saving">{{ $t('common.add') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const artists = ref([])
const loading = ref(true)
const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({ qqNumber: '', name: '', subdomain: '', bio: '' })

async function addArtist() {
  if (!form.qqNumber || !form.name || !form.subdomain) {
    return ElMessage.warning(t('admin.requiredFields'))
  }
  saving.value = true
  try {
    await adminApi.createArtist({
      qqNumber: form.qqNumber,
      name: form.name,
      subdomain: form.subdomain.toLowerCase(),
      bio: form.bio
    })
    ElMessage.success(t('admin.added'))
    dialogVisible.value = false
    Object.assign(form, { qqNumber: '', name: '', subdomain: '', bio: '' })
    await loadArtists()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      t('admin.confirmRemove', { name: row.name }),
      t('admin.confirmRemoveTitle'), { type: 'error', confirmButtonText: t('admin.confirmRemoveBtn') }
    )
    await adminApi.deleteArtist(row.id)
    ElMessage.success(t('common.removed'))
    await loadArtists()
  } catch { /* cancelled */ }
}

async function loadArtists() {
  loading.value = true
  try {
    artists.value = await adminApi.getArtists()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadArtists)
</script>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
</style>
