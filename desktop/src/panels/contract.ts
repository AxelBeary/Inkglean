// 板块契约（插件化批档①，拍板事实源：docs/comms/插件化研判-板块契约-20260825-已拍板.md §4.1/§4.2）
// 冻结契约：本批所有板块组件、壳层行为一律引用本文件类型，不得另立平行定义。
// 纪律：框架对登记在册板块统一施加显隐/装裱纸式/撕出贴回/专注收合/等高对齐/双模式过滤，板块自己一概不管。
// api 字段档①预留不实现校验，保证档②（本地模块机制）落地零破坏。

export type PanelZone = 'core' | 'aside' | 'tail'
export type PanelId = 'today' | 'ops' | 'msgs' | 'orders'
/** 撕悬浮三件（首发仅此三件，§4.2 拍板）：计时器（经营）/ 今日待办行（今日要办）/ 截稿倒计时（订单速览） */
export type TearableId = 'timer' | 'today-todo' | 'deadline'
/** 装裱纸式三选（全局单选防混搭，825 拍板） */
export type MountStyle = 'plain' | 'grid' | 'indigo'

export interface PanelContract {
  id: PanelId
  /** 平实文案（命名纪律：器物进形态不进名字） */
  label: string
  /** 方向 A 卷面区位（框架管区位，板块不管自己放哪） */
  zone: PanelZone
  /** 是否允许显隐（今日要办不可隐，系统控制优先纪律） */
  hideable: boolean
  /** 可撕悬浮件（独立窗口投影 = 框架行为） */
  tearables: TearableId[]
  /** 专注画画模式下去留 */
  focusPolicy: 'keep' | 'fold'
  /** 等高纪律：定行数 / 随区拉伸，禁止内容撑高 */
  heightRule: 'fixed-rows' | 'stretch'
  /** 依赖的板块 API 版本（档②单独失效校验用，档①只登记不校验） */
  api: 'panel@1'
}

export const PANEL_REGISTRY: readonly PanelContract[] = [
  { id: 'today', label: '今日要办', zone: 'core', hideable: false, tearables: ['today-todo'], focusPolicy: 'keep', heightRule: 'stretch', api: 'panel@1' },
  { id: 'ops', label: '经营', zone: 'aside', hideable: true, tearables: ['timer'], focusPolicy: 'keep', heightRule: 'fixed-rows', api: 'panel@1' },
  { id: 'msgs', label: '留言', zone: 'aside', hideable: true, tearables: [], focusPolicy: 'fold', heightRule: 'fixed-rows', api: 'panel@1' },
  { id: 'orders', label: '订单速览', zone: 'tail', hideable: true, tearables: ['deadline'], focusPolicy: 'fold', heightRule: 'fixed-rows', api: 'panel@1' }
]

export function getPanel(id: PanelId): PanelContract {
  const p = PANEL_REGISTRY.find(x => x.id === id)
  if (!p) throw new Error(`未登记的板块: ${id}`)
  return p
}

// 状态挂牌（plaque）＝题签壳控件，不是板块：云端模式渲染 / 本地模式整体不渲染（810 联网职能隐藏纪律，§4.2 拍板）。
// 墨笔菜单 / 卷尾状态带同为壳层控件。
