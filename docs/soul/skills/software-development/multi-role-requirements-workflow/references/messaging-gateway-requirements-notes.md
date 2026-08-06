# 消息网关 / QQ Bot 需求深聊笔记（2026-08-05）

artist-commission（绘约）REQ-消息网关深聊的浓缩结论。方法通用，组件状态有时效——引用前先复查。

## 开源组件选型实时核实法（GitHub API）

推荐任何开源接入方案前必查，`archived=false` ≠ 活跃：

```powershell
$repos = @('NapNeko/NapCatQQ','LagrangeDev/Lagrange.Core','Mrs4s/go-cqhttp')
foreach ($r in $repos) {
  $d = Invoke-RestMethod -Uri "https://api.github.com/repos/$r" -Headers @{'User-Agent'='hermes'}
  "{0} | archived={1} | pushed_at={2} | stars={3}" -f $d.full_name, $d.archived, $d.pushed_at, $d.stargazers_count
}
```

## 2026-08 快照（引用前复查 pushed_at）

| 组件 | 判断 |
|------|------|
| NapCatQQ (NapNeko) | ✅ 主选。活跃，Docker 一键，对外标准 OneBot 11 |
| Lagrange.Core | 🟡 备胎。纯协议实现更轻，社区小一档 |
| go-cqhttp (Mrs4s) | ❌ 名义未归档实质停摆，协议旧，新号登录极易失败 |
| LLOneBot | ❌ 需依附桌面 QQ 客户端，不适合无头服务 |
| NoneBot2 | ⏸ 交互式指令机器人框架；只做单向发消息时排除 |

## 关键 SPOF：管理员与画师共用同一套 QQ 码登录

`server/src/features/auth/auth.service.ts` 的 generateLoginCode/verifyLoginCode 全员共用；管理员 = platform_config.admin_qq 标记的画师账号。
⇒ Bot 挂 → 管理员也登不进后台 → "管理员人工发码"兜底自身失效。
⇒ 三层兜底：① 登录页自动提示（复用 health 框架加 Bot 状态检查）② 管理端查看/重发当前验证码（前提：已登录，会话 7 天 TTL 内）③ 服务器本机 CLI 打印当前码（不走网络、零攻击面、终极保险）。

## 拍板结论（用户确认）

- 定位：消息网关（独立 notify 模块 + 渠道适配器），本轮只接 QQ。
- 范围：本轮只做发登录码；③④ 类通知 later；QQ 指令排除。
- 排队提醒勾选框（客户下单页 + 画师录单页两处）：保留但灰置、默认关闭、标"开发中"。当前默认值 `notifyEnabled: true`（useOrderForm.js）需改 false。真上线后也默认不勾。
- 托管：家用闲置笔记本跑 NapCat。QQ Bot 出站连腾讯不需要反代；需要穿透的是网站本身（零预算 → Cloudflare Tunnel；frp 需额外云服务器，排除）。笔记本设永不休眠 + 通电自启。家庭断电断网 = 平台+机器人双瘫，这正是兜底必须存在的理由。
- 机器人 QQ 号：待用户拍板（四号建议新注册免费"平台号"并养号几天，与主号隔离）。
- 邮件兜底：下一批候选，且天然是"网关接第二渠道"的首个实战。
