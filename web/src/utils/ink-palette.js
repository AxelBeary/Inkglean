/**
 * canvas 纸墨色板单源（P1 汇总波 C19）
 * PriceCard/ScheduleSharePage/PuzzlePage 曾各自硬编码纸墨 hex；另见 ImageResize/Watermark
 * 的 CSS color-mix 暗化底（无独立 hex，不迁入）。
 *
 * 口径：与 artist-tokens.css 宣纸主题取值一致。canvas 导出图不随实时主题变量换色，
 * 保持既有宣纸口径（墨黑主题下导出/预览底仍为宣纸色，与现状逐像素等价）。
 */
export const INK_PALETTE = {
  paper: '#F5F4EF',
  paper2: '#FBFAF6',
  card: '#FFFFFF',
  ink: '#262520',
  ink2: '#5A564B',
  ink3: '#757062',
  ink4: '#807B6C',
  line: '#E7E4D9',
  line2: '#DAD6C8',
  hq: '#33526E',
  hqT: '#E9EFF4',
  zs: '#BC3A2B',
  zsT: '#F8EAE6',
  sl: '#2F7D54',
  slT: '#EAF3EC',
  white: '#FFFFFF',
  black: '#000000'
}
