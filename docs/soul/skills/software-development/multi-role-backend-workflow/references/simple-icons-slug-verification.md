# simple-icons slug 核验（外链平台种子 / icon_key 清单类任务）

## 场景

REQ-022 F2-1 要求 `social_platforms.icon_key` 采用 simple-icons slug 命名，下游（二号 F2-4 图标打包）按此清单执行。**派工给的示例清单（weibo/lofter/douyin…）与上游实际 slug 不符**——icon_key 是对外承诺，必须先对上游权威数据逐一核验，不可照抄派工示例。这是「不盲信指令中的技术判断」纪律在数据层的实例。

## 权威核验方法（2026-08-05 实测）

1. **不要猜 raw.githubusercontent.com 路径**：simple-icons 仓库布局变过——`_data/simple-icons.json` 已 404，现在是 `data/simple-icons.json`。HEAD 请求对 raw.githubusercontent 可能 404 而 GET 正常，直接用 GET。
2. **最权威来源 = git trees API 枚举真实文件**（不依赖任何派生算法）：

   ```powershell
   curl.exe -sS --max-time 120 "https://api.github.com/repos/simple-icons/simple-icons/git/trees/master?recursive=1" -o "$env:TEMP\si-tree.json"
   ```

   `icons/*.svg` 的文件名（去 `.svg` 后缀）就是全部合法 slug（master 分支实测 3453 个）。用 Python 解析：

   ```python
   import json, os
   d = json.load(open(os.path.join(os.environ['TEMP'], 'si-tree.json'), encoding='utf-8'))
   slugs = {t['path'][len('icons/'):-4] for t in d['tree']
            if t['path'].startswith('icons/') and t['path'].endswith('.svg')}
   ```

3. **不要用 data/simple-icons.json 找 slug**：条目没有 `slug` 字段（只有 `title`，slug 需按官方 titleToSlug 算法派生，易写错）；且文件 458KB，超出 PowerShell `ConvertFrom-Json` 处理能力（报假语法错误「传入的对象无效」）。必须用 Python `json.load`。
4. **用 master 分支**（npm 发布版）核验，不用 develop——develop 条目略少且会继续移除图标（weibo 在 develop 已消失，master 还在、名为 Sina Weibo）。前端打包装的是 stable 版。

## 已核验结论（2026-08-05，master 分支）

- **微博 = `sinaweibo`**（不是 weibo！title 是 "Sina Weibo"）
- 有图标（20 个）：sinaweibo / bilibili / xiaohongshu / pixiv / x / kuaishou / douban / qq / youtube / instagram / twitch / artstation / tiktok / deviantart / zcool / afdian / weasyl / threads / tumblr / behance / neteasecloudmusic
- **无图标，必须 fallback_char 单字兜底**：LOFTER(「L」)、抖音(「抖」)、米画师(「米」)、QQ空间(「空」)；另有 huaban、twitter（已被 x 取代，aka 指向 X）
- 设计规则：icon_key 与 fallback_char 至少一项非空；两者都空拒绝（错误码 PLATFORM_ICON_REQUIRED）
- v42 迁移种子共 24 平台；最终 icon_key 清单必须写入交付报告，供下游打包任务执行

## 关联工具陷阱（同会话实测）

- PowerShell 三元表达式放进 `-f` 格式参数表会解析失败：`"{0}" -f $s, ($cond ? $a : $b)` → Unexpected token '?'。改 if/else。
- 复杂 `python -c` 单行（嵌套引号/列表推导）在 PowerShell 下极易被引号层吃掉——连续失败 2 次就 `write_file` 写 `.py` 再跑，不要硬试第 3 次。
- PowerShell 处理大 JSON 一律让位 Python：`ConvertFrom-Json` 对 458KB 合法 JSON 报假错。
