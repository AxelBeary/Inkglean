<template>
  <ArtistLayout>
    <h2 class="font-display">{{ $t('settings.title') }}</h2>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- 基本资料 -->
      <el-tab-pane :label="$t('settings.tabProfile')" name="profile">
        <el-card style="max-width: 600px" v-loading="loading">
          <el-form :model="form" label-position="top" size="large">
            <el-form-item :label="$t('settings.nameLabel')">
              <el-input v-model="form.name" />
            </el-form-item>
            <el-form-item :label="$t('settings.codeLabel')">
              <el-input v-model="form.artist_code" :placeholder="$t('settings.codePlaceholder')" maxlength="10" />
              <div class="form-hint">{{ $t('settings.codeHint') }}</div>
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
            <el-form-item :label="$t('settings.contactQqLabel')">
              <el-input v-model="form.contact_qq" :placeholder="$t('settings.contactQqPlaceholder')" maxlength="15" />
              <div class="form-hint">{{ $t('settings.contactQqHint') }}</div>
            </el-form-item>
            <el-form-item :label="$t('settings.notifyLabel')">
              <el-switch
                v-model="form.notify_enabled" :active-value="1" :inactive-value="0"
                :active-text="$t('settings.notifyText')"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save" :loading="saving">{{ $t('settings.save') }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 流程与比例 -->
      <el-tab-pane :label="$t('settings.tabWorkflow')" name="workflow" lazy>
        <el-card style="max-width: 700px">
          <WorkflowPaymentEditor />
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'

const { t } = useI18n()
const activeTab = ref('profile')
const loading = ref(true)
const saving = ref(false)

const form = reactive({
  name: '', bio: '', status: 'open',
  weibo_url: '', bilibili_url: '', contact_qq: '',
  notify_enabled: 1, artist_code: ''
})

async function save() {
  saving.value = true
  try {
    await artistApi.updateProfile({
      name: form.name.trim(), bio: form.bio.trim(), status: form.status,
      weibo_url: form.weibo_url.trim(), bilibili_url: form.bilibili_url.trim(),
      contact_qq: form.contact_qq.trim(), notify_enabled: form.notify_enabled,
      artist_code: form.artist_code.trim()
    })
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

onMounted(async () => {
  try {
    const profile = await artistApi.getProfile()
    Object.assign(form, {
      name: profile.name, bio: profile.bio || '', status: profile.status,
      weibo_url: profile.weibo_url || '', bilibili_url: profile.bilibili_url || '',
      contact_qq: profile.contact_qq || '', notify_enabled: profile.notify_enabled,
      artist_code: profile.artist_code || ''
    })
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
})
</script>

<style scoped>
.form-hint { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
</style>
