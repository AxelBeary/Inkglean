// ============================================
// 开箱设置状态管理（REQ-038）
// ============================================
import { defineStore } from 'pinia'
import { ref } from 'vue'
// 813-fq-tail-shared 战役 S：错误兜底文案走 i18n（setup 命名空间），随当前 locale 即时翻译
import { i18n } from '../i18n/index.js'

/** 设置接口错误体（Error 扩展 code/status，语义与原 JS 动态属性一致） */
interface SetupApiError extends Error {
  code?: string
  status?: number
}

/** /api/setup/status 响应体 */
interface SetupStatus {
  initialized: boolean
  tokenRequired: boolean
}

/** /api/setup/admin 响应体（成功路径字段） */
interface SubmitAdminResult {
  artist: { qqNumber: string; name: string }
  totpSecret: string
  otpauthUri: string
}

export const useSetupStore = defineStore('setup', () => {
  // 初始化状态
  const initialized = ref(false)
  const tokenRequired = ref(false)
  const checking = ref(true)

  // 设置令牌（安装口令）
  const setupToken = ref('')

  // 管理员信息
  const adminQq = ref('')
  const adminName = ref('')
  const totpSecret = ref('')
  const otpauthUri = ref('')

  // 工作室信息
  const studioName = ref('')
  const studioSubdomain = ref('')
  const createStudio = ref(true)

  // 当前步骤（1-4）
  const currentStep = ref(1)

  /**
   * 查询设置状态
   */
  async function checkStatus(): Promise<SetupStatus> {
    checking.value = true
    try {
      const res = await fetch('/api/setup/status')
      // a3: res.ok 守卫——503/HTML 错误体直接 res.json() 会抛 SyntaxError，与路由守卫分支处理对齐
      if (!res.ok) {
        initialized.value = false
        tokenRequired.value = false
        return { initialized: false, tokenRequired: false }
      }
      const data = await res.json()
      initialized.value = data.initialized
      tokenRequired.value = data.tokenRequired
      return data
    } finally {
      checking.value = false
    }
  }

  /**
   * 提交创建管理员
   */
  async function submitAdmin(params: Record<string, unknown>): Promise<SubmitAdminResult> {
    const res = await fetch('/api/setup/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    const data = await res.json()
    if (!res.ok) {
      const err = new Error(data.error || i18n.global.t('setup.submitAdminFailed')) as SetupApiError
      err.code = data.code
      err.status = res.status
      throw err
    }
    adminQq.value = data.artist.qqNumber
    adminName.value = data.artist.name
    totpSecret.value = data.totpSecret
    otpauthUri.value = data.otpauthUri
    return data
  }

  /**
   * 确认 TOTP 并完成设置
   */
  async function confirmTotp(code: string): Promise<Record<string, unknown>> {
    const res = await fetch('/api/setup/totp-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qqNumber: adminQq.value, code })
    })
    const data = await res.json()
    if (!res.ok) {
      const err = new Error(data.error || i18n.global.t('setup.confirmTotpFailed')) as SetupApiError
      err.code = data.code
      err.status = res.status
      throw err
    }
    initialized.value = true
    return data
  }

  /**
   * 重置状态
   */
  function reset(): void {
    initialized.value = false
    tokenRequired.value = false
    checking.value = true
    setupToken.value = ''
    adminQq.value = ''
    adminName.value = ''
    totpSecret.value = ''
    otpauthUri.value = ''
    studioName.value = ''
    studioSubdomain.value = ''
    createStudio.value = true
    currentStep.value = 1
  }

  return {
    initialized,
    tokenRequired,
    checking,
    setupToken,
    adminQq,
    adminName,
    totpSecret,
    otpauthUri,
    studioName,
    studioSubdomain,
    createStudio,
    currentStep,
    checkStatus,
    submitAdmin,
    confirmTotp,
    reset
  }
})
