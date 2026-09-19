# 客户端前端实现模式（二号）

来源：v0.32 Phase2 客户端三步走 + Phase3 四模板适配实践（2026-08-03）。

## 变长步骤流程（动态步骤号）

多模型表单（旧模型 3 步 / 单画风 4 步 / 多画风 5 步）不要硬编码 step 号：

```js
const stepDefs = computed(() => {
  if (!isStyleMode.value) return [{ key: 'tier', label: ... }, { key: 'detail', ... }, { key: 'contact', ... }]
  const defs = []
  if (isMultiStyle.value) defs.push({ key: 'style', ... })
  defs.push({ key: 'size', ... }, { key: 'addon', ... }, { key: 'detail', ... }, { key: 'contact', ... })
  return defs
})
const sizeStep = computed(() => stepDefs.value.findIndex(s => s.key === 'size') + 1)
// detailStep / addonStep / contactStep 同理
```

- 步骤指示器：`v-for="(sd, idx) in stepDefs"`，dot 状态用 `idx + 1` 对比 step
- 内容块：`v-show="step === sizeStep"`；旧模型块用 `v-if="!isStyleMode"` 隔离（完全不动）
- prev/next 按钮引用 computed 步骤号，不写数字字面量

## 退化逻辑必须跨入口一致

- 多画风 → 完整流程；单画风 → 自动选中唯一项跳过选择步骤（onMounted 里 `if (styles.length === 1) selectedStyleId.value = styles[0].id`）；无数据 → 旧模型不动
- OrderForm（下单流程）和 TplStyleGrid（主页价格表）必须实现同样的退化规则，用户体验才一致

## 数据驱动的模式检测

- `isStyleMode = styles.length > 0`；画风 API 静默失败（catch 空函数）→ styles 保持 [] → 自动回退旧模型，无需显式开关
- 画风列表用 **await** 加载（在 onMounted 里 loading=false 之前），避免步骤列表先渲染 3 步再跳 5 步的闪烁

## 模板适配任务：方案 A（扩展现有组件）vs 方案 B（新建组件）

派工常写"方案你定，写进交付报告"：

- 派工有硬要求"现有组件 props/插槽/样式不动" → **选 B 新建组件**
- 新组件复用现有布局语言：同 class 命名模式（`tpl-tier-*` → `tpl-style-*`）、同 CSS 变量（`--pal-border` / `--pal-surface` / `--pal-text` / `--color-primary`，零硬编码颜色，4 配色主题自动适配）、同交互（移动端 touchstart/touchend 滑动，阈值 50px）
- 模板入口 `v-if="styles.length"` → 新组件；`v-else-if="tiers.length"` → 旧组件原样保留兜底；section 级 v-if 改为 `styles.length || tiers.length || ...`
- 交付报告写"方案选择"专节：选了哪个 + 2-3 条理由

## 无浏览器环境的走查要求

派工要求"手动走查或截图说明"但没有运行环境时：
- 交付报告列"场景 × 渲染路径 × 状态"表（如 4 模板 × 有画风/无画风/单画风）
- 写明依据是代码路径 + 构建产物，并给一号可执行的复核建议（如 `?_tpl=classic/gallery/folio/atelier` 预览参数）
- **不伪造截图**

## 价格联动细节

- 价格计算全走后端 API（不做本地计算，避免覆盖逻辑漂移），防抖 300ms
- 折扣码验证成功 / 清除时都要重新触发计价（后端计价响应含折扣行）
- onUnmounted 清掉所有 calc timer（draftTimer / calcTimer / styleCalcTimer）
- 切换上游选择（画风/尺寸/档位）必须重置下游选择（增项选择依赖尺寸，切尺寸要清空增项）
- el-input-number 的 v-model 不接受 undefined：新可选列表渲染前先初始化默认值（quantity→0, toggle→false）

## URL query 预选进多步表单（v0.34 任务B，深链模式）

主页展示柜选好后跳转下单页并跳过已选步骤的通用实现：

