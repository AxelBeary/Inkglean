# vue-i18n 中文花括号占位符陷阱

## 问题

vue-i18n 的 message compiler 使用 ICU MessageFormat 语法，`{...}` 是占位符定界符，占位符名必须是合法 ASCII 标识符。

本项目中 speech_template 的默认值为 `'{客户名}，你的订单已{节点名}。'`——当这类字符串通过 `$t()` 或 `t()` 传入 vue-i18n 编译时，`{客户名}` 被解析为占位符，中文字符不是合法标识符，抛出：

```
SyntaxError: Invalid token in placeholder: '客户名'
```

## 触发条件

locale 文件（zh-CN.js / en.js）中的字符串包含 `{中文}` 格式，且该字符串被 `$t('key')` 调用（触发 message compiler）。

**不触发的情况**：字符串作为普通 prop（如 `:placeholder="someRef"`）直接使用，不经过 `$t()`。

## 已知触发点

| 文件 | 行 | 调用 | locale 值 |
|------|---|------|-----------|
| StageListView.vue | 72 | `:placeholder="$t('workflow.speechPlaceholder')"` | `'{客户名}，你的订单已{节点名}。'` |

## 修复方案

1. **转义花括号**（推荐）：locale 中写 `{'{'}客户名{'}'}`，vue-i18n 会输出字面 `{客户名}`
2. **不走 $t()**：如果文案中英界面都一样（如 speechPlaceholder 注释已说明"中英文界面均保持中文原文"），直接用常量而非 i18n 键
3. **用 t 的 literal 模式**：`t('key', {}, { escapeParameter: false })` 不适用于此场景，不推荐

## 变体二：合法 ASCII 占位符静默消失（不报错）

`{name}` 是合法 ASCII 标识符，vue-i18n **不报错**，但渲染时找不到 `name` 参数 → 输出空字符串。用户看到的是「用  代替画师名」——中间一坨空白，没有任何错误提示。

**比变体一更隐蔽**：不崩溃、不报错、控制台无警告，只有视觉上一个空格。

### 已知触发点

| 文件 | 行 | locale 值 | 现象 |
|------|---|-----------|------|
| locales/zh-CN.js | 616 | `'输入问候语，用 {name} 代替画师名'` | placeholder 中 `{name}` 消失，显示「用  代替画师名」 |

### 修复

同变体一：转义 `{'{'}name{'}'}` 或改用不走 `$t()` 的常量。

## 预防

新增 locale 键时，如果值包含 `{...}` 且花括号内不是合法 ASCII 变量名（如 `{count}`），必须转义或改用常量。**即使是合法变量名（如 `{name}`），如果调用时不传参数也会静默消失。** 审核前端 diff 时搜 locale 文件新增行中的 `\{[a-zA-Z]` 模式，确认调用处是否传了对应参数。
