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

      <!-- 主页模板 -->
      <el-tab-pane :label="$t('templates.tab')" name="template" lazy>
        <el-card style="max-width: 700px" v-loading="loading">
          <p class="form-hint" style="margin-bottom: 20px">{{ $t('templates.hint') }}</p>
          <p class="template-label">{{ $t('templates.label') }}</p>
          <div class="template-grid">
            <div
              v-for="tpl in templates"
              :key="tpl.id"
              class="template-card"
              :class="{ active: form.template_id === tpl.id }"
              @click="form.template_id = tpl.id"
              tabindex="0"
              role="button"
              @keyup.enter="form.template_id = tpl.id"
            >
              <div class="template-preview">{{ tpl.preview }}</div>
              <div class="template-info">
                <div class="template-name">{{ tpl.name }}</div>
                <div class="template-desc">{{ tpl.desc }}</div>
              </div>
            </div>
          </div>
          <el-button type="primary" @click="save" :loading="saving" style="margin-top: 20px">{{ $t('settings.save') }}</el-button>
        </el-card>
      </el-tab-pane>

      <!-- 嵌入脚本 -->
      <el-tab-pane :label="$t('embed.tab')" name="embed" lazy>
        <el-card style="max-width: 700px" v-loading="loading">
          <p class="form-hint" style="margin-bottom: 16px">{{ $t('embed.hint') }}</p>
          <p class="form-hint" style="margin-bottom: 16px">{{ $t('embed.step1') }}</p>
          <div class="embed-code-box" @click="copyEmbedCode">
            <code>{{ embedCode }}</code>
          </div>
          <el-button size="small" @click="copyEmbedCode" style="margin-bottom: 20px">{{ $t('embed.copyBtn') }}</el-button>
          <p class="form-hint">{{ $t('embed.step2') }}</p>
          <img class="embed-preview" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='60'%3E%3Crect width='240' height='60' fill='%231a1a1a' rx='8'/%3E%3Ctext x='16' y='28' fill='white' font-size='13' font-family='sans-serif'%3E%E2%9C%A8 Commission Me%3C/text%3E%3Ctext x='16' y='46' fill='%23999' font-size='11' font-family='sans-serif'%3E%E2%86%97 Order on HuiYue%3C/text%3E%3C/svg%3E" alt="Embed preview" />
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
import { ref, reactive, onMounted, computed } from 'vue'
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
  notify_enabled: 1, artist_code: '',
  template_id: 'default'
})

const templates = computed(() => [
  { id: 'default',       name: t('templates.default'),       desc: t('templates.defaultDesc'),       preview: '📋 ☀️' },
  { id: 'dark-gallery',  name: t('templates.darkGallery'),   desc: t('templates.darkGalleryDesc'),   preview: '🖼 🌙' },
  { id: 'single-page',   name: t('templates.singlePage'),    desc: t('templates.singlePageDesc'),    preview: '📄 ✨' }
])

const embedCode = computed(() =>
  `<script src="/embed.js" data-artist="${form.subdomain || 'your-subdomain'}"><\/script>`
)

async function copyEmbedCode() {
  try {
    await navigator.clipboard.writeText(embedCode.value)
    ElMessage.success(t('embed.copied'))
  } catch {
    ElMessage.warning(t('embed.copyFailed'))
  }
}

async function save() {
  saving.value = true
  try {
    // P1-D: 只提交 template_id，其他字段由 profile tab 的 save 提交
    if (activeTab.value === 'template') {
      await artistApi.updateProfile({ template_id: form.template_id })
    } else if (activeTab.value === 'embed') {
      // 嵌入脚本 tab 没有需要保存的设置
    } else {
      await artistApi.updateProfile({
        name: form.name.trim(), bio: form.bio.trim(), status: form.status,
        weibo_url: form.weibo_url.trim(), bilibili_url: form.bilibili_url.trim(),
        contact_qq: form.contact_qq.trim(), notify_enabled: form.notify_enabled,
        artist_code: form.artist_code.trim()
      })
    }
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
      artist_code: profile.artist_code || '',
      template_id: profile.template_id || 'default',
      subdomain: profile.subdomain || ''
    })
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
})
</script>

<style scoped>
.form-hint { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }

.template-label { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary); }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.template-card {
  cursor: pointer; border: 2px solid var(--border-color); border-radius: 8px;
  overflow: hidden; transition: all 0.2s; background: var(--bg-card);
}
.template-card:hover { border-color: var(--el-color-primary-light-5); }
.template-card.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); }
.template-preview {
  height: 80px; display: flex; align-items: center; justify-content: center;
  font-size: 28px; background: var(--bg-inset);
}
.template-info { padding: 12px; }
.template-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.template-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.4; }

.embed-code-box {
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; cursor: pointer;
  font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.6;
  overflow-x: auto; transition: background 0.2s;
}
.embed-code-box:hover { background: var(--bg-hover); }
.embed-code-box code { color: var(--text-primary); white-space: nowrap; }
.embed-preview { margin-top: 8px; max-width: 240px; border-radius: 6px; }
</style>
