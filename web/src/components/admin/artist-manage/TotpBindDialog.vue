<template>
  <!-- TOTP 绑定弹窗（REQ-027 R2：管理员协助画师扫码绑定） -->
  <el-dialog v-model="totpVisible" :title="$t('admin.totpBindTitle', { name: totpArtist?.name || '' })" width="420px" :close-on-click-modal="false">
    <div v-loading="totpLoading">
      <p class="totp-step">{{ $t('admin.totpStep1') }}</p>
      <div class="totp-qr-wrap">
        <img v-if="totpQr" :src="totpQr" alt="TOTP QR" class="totp-qr" />
        <el-button v-else text type="primary" @click="genTotpQr">{{ $t('admin.totpRegenerate') }}</el-button>
      </div>
      <p class="totp-step">{{ $t('admin.totpStep2') }}</p>
      <el-input
        v-model="totpCode" maxlength="6" size="large"
        :placeholder="$t('admin.totpCodePlaceholder')" @keyup.enter="confirmTotpBind"
      />
      <p class="totp-hint">{{ $t('admin.totpRegenerateHint') }}</p>
    </div>
    <template #footer>
      <el-button @click="totpVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="danger" plain :loading="totpLoading" @click="resetTotpBind">
        {{ $t('admin.totpReset') }}
      </el-button>
      <el-button @click="genTotpQr" :loading="totpLoading">{{ $t('admin.totpRegenerate') }}</el-button>
      <el-button type="primary" :disabled="!totpCode" @click="confirmTotpBind" :loading="totpLoading">
        {{ $t('admin.totpBindConfirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// F-09 巨型文件拆分：自 views/admin/ArtistManage.vue 整体搬入（REQ-027 R2/R5 TOTP 绑定弹窗），
// 模板/文案键/样式取值一字未改；目标画师由父页以 artist 传入，绑定/重置成功后 emit('refresh') 让父页重拉列表。
import { computed, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { adminApi } from '../../../api/index'
import type { AdminArtistItem } from '../../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// ─── TOTP 绑定/重置（REQ-027 R2/R5） ───
const totpVisible = defineModel({ type: Boolean, default: false })
const props = defineProps({ artist: { type: Object as PropType<AdminArtistItem | null>, default: null } })
/** 绑定/重置成功后通知父页（原口径：await loadArtists()） */
const emit = defineEmits<{ (e: 'refresh'): void }>()
// 模板口径保持与拆分前一致（沿用 totpArtist 命名，值即父页传入的目标画师）
const totpArtist = computed(() => props.artist)
const totpQr = ref('')
const totpCode = ref('')
const totpLoading = ref(false)

// 打开即清空输入并生成二维码（与原 openTotpBind 函数体同口径；父页先落 artist 再置显）
watch(totpVisible, async (v) => {
  if (!v) return
  totpCode.value = ''
  totpQr.value = ''
  await genTotpQr()
})

/** 生成/重新生成绑定二维码（覆盖旧密钥，旧 App 绑定立即失效） */
async function genTotpQr() {
  if (!totpArtist.value) return
  totpLoading.value = true
  try {
    const res = await adminApi.totpBindInit(totpArtist.value.id)
    totpQr.value = res.qrDataUrl
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    totpLoading.value = false
  }
}

/** 输入画师报的 6 位码，完成绑定 */
async function confirmTotpBind() {
  if (!totpCode.value.trim()) return
  totpLoading.value = true
  try {
    await adminApi.totpBindConfirm(totpArtist.value!.id, totpCode.value.trim())
    ElMessage.success(t('admin.totpBindSuccess'))
    totpVisible.value = false
    emit('refresh')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    totpLoading.value = false
  }
}

/** R5 恢复方案：重置绑定，旧密钥立即失效，画师须重新绑定才能登录 */
async function resetTotpBind() {
  if (!totpArtist.value) return
  try {
    await ElMessageBox.confirm(
      t('admin.totpResetConfirm', { name: totpArtist.value.name }),
      t('admin.confirmRemoveTitle'), { type: 'warning', confirmButtonText: t('admin.totpReset') }
    )
  } catch { return }
  totpLoading.value = true
  try {
    await adminApi.totpReset(totpArtist.value.id)
    ElMessage.success(t('admin.totpResetSuccess'))
    totpVisible.value = false
    emit('refresh')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    totpLoading.value = false
  }
}
</script>

<style scoped>
/* REQ-027: TOTP 绑定弹窗（随弹窗搬入，取值与 ArtistManage.vue 同源） */
.totp-qr-wrap { display: flex; justify-content: center; margin: 12px 0 4px; }
.totp-qr { width: 200px; height: 200px; border: 1px solid var(--line); border-radius: var(--r-m); }
.totp-step { font-size: 13px; color: var(--ink); margin: 8px 0; }
.totp-hint { font-size: 12px; color: var(--ink2); margin-top: 8px; }
</style>
