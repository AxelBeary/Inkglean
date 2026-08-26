// 模块机制类型（档②波17）：形状照《拾绘模块规范》v0.3 §二 manifest 完整形状。
// 首发口径：network 声明了也拒发；write.shared 只开 none/ro；tearable 壳压 false。
export type ModuleZone = 'core' | 'aside' | 'tail'
export type ModuleHeightRule = 'fixed-rows' | 'stretch'
export type ModuleFocusPolicy = 'keep' | 'fold'
export type SharedWriteLevel = 'none' | 'ro' | 'rw'
export type NetworkScope = 'none' | 'lan' | 'internet'
export type ModuleLifecycle = 'on-view' | 'resident'
export type ModuleIdlePolicy = 'afk-aware' | 'always'

export interface ModuleUiDecl {
  zone: ModuleZone
  heightRule: ModuleHeightRule
  hideable: boolean
  tearable: boolean
  focusPolicy: ModuleFocusPolicy
  styles: string[]
}

export interface ModuleDataDecl {
  /** 只读视图订阅（拍板一：orders/ledger/time/messages 四视图） */
  views: string[]
  write: {
    own: boolean
    shared: SharedWriteLevel
    reason: string
  }
}

export interface ModuleSettingDecl {
  name: string
  type: string
  title: string
  description?: string
  options?: string[]
  default?: string
}

export interface ModuleNetworkDecl {
  scope: NetworkScope
  hosts: string[]
  reason: string
}

export interface ModuleLinkageDecl {
  subscribes: string[]
  emits: string[]
}

export interface ModuleRuntimeDecl {
  lifecycle: ModuleLifecycle
  wakeInterval: string | null
  idlePolicy: ModuleIdlePolicy
}

/** manifest 归一后的完整形状（未声明字段已落最保守默认值） */
export interface ModuleManifest {
  spec: string
  api: string
  minHost: string
  id: string
  name: string
  description: string
  version: string
  /** source 壳判定（规范 §3.1）：模块自报一律忽略，壳按官方/外部/未知标 */
  source: 'official' | 'external'
  entry: string
  ui: ModuleUiDecl
  data: ModuleDataDecl
  settings: ModuleSettingDecl[]
  network: ModuleNetworkDecl
  linkage: ModuleLinkageDecl
  runtime: ModuleRuntimeDecl
  diagnostics: boolean
}

/** 模块四态状态机（规范 §四 审计 M5） */
export type ModuleState = 'ok' | 'disabled' | 'invalid' | 'grey'
