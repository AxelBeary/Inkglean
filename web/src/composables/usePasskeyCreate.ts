/**
 * usePasskeyCreate — WebAuthn 仪式统一护栏（812-B5 口径）
 *
 * AccountSecurity 的注册（credentials.create）与重绑身份验证（credentials.get）
 * 共享同一套「取消 / 不支持 / 失败」人话提示与 loading 收尾，抽此单源，
 * 行为与两处原实现逐分支等价。
 *
 * 约定：
 * - ceremony 返回非空值（凭据等）→ 视为成功，原样透传
 * - ceremony 返回 null → 视为用户取消，提示 common.passkeyCancelled
 * - ceremony 返回 PASSKEY_FLOW_HANDLED → 调用方已自行处理结果与提示，不再追加
 * - InvalidStateError（设备已注册）→ 走 onInvalidState 回调（默认按取消提示）
 * - 其余异常按 812-B5 分类：取消 / 不支持 / 失败，禁止原始英文错误直出
 * - setBusy(v) 负责进入/退出 busy 态，finally 保证复位
 */
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { isWebAuthnCancellation, isWebAuthnUnsupported } from '../utils/webauthn.js'

/** 仪式内已自行处理（含特定提示），flow 不再追加默认提示 */
export const PASSKEY_FLOW_HANDLED = Symbol('passkey-flow-handled')

export function usePasskeyCreate() {
  const { t } = useI18n()

  /**
   * 执行一次 WebAuthn 仪式并统一处理结果/错误。
   * @param ceremony create/get 仪式
   * @param options
   * @returns 成功返回凭据；取消/失败返回 null
   */
  async function passkeyCreateFlow(
    ceremony: () => Promise<Credential | typeof PASSKEY_FLOW_HANDLED | null>,
    { setBusy, onInvalidState }: {
      setBusy?: (busy: boolean) => void
      onInvalidState?: () => Promise<void> | void
    } = {}
  ): Promise<Credential | null> {
    setBusy?.(true)
    try {
      const result = await ceremony()
      if (result === PASSKEY_FLOW_HANDLED) return null
      if (!result) {
        ElMessage.info(t('common.passkeyCancelled'))
        return null
      }
      return result
    } catch (err) {
      if (err instanceof Error && err.name === 'InvalidStateError') {
        await onInvalidState?.()
        return null
      }
      if (isWebAuthnCancellation(err)) {
        ElMessage.info(t('common.passkeyCancelled'))
        return null
      }
      if (isWebAuthnUnsupported(err)) {
        ElMessage.warning(t('common.passkeyNotSupported'))
        return null
      }
      ElMessage.error(t('common.passkeyFailed'))
      return null
    } finally {
      setBusy?.(false)
    }
  }

  return { passkeyCreateFlow }
}
