# 二号工作流沉淀：v0.29 修复批 + 封面预读 + v0.30 两波（2026-08-02）

## 流程类

### STATUS.md 不是派工单——等 01-to-02 文件才开工

用户纠正："你不等一号派工吗？" STATUS.md 的"下一步执行顺序"只是全局规划，不是给二号的派工。只有 `docs/comms/01-to-02-*.md` 才是正式派工。

**规则**：读完 STATUS.md 后可做只读调研（熟悉代码、确认现状），但**不切分支、不改代码、不 commit**，等派工文件到再开工。调研结论可主动写 comms 给一号参考。只读预读任务（如封面模板预读）明确"不建分支不改代码"时，报告直接写主 worktree 的 comms，commit 由一号处理。

### 派工里的授权范围要逐字核对

v0.29 派工把 #17（OrderDetail 客户沟通区，画师后台文件）明确列入授权范围——画师后台通常归三号，但派工点名授权就可改。判断依据是派工文件的"授权文件范围"清单，不是默认职责边界。

## patch 操作类

### 删 CSS 块时防重复行（v0.29 连踩 3 次）

patch 删除一段代码时，若 old_string 的边界行同时出现在 new_string 上下文，会产生重复行（Gallery hover 规则、TrackOrder container、OrderForm 注释各一次）。

**规则**：new_string 只保留前后各一行不重复的上下文；patch 完立刻读返回的 diff 确认无重复行，发现重复立即修掉，不带着重复行 commit。

## 环境类

### worktree node_modules 可能中途被清 + approve-scripts

同一会话内 worktree 的 node_modules 也可能被清掉（上轮装好、下轮 ESLint 又报 `Cannot find package '@eslint/js'` / `vite is not recognized`）。

**规则**：每波验证链之前先跑验证命令试探，缺依赖就 `npm install` + `npm approve-scripts esbuild; npm approve-scripts vue-demi`（postinstall 被 allow-scripts 拦截，不批准 vite 起不来）。approve-scripts 会改 package.json——**不 commit 该改动**，git add 显式列文件名，永远不用 `git add -A`。

## Vue/EP 技术类

### 插元素别打断 v-if/v-else-if 链

ArtistHome.vue 的 hidden/模板/空态是 `v-if → v-else-if → v-else-if` 链。在链中间插新元素（统一浮窗）会让后面的 `v-else-if` 找不到前驱——编译不报错但空态永远不渲染。**新元素放链外，用独立 v-if；插完读一遍模板确认链完整。**

### el-image 预览遮罩点击需显式属性

EP 2.9 `el-image` preview：ESC 关闭默认可用，但点击遮罩关闭需显式 `hide-on-click-modal`（默认 false）。用户报"点外面关不掉"不是 bug 是缺属性。客户端所有带 `preview-src-list` 的 el-image 统一加上。

### 瀑布流零跳动：aspect-ratio 占位容器 + 骨架兜底（#15/#50）

后端 width/height 就绪时精确预留、缺失时骨架兜底，后端未合入也能先上：

```html
<div class="img-wrap" :style="ratioStyle(art)">
  <el-image fit="cover" lazy ...>
    <template #placeholder><div class="skeleton" /></template>
  </el-image>
</div>
```
```js
function ratioStyle(art) {
  return art.width && art.height ? { aspectRatio: `${art.width} / ${art.height}` } : {}
}
```
```css
.img-wrap { width: 100%; }
.img-wrap .el-image { display: block; height: 100%; }
.img-wrap :deep(.el-image__placeholder) { height: 100%; } /* 有 ratio 时骨架撑满精确高度 */
.skeleton { width: 100%; height: 100%; min-height: 200px; /* 无 ratio 时兜底 */ }
```
要点：wrap **不加** overflow:hidden（会裁掉 editorial 布局的 hover scale）；字段缺失返回空对象，天然向后兼容。

### 父级浮窗 + 多模板状态同步：provide/inject + watch（#55/61）

4 模板共用浮窗组件且需要模板内部状态（吸底 CTA 可见性）时：
- 父组件 `provide('ctaRaised', ref(false))` + 挂载浮窗 `:raised="ctaRaised"`
- 有 CTA 的模板 `inject` 后 `watch(ctaVisible, v => { ctaRaised.value = v }, { immediate: true })`
- 无 CTA 的模板不 inject，浮窗默认不抬升

模板切换时旧 watch 随组件销毁自动失效。客户端统一浮窗**可以带样式**（客户端只有一套皮肤；"共享组件不带样式"原则只约束 4 模板差异化的 Tpl* 组件）。

### 数据适配层一处改动全局生效的模式（REQ-017）

去重/Hero 显式化全部收在 `useArtistData.js`：
- `galleryArtworks = filter(!is_cover)`，**兜底：过滤后为空则返回完整列表**（用户拍板：唯一作品设了封面时主页不能空）
- `heroArtwork = coverArtworks[0] || artworks[0] || null`（显式优先封面）
- `coverArtworks` 按 `cover_order` 排序，字段缺失 fallback 0 保持后端原序
- 4 模板只改解构 + TplGallery 传参，逻辑零改动

后端字段未就绪时一律 `|| 0` / `|| status` 式 fallback，对着契约先做，合入后自动生效。

## 验证类

### 纯逻辑断言脚本补强验证

ESLint + build 只证明能编译。对 computed 核心逻辑（去重/排序/兜底/ratioStyle），写临时 node 脚本复刻逻辑做断言（放 %TEMP%，跑完删除），覆盖正常路径 + 兜底路径 + 空列表 + 字段缺失。comms 里注明"ad-hoc 验证，非项目测试套件"，并列出未覆盖项（需后端就绪后容器内验证的部分）。
