# CJK 字体子集拆分（PERF-1 模式）

当项目使用大型 CJK 字体（如霞鹜文楷 3.3MB）导致首屏字体跳变时，用 fonttools 按 unicode-range 拆分为多个 woff2 子集。

## 前置条件

```powershell
pip install fonttools brotli
```

## 核心脚本模式

```python
import subprocess, sys, os, math

FONT_SRC = 'path/to/font.woff2'
UNICODES_FILE = 'path/to/_unicodes.txt'  # U+XXXX,U+YYYY,... 格式
NUM_CHUNKS = 6  # CJK 7000 字 → 6 片，每片 ~280KB

codepoints = sorted(set(int(t.strip()[2:], 16) for t in open(UNICODES_FILE).read().replace('\n', ',').split(',') if t.strip().startswith('U+')))
chunk_size = math.ceil(len(codepoints) / NUM_CHUNKS)

for i in range(NUM_CHUNKS):
    chunk = codepoints[i * chunk_size : (i + 1) * chunk_size]
    unicodes_arg = ','.join(f'U+{cp:04X}' for cp in chunk)
    subprocess.run([
        sys.executable, '-m', 'fontTools.subset', FONT_SRC,
        f'--unicodes={unicodes_arg}',
        f'--output-file=out-{i:02d}.woff2',
        '--flavor=woff2',
        '--no-hinting',
        '--desubroutinize',
        '--layout-features=',  # 空 = 去掉 OpenType 布局表（Web 不需要，省 ~5%）
    ], check=True)
```

## CSS 生成

每个子集一个 `@font-face`，关键是 `unicode-range`（浏览器按需加载）：

```css
@font-face {
  font-family: 'LXGW WenKai';
  src: url('./lxgw-wenkai-00.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0020-007E, U+3000-303F, U+4E00-4E01, ...;
}
```

码点压缩为范围：连续码点合并为 `U+START-END`，孤立码点写 `U+XXXX`。

## 关键认知

1. **首屏收益是核心**：总量从 3.3MB → 1.6MB（-51%）可能达不到 1.5MB 目标，但首屏从 3.3MB → ~215KB（-93%）才是真正修复。CJK 字形数据本身不可压缩。
2. **Vite 构建加 content hash**：字体文件变成 `lxgw-wenkai-00-BmZ3xVWo.woff2`，静态 `<link rel="preload">` 无法预知路径。子集拆分 + unicode-range 已足够，不需要 preload。
3. **`--layout-features=`（空字符串）**：去掉 GSUB/GPOS 等 OpenType 布局表。霞鹜文楷的连字/替换特性在 Web 场景不需要，每片省 ~5-15KB。
4. **旧单文件必须删除**：否则 git 仓库膨胀（3.3MB 二进制）。确认 font.css 不再引用后 `Remove-Item`。
5. **脚本放 `scripts/` 目录**：可重复执行（字体更新时重跑），提交进 git。

## 验证

```powershell
# 构建确认子集正确输出
cd web; node node_modules/vite/bin/vite.js build 2>&1 | Select-String "woff2|built"
# 检查构建产物中字体文件
Get-ChildItem dist/assets/*.woff2 | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1024,1)}}
```
