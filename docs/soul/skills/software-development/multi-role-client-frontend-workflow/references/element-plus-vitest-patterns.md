# Element Plus 组件测试配方（vitest + @vue/test-utils + happy-dom）

来源：ManualOrder.stylemode.test.js（v0.38 D路，6 用例一次通过率从 0 到 100 的踩坑总结）。适用于挂载含 EP 组件的 .vue 页面做交互/提交参数断言。

## 挂载四要素（缺一必炸）

1. **ElementPlus 必须 default import**：`import ElementPlus from 'element-plus'`（默认导出才是安装函数）。命名导出 `ElementPlus` 不存在 → `plugins: [undefined]` → 插件未安装 → 全部 el-* 无法解析（Vue warn "Failed to resolve component: el-input"）+ watch 等连锁异常。症状看似组件问题，根因是插件。
2. **vi.mock 工厂里要 ref**：mock composable 返回 `{ pasteError: { value: null } }` 是普通对象不是 ref，`watch(pasteError)` 报 "Invalid watch source"。必须：
   ```js
   vi.mock('../../composables/usePasteUpload.js', async () => {
     const { ref } = await import('vue')
     return { usePasteUpload: () => ({ pasteError: ref(null) }) }
   })
   ```
3. **ResizeObserver polyfill**（happy-dom 缺失，EP 内部用到）：
   ```js
   if (!window.ResizeObserver) { window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} } }
   ```
4. **重型组件 stub**（date-picker/upload/dialog 渲染重或依赖 popper）：dialog stub 必须 `{ props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' }`，否则模板访问 modelValue 报警告；date-picker/upload/tooltip/icon/empty 直接占位模板。

## 触发组件交互：emit 事件按绑定方式选

| 模板绑定 | 测试触发 |
|---|---|
| `v-model="x"`（展开为 :model-value + @update:model-value） | `vm.$emit('update:modelValue', v)` |
| `:model-value` + `@change="handler"` | `vm.$emit('change', v)` |

同一页面常混用两种（旧档位增项 v-model、画风增项 :model-value+@change）——先读模板再选事件，emit 错事件静默不生效（断言直接空数组）。

## findAllComponents 区块定位（最大陷阱）

页面多个同类 EP 组件时 `findAllComponents(X).at(0)` 会命中**错误组件**且静默：

- **el-radio-group 三连坑**：ManualOrder 有 优先级 / 初始节点状态 / 画风增项 radio 三个 group，`at(0)` 是优先级组，emit 到它父组件无监听 → 断言失败。必须按区块定位：
  ```js
  const radioItem = wrapper.findAll('.style-addon-item').find(i => i.findComponent(ElRadioGroup).exists())
  const radioGroup = radioItem.findComponent(ElRadioGroup)
  ```
- **el-input-number 同型**：价格面板 finalPrice 输入框也是 ElInputNumber，DOM 顺序决定 at(0) 命中谁。先数清页面同类组件再定位，或按 DOM 祖先限定范围。
- 安全模式：`wrapper.find('.区块容器').findComponent(Comp)` 或 `findAll(区块).find(i => i.findComponent(Comp).exists())`。

## 防抖与异步

- 300ms 防抖：`vi.useFakeTimers()`（beforeEach）+ `await vi.advanceTimersByTimeAsync(300)`（Async 版会连带 flush 微任务）；afterEach `vi.useRealTimers()`。mount 前启用安全（组件 mount 阶段无 setTimeout 启动）。
- mount 后 `await flushPromises()` 等 onMounted 的 API promise 链。
- 页面 locale 断言用 key 文本（mock `$t: (k, p) => p ? k : k`），placeholder 定位输入框：`input[placeholder="manualOrder.clientQqPlaceholder"]`。

## 参考实现

`web/src/views/artist/__tests__/ManualOrder.stylemode.test.js`（6 用例：多画风提交透传/单画风退化/旧档位回归/未选尺寸拦截/切画风重置/radio optionLabel）——含 vi.hoisted 状态容器、区块点击辅助函数 `clickCardInSection(wrapper, titleKey, n)`。
