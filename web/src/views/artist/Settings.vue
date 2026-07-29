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
              <el-input v-model="form.artistCode" :placeholder="$t('settings.codePlaceholder')" maxlength="10" />
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

            <!-- R15: 外链列表编辑器（替代旧微博/B站输入框） -->
            <el-form-item :label="$t('settings.linksLabel')">
              <div class="link-editor">
                <div v-for="(link, index) in form.customLinks" :key="index" class="link-row">
                  <el-select v-model="link.icon" class="link-icon-select">
                    <el-option v-for="opt in LINK_ICONS" :key="opt.value" :value="opt.value" :label="opt.label" />
                  </el-select>
                  <el-input v-model="link.name" :placeholder="$t('settings.linkName')" maxlength="20" class="link-name-input" />
                  <el-input v-model="link.url" placeholder="https://" class="link-url-input" />
                  <div class="link-actions">
                    <el-button text size="small" :disabled="index === 0" @click="moveLink(index, -1)">↑</el-button>
                    <el-button text size="small" :disabled="index === form.customLinks.length - 1" @click="moveLink(index, 1)">↓</el-button>
                    <el-button text size="small" type="danger" @click="removeLink(index)">✕</el-button>
                  </div>
                </div>
                <el-button size="small" @click="addLink" :disabled="form.customLinks.length >= 6">
                  + {{ $t('settings.addLink') }}
                </el-button>
                <div class="form-hint">{{ $t('settings.linksHint') }}</div>
              </div>
            </el-form-item>

            <el-form-item :label="$t('settings.contactQqLabel')">
              <el-input v-model="form.contactQq" :placeholder="$t('settings.contactQqPlaceholder')" maxlength="15" />
              <div class="form-hint">{{ $t('settings.contactQqHint') }}</div>
            </el-form-item>
            <el-form-item :label="$t('settings.notifyLabel')">
              <el-switch
                v-model="form.notifyEnabled"
                :active-text="$t('settings.notifyText')"
              />
            </el-form-item>
            <!-- R8: 默认面板 -->
            <el-form-item :label="$t('settings.defaultPanelLabel')">
              <el-select v-model="form.dashboardDefaultPanel" style="width: 200px">
                <el-option value="queue" :label="$t('dashboard.panelQueue')" />
                <el-option value="orders" :label="$t('dashboard.panelOrders')" />
                <el-option value="manual" :label="$t('dashboard.panelManual')" />
                <el-option value="tiers" :label="$t('dashboard.panelTiers')" />
              </el-select>
              <div class="form-hint">{{ $t('settings.defaultPanelHint') }}</div>
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
              :class="{ active: form.templateId === tpl.id }"
              @click="form.templateId = tpl.id"
              tabindex="0"
              role="button"
              @keyup.enter="form.templateId = tpl.id"
            >
              <div class="template-preview">{{ tpl.preview }}</div>
              <div class="template-info">
                <div class="template-name">{{ tpl.name }}</div>
                <div class="template-desc">{{ tpl.desc }}</div>
              </div>
            </div>
          </div>

          <p class="template-label" style="margin-top: 24px">{{ $t('templates.palette') }}</p>
          <p class="form-hint" style="margin-bottom: 12px">{{ $t('templates.paletteHint') }}</p>
          <div class="palette-grid">
            <div
              v-for="pal in palettes"
              :key="pal.id"
              class="palette-card"
              :class="{ active: form.paletteId === pal.id }"
              @click="form.paletteId = pal.id"
              tabindex="0"
              role="button"
              @keyup.enter="form.paletteId = pal.id"
            >
              <div class="palette-swatch">
                <span class="swatch-light" :style="{ background: pal.light }"></span>
                <span class="swatch-dark" :style="{ background: pal.dark }"></span>
              </div>
              <div class="template-info">
                <div class="template-name">{{ pal.name }}</div>
                <div class="template-desc">{{ pal.desc }}</div>
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
    </el-tabs>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const activeTab = ref('profile')
const loading = ref(true)
const saving = ref(false)

// R15: 外链图标枚举（一号拍板：纯文字标签 + Element Plus Link 图标兜底）
const LINK_ICONS = [
  { value: 'weibo', label: '微 微博' },
  { value: 'bilibili', label: 'B Bilibili' },
  { value: 'pixiv', label: 'P Pixiv' },
  { value: 'x', label: 'X' },
  { value: 'xiaohongshu', label: '红 小红书' },
  { value: 'lofter', label: 'L Lofter' },
  { value: 'douyin', label: '抖 抖音' },
  { value: 'link', label: '🔗 通用链接' }
]

const form = reactive({
  name: '', bio: '', status: 'open',
  customLinks: [],
  contactQq: '',
  notifyEnabled: true,
  artistCode: '',
  templateId: 'classic',
  paletteId: 'paper',
  dashboardDefaultPanel: 'queue'
})