1. **composable 第三参传 query**：`useOrderForm(subdomain, formRef, route.query)`，第三参默认 `{}`；测试直接传 opts 注入（不需要 mock router）。
2. **加载数据后统一应用**：`applyQueryPreselect()` 放在 styles/tiers 加载完成后、草稿恢复之前。无效/已停用 ID **静默忽略**（不报错不提示，走正常流程）；sizeId 必须属于当前已选画风的 sizes 才生效（跨画风忽略）。
3. **query > 草稿恢复**：用 `queryPreselect = reactive({ styleId, sizeId })` 记录命中项；restoreDraft 里逐项判断 `if (!queryPreselect.styleId)` 才恢复草稿值。共用字段（如倍率）不受影响，仍从草稿恢复。
4. **初始步骤跳转**：页面层 `watch(loading, v => { if (v || !isStyleMode) return; if (queryPreselect.sizeId) step = addonStep; else if (queryPreselect.styleId && isMultiStyle) step = sizeStep }, { once: true })`——等数据加载完再跳，否则步骤号 computed 还没稳定。
5. **测试必配**：双参有效 / 仅一参 / 无效 ID 忽略 / 跨父级 ID 忽略 / 单亲退化路径 / query+草稿并存（query 不被覆盖）/ query 缺一参时草稿补位——至少 6-7 个用例。

## 删共享组件的 DOM 元素 → 孤儿样式清理检查

删图标 span（如 `tpl-announcement-icon`、`tpl-revision-note-icon`）时：

- 用 `search_files` 全局搜该 class 名——**4 个模板的 `:deep(.xxx)` scoped 穿透样式会变成孤儿**，一并删掉。
- 删 i18n 键（如 `landing.notFoundHint`）前同样全局搜引用，确认 0 引用才删；新键中英双语同步加。
- 删 emoji 图标位：元素只剩图标（纯装饰 span）→ 删整个元素；元素还承载文字（如 `{{ group.icon }} {{ group.label }}`）→ 只删图标插值保留文字。

## emoji 清理的替代手法（不用图标库）

- 纯 CSS 图形：太阳 = 圆 + 8 方向 box-shadow 光线；月亮 = `border-radius:50% + box-shadow: inset -3px 2px 0 0 currentColor`（双圆遮罩效果）。跟随 currentColor，亮暗主题免适配。
- 文字徽标：🔗 → 「链」，与其他平台徽标（微/B/P/X/红/L/抖）同一视觉语言。
- 收款/尾款语义：emoji 改「百分比胶囊徽章 + 文字标签」，复用已有 i18n 键（如 `workflow.final`），语义更强且不引入新键。
- 保留白名单：✓ U+2713 / ✕ U+2715 / ✔ U+2714 / ★ ☆ / ◐ / 所有箭头（U+2190-21FF）是功能性文本符号不是 emoji，扫描正则要排除，清理脚本 KEEP 集合显式列出。

## 独立 404 页模式（v0.34 任务A）

- 大号 404 用描边镂空字（`color: transparent; -webkit-text-stroke: 2px var(--color-primary)`），干净有质感不占资源。
- 画师入口卡片是锦上添花：API 失败**静默隐藏**整个 section，不影响 404 主体信息。
- 主题/语言切换复用客户端浮窗组件（ClientFloatingActions 右下角），不要在 404 页 header 放第二套——与画师主页体系一致是硬要求。
- router catch-all 指向新页后，原 LandingPage 的 isNotFound 逻辑（computed + 提示条 + 样式）三处全删；`useRoute`/`computed` 无其他引用时导入一并清。

## Mock-first 并行开发（API 契约未定，等并行角色交付）

派工写明"契约已定但后端未交付，先按预判契约 mock"时的标准实施法（v0.35 波 2 实践）：

1. **逻辑抽纯函数进 composable 模块级 export**（如 `resolveSizeImagePath` / `deriveGalleryFilters` / `filterArtworksBySize`）——不依赖 API、不依赖组件挂载即可单测，契约字段名将来变了只改这一处。
2. **mock 做成显式装饰函数**（如 `applyV035MockFields(styles, artworks)`），整块用 `⚠️ 待 X 交付后删除` 注释包裹，函数头注释写明"删除本函数 + 调用行即还原"。替换成本必须是一行级的。
3. **注入点收敛在数据加载单点**（如 ArtistHome 的 getPublicStyles 回调内），不散落各组件。
4. **mock 数据确定性生成、基于真实返回数据派生**（第一张作品引用 id、步长分配标签），不猜 DB id——任何画师的数据都能演示，且测试可断言。
5. **测试覆盖 mock 形状本身**（字段分配规则、边界：无画风/单尺寸/最后一张不标），联调替换 mock 时这些用例随 mock 一起删，纯函数用例保留。
6. **comms 交付文件必须列 mock 占位清单**（哪个函数 + 哪个调用点待替换），一号据此安排联调。

### mock 数据必须尊重 UI 的展示规则（v0.35 实测 bug）

