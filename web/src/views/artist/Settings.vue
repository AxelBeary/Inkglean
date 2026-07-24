<template>
  <ArtistLayout>
    <h2>⚙ 主页设置</h2>

    <el-card style="margin-top: 16px; max-width: 600px" v-loading="loading">
      <el-form :model="form" label-position="top" size="large">
        <el-form-item label="画师昵称">
          <el-input v-model="form.name" />
        </el-form-item>

        <el-form-item label="个人简介">
          <el-input v-model="form.bio" type="textarea" :rows="3" placeholder="介绍一下自己" />
        </el-form-item>

        <el-form-item label="主页状态">
          <el-radio-group v-model="form.status">
            <el-radio-button value="open">✅ 可约稿</el-radio-button>
            <el-radio-button value="full">⏳ 已排满</el-radio-button>
            <el-radio-button value="break">💤 休息中</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="微博链接（可选）">
          <el-input v-model="form.weibo_url" placeholder="https://weibo.com/xxx" />
        </el-form-item>

        <el-form-item label="B站链接（可选）">
          <el-input v-model="form.bilibili_url" placeholder="https://space.bilibili.com/xxx" />
        </el-form-item>

        <el-form-item label="客户QQ通知">
          <el-switch v-model="form.notify_enabled" :active-value="1" :inactive-value="0"
            active-text="允许客户接收排队/完成通知" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="save" :loading="saving">保存设置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const loading = ref(true)
const saving = ref(false)

const form = reactive({
  name: '',
  bio: '',
  status: 'open',
  weibo_url: '',
  bilibili_url: '',
  notify_enabled: 1
})

async function save() {
  saving.value = true
  try {
    await artistApi.updateProfile({
      name: form.name,
      bio: form.bio,
      status: form.status,
      weibo_url: form.weibo_url,
      bilibili_url: form.bilibili_url,
      notify_enabled: form.notify_enabled
    })
    ElMessage.success('设置已保存')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const profile = await artistApi.getProfile()
    Object.assign(form, {
      name: profile.name,
      bio: profile.bio || '',
      status: profile.status,
      weibo_url: profile.weibo_url || '',
      bilibili_url: profile.bilibili_url || '',
      notify_enabled: profile.notify_enabled
    })
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
})
</script>
