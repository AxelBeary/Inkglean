<template>
  <!-- 818-H：分组卡片 + 一行一事（说明在左、控件在右，栅格对齐） -->
  <div class="group" v-loading="loading">
    <div class="group-head">{{ $t('settings.tabProfile') }}</div>

    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('settings.avatarLabel') }}</div>
        <div class="desc">{{ $t('settings.avatarHint') }}</div>
      </div>
      <div class="ctrl ctrl--wide">
        <div
          class="avatar-upload" tabindex="0" role="button"
          :aria-label="$t('settings.avatarHint')"
          @click="triggerAvatarUpload"
          @keydown.enter.prevent="triggerAvatarUpload"
          @keydown.space.prevent="triggerAvatarUpload"
        >
          <el-avatar :size="72" :src="avatarPreviewUrl" class="avatar-preview">
            {{ name?.charAt(0) || '?' }}
          </el-avatar>
          <span class="avatar-upload-hint">{{ $t('settings.avatarHint') }}</span>
        </div>
        <input ref="avatarInputEl" type="file" accept="image/*" hidden @change="onAvatarPick" />
      </div>
    </div>

    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('settings.nameLabel') }}</div>
        <div class="desc">{{ $t('settings.profileNameDesc') }}</div>
      </div>
      <div class="ctrl">
        <el-input :model-value="name" @update:model-value="$emit('update:name', $event)" />
      </div>
    </div>

    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('settings.codeLabel') }}</div>
        <div class="desc">{{ $t('settings.codeHint') }}</div>
      </div>
      <div class="ctrl">
        <el-input
          :model-value="artistCode"
          @update:model-value="$emit('update:artistCode', $event)"
          :placeholder="$t('settings.codePlaceholder')" maxlength="20"
        />
      </div>
    </div>

    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('settings.bioLabel') }}</div>
        <div class="desc">{{ $t('settings.profileBioDesc') }}</div>
      </div>
      <div class="ctrl ctrl--textarea">
        <el-input
          :model-value="bio"
          @update:model-value="$emit('update:bio', $event)"
          type="textarea" :rows="3" :placeholder="$t('settings.bioPlaceholder')"
        />
      </div>
    </div>

    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('settings.contactQqLabel') }}</div>
        <div class="desc">{{ $t('settings.contactQqHint') }}</div>
      </div>
      <div class="ctrl">
        <el-input
          :model-value="contactQq"
          @update:model-value="$emit('update:contactQq', $event)"
          :placeholder="$t('settings.contactQqPlaceholder')" maxlength="15"
        />
      </div>
    </div>

    <!-- 820-L：留言功能开关（说明在左控件在右；与通知类开关同口径） -->
    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('settings.guestbookLabel') }}</div>
        <div class="desc">{{ $t('settings.guestbookDesc') }}</div>
      </div>
      <div class="ctrl">
        <el-switch
          :model-value="guestbookEnabled"
          @update:model-value="$emit('update:guestbookEnabled', $event)"
        />
      </div>
    </div>

    <div class="form-actions">
      <el-button type="primary" @click="$emit('save')" :loading="saving" :disabled="profileLoadFailed">
        {{ $t('settings.save') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  name: string
  artistCode: string
  bio: string
  contactQq: string
  guestbookEnabled: boolean
  avatar: string
  loading: boolean
  saving: boolean
  profileLoadFailed: boolean
}>()

const emit = defineEmits<{
  save: []
  'update:name': [value: string]
  'update:artistCode': [value: string]
  'update:bio': [value: string]
  'update:contactQq': [value: string]
  'update:guestbookEnabled': [value: boolean]
  'avatar-pick': [file: File]
}>()

const avatarInputEl = ref<HTMLInputElement | null>(null)
const avatarPreviewUrl = computed(() => props.avatar ? '/uploads/' + props.avatar : undefined)

function triggerAvatarUpload() {
  avatarInputEl.value?.click()
}

function onAvatarPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('avatar-pick', file)
  }
  input.value = ''
}
</script>

<style scoped>
/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点（对齐 QuickNote/Watermark 样板） */
.group {
  margin-top: 16px;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { width: 320px; }
.ctrl--wide { width: 360px; }
.ctrl--textarea { width: 360px; }
.form-actions { display: flex; justify-content: flex-end; padding: 12px 0 0; }

.avatar-upload {
  display: flex; align-items: center; gap: 16px;
  cursor: pointer; user-select: none;
  outline: none;
}
.avatar-upload:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; border-radius: var(--r-m); }
.avatar-preview { transition: box-shadow var(--dur-fast); }
.avatar-upload:hover .avatar-preview { box-shadow: 0 0 0 3px color-mix(in srgb, var(--hq) 50%, transparent); }
.avatar-upload-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .ctrl, .ctrl--wide, .ctrl--textarea { width: 100%; }
}
</style>