- mock 给**全量** artworks 附加 tags，但画廊只展示非封面作品（`galleryArtworks` 去重规则）→ 出现"筛选标签存在但该档位筛出 0 作品"。
- **规则：mock 装饰必须基于 UI 实际消费的展示列表分布**（先 `filter(a => !a.is_cover)` 再装饰，然后按 id merge 回全量），否则依赖该字段的筛选/标签功能会出现幽灵空态。
- 分配覆盖性：N 张作品分 M 个档位，"步长 1 每张标 2 档"在 M > N-1 时漏尾档位；**步长 2 分配（j → 2j%n, (2j+1)%n）**在 2(N-1) ≥ M 时全覆盖，同 id 要去重。浏览器自测要**逐标签点一遍**验证每个筛选非空（或空态文案正确）。

### F4 预选可见横幅（query 预选的可见性扩展）

- 深链预选跳步后客户不知道自己被预选了什么 → composable 加 `preselectBannerText` computed：`queryPreselect` 命中 **且当前选择仍等于预选值** 时返回 i18n 文案（齐选/仅画风两态），用户手动改选后自动消失（摘要卡已反映实选）。
- 页面层横幅带「修改」按钮跳回对应步骤（多画风→选画风步 / 单画风→选尺寸步），满足"可见、可改、不锁死"。
- 测试：齐选横幅 / 仅画风横幅 / 改选后消失 / 入口 B 无横幅 / 旧模型无横幅。

## 带操作按钮的 toast（撤销类软撤销）

ElMessage 不支持 action 按钮（v0.36 波1实测），破坏性操作后的"撤销"提示要自写 fixed 小组件（UndoToast.vue 模式）：

- **组件自包含**：Teleport body + fixed bottom-center + Transition；props 收 visible/message/label（按钮文案由父组件传已翻译文本，组件自身不依赖 i18n 键——避免键名漂移）；emit undo/timeout。
- **一次性撤销按钮**：点击后 undoing=true 禁再点、清 timer、emit undo；watch(visible) 重置 undoing + 起 duration 倒计时（默认 5s）。
- **视觉规格**：派工通常要求深色背景白字（`rgba(30,32,36,.92)` + `#fff`，按钮浅蓝 `#7ab3ff`），不要用浅色 `--el-bg-color-overlay`——v0.36 接力曾在此偏轨。
- **父组件职责**：拖拽提交成功时记 oldXxx/newXxx 快照 + showUndoToast；点撤销时按旧值反向调同样的 API（两次 PUT 的顺序要对称处理交叉校验，参考 dayDelta 正负分支）；撤销成功刷队列 + `ElMessage.success(t('queue.tlUndone'))`；撤销失败重拉服务端数据对齐。API 失败路径不弹 toast（走 catch）。

## ESLint：多行元素内联内容警告

- 新增的 `<button ...>文字</button>` 若 button 属性多行展开，`vue/multiline-html-element-content-newline` 会报 warning（0 error 也违反"零警告"标准）。`npx eslint . --fix` 全自动修复，fix 后重跑 vitest 确认无回归。

## 组件级步骤导航测试模式（F1 跳步修复实践，2026-08-04）

步骤导航逻辑（stepDefs / step / 各步骤号 computed）在**组件 `<script setup>` 内、不在 composable 里**时，composable 测试覆盖不到——必须写组件测试。已验证的配方（OrderForm.stepnav.test.js）：

1. **mock composable 控制模式，不 mock Element Plus**。`vi.hoisted` 建提升容器 `h`，`vi.mock('.../useOrderForm.js', () => ({ useOrderForm: () => (h.current = h.build(h.mode)) }))`——每次挂载返回可控实例，测试体内直接改 `h.current.selectedSizeId.value = 111` 驱动状态；`h.mode = 'legacy' | 'single' | 'multi'` 切三种模式。Element Plus 用 `global.plugins: [ElementPlus]` 全量真挂（需要 `window.ResizeObserver` polyfill：happy-dom 没有，EP 内部会用到）。
2. **i18n 双 mock**：`vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: k => k })}))` 之外，**必须再 mock i18n 单例模块**（`vi.mock('../../../i18n/index.js', ...)` 给 `setLocale`/default 假实现）——ThemePicker 经 ClientFloatingActions import 链带入真实 `i18n/index.js`，它调用 `createI18n`，会被 vue-i18n mock 炸掉（报错 `No "createI18n" export is defined on the "vue-i18n" mock`）。stub 只挡渲染不挡 import，import 链上的模块要 mock。同理 pinia store 依赖的组件直接 stubs 掉（`ClientFloatingActions: true`）。
3. **v-show 面板定位**：多步骤面板全在 DOM 里，可见面板 = `wrapper.findAll('form > div').find(d => d.element.style.display !== 'none' && d.find('.step-title').exists())`。
4. **按 i18n key 找按钮**：mock 后 `$t(key)` 返回 key 本身，`panel.findAll('.step-nav button').find(b => b.text().replace(/\s+/g,'') === 'orderForm.nextStep')`——断言文案用 key 不写中文，i18n 改键名测试不脆。点击前断言 `btn.element.disabled === false`。
5. **测试矩阵**：每模式正向全链路（1→N 逐步）+ 反向全链路（N→1）+ 首步无"上一步"按钮断言 + **回归专项用例**（bug 步骤的下一步目标断言，注释写明"不得跳到 X"）。正向链路中途需先置选择状态（selectedStyleId/selectedSizeId/tierId）再点"下一步"，否则按钮 disabled。

