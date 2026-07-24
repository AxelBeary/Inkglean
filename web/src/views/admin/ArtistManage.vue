<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/admin')" title="返回管理面板" content="画师管理" />

    <el-button type="primary" style="margin: 16px 0" @click="dialogVisible = true">+ 添加画师</el-button>

    <el-table :data="artists" v-loading="loading" stripe>
      <el-table-column prop="name" label="昵称" width="120" />
      <el-table-column prop="subdomain" label="子域名" width="120">
        <template #default="{ row }">{{ row.subdomain }}.主域名</template>
      </el-table-column>
      <el-table-column prop="qq_number" label="QQ号" width="120" />
      <el-table-column prop="bio" label="简介" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="{ open: 'success', full: 'warning', break: 'danger' }[row.status]" size="small">
            {{ { open: '可约', full: '排满', break: '休息' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click="remove(row)">移除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加画师弹窗 -->
    <el-dialog v-model="dialogVisible" title="添加画师" width="420px">
      <el-form :model="form" label-position="top">
        <el-form-item label="QQ号" required>
          <el-input v-model="form.qqNumber" placeholder="画师的QQ号（用于登录）" />
        </el-form-item>
        <el-form-item label="昵称" required>
          <el-input v-model="form.name" placeholder="展示给客户的名字" />
        </el-form-item>
        <el-form-item label="子域名" required>
          <el-input v-model="form.subdomain" placeholder="如 alice（小写字母/数字/连字符）">
            <template #append>.主域名</template>
          </el-input>
        </el-form-item>
        <el-form-item label="简介（可选）">
          <el-input v-model="form.bio" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addArtist" :loading="saving">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'

const artists = ref([])
const loading = ref(true)
const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({ qqNumber: '', name: '', subdomain: '', bio: '' })

async function addArtist() {
  if (!form.qqNumber || !form.name || !form.subdomain) {
    return ElMessage.warning('QQ号、昵称和子域名为必填项')
  }
  saving.value = true
  try {
    await adminApi.createArtist({
      qqNumber: form.qqNumber,
      name: form.name,
      subdomain: form.subdomain.toLowerCase(),
      bio: form.bio
    })
    ElMessage.success('画师已添加')
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
      `确定移除画师「${row.name}」？该画师的所有订单、作品数据将被永久删除！`,
      '⚠️ 危险操作', { type: 'error', confirmButtonText: '确定移除' }
    )
    await adminApi.deleteArtist(row.id)
    ElMessage.success('已移除')
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
