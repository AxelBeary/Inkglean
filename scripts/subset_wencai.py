#!/usr/bin/env python3
"""
霞鹜文楷子集拆分脚本（PERF-1）
将单文件 lxgw-wenkai.woff2 (3.3MB) 按 unicode-range 拆分为 5 个 woff2 子集。
用法: python scripts/subset_wencai.py
输出: web/src/assets/fonts/wencai/lxgw-wenkai-{00..04}.woff2 + font.css
"""
import subprocess, sys, os, math

FONT_DIR = os.path.join(os.path.dirname(__file__), '..', 'web', 'src', 'assets', 'fonts', 'wencai')
FONT_SRC = os.path.join(FONT_DIR, 'lxgw-wenkai.woff2')
UNICODES_FILE = os.path.join(FONT_DIR, '_unicodes.txt')
NUM_CHUNKS = 6

def parse_unicodes(path):
    """读取 _unicodes.txt，返回排序后的码点列表"""
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read().strip()
    # 格式: U+XXXX,U+YYYY,...
    codepoints = []
    for token in text.replace('\n', ',').split(','):
        token = token.strip()
        if token.startswith('U+'):
            codepoints.append(int(token[2:], 16))
    return sorted(set(codepoints))

def to_css_ranges(codepoints):
    """将码点列表压缩为 CSS unicode-range 格式"""
    if not codepoints:
        return ''
    ranges = []
    start = prev = codepoints[0]
    for cp in codepoints[1:]:
        if cp == prev + 1:
            prev = cp
        else:
            ranges.append((start, prev))
            start = prev = cp
    ranges.append((start, prev))

    parts = []
    for s, e in ranges:
        if s == e:
            parts.append(f'U+{s:04X}')
        else:
            parts.append(f'U+{s:04X}-{e:04X}')
    return ', '.join(parts)

def main():
    codepoints = parse_unicodes(UNICODES_FILE)
    print(f'总码点数: {len(codepoints)}')

    chunk_size = math.ceil(len(codepoints) / NUM_CHUNKS)
    chunks = []
    for i in range(NUM_CHUNKS):
        chunk = codepoints[i * chunk_size : (i + 1) * chunk_size]
        if chunk:
            chunks.append(chunk)

    print(f'拆分为 {len(chunks)} 个子集')

    css_blocks = []
    total_size = 0

    for i, chunk in enumerate(chunks):
        out_name = f'lxgw-wenkai-{i:02d}.woff2'
        out_path = os.path.join(FONT_DIR, out_name)

        # 构建 unicodes 参数（逗号分隔的 U+XXXX）
        unicodes_arg = ','.join(f'U+{cp:04X}' for cp in chunk)

        cmd = [
            sys.executable, '-m', 'fontTools.subset',
            FONT_SRC,
            f'--unicodes={unicodes_arg}',
            f'--output-file={out_path}',
            '--flavor=woff2',
            '--no-hinting',
            '--desubroutinize',
            '--layout-features=',  # 去掉 OpenType 布局表（Web 场景不需要）
        ]
        print(f'  [{i:02d}] {len(chunk)} 码点 → {out_name} ...')
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f'  ❌ 失败: {result.stderr}')
            sys.exit(1)

        size = os.path.getsize(out_path)
        total_size += size
        print(f'       {size / 1024:.1f} KB')

        css_ranges = to_css_ranges(chunk)
        css_blocks.append(f"""@font-face {{
  font-family: 'LXGW WenKai';
  src: url('./{out_name}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: {css_ranges};
}}""")

    # 写 font.css
    css_header = f'/* 霞鹜文楷 — 子集化分包 ({len(codepoints)} 字符, unicode-range 按需加载) */\n/* 由 subset_wencai.py 自动生成，勿手动编辑 */\n\n'
    css_path = os.path.join(FONT_DIR, 'font.css')
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css_header + '\n\n'.join(css_blocks) + '\n')

    print(f'\n✅ 完成: {len(chunks)} 个子集, 总大小 {total_size / 1024:.1f} KB ({total_size / 1024 / 1024:.2f} MB)')
    print(f'   font.css 已更新: {css_path}')

    if total_size > 1.5 * 1024 * 1024:
        print(f'⚠️  总大小超过 1.5MB 目标，考虑增加分片数')
    else:
        print(f'   ✓ 低于 1.5MB 目标')

if __name__ == '__main__':
    main()
