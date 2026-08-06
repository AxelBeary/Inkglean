# i18n Locale 审计（空字符串 / 键缺失扫描）— 可靠做法

派工里反复出现的任务形态："自行扫描 zh-CN.js + en.js 全部空字符串值，按上下文补齐"（L5 类）、"检查两语言键集是否对齐"。

## 为什么 regex 扫描不可靠（本会话两次失败）

1. **Select-String / 手写正则**：locale 文件是 JS 模块——一行多键（`a: '一', b: '二',`）、嵌套对象、注释里含引号。匹配 `:\s*''` 的模式在 PowerShell 里还要和反引号/引号转义层打架（本会话 PowerShell 模式被转义吃掉后退化成匹配一切，输出整文件；`node -e` 内联版同样受转义干扰）。
2. **文本正则无法理解语义**：`''` 可能合法出现在注释或数组里；真正要查的是"叶子值为空/纯空白"。

## 可靠配方：Node ESM-import 真实模块 + flatten + 键差集

把脚本放在 **worktree 根目录**（相对 import 生效），跑完即删，绝不提交：

```js
// scan-i18n-deep.mjs（worktree 根目录；跑完 Remove-Item）
async function main() {
  const zh = (await import('./web/src/locales/zh-CN.js')).default
  const en = (await import('./web/src/locales/en.js')).default
  const flatten = (obj, prefix = '', out = {}) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (Array.isArray(v)) out[key] = `[array:${v.length}]`
      else if (v && typeof v === 'object') flatten(v, key, out)
      else out[key] = v
    }
    return out
  }
  const fz = flatten(zh), fe = flatten(en)
  console.log('── 空/纯空白字符串值 ──')
  for (const [name, flat] of [['zh-CN', fz], ['en', fe]])
    for (const [k, v] of Object.entries(flat))
      if (typeof v === 'string' && v.trim() === '') console.log(`${name}: ${k} = ${JSON.stringify(v)}`)
  console.log('── 键差集 ──')
  for (const k of Object.keys(fz)) if (!(k in fe)) console.log(`only-zh: ${k}`)
  for (const k of Object.keys(fe)) if (!(k in fz)) console.log(`only-en: ${k}`)
  console.log(`zh keys=${Object.keys(fz).length} en keys=${Object.keys(fe).length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
```

```powershell
node scan-i18n-deep.mjs; Remove-Item scan-i18n-deep.mjs
```

## 要点

- **import 真实模块**而非读文本：能捕获运行时实际导出的结构，顺带验证文件语法合法（import 失败=文件本身坏了）。
- **"零空值 + 键集对齐"是合法审计结论**：本会话 v0.36 波1 L5 扫出 1310 键双方对齐、零空字符串——无需修改。交付报告里必须写清扫描方法（脚本+口径），否则一号无法区分"查过没有"和"没查"。
- 新增/删除 i18n 键后**重跑一次**该脚本，确认键集仍对齐（本流程中删 tlZoom2m/tlDragSaved、加 6 个新键后应再验一遍——放入同一轮自动化门禁）。
- locale 文件里中文注释 + 多键一行的格式意味着：任何批量替换都要用精确上下文锚定（patch 工具带足上下文行），禁止整段重写。

## 删键时的 patch 陷阱（2026-08-06 视觉批实证）

用 patch 删一行键时两个真实翻车：

1. **误删行尾换行导致格式破坏**：old_string 只含键行本身不带尾部换行，替换后 `},` 被挤到上一行尾部（`...loadFailed: '加载画师列表失败',  },`）。patch 工具返回的 diff 一眼可见，**每次 patch 后必读 diff 检查相邻行**；补救用二次 patch 恢复换行。
2. **凭记忆拼 old_string 误加不存在的键**：以为 en.js 的 landing 块和 zh 一样有 `weibo/bilibili` 键，old_string 里写了它们——patch 竟然"成功"（fuzzy 匹配容忍），实际是把两个键**加进**了 en.js。靠 `search_files` 对比 zh/en 引用才发现。**教训：改 locale 前先 search_files 确认目标键在双语言里的真实存在与写法，绝不凭 zh 的记忆改 en**；patch 后跑一次键差集脚本（见上）验证双语言键集对齐。

## worktree 新装依赖的 approve-scripts 坑

新 worktree `npm install` 后 vite 可能起不来（`'vite' is not recognized`）：npm allow-scripts 机制会拦截 esbuild/vue-demi 的 postinstall。修法：`npm approve-scripts esbuild vue-demi` 再起 dev。dev server 起来了但页面空白时先看 `document.body.innerText` 是否渲染、再查 console。
