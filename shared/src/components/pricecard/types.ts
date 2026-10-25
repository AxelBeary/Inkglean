// issue-51 拆分批：PriceCard 契约类型单源（原住 PriceCard.vue 普通 <script> 块）
// 纯拆搬零改动：字段/可选性/注释原样保留；index.ts 的对外 re-export 签名不变
// （web/desktop 宿主 `import type { ... } from '@inkglean/shared'` 无需跟改）

/** i18n 注入签名：宿主传自己的翻译函数（与 index.ts 的 TFn 同形，独立声明避免循环引用） */
export type TFn = (key: string, params?: Record<string, unknown>) => string

/** 海报布局：A 菜单长条式 / B 画风卡片式（用户拍板都要，做成可切换） */
export type PriceCardLayout = 'A' | 'B'

/** 档位（id 组件内自管；priceYuan 单位元，可为空；group = 画风分组，空 = 未分组） */
export interface PriceCardTier { id: string; name: string; priceYuan: number | null; note: string; group: string }

/** 例图选条目：作品库勾选或本地上传（dataURL） */
export interface ExamplePick { kind: 'artwork' | 'local'; artworkId?: number; src: string }

/** 约稿条草稿整体（宿主持久化往返的 payload；exampleThumb 为老草稿兼容字段，保留解析） */
export interface PriceCardDraft {
  title: string
  contact: string
  layout: PriceCardLayout
  tiers: Array<Partial<PriceCardTier>>
  picks: ExamplePick[]
  exampleThumb?: string
}

/** 作品库条目（src 为宿主组好的可直载地址） */
export interface PriceCardArtwork { id: number; title: string; src: string }

/** 宿主取数转换后回灌的档位（长度/字数钳制在组件内做） */
export interface ImportedTier { name: string; priceYuan: number; note?: string; group?: string }

/** 档位分组（保持首次出现顺序；空组名渲染时回落「未分组」） */
export interface TierGroup { name: string; tiers: PriceCardTier[] }
