/**
 * qrcode 最小类型声明（库本身不带 d.ts；只声明项目用到的 API 形状）
 * 仅服务 TS 迁移类型检查，零运行时影响。
 */
declare module 'qrcode' {
  interface QRCodeToDataURLOptions {
    width?: number
    margin?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }
  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>
  }
  export default QRCode
}
