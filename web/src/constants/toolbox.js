// ─── 工具箱四分类注册表（纸墨提案 §5.5：导航一个把手 + 四个分类格子） ───
// 单一事实源：ArtistLayout（侧栏把手/抽屉分类组）与 ToolsHome（工具箱首页）共用。
// 路由与 i18n 键保持现状不变，本文件只定义导航归组。
import { Wallet, Download, PriceTag, Document, Stamp, Grid, Calendar, RefreshRight, ScaleToOriginal, User, Connection, ChatLineRound, ForkSpoon, Notebook, AlarmClock, Box } from '@element-plus/icons-vue'

/** 15 个小工具按用途归入四类（cat 对应 TOOL_BOX_CATEGORIES.key） */
export const TOOLS_MENU_ITEMS = [
  // 钱袋子：记账/导出/算价
  { index: '/tools/income', icon: Wallet, labelKey: 'menu.standaloneIncome', cat: 'money' },
  { index: '/tools/export', icon: Download, labelKey: 'menu.toolsExport', cat: 'money' },
  { index: '/tools/price-calc', icon: PriceTag, labelKey: 'menu.priceCalc', cat: 'money' },
  { index: '/tools/quote', icon: Document, labelKey: 'menu.quote', cat: 'money' },
  // 交付：水印/拼图/排期公示/改稿计数/压图改尺寸
  { index: '/tools/watermark', icon: Stamp, labelKey: 'menu.watermark', cat: 'delivery' },
  { index: '/tools/puzzle', icon: Grid, labelKey: 'menu.puzzle', cat: 'delivery' },
  { index: '/tools/schedule', icon: Calendar, labelKey: 'menu.scheduleShare', cat: 'delivery' },
  { index: '/tools/revision-count', icon: RefreshRight, labelKey: 'menu.revisionCount', cat: 'delivery' },
  { index: '/tools/image-resize', icon: ScaleToOriginal, labelKey: 'menu.imageResize', cat: 'delivery' },
  // 客户：标记/召回/回复
  { index: '/tools/clients', icon: User, labelKey: 'menu.clientTags', cat: 'clients' },
  { index: '/tools/returning', icon: Connection, labelKey: 'menu.returningClients', cat: 'clients' },
  { index: '/tools/reply', icon: ChatLineRound, labelKey: 'menu.socialReply', cat: 'clients' },
  // 效率：吃什么/速记/截稿日
  { index: '/tools/food', icon: ForkSpoon, labelKey: 'menu.foodMenu', cat: 'efficiency' },
  { index: '/tools/note', icon: Notebook, labelKey: 'menu.quickNote', cat: 'efficiency' },
  { index: '/tools/deadline', icon: AlarmClock, labelKey: 'menu.deadlineAdvice', cat: 'efficiency' }
]

/** 四个分类格子（顺序即展示顺序） */
export const TOOL_BOX_CATEGORIES = [
  { key: 'money', labelKey: 'menu.toolboxCatMoney', icon: Wallet },
  { key: 'delivery', labelKey: 'menu.toolboxCatDelivery', icon: Box },
  { key: 'clients', labelKey: 'menu.toolboxCatClients', icon: User },
  { key: 'efficiency', labelKey: 'menu.toolboxCatEfficiency', icon: AlarmClock }
]
