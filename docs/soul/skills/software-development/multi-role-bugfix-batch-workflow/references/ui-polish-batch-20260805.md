# UI 打磨批 A+B+C+E（五号，2026-08-05）——EP 组件覆盖技法 + 派工重发断点续跑

## ⚠️ 通用纪律：派工重发 = 断点续跑（本批派工送达 8 次）
同一条派工被重复送达时：
1. 三查定位断点：`git branch --show-current` + `git status --short` + `git log --oneline -3`
2. 与派工清单比对，只续做未完成部分；已 commit 的绝不重跑
3. 连续重发多轮 → 明确告知用户，建议一号排查派工循环卡住

## ⚠️ 通用纪律：核验器「未观察到执行证据」应对
改动在 worktree、workspace 根是主仓时核验器常误报。可靠做法：在改动所在 worktree
直接重跑 canonical 命令并展示带退出码的输出（server: `npx vitest run`；
web: `npx vitest run` + `npx eslint .` + `npm run build`）。
**不要**先写临时验证脚本（hermes-verify-*.ps1）再执行——会被 PowerShell
script-execution 审批拦截，审批超时反而阻塞。直接跑 canonical 命令最可靠。

## E 类：EP el-page-header 无障碍名重复（根因 + 修法）
- 根因（EP 2.14.3 page-header 源码）：icon 容器 div 自动带 `aria-label = title prop`，
  与 title 文本叠加，读屏读两遍
- 修法：title 插槽包 `aria-hidden="true"`——icon aria-label 保留为唯一无障碍名，
  视觉文本不变，零视觉改动：
  ```vue
  <el-page-header @back="..." :title="$t('x.backHome')" :content="...">
    <template #title><span aria-hidden="true">{{ $t('x.backHome') }}</span></template>
  </el-page-header>
  ```
- 同类组件全 grep：`返回主页|backHome` 定位所有使用处（本批 3 处：TrackOrder/OrderForm/DeliveryPage）

## B/C 类：EP 亮色对比度覆盖（不动暗色）
- 选择器限定 `html:not(.dark)` 作用域，暗色零影响（红线「只调亮色」的标准写法）
- warning alert 文字：EP 默认 `--el-color-warning` #e6a23c 在浅橙底约 2.2:1，
  加深 `#855e0a` ≈ 5.4:1 达 AA；title + `:deep(.el-alert__description)` 都要覆盖
- placeholder：scoped CSS 覆盖 EP 变量即可：
  `html:not(.dark) .page-root { --el-input-placeholder-color: #6c6e72; }`
  （EP input.scss 用 `getCssVarWithDefault('input-placeholder-color', ...)`，变量覆盖生效）

## A 类：硬编码文案 → i18n 键
- 数组 name 改 nameKey（存完整键路径），渲染处 `t(a.nameKey)`
- 色名翻译信达雅：青=Teal 碧=Turquoise 蓝=Blue 靛=Indigo 紫=Violet（英语传统色名，非直译）
- locales 双语成对加键，键名与语义对齐（teal/turquoise 而非 cyan/sky）

## 实测闭环（派工要求实测的项目）
- A：vite dev + 浏览器切 EN，快照确认 tooltip 显示英文色名
- B：browser_vision 确认亮色警告文字深琥珀清晰
- C/E：browser_console 读 computed style / DOM 属性（比视觉判断精确）：
  `getComputedStyle(...).getPropertyValue('--el-input-placeholder-color')`、
  `querySelector('.el-page-header__icon').getAttribute('aria-label')`
- 实测完 kill vite dev session（background=true 起的进程要显式 kill）
