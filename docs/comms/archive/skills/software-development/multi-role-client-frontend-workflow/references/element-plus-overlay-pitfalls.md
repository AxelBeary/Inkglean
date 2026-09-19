# Element Plus 浮层两大陷阱（artist-commission 用户实测事故）

两个都是"开发环境看不出问题、用户实测截图才暴露"的事故，修法固定。

## 陷阱 1：el-dialog 被 transform 祖先劫持定位

症状：弹窗不在窗口中心、到处飘、甚至飘出窗口外，用户什么都点不了。
根因：el-dialog 默认就地渲染，其 overlay 用 fixed 定位。任何祖先带 `transform`（滚动渐入 `.tpl-reveal` 的 `tpl-fade-up` 动画 translateY、纸片旋转 rotate 等）都会把该祖先变成 fixed 的 containing block，弹窗定位基准从视口变成那个祖先。
修法：el-dialog 加 `append-to-body`（teleport 到 body，脱离 transform 链）。
注意：scoped CSS 不受影响——data-v 属性跟着渲染内容走，teleport 后样式依然生效。
本项目高发点：客户端主页画廊区所有 section 都挂 `.tpl-reveal`，模板内任何弹窗都要 append-to-body。

## 陷阱 2：自定义灯箱里再套 el-image 内置预览 = 三层嵌套截断

症状：点开大图后出现"页面遮罩 → 弹窗 → 又一层全屏预览"，第三层被弹窗宽度截断一半，用户形容"三层嵌套的屎山"。
根因：el-image 带 `:preview-src-list` + `preview-teleported` 时，点击会渲染 EP 自己的全屏 viewer。塞在自定义 lightbox（el-dialog）里就叠出第三层。
修法：如果灯箱已有自己的左右箭头翻页，删掉内层 el-image 的 `:preview-src-list` / `preview-teleported` / `hide-on-click-modal`——预览层纯属多余。

## 验证配方（容器重建后浏览器实测）

1. 打开画师主页，JS 点开第一张图：`document.querySelector('.tpl-album-frame')?.click()`（或对应模式的图片容器）。
2. 断言只有一层 overlay 且弹窗水平居中：
```js
const d = document.querySelector('.el-dialog');
JSON.stringify({ overlays: document.querySelectorAll('.el-overlay').length,
  centered: Math.round(d.getBoundingClientRect().x) === Math.round((innerWidth - d.getBoundingClientRect().width)/2),
  thirdLayer: !!document.querySelector('.el-image-viewer__wrapper') })
// 期望 { overlays: 1, centered: true, thirdLayer: false }
```
3. 再点一次图片确认不会触发 viewer 层；点灯箱箭头确认翻页仍可用。
4. 最坏情况矩阵：带 rotate/transform 装饰的模板（Atelier 纸片）+ 窄视口各测一次。