## 页内拖拽守卫模式（G1 实践，v0.36-w2）

需求"页面里已展示的图片不许拖进上传区"的统一实现：

1. **来源判断**：`e.dataTransfer.types` 含 `'Files'` = 系统文件拖拽；只有 text/html/text/plain = 页内元素拖拽。写成共享 composable（如 `useDropGuard`）+ 模块级纯函数 export（`isSystemFileDrag`）供单测，各上传区统一接入，不复制逻辑。
2. **必须挂捕获阶段**：Element Plus 的 el-upload dragger 在冒泡阶段处理 drop 且不检查来源（读 `element-plus/es/components/upload/src/upload-dragger.vue_*.mjs` 源码确认），页内拖入时 files 为空被静默放过。守卫用 `@dragenter.capture` / `@dragover.capture` / `@drop.capture` 抢在 EP 之前拦截。
3. **用 `stopImmediatePropagation` 而非 `stopPropagation`**：守卫捕获监听与上传区自身的冒泡监听（如 `@dragover.prevent` 高亮）常挂在同一元素——DOM 规范下 target 阶段同元素监听按注册顺序全部执行，stopPropagation 拦不住同元素的冒泡监听。
4. **原生 drop 区双保险**：模板挂捕获 dragenter/dragover 拦截 + handler 开头 `if (!guardDrop(event)) return` 兜底。el-upload drag 区只需模板三个 .capture 监听。
5. **警告节流**：dragenter 在子元素间移动会重复触发，模块级时间戳节流（~1.5s）防 toast 刷屏。单测注意：fake timers 下每个用例时钟基准要递增，否则上一用例写入的节流时间戳污染下一用例。
6. **grep 枚举上传区别只信派工清单**：派工列的清单可能不全（实测发现 QueueBoard 焦点图替换区、DeliverDialog 交付区也是 drop 目标）。用 `@drop|@dragover` + `el-upload` 两轮搜索交叉枚举；vuedraggable 的排序拖拽不是上传区，排除。

## 价格字段脏标记模式（G2 实践，v0.36-w2）

"自动填充的计算价 vs 用户手输价"冲突的通用解法（手动录单 005 事故根因：字段停在旧计算价 → 提交时被误判为用户改价 → 误调改价接口抹掉增项）：

1. **computed setter 包装置脏**：`el-input-number` 绑定 `priceInput`（computed get→原始 ref / set→置脏+写入），用户输入/步进必经 setter 置脏；程序自动填充（doCalc）直接写原始 ref 绕过 setter，**永不置脏**。比监听 EP 的 change/input 事件语义更确定（不依赖组件事件触发时机）。
2. **未置脏 → 计算结果始终同步进字段**（修"加增项后价格停在旧值"）；已置脏 → 尊重手输不覆盖。
3. **提交分支以脏标记为准**：未置脏绝不调改价接口（后端按计算价自动入账）；仅置脏且手输价 ≠ 计算价时才写入。
4. **所有重置路径清脏标记**：resetForm、切换档位（清空下游选择的同时）、任何把价格置回 null 的地方——漏一处就会出现"价格框空白且不跟随计算"。

## browser_console 返回值陷阱（自测辅助）

- `browser_console` 对 IIFE / async 表达式常返回 `null`（序列化丢失），即使表达式有返回值。别依赖复杂表达式一次拿结果：**写简单表达式**（直接 `JSON.stringify([...].map(...))`），或 dispatch 与断言分两次调用。
- tab 可能被重置为 about:blank（弹窗操作/导航副作用），console 返回 bodyLen=0 + url=about:blank 时先 `browser_navigate` 重进，登录 cookie（httpOnly）通常还在；若被清则重走开发登录流程。

