// 更多抽屉条目组装（9/4 主页重设计落码波1 · 路B）：纯函数，供 MoreDrawer.vue 渲染与单测。
// 抽成纯函数的理由（施工图 §五-7）：条目分组/文案/降级逻辑可测，组件只管渲染。
// 纪律（§一-4 不留死按钮）：只列桌面端真有的条目——原型里的「统计」「客户快查」桌面端无对应页面，
//   一律不出现在这里（不留死条目）。模块四态文案与 views/tools/ModulesTool.vue 的 stateLabel 同口径。
import type { ModuleState } from '../../modules/types'

/** 抽屉单条：图标字 + 名称 + 描述 + 目标路由路径（点击一律 router.push(to)） */
export interface DrawerItem {
  ico: string
  name: string
  desc: string
  to: string
}

/** 抽屉分组：段标题 + 条目 */
export interface DrawerSection {
  sec: string
  items: DrawerItem[]
}

/** 模块入参：展示名 + 四态（由 store.stateOf 合成后传入，纯函数不碰 store/桥） */
export interface DrawerModule {
  name: string
  state: ModuleState
}

/** 四态文案（与 ModulesTool.stateLabel 逐字同口径，防两处漂移） */
export function moduleStateLabel(s: ModuleState): string {
  switch (s) {
    case 'ok': return '正常'
    case 'disabled': return '已停用'
    case 'invalid': return '已失效'
    case 'grey': return '灰牌'
  }
}

/** 工具箱六条（照墨笔菜单「工具箱」段既有六页，路由与 router/index.ts 一致） */
const TOOL_ITEMS: DrawerItem[] = [
  { ico: '价', name: '价目分享卡', desc: '档位价目卡', to: '/tools/price-card' },
  { ico: '票', name: '小票打印机', desc: '接单小票', to: '/tools/receipt' },
  { ico: '档', name: '我的档案', desc: '画师资料', to: '/tools/profile' },
  { ico: '模', name: '工程模板', desc: '接单工程模板', to: '/tools/templates' },
  { ico: '导', name: '数据导出', desc: '导出记账数据', to: '/tools/export' },
  { ico: '块', name: '模块管理', desc: '装 / 停 / 看模块', to: '/tools/modules' }
]

/**
 * 组装抽屉三段条目：板块 / 插件（模块）/ 工具箱。
 * - 板块：「排期三视图」→ /schedule（本地模式也显——本地有列表+月历，只是描述里诚实说明无时间条，拍板②）。
 * - 插件：模块逐条（带四态文案）+「装新插件」，点击一律 → /tools/modules（诚实简化：抽屉不内联沙箱帧）。
 *   无模块时该段只留「装新插件」（不留空段）。
 * - 工具箱：六条既有工具页。
 */
export function buildMoreDrawer(modules: DrawerModule[], mode: 'cloud' | 'local'): DrawerSection[] {
  const panelItem: DrawerItem = {
    ico: '排',
    name: '排期三视图',
    desc: mode === 'cloud' ? '列表 / 月历 / 时间条全景' : '列表 / 月历（本地按记账自建）',
    to: '/schedule'
  }
  const moduleItems: DrawerItem[] = [
    ...modules.map(m => ({
      ico: m.name.charAt(0) || '插',
      name: m.name,
      desc: `插件 · ${moduleStateLabel(m.state)}`,
      to: '/tools/modules'
    })),
    { ico: '+', name: '装新插件', desc: '从「我的文档\\拾绘\\modules」扫描', to: '/tools/modules' }
  ]
  return [
    { sec: '板块', items: [panelItem] },
    { sec: '插件（模块）', items: moduleItems },
    { sec: '工具箱', items: [...TOOL_ITEMS] }
  ]
}
