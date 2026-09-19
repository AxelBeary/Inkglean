# 派工可见性汇报 + 子代理验活

> 模式注记（2026-08-05 起）：执行角色已改为**用户侧外部窗口**（一号不再 delegate_task）。本文件 §二 的子代理验活只适用于旧模式残留场景；外部窗口角色的验活 = 查 worktree（`git log`/`git status` 看有无 commit 与交付），用户报「X号没在工作」的三分判定见 `dispatch-delivery-discipline.md` §补遗 5。§一「派工后立即给全景表」规则对用户侧模式仍然适用（派工后同一轮给触发语 + 全景表）。

## 一、派工后必须立即给用户全景表（2026-08-05 事故）

**背景**：一号用 delegate_task 拉起的子代理**对用户完全不可见**（用户在左侧角色会话窗口，看不见右侧一号的子代理）。v0.38 轮一号已派二号、三号两路，但派工后只说了句"二号已开工"就继续干活，用户下一条消息直接发火："你现在一个工都没有派出去。所有人都在待命，派工。"

**规则**：
1. 每次 delegate_task 之后，**同一轮回复里**就给用户派工全景表，不等用户问：

   | 角色 | 任务 | 状态 | 证据 |
   |------|------|------|------|
   | 二号 | xxx | 🔵 运行中 | 日志时间戳/worktree 分支 |
   | ... | | | |

2. 有槽位限制（默认并发 3，查 config.yaml delegation 段，无该段=默认 3）时，表里要写明"四号备工已落盘待槽位"——让用户知道活已经排了，不是忘了。
3. 用户质疑"没派工"时，**先验活再回话**（见下节），带着证据回：日志时间戳、worktree 新文件、分支 commit。不要空口说"在跑"。

## 二、子代理验活（会话中断/用户质疑时用）

子代理是后台进程，会话被中断（/new、进程退出）会连子代理一起杀掉。跨会话或长时间后，**不要假设上轮派的还在跑**。

验活命令（PowerShell）——核心是**两次间隔采样对比 mtime+size**，单次快照不能区分"活着但在长思考"和"死了"：

```powershell
$base="D:\Hermes Agent CN Desktop\data\hermes-home\cache\delegation\live"
$f = "$base\deleg_XXXX\task-0.log"
"t0: $((Get-Item $f).LastWriteTime.ToString('HH:mm:ss')) $((Get-Item $f).Length)b"
Start-Sleep 20
"t1: $((Get-Item $f).LastWriteTime.ToString('HH:mm:ss')) $((Get-Item $f).Length)b"
```

判读：
- 20~25s 内 size 增长 → 活着。
- size 不变但 mtime 是几十秒内 → 可能长思考，tail 日志尾部看最后一条 tool/result 是什么再判断（正在 read_file 大文件 = 正常）。
- mtime 停在几分钟前且 tail 显示最后动作无后续 → 死了。死了就重派（重发前把已完成部分从 transcript/git status 摸清，避免重复劳动）。

辅助证据：worktree 里 `git status --short`（有无新文件）、`git log`（有无新 commit）。delegation live 目录文件名含 delegation_id，dispatch 响应里有 live_transcripts 路径。

tail 日志看内容（注意文件是 UTF-8，PowerShell 加 -Encoding UTF8 否则中文乱码）：

```powershell
Get-Content "$base\deleg_XXXX\task-0.log" -Tail 8 -Encoding UTF8
```

## 三、派工前冲突域检查（2026-08-05 两次实例）

给空闲角色找活时，候选任务必须先过两道检查：

1. **代码现状验证**（soul 已有纪律，这里补实例）：BUG 清单/候选列表里的条目可能已完成。v0.38 轮验证发现 BUG-3（hidden 过滤）已在 style.routes L348 修掉、BUG-5 死代码源码零引用——盲信清单会派重复劳动。
2. **并行冲突域检查**：候选任务涉及的文件/页面是否有其他在跑角色正在大改。v0.38 轮 BUG-6（QueueBoard 时间条拖拽）本是五号候选，但二号正在做 v038 视觉批重绘 QueueBoard 同文件 → 撞车，改派 F4 回收站分页（admin 域，零重叠）。

原则：**同一文件不并行两路**；纯只读/纯文档任务（三号评估、四号拆解）例外，但报告文件也要落各自 comms 路径。

## 四、槽位管理

- 并发上限默认 3（config.yaml 无 delegation 段时）。派工前先数在跑的。
- 满槽时：备工文件照写照 commit（落 docs/comms/01-to-0N-...md），STATUS 标注"待槽位"，任一交付审完立即拉起下一个。
- 每路一个独立 worktree（一号统一 `git worktree add ../artist-commission-<用途> -b <分支> master`），文档类纯读任务可只在主仓分支。
