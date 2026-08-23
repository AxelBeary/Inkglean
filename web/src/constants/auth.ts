/**
 * 认证流程公共常量（824：TOTP 绑定失效拦截 + 入驻首绑防刷新）
 */

/**
 * sessionStorage 键：TOTP_BIND_REQUIRED 401 提示旗标。
 * api 拦截器在登出跳登录页前写入（非敏感标记，不含任何会话凭据），
 * Login.vue 挂载时消费：展示绑定失效文案后清除，防重复展示。
 */
export const TOTP_BIND_REQUIRED_NOTICE_KEY = 'totp_bind_required_notice'

/**
 * sessionStorage 键：邀请码入驻「首绑进行中」状态。
 * 建号成功后存 { qqNumber, otpauthUri }，页面刷新后直接恢复到二维码页；
 * 找回成功 / 用户主动关闭叠加层 / 流程完成时清除。
 * 注：otpauthUri 含 TOTP 密钥，仅存标签页会话级存储（关页即清），不落 localStorage。
 */
export const INVITE_TOTP_PROGRESS_KEY = 'invite_totp_bind_in_progress'
