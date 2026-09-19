# 外链/社交平台链接 + 发布为作品（REQ-022 F1/F2 模式，2026-08-05 二号实施沉淀）

> 适用：客户端页脚链接改造、社交平台管理、订单交付物发布为作品。
> 核心原则：**前端校验 = 后端子集的弱化复刻**；**共享逻辑不共享皮肤**；**新依赖按需精选打包**。

## 1. simple-icons 精选打包模式（新依赖引入先例）

- 依赖：`npm install simple-icons`（导出 `si<Slug>`，对象含 `.path` SVG path / `.title`；全量 3453 个图标）。
- **不要全量导入**：`web/src/utils/simpleIcons.js` 只 `import { siSinaweibo, siBilibili, ... }` 白名单 20 个 slug，
  构建时 tree-shaking 只打包被引用的 path。平台名/单字兜底另存 `PLATFORM_ICON_NAMES` / `fallbackChar`。
- 无 simple-icons 图标的平台（LOFTER/抖音/QQ空间/米画师）用 `fallback_char` 单字兜底——种子数据里
  `icon_key=null` + `fallback_char='L'/'抖'/'空'/'米'`。
- 共享图标组件 `components/shared/TplPlatformIcon.vue`：props `{ iconKey, fallbackChar }`，
  `iconPath = getIconPath(iconKey)`，有 path 渲染 `<svg viewBox="0 0 24 24" fill="currentColor"><path :d/></svg>`，
  无 path 渲染单字。**组件零装饰 CSS**（不写 margin/padding/字号），视觉由各模板外层 class 控制（共享逻辑不共享皮肤）。

## 2. 前端校验 = 后端子集（防投毒三规则复刻）

后端 `server/src/shared/utils/platform.ts` 是安全边界（保存时后端强制重推导 platformId，忽略前端传值）。
前端 `web/src/utils/linkValidation.js` 纯函数复刻体验层，规则必须一致：

- 归一化 `normalizeLinkUrl`：已带 `http(s)://` 原样；带其他协议前缀（`javascript:`/`ftp://`/`data:`）拒绝；
  裸域名+端口（`weibo.com:8080`）补 `https://`；其余裸链补 `https://`；`new URL` 解析失败拒绝。
- 长度 `checkLinkLength`：域名 ≤253 / 路径+查询 ≤1500 / 总长 ≤1800（超限 reason='tooLong'）。
- 域名末尾匹配 `matchDomain(hostname, matchDomains)`：`host === domain || host.endsWith('.' + domain)`，
  比较前双方小写——`weibo.com.evil.com` / `xweibo.com` 一律不认（防投毒核心）。
- 组合 `validateLink(raw, platforms)` → `{ ok, url, platformId }`（platformId=null 即「其他」）。
- 前端拦截文案与后端错误码语义一致（LINK_URL_INVALID→「外链地址格式不正确」、超长→「链接过长」）。

## 3. useArtistData 链接数据适配层（旧两套 → 新一套）

- 旧结构：`socialLinks`（读 customLinks 旧 `{name,url,icon}`）+ `platformLinks`（读 platformUrls）两套 + 两套徽标映射。
- 新结构（F2 后端）：`artist.customLinks = [{ platformId, url }]`，`platformId=null` 即「其他」。
- **合一**：`footerLinks = computed(() => customLinks.map(item => { platform = platforms.find(p => p.id === item.platformId);
  return { key, url, label: platform?.name || t('artistHome.otherLink'), iconKey, fallbackChar } }))`。
- 平台元数据来源：容器页（ArtistHome.vue）`GET /api/platforms`（公开仅启用）→ `:platforms` prop 传给 4 模板 →
  `useArtistData(props)` 里 `props.platforms`。静默失败 → footerLinks 全部走「其他」兜底（不阻塞主页）。
- 4 模板页脚合一：每个模板删两块 v-for（socialLinks/platformLinks），改一个 `footerLinks` v-for，
  图标位放 `<TplPlatformIcon :icon-key="link.iconKey" :fallback-char="link.fallbackChar" />`，`target="_blank" rel="noopener noreferrer"`。

## 4. F1 发布为作品流程（OrderDetail.vue）

- 入口只在 `order.status === 'delivered'` 显示（done 半终态无入口，放交付物卡 CardHead #extra）。
- 后端契约：`POST /api/artist/orders/:id/publish-artwork` body `{ deliverableIds: int[] 1~50, title 1~100, description? ≤500 }`，
  additionalProperties:false；201 → `{ artworks: [{id, imagePath, title, description}] }`（一图一条）。
- 前端图片白名单对齐后端 `PUBLISH_ALLOWED_EXTS = ['.jpg','.jpeg','.png','.webp','.gif']`：
  `isPublishableImage(d)` 用 `d.original_name || d.file_path` 取扩展名，非图片置灰不可勾（zip/psd 交付物不能发布）。
- 弹窗默认全选图片交付物；标题必填（提交按钮 disabled 前端拦空）；发布不锁订单 → 可重复发布剩余未勾图。
- 成功后 `ElMessage.success(publishSuccess, { n })` + `ElMessageBox.confirm` 问是否跳作品管理页（用户取消留在本页）。

## 5. Settings.vue 两区合一（画师后台链接编辑器）

- 旧两区（外链 ≤6 / 平台链接 ≤10）→ 一个链接区：`[平台下拉(disabled 展示识别结果)] [URL输入] [↑][↓][✕]`，上限 8。
- 每行 form 结构 `{ url, platformId }`；`@input="detectLinkPlatform(link)"` 即时识别（`validateLink` 更新 platformId）。
- **保存只传 `[{ url }]`**（platformId 后端重推导，前端传了也被忽略）；保存前逐行 `validateLink` 校验，不过则提示并 return。
- 回显解析 `profile.custom_links`（GET profile 返回原始 DB JSON 字符串）：
  `parsed.map(item => typeof item === 'string' ? { url, platformId: null } : { url, platformId: item.platformId ?? null })`。
- 加载平台列表 `GET /api/platforms`（artistPublicApi.getPlatforms）失败静默，识别走「其他」。

## 6. 收尾注意

- 删旧功能后 grep 残留：`platformUrls` / `platform_urls` / `weiboUrl` / `bilibiliUrl` / 旧枚举名（LINK_ICONS/PLATFORM_OPTIONS/旧徽标映射）全仓清零。
- i18n 新键双语同步（zh-CN.js + en.js）；删功能后同步删死键（如 platformLabel/platformAuto/landing.weibo）。
- 共享组件新增（TplPlatformIcon.vue 在 components/shared/ 属二号权限）需在一号派工授权清单内或 comms 注明。
- 后端新接口封装进 `web/src/api/index.js` 属隐含授权（soul 硬规则），comms 注明即可。

## 7. 工具注意（本批实踩）

- **patch replace 偶发吞行**：old_string 若以行尾换行结尾，new_string 里相邻两行可能被合并成一行
  （本批 api/index.js getDiscountCodes/toggleDiscount 被拼成一行）。每次 patch 后**必须看返回的 diff**，
  发现非预期合并立即回补，不要靠 lint 兜底。
- 批量连续 patch 同一文件时，diff 里带 `_warning: last read with pagination` 提示
  ——先重读相关区段再改，避免 old_string 失配（工具会 fuzzy 匹配，但语义风险自担）。
- `.vue` 文件 patch 后无 lint 检查（"No linter for .vue files"），模板/脚本错误靠 build/vitest 兜底，
  改完一组文件就 `npm run build` 或 `npx vitest run` 一次，不要攒到最后。
