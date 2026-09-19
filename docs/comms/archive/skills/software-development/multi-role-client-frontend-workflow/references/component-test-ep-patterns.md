# Element Plus 组件级测试配方（vitest + @vue/test-utils + happy-dom）

用于 mount 完整组件（script setup + el-* 模板）做交互/提交参数断言的测试。踩坑于 ManualOrder.stylemode.test.js（v0.38 D 路）实战。

## 挂载骨架

```js
import ElementPlus from 'element-plus'   // ← 必须 default import！命名导出 ElementPlus 不存在
mount(Comp, {
  global: {
    plugins: [ElementPlus],              // 不装插件 → el-* 全渲染成未知元素，findComponent 全空
    mocks: { $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) },
    stubs: {
      // 重型/弹层组件占位，避免 happy-dom 渲染炸
      'el-date-picker': { template: '<div />' },
      'el-upload': { template: '<div />' },
      'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },  // 缺 props 声明 → Vue warn modelValue undefined
      'el-tooltip': { template: '<span><slot /></span>' },
      'el-icon': { template: '<span><slot /></span>' },
      'el-empty': { template: '<div />' }
    }
  }
})
```

- happy-dom 无 ResizeObserver：测试顶部补 polyfill（class { observe(){} unobserve(){} disconnect(){} }）
- Element Plus 全局注册（plugins: [ElementPlus]）后模板中的 el-* 才能被 findAllComponents 匹配

## vi.mock 三坑

1. **mock composable 必须返回真 ref**：`usePasteUpload: () => ({ pasteError: { value: null } })` 会触发 `Invalid watch source` 崩溃。正确：
   ```js
   vi.mock('.../usePasteUpload.js', async () => {
     const { ref } = await import('vue')
     return { usePasteUpload: () => ({ pasteError: ref(null) }) }
   })
   ```
2. **api mock 用 vi.hoisted 容器**：`const h = vi.hoisted(() => ({ created: null, ... }))`，mock 函数写 `h.created = data`，每个用例 setupState 重置——断言提交参数不用 spyOn 也能精确比对。
3. **子组件（ArtistLayout 等）stub 成 `<div><slot /></div>`**，避免外层布局干扰选择器。

## 控件交互：emit 事件选择（先看模板绑定再决定）

| 模板绑定 | 测试 emit | 说明 |
|---|---|---|
| `v-model="x"`（旧增项 el-input-number） | `vm.$emit('update:modelValue', 2)` | v-model 展开为 update:modelValue |
| `:model-value` + `@change`（画风增项 switch/quantity/radio） | `vm.$emit('change', true/2/'室内')` | 直接触发父级 @change |
| div @click 卡片 | `wrapper.find(...).trigger('click')` | 纯 DOM 事件 |

## findAllComponents 多实例定位陷阱（本会话最大坑）

同一页面常有多个同名 EP 组件实例，`at(0)` 必错。实测 ManualOrder 有 **3 个 el-radio-group**（优先级 + 初始节点状态 + 画风增项 radio）——`at(0)` 点到优先级组，emit 石沉大海。

正确定位：**按区块 DOM 缩小范围**，如画风增项内找 radio：
```js
const radioItem = wrapper.findAll('.style-addon-item').find(i => i.findComponent(ElRadioGroup).exists())
const radioGroup = radioItem.findComponent(ElRadioGroup)
```
同理 el-input-number 会命中价格输入框（模板顺序靠后时 at(0) 恰好是增项，顺序一变就错）——优先用区块 find。

## 防抖等待

组件内 scheduleCalc/scheduleStyleCalc 都是 300ms setTimeout：
```js
vi.useFakeTimers()                    // beforeEach
await vi.advanceTimersByTimeAsync(300) // 会同时 flush 微任务
vi.useRealTimers()                    // afterEach
```

## 验证基线

ManualOrder.stylemode.test.js 模式：6 用例覆盖多画风提交透传（tierId null + styleSizeId + styleAddons + addons []）、单画风退化、旧模式回归（tierId/addons）、未选拦截、切画风重置、radio optionLabel。测试放 `web/src/views/<域>/__tests__/<Comp>.<场景>.test.js`。
