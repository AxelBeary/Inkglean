/**
 * canvas 纸墨色板单源（P1 汇总波 C19）
 * PriceCard/ScheduleSharePage/PuzzlePage 曾各自硬编码纸墨 hex；另见 ImageResize/Watermark
 * 的 CSS color-mix 暗化底（无独立 hex，不迁入）。
 *
 * 口径：与 artist-tokens.css 宣纸主题取值一致（818 W5 米色宣纸同步）。
 * canvas 导出图不随实时主题变量换色，保持宣纸口径（墨黑主题下导出/预览底仍为宣纸色）。
 */
export const INK_PALETTE = {
  paper: '#F0E6CF',
  paper2: '#F5EFDF',
  card: '#FFFDF7',
  ink: '#262520',
  ink2: '#5A564B',
  ink3: '#6A6455',
  ink4: '#77705E',
  line: '#DCD0B4',
  line2: '#CFC1A0',
  hq: '#33526E',
  hqT: '#E9EFF4',
  zs: '#BC3A2B',
  zsT: '#F8EAE6',
  sl: '#2F7D54',
  // F-30（P5 收口批）：石绿浅底原为 #EAF3EC，与两处 css 事实源
  // （web/src/styles/artist-tokens.css `--sl-t`、desktop/src/styles/paper-ink.css `--sl-t`）
  // 不一致 → 对齐为 #E5F1E9（色差肉眼不可辨，无测试钉死；本包是双端共用色值事实源）
  slT: '#E5F1E9',
  white: '#FFFFFF',
  black: '#000000'
}
