<template>
  <ArtistLayout>
    <h2 class="font-display">{{ $t('settings.title') }}</h2>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- 基本资料 -->
      <el-tab-pane :label="$t('settings.tabProfile')" name="profile">
        <el-card style="max-width: 600px" v-loading="loading">
          <el-form :model="form" label-position="top" size="large">
            <!-- R48: 头像上传（即时保存，不等 Save 按钮） -->
            <el-form-item :label="$t('settings.avatarLabel')">
              <div class="avatar-upload" @click="triggerAvatarUpload">
                <el-avatar :size="72" :src="avatarPreviewUrl" class="avatar-preview">
                  {{ form.name?.charAt(0) || '?' }}
                </el-avatar>
                <span class="avatar-upload-hint">{{ $t('settings.avatarHint') }}</span>
              </div>
              <input ref="avatarInputEl" type="file" accept="image/*" hidden @change="handleAvatarSelect" />
            </el-form-item>
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

            <!-- R58-8: 平台链接（自动识别 + 手动选择，客户主页展示） -->
            <el-form-item :label="$t('settings.platformLabel')">
              <div class="link-editor">
                <div v-for="(pl, index) in form.platformUrls" :key="index" class="link-row">
                  <el-select v-model="pl.platform" class="platform-select">
                    <el-option value="" :label="$t('settings.platformAuto')" />
                    <el-option v-for="opt in PLATFORM_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
                  </el-select>
                  <el-input v-model="pl.url" placeholder="https://" class="link-url-input" />
                  <el-button text size="small" type="danger" @click="removePlatformLink(index)">✕</el-button>
                </div>
                <el-button size="small" @click="addPlatformLink" :disabled="form.platformUrls.length >= 10">
                  + {{ $t('settings.addLink') }}
                </el-button>
                <div class="form-hint">{{ $t('settings.platformHint') }}</div>
              </div>
            </el-form-item>

            <!-- R58-8: 灵感标签（客户下单页展示，点击注入描述框） -->
            <el-form-item :label="$t('settings.inspireLabel')">
              <div class="tag-editor">
                <div class="tag-list">
                  <el-tag
                    v-for="(tag, index) in form.inspirationTags"
                    :key="tag + index"
                    closable
                    @close="removeTag(index)"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
                <el-input
                  v-model="newTag"
                  class="tag-input"
                  :placeholder="$t('settings.inspireInputPlaceholder')"
                  maxlength="30"
                  show-word-limit
                  @keyup.enter="addTag"
                />
                <div class="form-hint">{{ $t('settings.inspireHint') }}</div>
              </div>
            </el-form-item>

            <!-- SPEC-004: 名额与缓冲（正式位 N + 缓冲位 M + 4 开关） -->
            <el-form-item :label="$t('settings.slotLabel')">
              <div class="slot-config">
                <div class="slot-row">
                  <el-switch v-model="form.batchLimitEnabled" :active-text="$t('settings.slotEnable')" />
                  <el-input-number
                    v-model="form.batchLimit" :min="0" :max="999"
                    :disabled="!form.batchLimitEnabled"
                    controls-position="right" class="slot-input"
                  />
                  <span class="slot-unit">{{ $t('settings.slotUnit') }}</span>
                </div>
                <div class="form-hint">{{ $t('settings.slotHint') }}</div>
              </div>
            </el-form-item>
            <el-form-item :label="$t('settings.bufferLabel')">
              <el-input-number v-model="form.bufferLimit" :min="0" :max="999" controls-position="right" class="slot-input" />
              <div class="form-hint">{{ $t('settings.bufferHint') }}</div>
            </el-form-item>
            <el-form-item :label="$t('settings.bufferSwitchLabel')">
              <div class="switch-grid">
                <div class="switch-row">
                  <el-switch v-model="form.autoPromote" />
                  <span>{{ $t('settings.autoPromote') }}</span>
                </div>
                <div class="switch-row">
                  <el-switch v-model="form.hideQueuePosition" />
                  <span>{{ $t('settings.hideQueuePosition') }}</span>
                </div>
                <div class="switch-row">
                  <el-switch v-model="form.hidePromoteNotify" />
                  <span>{{ $t('settings.hidePromoteNotify') }}</span>
                </div>
                <div class="switch-row">
                  <el-switch v-model="form.bufferShortForm" />
                  <span>{{ $t('settings.bufferShortForm') }}</span>
                </div>
              </div>
              <div class="form-hint">{{ $t('settings.bufferSwitchHint') }}</div>
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

          <!-- R49: 强调色选择器（5 色预设 + 清除，后端白名单校验） -->
          <p class="template-label" style="margin-top: 24px">{{ $t('settings.accentLabel') }}</p>
          <p class="form-hint" style="margin-bottom: 12px">{{ $t('settings.accentHint') }}</p>
          <div class="accent-picker">
            <button
              v-for="a in ACCENT_PRESETS" :key="a.color"
              class="accent-swatch-btn" :class="{ active: form.accentColor === a.color }"
              :style="{ background: a.color }"
              :title="a.name"
              @click="form.accentColor = a.color"
            >
              <span v-if="form.accentColor === a.color" class="swatch-check">✓</span>
            </button>
            <button
              class="accent-clear-btn" :class="{ active: !form.accentColor }"
              @click="form.accentColor = null"
            >
              {{ $t('settings.accentClear') }}
            </button>
          </div>
          <p class="form-hint" style="margin-top: 8px">{{ $t('settings.accentDarkHint') }}</p>

          <!-- R50: 预览按钮（新窗口打开，参数覆盖渲染层） -->
          <div class="template-actions">
            <el-button @click="openPreview" :disabled="!form.subdomain">{{ $t('settings.previewBtn') }}</el-button>
            <el-button type="primary" @click="save" :loading="saving">{{ $t('settings.save') }}</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- R42b: 须知编辑（原 /rules 独立页面合并至此） -->
      <el-tab-pane :label="$t('settings.tabRules')" name="rules" lazy>
        <el-card style="max-width: 700px" v-loading="rulesLoading">
          <p class="form-hint" style="margin-bottom: 16px">{{ $t('rules.hint') }}</p>
          <el-input
            v-model="rulesContent" type="textarea" :rows="16"
            :placeholder="$t('rules.placeholder')"
          />
          <div class="preview" v-if="rulesContent">
            <h4 style="margin: 16px 0 8px; color: var(--text-secondary)">{{ $t('rules.preview') }}</h4>
            <el-card shadow="never" class="preview-card">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="sanitizedRulesPreview"></div>
            </el-card>
          </div>
          <el-button type="primary" style="margin-top: 16px" @click="saveRules" :loading="rulesSaving">
            {{ $t('rules.save') }}
          </el-button>
        </el-card>
      </el-tab-pane>

      <!-- 嵌入脚本 -->
      <el-tab-pane :label="$t('embed.tab')" name="embed" lazy>
        <el-card style="max-width: 700px" v-loading="loading">
          <!-- P0-5: 嵌入功能暂未开放（frame-ancestors 已收紧为 'self'，外部 iframe 不可用） -->
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
            嵌入功能暂未开放，敬请期待
          </el-alert>
          <p class="form-hint" style="margin-bottom: 16px">{{ $t('embed.hint') }}</p>
          <p class="form-hint" style="margin-bottom: 16px">{{ $t('embed.step1') }}</p>
          <div class="embed-code-box">
            <code>{{ embedCode }}</code>
          </div>
          <el-button size="small" disabled @click="copyEmbedCode" style="margin-bottom: 20px">{{ $t('embed.copyBtn') }}</el-button>
          <p class="form-hint">{{ $t('embed.step2') }}</p>
          <img class="embed-preview" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='60'%3E%3Crect width='240' height='60' fill='%231a1a1a' rx='8'/%3E%3Ctext x='16' y='28' fill='white' font-size='13' font-family='sans-serif'%3E%E2%9C%A8 Commission Me%3C/text%3E%3Ctext x='16' y='46' fill='%23999' font-size='11' font-family='sans-serif'%3E%E2%86%97 Order on HuiYue%3C/text%3E%3C/svg%3E" alt="Embed preview" />
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { sanitizeHtml } from '../../utils/sanitize.js'

