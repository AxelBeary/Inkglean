<script setup lang="ts">
// 我的档案·桌面宿主壳（工具箱波4 · F6 本地档案）：昵称/头像/简介/风格标签，
// 纯本地存 SQLite（local_profile 单行）；价目分享卡与小票的署名/印章复用此档案（useToolT）。
// 头像自含存储：选图 → 读文件转 base64 落库（data URL 渲染，不依赖路径，同机换目录不丢）。
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalProfileStore } from '../../stores/localProfile'
import { useToolToast } from '../../tools/host'
import { readFileB64, isDesktop } from '../../bridge'

const router = useRouter()
const toast = useToolToast()
const profileStore = useLocalProfileStore()

const nickname = ref('')
const intro = ref('')
const tags = ref('')
const avatarB64 = ref('')
const saving = ref(false)

onMounted(async () => {
  if (!profileStore.loaded) await profileStore.load()
  nickname.value = profileStore.profile.nickname
  intro.value = profileStore.profile.intro
  tags.value = profileStore.profile.tags
  avatarB64.value = profileStore.profile.avatar_b64
})

function goHome() { void router.push({ name: 'home' }) }

function avatarUrl(): string {
  const b = avatarB64.value
  if (!b) return ''
  return b.startsWith('data:') ? b : `data:image/png;base64,${b}`
}

/** 由扩展名猜 MIME（头像多为手机导出的 jpg/png/webp） */
function mimeOf(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

async function pickAvatar() {
  if (!isDesktop()) return
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: false,
      title: '选择头像图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (typeof picked !== 'string' || !picked) return
    const b64 = await readFileB64(picked)
    avatarB64.value = `data:${mimeOf(picked)};base64,${b64}`
  } catch {
    toast.show('头像读取失败，换一张试试', 'err')
  }
}

function removeAvatar() {
  avatarB64.value = ''
}

async function save() {
  if (saving.value) return
  saving.value = true
  const ok = await profileStore.save({
    nickname: nickname.value,
    avatar_b64: avatarB64.value,
    intro: intro.value,
    tags: tags.value
  })
  saving.value = false
  if (ok) toast.show('档案已保存，价目卡与小票将使用你的署名')
  else toast.show('保存失败，请重试', 'err')
}
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
    </header>

    <div class="profile-card">
      <h2 class="pf-title">我的档案</h2>
      <p class="pf-sub">填好昵称与头像，价目分享卡与小票会用你的署名；数据仅存本机，永不上传</p>

      <p v-if="profileStore.unavailable" class="pf-empty">本地数据层仅在桌面壳内可用</p>

      <template v-else>
        <!-- 头像 -->
        <div class="pf-row pf-row--avatar">
          <div class="avatar" aria-hidden="true">
            <img v-if="avatarUrl()" :src="avatarUrl()" alt="" />
            <span v-else>{{ (nickname.trim() || '画').charAt(0) }}</span>
          </div>
          <div class="avatar-acts">
            <button type="button" class="mini" @click="pickAvatar">选择头像</button>
            <button v-if="avatarB64" type="button" class="mini mini--dim" @click="removeAvatar">移除</button>
            <p class="pf-hint">PNG/JPG/WEBP，不超过 5MB</p>
          </div>
        </div>

        <!-- 昵称 -->
        <div class="pf-row">
          <label class="lab" for="pf-nickname">昵称</label>
          <input id="pf-nickname" v-model.trim="nickname" class="field" type="text" maxlength="16" placeholder="画师名，如：星野" />
        </div>

        <!-- 简介 -->
        <div class="pf-row">
          <label class="lab" for="pf-intro">简介</label>
          <textarea id="pf-intro" v-model.trim="intro" class="field field--area" maxlength="120" rows="3" placeholder="一句话介绍自己的画风（选填）"></textarea>
        </div>

        <!-- 风格标签 -->
        <div class="pf-row">
          <label class="lab" for="pf-tags">风格标签</label>
          <input id="pf-tags" v-model.trim="tags" class="field" type="text" maxlength="60" placeholder="如：日系，厚涂，Q版（选填）" />
        </div>

        <div class="pf-foot">
          <button type="button" class="ok" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存档案' }}</button>
        </div>
      </template>
    </div>

    <transition name="toast">
      <div v-if="toast.visible.value" class="toast" :class="`toast--${toast.kind.value}`" role="status">
        {{ toast.text.value }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tool-page { min-height: var(--app-h); background: var(--paper); padding: 18px clamp(16px, 6vw, 72px) 48px; } /* 827：--app-h 不写 100vh（字号 zoom 超窗） */
.tool-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.back {
  font-size: 12.5px; color: var(--ink3); padding: 5px 12px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.back:hover { color: var(--ink); border-color: var(--ink4); }
.badge {
  font-size: 11px; color: var(--hq-d); padding: 3px 9px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
}

.profile-card {
  max-width: 560px; background: var(--card); border: 1px solid rgba(var(--ink-rgb), .06);
  border-radius: var(--r-paper); padding: 20px 24px 22px;
}
.pf-title { font-family: var(--f-d); font-size: 19px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.pf-sub { font-size: 12px; color: var(--ink4); margin: 4px 0 14px; }
.pf-empty { font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

.pf-row { display: flex; align-items: flex-start; gap: 12px; margin-top: 12px; }
.pf-row--avatar { align-items: center; }
.lab { flex: none; width: 64px; font-size: 13px; color: var(--ink2); padding-top: 7px; }
.field {
  flex: 1; font-size: 13px; color: var(--ink); padding: 7px 12px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
}
.field:focus { outline: none; border-color: var(--hq); }
.field--area { resize: vertical; min-height: 58px; line-height: 1.5; }

.avatar {
  flex: none; width: 64px; height: 64px; border-radius: 50%; overflow: hidden;
  background: var(--hq-t); color: var(--hq-d); font-family: var(--f-d); font-size: 26px;
  display: flex; align-items: center; justify-content: center;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.avatar-acts { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.mini {
  font-size: 12px; color: var(--ink2); padding: 4px 12px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.mini:hover { color: var(--hq-d); border-color: var(--hq); }
.mini--dim { color: var(--ink4); }
.mini--dim:hover { color: var(--zs-d); border-color: var(--zs-t); }
.pf-hint { font-size: 11px; color: var(--ink4); }

.pf-foot { margin-top: 18px; display: flex; justify-content: flex-end; }
.ok {
  font-size: 13px; color: var(--hq-d); font-weight: 500; padding: 7px 20px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.ok:hover:not(:disabled) { color: var(--hq); background: var(--hq-t2); border-color: var(--hq); }
.ok:disabled { opacity: .55; cursor: wait; }

/* 纸签 toast（与其余工具页同款） */
.toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 60;
  font-size: 12.5px; color: var(--ink2); padding: 8px 18px; white-space: nowrap;
  background: var(--card); border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  box-shadow: 0 2px 4px rgba(var(--ink-rgb), .08), 0 14px 28px -18px rgba(var(--ink-rgb), .5);
}
.toast--err { color: var(--zs-d); border-color: var(--zs-t); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
