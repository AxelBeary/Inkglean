// 桌面端 Promise 化确认框控制器（issue #83）：替换渲染层四处 window.confirm。
// 用法：if (await confirmDialog({ message: '……' })) { 确认分支 } else { 取消分支 }
// 挂载方式：调用处局部挂载（每次 createApp 到 body，落定即 unmount），不新增 App 层依赖；
// 四处共用同一套组件与同一个串行队列——前一个没关时后来的排队，避免叠层与焦点互抢。
import { createApp } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

export interface ConfirmDialogOptions {
  /** 正文：原样渲染（pre-line 保留换行），调用方文案逐字保留 */
  message: string
  /** 可选卡片标题；四处调用均未传，只有正体 */
  title?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（整库替换一类）：确定键换朱砂 */
  danger?: boolean
}

// 队列尾：只做串行化，不参与结果传递
let tail: Promise<void> = Promise.resolve()

export function confirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  const run = (): Promise<boolean> => mountDialog(opts)
  const result = tail.then(run, run)
  tail = result.then(() => undefined, () => undefined)
  return result
}

function mountDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const host = document.createElement('div')
    host.dataset.confirmDialog = ''
    // 打开前的焦点元素：关闭后还原（路由已切走等连不着的场景交给浏览器默认）
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let settled = false

    function finish(value: boolean): void {
      if (settled) return
      settled = true
      app.unmount()
      host.remove()
      if (prevFocus?.isConnected) prevFocus.focus()
      resolve(value)
    }

    const app = createApp(ConfirmDialog, {
      message: opts.message,
      title: opts.title ?? '',
      confirmText: opts.confirmText ?? '确定',
      cancelText: opts.cancelText ?? '取消',
      danger: opts.danger ?? false,
      onConfirm: () => finish(true),
      onCancel: () => finish(false)
    })

    document.body.appendChild(host)
    app.mount(host)
  })
}