const { t } = useI18n()
const route = useRoute()
// R42b: /rules 重定向到 /settings?tab=rules 时直达须知 tab
const activeTab = ref(route.query.tab === 'rules' ? 'rules' : 'profile')
const loading = ref(true)
const saving = ref(false)

// ─── R42b: 须知编辑（原 RulesEditor.vue 逻辑迁入） ───
const rulesContent = ref('')
const rulesSaving = ref(false)
const rulesLoading = ref(false)
let rulesLoaded = false

// XSS 防护：预览也消毒
const sanitizedRulesPreview = computed(() => sanitizeHtml(rulesContent.value))

async function loadRules() {
  if (rulesLoaded) return
  rulesLoading.value = true
  try {
    const rules = await artistApi.getRules()
    rulesContent.value = rules?.content || ''
    rulesLoaded = true
  } catch { /* ignore */ } finally { rulesLoading.value = false }
}

async function saveRules() {
  rulesSaving.value = true
  try {
    await artistApi.updateRules(rulesContent.value)
    ElMessage.success(t('rules.saved'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    rulesSaving.value = false
  }
}

// 首次切到须知 tab 时加载内容（懒加载）
watch(activeTab, (tab) => { if (tab === 'rules') loadRules() }, { immediate: true })

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

// R58-8: 平台链接手动选择枚举（与后端 KNOWN_PLATFORMS 一致，不含 other——other 由"自动识别"兜底）
const PLATFORM_OPTIONS = [
  { value: 'pixiv', label: 'Pixiv' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'weibo', label: '微博' },
  { value: 'lofter', label: 'Lofter' },
  { value: 'bilibili', label: 'Bilibili' },
  { value: 'xiaohongshu', label: '小红书' }
]

const form = reactive({
  name: '', bio: '', status: 'open',
  customLinks: [],
  platformUrls: [],
  inspirationTags: [],
  batchLimitEnabled: false,
  batchLimit: 0,
  bufferLimit: 0,
  autoPromote: false,
  hideQueuePosition: false,
  hidePromoteNotify: false,
  bufferShortForm: false,
  contactQq: '',
  notifyEnabled: true,
  artistCode: '',
  templateId: 'classic',
  paletteId: 'paper',
  accentColor: null,
  avatar: '',
  dashboardDefaultPanel: 'queue'
})

// ─── R49: 强调色预设（5 色与 ThemePicker 一致，后端白名单校验） ───
const ACCENT_PRESETS = [
  { color: '#34dbcb', name: '青' },
  { color: '#34c2db', name: '碧' },
  { color: '#3498db', name: '蓝' },
  { color: '#346edb', name: '靛' },
  { color: '#3445db', name: '紫' }
]

// ─── R48: 头像上传（即时保存，uploadApi.image → PUT profile avatar） ───
const avatarInputEl = ref(null)
const avatarPreviewUrl = computed(() => form.avatar ? `/uploads/${form.avatar}` : undefined)

function triggerAvatarUpload() {
  avatarInputEl.value?.click()
}

async function handleAvatarSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('settings.avatarNotImage'))
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('settings.avatarTooBig'))
    return
  }
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.updateProfile({ avatar: uploaded.filePath })
    form.avatar = uploaded.filePath
    ElMessage.success(t('settings.avatarUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R50: 预览主页（新窗口，参数覆盖渲染层，不碰数据层） ───
function openPreview() {
  const params = new URLSearchParams({
    _tpl: form.templateId,
    _pal: form.paletteId
  })
  if (form.accentColor) params.set('_accent', form.accentColor)
  window.open(`/artist/${form.subdomain}?${params.toString()}`, '_blank', 'noopener')
}

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

// ─── R58-8: 平台链接操作 ───
function addPlatformLink() {
  if (form.platformUrls.length >= 10) return
  form.platformUrls.push({ url: '', platform: '' })
}
function removePlatformLink(index) {
  form.platformUrls.splice(index, 1)
}

// ─── R58-8: 灵感标签操作 ───
const newTag = ref('')
function addTag() {
  const tag = newTag.value.trim()
  if (!tag) return
  if (tag.length > 30) {
    ElMessage.warning(t('settings.inspireTagTooLong'))
    return
  }
  if (form.inspirationTags.length >= 20) {
    ElMessage.warning(t('settings.inspireTagLimit'))
    return
  }
  if (form.inspirationTags.includes(tag)) {
    ElMessage.warning(t('settings.inspireTagDuplicate'))
    return
  }
  form.inspirationTags.push(tag)
  newTag.value = ''
}
function removeTag(index) {
  form.inspirationTags.splice(index, 1)
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
    // P1-D: 只提交 templateId + paletteId + accentColor，其他字段由 profile tab 的 save 提交
    if (activeTab.value === 'template') {
      await artistApi.updateProfile({ templateId: form.templateId, paletteId: form.paletteId, accentColor: form.accentColor })
    } else if (activeTab.value === 'embed') {
      // 嵌入脚本 tab 没有需要保存的设置
    } else {
      // R15: camelCase + customLinks 数组（PUT /api/artist/profile 已改 additionalProperties:false）
      // R58-8: platformUrls + inspirationTags（留空行/空标签不提交，platform 为空时省略让后端自动识别）
      // SPEC-004: N+M ≥ 1 前端提示（后端同校验，前端先拦避免无效请求）
      if (form.batchLimitEnabled && form.batchLimit + form.bufferLimit < 1) {
        ElMessage.warning(t('settings.slotMinError'))
        return
      }
      await artistApi.updateProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        status: form.status,
        customLinks: form.customLinks
          .filter(l => l.name.trim() && l.url.trim())
          .map(l => ({ name: l.name.trim(), url: l.url.trim(), icon: l.icon || 'link' })),
        platformUrls: form.platformUrls
          .filter(p => p.url.trim())
          .map(p => {
            const item = { url: p.url.trim() }
            if (p.platform) item.platform = p.platform
            return item
          }),
        inspirationTags: form.inspirationTags.map(tag => tag.trim()).filter(Boolean),
        // SPEC-004: 名额与缓冲（batchLimitEnabled 关闭时传 null = 不限制）
        batchLimit: form.batchLimitEnabled ? form.batchLimit : null,
        bufferLimit: form.bufferLimit,
        autoPromote: form.autoPromote,
        hideQueuePosition: form.hideQueuePosition,
        hidePromoteNotify: form.hidePromoteNotify,
        bufferShortForm: form.bufferShortForm,
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

    // R58-8: 解析 platform_urls / inspiration_tags JSON（同为原始 DB 行字段）
    // platform 有值时回显到下拉框，无值时显示"自动识别"
    let platformUrls = []
    if (profile.platform_urls) {
      try {
        const parsed = JSON.parse(profile.platform_urls)
        if (Array.isArray(parsed)) {
          platformUrls = parsed
            .map(item => typeof item === 'string' ? { url: item, platform: '' } : { url: item.url || '', platform: item.platform || '' })
            .filter(item => item.url)
        }
      } catch { platformUrls = [] }
    }
    let inspirationTags = []
    if (profile.inspiration_tags) {
      try {
        const parsed = JSON.parse(profile.inspiration_tags)
        if (Array.isArray(parsed)) inspirationTags = parsed.filter(tag => typeof tag === 'string' && tag)
      } catch { inspirationTags = [] }
    }

    Object.assign(form, {
      name: profile.name,
      bio: profile.bio || '',
      status: profile.status,
      customLinks,
      platformUrls,
      inspirationTags,
      batchLimitEnabled: profile.batch_limit != null,
      batchLimit: profile.batch_limit ?? 0,
      bufferLimit: profile.buffer_limit ?? 0,
      autoPromote: !!profile.auto_promote,
      hideQueuePosition: !!profile.hide_queue_position,
      hidePromoteNotify: !!profile.hide_promote_notify,
      bufferShortForm: !!profile.buffer_short_form,
      contactQq: profile.contact_qq || '',
      notifyEnabled: !!profile.notify_enabled,
      artistCode: profile.artist_code || '',
      templateId: LEGACY[rawTpl] || rawTpl,
      paletteId: profile.palette_id || 'paper',
      accentColor: profile.accent_color || null,
      avatar: profile.avatar || '',
      dashboardDefaultPanel: profile.dashboard_default_panel || 'queue',
      subdomain: profile.subdomain || ''
    })
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
})
</script>

<style scoped>
.form-hint { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }

/* R42b: 须知预览（原 RulesEditor.vue 样式迁入） */
.preview-card { line-height: 1.8; color: var(--text-primary); }

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

/* ─── R48: 头像上传 ─── */
.avatar-upload {
  display: flex; align-items: center; gap: 16px;
  cursor: pointer; user-select: none;
}
.avatar-preview { transition: transform 0.15s, box-shadow 0.15s; }
.avatar-upload:hover .avatar-preview { transform: scale(1.05); box-shadow: 0 0 0 3px var(--el-color-primary-light-5); }
.avatar-upload-hint { font-size: 12px; color: var(--text-secondary); }

/* ─── R49: 强调色选择器 ─── */
.accent-picker { display: flex; align-items: center; gap: 10px; }
.accent-swatch-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, border-color 0.15s;
}
.accent-swatch-btn:hover { transform: scale(1.15); }
.accent-swatch-btn.active { border-color: var(--text-primary); }
.swatch-check { color: #fff; font-size: 13px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.accent-clear-btn {
  padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 999px;
  background: transparent; cursor: pointer; font-size: 12px; color: var(--text-secondary);
  transition: border-color 0.15s, color 0.15s;
}
.accent-clear-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.accent-clear-btn.active { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-soft); }

/* ─── R50: 模板 tab 操作行 ─── */
.template-actions { display: flex; gap: 12px; margin-top: 20px; }

/* ─── R58-8: 平台链接 + 灵感标签 ─── */
.platform-select { width: 130px; flex-shrink: 0; }
.tag-editor { width: 100%; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.tag-input { max-width: 300px; }

/* ─── SPEC-004: 名额与缓冲 ─── */
.slot-config { width: 100%; }
.slot-row { display: flex; align-items: center; gap: 12px; }
.slot-input { width: 130px; }
.slot-unit { font-size: 13px; color: var(--text-secondary); }
.switch-grid { display: flex; flex-direction: column; gap: 10px; }
.switch-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-primary); }
</style>
