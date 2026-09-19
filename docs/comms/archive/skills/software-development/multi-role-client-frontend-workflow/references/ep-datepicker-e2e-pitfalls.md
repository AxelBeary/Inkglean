# el-date-picker 面板自动化验证四个坑（Playwright / 组件级 vitest）

来源：2026-08-06 二号「手动录单日期批」E2E 实测（B1 今天可选 / B2 截稿↔开稿双向灰掉 / B2c 提交拦截）。调试耗时约 5 轮，全部命中以下四个坑后收敛。

## 坑 1：多个 date-picker 的 popper 同时存在于 DOM（display:none）

页面上有 2 个 el-date-picker 时，两个 popper 都会渲染在 body（未打开的 `display:none`）。
`page.locator('td.today')` 会 strict-mode violation（匹配 2 个元素）。

**修法**：所有面板内定位都限定「当前可见面板」：

```js
function openPanel(page) {
  return page.locator('.el-picker-panel:visible').first()
}
```

注意：仅用 `:visible` 不够——见坑 2。

## 坑 2：面板关闭有 transition，「:visible」会命中关闭中的旧面板

EP 面板关闭有 transition（~0.3s），关闭过程中旧面板仍 `:visible`。
上一个 picker 面板关闭动画未结束时打开下一个 → `openPanel().first()` 取到 DOM 顺序靠前的**旧面板**，
断言错位（flaky，时好时坏）。

**修法**（两条都要）：
- 点选日期后**等面板完全关闭**：`await expect(page.locator('.el-picker-panel:visible')).toHaveCount(0)`
- 打开新面板前**先清残留**：`await page.keyboard.press('Escape')` + 同上等 count 0

## 坑 3：输入框键入也受 disabled-date 约束——UI 层无法构造「冲突日期」

假设修好了双向灰掉（截稿日不可晚于开稿日），想 E2E 验证「提交拦截」：
在输入框键入 startDate=8/21、deadline=8/16 → **EP 输入解析同样应用 disabled-date**，
8/21 > 8/16 被拒绝 → form.startDate 保持 null → 提交正常走（甚至创建订单成功），断言失败。

**结论**：B2 双向灰掉修复后，UI 层面已选不出冲突日期（这正是修复目的），
「提交守卫」是防御性兜底（防数据回填/未来赋值），**E2E 无法构造该场景**。
正确验证路径：**组件级 vitest**——stub el-date-picker 使其可 emit `update:modelValue`，
直接驱动 v-model 构造冲突，断言 `ElMessage.error` 被调 + `createManualOrder` 未被调。

```js
// vitest stub（手动 stub 需带 name 才能 findAllComponents）
'el-date-picker': {
  name: 'ElDatePicker',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="date-picker-stub" />'
}
// 驱动（模板顺序：截稿日在先）
const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
await pickers[0].vm.$emit('update:modelValue', '2026-08-16')  // deadline
await pickers[1].vm.$emit('update:modelValue', '2026-08-21')  // startDate → 冲突
```

## 坑 4：`.el-form-item hasText` 定位 input 不可靠——用 combobox role

点击「截稿日」form-item 的 input 后，accessibility tree 显示 expanded 的竟是「开稿日」combobox
（`.el-form-item` + `hasText` + `locator('input')` 的定位链会错位）。

**修法**：用 accessible role 精确定位：

```js
await page.getByRole('combobox', { name: '截稿日（可选）' }).click()
// name 是 label 文本（EP 用 label 作为 combobox 的 accessible name，含「（可选）」后缀）
```

## 附带：日期选择器 B1 修法速记（disabled-date 今天被灰掉的根因）

`:disabled-date="(d) => d < new Date()"` —— 面板日期 d 是**当天 0 点**对象，
`new Date()` 带当前时分秒 → 今天 0 点 < 当前时刻 = true → **今天被灰掉**。
修法：`const today0 = new Date(); today0.setHours(0,0,0,0); const disablePast = d => d < today0`
（setup 期构造一次即可）。双向约束边界用 `new Date(form.startDate + 'T00:00:00')`（value-format 字符串）。
