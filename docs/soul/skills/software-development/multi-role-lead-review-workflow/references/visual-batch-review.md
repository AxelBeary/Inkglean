# 视觉/主题重设计批的审核形态（v0.38 第一批实录，2026-08-05）

触发：审核「换肤/主题/token 体系」类前端批（画师后台视觉重设计第一批 35 文件 +1492/-646 的完整审法）。
代码 diff 只能证明结构正确，**视觉决策（用户拍板的 7 色语义、字体分工、克制度）必须逐张截图 vision 核验**——读代码审不出视觉。

## 审核清单（按序）

1. **黑名单零触碰**（一条命令定生死）：
   `git diff --stat master...<branch> -- <黑名单路径们>` 输出必须为空。v0.38 黑名单：theme.css/templates.css/palettes.css、views/client/、views/admin/（第二批前）、server/、components/templates/、ThemePicker.vue。
2. **token 文件逐行读**：确认无 `:root` 声明、全部挂在作用域条件属性（如 `html[data-artist-theme]`）；确认不覆写既有变量**值**（新文件里允许出现旧变量名——那是作用域内的兼容映射，见第 6 条）。
3. **作用域挂/卸生命周期**：谁 setAttribute、谁 removeAttribute、挂在哪两个生命周期钩子（ArtistLayout onMounted/onUnmounted）；watch 守卫——作用域外主题切换不得残留属性。
4. **关键 UI 决策逐条对照**（用户拍板项，R30a 教训）：如「日期保存逻辑一行不动只换模板位置」——diff 里 grep 该函数名确认逻辑段零改动、只有模板位移；「7 色语义一对一」——chip computed 的 type 映射逐分支读。
5. **截图逐张 vision_analyze**（不是看报告声称的张数）：每张给具体问题（「chip 文字是什么颜色？」「逾期提示外其余界面是否克制？」）。必查集：日期卡/核心新组件特写、逾期警示页（朱砂克制度）、双主题同页对照、**客户端页面（证明零影响：风格必须完全不是新体系）**、移动端窄宽度。vision 返回的细节（如数据自洽「截稿 08-02 今天 08-05 = 逾期 3 天」）是强证据。
6. **兼容映射层溢出效应**（v0.38 实录发现的账）：为未换肤页面兜底的「旧变量→新 token 映射」会波及**不在本批改动清单里的组件**——如 RevenueChart 用 `var(--color-primary)`，映射后变成花青，墨黑下统计数字变浅蓝，违反「统计数字墨色不上色」铁律。审核时抽查高频旧变量（--color-primary/--text-primary）在授权清单外组件的引用点。处置：非阻塞记跟进项，写进下一批派工（merge message + 派工任务都记）。
7. **功能迁移检查**（组件重写陷阱）：某组件被整体重写时（如 ThemeToggle 从「主题+语言」重写为纯主题切换），grep 确认被删的功能在别处复活了（本例语言切换挪到 ArtistLayout 顶栏）——重写 diff 里消失的功能不会自己报警。
8. **locales**：死键清理 grep 归零 + 新键中英成对。
9. **门禁复跑**：worktree 合并态 test + lint + build；再回主仓 merge 后复跑一遍（主仓跑前先 npm install，见 SKILL.md §18）。
10. **交付报告声称的测试数据清理**：临时脚本/测试库声明已删的，`git status --short` 确认 worktree 无 `??` 残留（临时文件未跟踪不碍事，但交付时必须干净）。

## 视觉批合并的 merge message 要素

审核轨迹写全：黑名单零触碰 + 作用域机制验证 + 截图 vision 核验范围 + 门禁数字 + **跟进项**（如「RevenueChart 数字上色偏差铁律，第二批修」）——跟进项写进 message 才不会丢。

## ⚠️ 截图疑似造假/标错时：先独立复现再定性，别凭 vision 一张图打回

v0.38 第二批实录：二号交付的 16/17 号截图命名为 `*-ink`（声称管理后台墨黑主题），vision 逐张核实**判定为浅色主题**——与报告"管理后台墨黑生效"声称矛盾。两种可能：① 功能真坏了（阻塞项，打回）；② 截图拍错/标错（非阻塞，代码没问题）。**vision 只能证明"这张图是浅色"，证明不了"功能没生效"。**

处置序列（实跑验证）：
1. 不急着打回。自己起隔离实例复现：临时库 + TOTP 注入 + 起 worktree 隔离服务器（换端口如 3100）+ playwright 管理员登录。
2. **直接注入主题持久化值再 reload**（`localStorage.setItem('huiyue-artist-theme','ink')` → goto → reload），等价"用户切过墨黑后刷新"。
3. 断言三件套：`data-artist-theme` 属性值 / `getComputedStyle(document.body).backgroundColor` / 目标容器背景色——拿到墨色 rgb 值（如 `rgb(23,22,17)`）即功能生效实锤。
4. page.screenshot 自拍一张再 vision 确认深色。
5. 结论写入 merge message：「管理后台墨黑存疑已亲测澄清=data-artist-theme=ink 生效，交付截图 16/17 标错为浅色拍」——既不放水也不冤枉人。

教训：截图是证据但可能是"拍错的证据"。功能生效与否以**运行时 DOM/computed style 断言**为准，截图只作辅助。打回前先独立复现一次，一次复现成本远低于一次错打回的返工成本。