// R15: 链接编辑器操作
function addLink() {
  if (form.customLinks.length >= 6) return
  form.customLinks.push({ name: '', url: '', icon: 'link' })
}
function removeLink(index) {
  form.customLinks.splice(index, 1)
}
function moveLink(index, direction) {
  const target = index + direction
  if (target < 0 || target >= form.customLinks.length) return
  const [item] = form.customLinks.splice(index, 1)
  form.customLinks.splice(target, 0, item)
}

const templates = computed(() => [
  { id: 'atelier', name: t('templates.atelier'), desc: t('templates.atelierDesc'), preview: '📖 🖌' },
  { id: 'classic', name: t('templates.classic'), desc: t('templates.classicDesc'), preview: '🖼 ☀️' },
  { id: 'gallery', name: t('templates.gallery'), desc: t('templates.galleryDesc'), preview: '🏛 🌙' },
  { id: 'folio',   name: t('templates.folio'),   desc: t('templates.folioDesc'),   preview: '📄 ✨' }
])

const palettes = computed(() => [
  { id: 'paper', name: t('templates.palettePaper'), desc: t('templates.palettePaperDesc'), light: '#faf8f5', dark: '#1c1a17' },
  { id: 'ink',   name: t('templates.paletteInk'),   desc: t('templates.paletteInkDesc'),   light: '#f4f4f2', dark: '#0e0e0e' },
  { id: 'dusk',  name: t('templates.paletteDusk'),  desc: t('templates.paletteDuskDesc'),  light: '#eef1f6', dark: '#121a26' },
  { id: 'moss',  name: t('templates.paletteMoss'),  desc: t('templates.paletteMossDesc'),  light: '#f0f4ee', dark: '#131c13' }
])

const embedCode = computed(() =>
  '<script src="/embed.js" data-artist="' + (form.subdomain || 'your-subdomain') + '"></' + 'script>'
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
    // P1-D: 只提交 templateId + paletteId，其他字段由 profile tab 的 save 提交
    if (activeTab.value === 'template') {
      await artistApi.updateProfile({ templateId: form.templateId, paletteId: form.paletteId })
    } else if (activeTab.value === 'embed') {
      // 嵌入脚本 tab 没有需要保存的设置
    } else {
      // R15: camelCase + customLinks 数组（PUT /api/artist/profile 已改 additionalProperties:false）
      await artistApi.updateProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        status: form.status,
        customLinks: form.customLinks
          .filter(l => l.name.trim() && l.url.trim())
          .map(l => ({ name: l.name.trim(), url: l.url.trim(), icon: l.icon || 'link' })),
        contactQq: form.contactQq.trim(),
        notifyEnabled: form.notifyEnabled,
        artistCode: form.artistCode.trim(),
        dashboardDefaultPanel: form.dashboardDefaultPanel
      })
    }
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

onMounted(async () => {
  try {
    const profile = await artistApi.getProfile()
    // 旧模板 ID 映射到新布局 ID，确保选择器正确高亮
    const LEGACY = { 'default': 'classic', 'dark-gallery': 'gallery', 'single-page': 'folio' }
    const rawTpl = profile.template_id || 'classic'

    // R15: 解析 custom_links JSON（GET profile 返回原始 DB 行，custom_links 是 JSON 字符串或 null）
    let customLinks = []
    if (profile.custom_links) {
      try { customLinks = JSON.parse(profile.custom_links) } catch { customLinks = [] }
    }

    Object.assign(form, {
      name: profile.name,
      bio: profile.bio || '',
      status: profile.status,
      customLinks,
      contactQq: profile.contact_qq || '',
      notifyEnabled: !!profile.notify_enabled,
      artistCode: profile.artist_code || '',
      templateId: LEGACY[rawTpl] || rawTpl,
      paletteId: profile.palette_id || 'paper',
      dashboardDefaultPanel: profile.dashboard_default_panel || 'queue',
      subdomain: profile.subdomain || ''
    })
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
})
</script>

<style scoped>
.form-hint { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }

/* R15: 外链列表编辑器 */
.link-editor { width: 100%; }
.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.link-icon-select { width: 110px; flex-shrink: 0; }
.link-name-input { width: 120px; flex-shrink: 0; }
.link-url-input { flex: 1; }
.link-actions {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

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

.palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
.palette-card {
  cursor: pointer; border: 2px solid var(--border-color); border-radius: 8px;
  overflow: hidden; transition: all 0.2s; background: var(--bg-card);
}
.palette-card:hover { border-color: var(--el-color-primary-light-5); }
.palette-card.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); }
.palette-swatch { height: 56px; display: flex; }
.swatch-light, .swatch-dark { flex: 1; }

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
