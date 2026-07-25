<template>
  <ArtistLayout>
    <h2>{{ $t('settings.title') }}</h2>

    <el-card style="margin-top: 16px; max-width: 600px" v-loading="loading">
      <el-form :model="form" label-position="top" size="large">
        <el-form-item :label="$t('settings.nameLabel')">
          <el-input v-model="form.name" />
        </el-form-item>

        <el-form-item :label="$t('settings.bioLabel')">
          <el-input v-model="form.bio" type="textarea" :rows="3" :placeholder="$t('settings.bioPlaceholder')" />
        </el-form-item>

        <el-form-item :label="$t('settings.statusLabel')">
          <el-radio-group v-model="form.status">
            <el-radio-button value="open">{{ $t('settings.statusOpen') }}</el-radio-button>
            <el-radio-button value="full">{{ $t('settings.statusFull') }}</el-radio-button>
            <el-radio-button value="break">{{ $t('settings.statusBreak') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="$t('settings.weiboLabel')">
          <el-input v-model="form.weibo_url" placeholder="https://weibo.com/xxx" />
        </el-form-item>

        <el-form-item :label="$t('settings.bilibiliLabel')">
          <el-input v-model="form.bilibili_url" placeholder="https://space.bilibili.com/xxx" />
        </el-form-item>

        <el-form-item :label="$t('settings.notifyLabel')">
          <el-switch v-model="form.notify_enabled" :active-value="1" :inactive-value="0"
            :active-text="$t('settings.notifyText')" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="save" :loading="saving">{{ $t('settings.save') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
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
    ElMessage.success(t('settings.saved'))
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
