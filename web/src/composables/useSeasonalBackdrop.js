// 登录页背景层接口（v0.49 预留，2026-08-10 用户拍板）
// 用途：① 节日换背景（服务端节日主题）② 画师自定义登录背景
//
// 契约：返回 backdropUrl（null = 默认纸艺山水）+ backdropAlt（描述文案）。
// 渲染层在 components/artist/login/LoginBackdrop.vue（.seasonal-backdrop，位于远山之上、卡片之下，入场渐显）；
// 本文件只负责数据源——数据源接通前恒返回 null，页面保持默认远山，无行为差异。
//
// 数据源接入点（立项后在此实现，前端其余部分零改动）：
//   1. 节日主题：GET /api/seasonal-backdrop → { url, alt }（服务端节日日历，未立项）
//   2. 画师自定义：artist.settings.login_backdrop_url（设置项未立项；
//      上传走既有 uploads 白名单，需加尺寸/体积上限与审核态，防滥用）
//   优先级约定（接入时实现）：画师自定义 > 节日主题 > 默认山水。
import { ref } from 'vue'

export function useSeasonalBackdrop() {
  const backdropUrl = ref(null)
  const backdropAlt = ref('')

  // 数据源接入点见文件头注释；立项后在此拉取并赋值，保持 null = 默认山水（无独立未完成项）

  return { backdropUrl, backdropAlt }
}
