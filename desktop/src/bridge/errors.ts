// desktop-bridge 逃生门错误类型：
// 在非 Tauri 环境（纯浏览器调试）调用需要原生能力的接口时抛出，
// 上层用 instanceof 判断即可统一降级，不必到处 typeof 检查。
export class BridgeUnavailableError extends Error {
  constructor(capability: string) {
    super(`desktop-bridge 能力「${capability}」需要 Tauri 桌面环境，当前为纯浏览器环境`)
    this.name = 'BridgeUnavailableError'
  }
}
