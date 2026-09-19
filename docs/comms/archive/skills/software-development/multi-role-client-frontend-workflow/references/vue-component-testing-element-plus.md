# Element Plus 组件测试配方（@vue/test-utils + happy-dom + vitest）

来源：ManualOrder.stylemode.test.js（v0.38 D 路 + REQ-029 补漏批，13 用例全绿，踩坑 4 个）。

## 挂载

- **ElementPlus 必须 default import**：`import ElementPlus from 'element-plus'`。命名导出 `ElementPlus` 不存在 → `plugins: [undefined]` → 所有 el-* 组件 Failed to resolve component（刷屏且全部交互失效）。
- mount 配置：`global: { plugins: [ElementPlus], mocks: { $t: (k, p) => p ? \`${k}:${JSON.stringify(p)}\` : k }, stubs: {...} }`
  - 模板里 `$t` 走 global.mocks；script setup 里 `t` 走 vi.mock('vue-i18n')。
- **stub 重型组件**（渲染即可，不需要交互）：`el-date-picker` / `el-upload` / `el-dialog`（stub 模板用 modelValue 时必须声明 `props: ['modelValue']` 否则渲染警告）/ `el-tooltip` / `el-icon` / `el-empty`。
- **保留真实**：el-form / el-input / el-input-number / el-switch / el-radio-group / el-radio-button / el-button（交互测试要用）。

## 控件交互（关键区分：v-model vs model-value+change）

- **v-model 控件**（`v-model="x"`）→ `vm.$emit('update:modelValue', val)`：
  - 旧档位增项 el-input-number、图片开关 el-switch、最终价格 el-input-number
- **`:model-value` + `@change` 控件**（受控写法）→ `vm.$emit('change', val)`：
  - 画风增项 switch/quantity/radio（setStyleAddon 模式）、el-radio-group
- emit 后：`await flushPromises()`；防抖算价：`vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(300)`（beforeEach/afterEach 配对 useRealTimers）。

## findAllComponents 区块定位陷阱（必踩）

页面有多处同类 EP 组件时 `findAllComponents(X).at(0)` 必错：
- 图片开关是模板**第一个** ElSwitch → 要操作画风增项 switch 必须先 `wrapper.find('.style-addon-item').findComponent(ElSwitch)`。
- 优先级 / 初始节点状态 / 画风 radio 是 3 个 ElRadioGroup → at(0) 点到优先级组（emit 无监听者，静默失败）→ 用 `.find(i => i.findComponent(ElRadioGroup).exists())` 或区块内 findComponent。
- **新增控件若成为页面上第一个同类 EP 组件，会破坏既有 at(0) 用例**（R6 开关加完后旧 switch 用例全挂）→ 改完模板后全量跑测试，别只跑新增用例。

## 其他

- localStorage：happy-dom 可用；beforeEach `localStorage.clear()`；记忆行为 = unmount → 重新 mount → 断言读取值。
- vi.mock 工厂里需要 ref：`vi.mock('...', async () => { const { ref } = await import('vue'); return { ... } })`——返回普通对象 `{ value: null }` 会被 watch 报 Invalid watch source。
- api mock 用 vi.hoisted 容器（`h.state`），setupState 每用例重置；提交参数断言读 h.created / h.extraItems / h.updatedPrice。
- 页面有其他 el-input-number（最终价格）时，增项数量定位要按区块：`editor.findComponent(ElInputNumber)`。
